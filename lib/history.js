var axios = require('axios');
var config = require('../config');

// Max pages to fetch per call (200 alerts per page)
var DEFAULT_MAX_PAGES = 500;

module.exports = function (callback, options) {
    // Ensure options is an object
    options = options || {};

    // Default to last day of alerts
    if (!options.period && !options.from) {
        options.period = 1;
    }

    var alerts = [];
    var seen = {};
    var maxPages = options.maxPages || DEFAULT_MAX_PAGES;
    var since = options.since ? new Date(options.since).getTime() : null;
    var page = 0;

    var next = function (lastAlarm) {
        getHistoryPage(options, lastAlarm, function (err, json) {
            if (err) {
                return callback(err);
            }

            var items = flattenAlarms(json);
            var added = 0;
            var reachedSince = false;

            for (var item of items) {
                // Stop collecting alerts older than the "since" cutoff
                if (since && getAlarmTime(item) < since) {
                    reachedSince = true;
                    continue;
                }

                // Dedupe across pages
                var key = item.rid != null ? 'rid:' + item.rid : JSON.stringify(item);

                if (seen[key]) {
                    continue;
                }

                seen[key] = true;
                alerts.push(item);
                added++;
            }

            page++;

            // Continue paginating while the API indicates there are more alerts
            if (items.length > 0 && json.lastRetrievedAlarm && !reachedSince && added > 0 && page < maxPages) {
                return next(json.lastRetrievedAlarm);
            }

            callback(null, alerts);
        });
    };

    next(null);
};

function getHistoryPage(options, lastAlarm, callback) {
    var params = {
        cities: options.cities ? [].concat(options.cities).join('|') : ''
    };

    if (options.from) {
        params.from = formatDate(options.from);
        params.to = formatDate(options.to || new Date());
    }
    else {
        params.period = options.period;
    }

    if (options.categoryIds) {
        params.categoryIds = [].concat(options.categoryIds).join('|');
    }

    // Pagination cursor
    if (lastAlarm) {
        params.lastCreatedOn = lastAlarm.dateTime;
        params.lastTitle = lastAlarm.category_Desc;
        params.lastCityName = lastAlarm.data;
    }

    var requestOptions = {
        url: config.hfc.alertsHistoryApi.api + '/' + (options.lang || 'heb'),
        params: params,
        headers: {
            'Accept': 'application/json',
            'Referer': 'https://www.oref.org.il/heb/alerts-history',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        }
    };

    // Pass on optional proxy settings
    if (options.proxy) {
        requestOptions.proxy = options.proxy;
    }

    if (options.httpsAgent) {
        requestOptions.httpsAgent = options.httpsAgent;
    }

    axios(requestOptions).then(function (res) {
        var json = res.data;

        if (!json || typeof json !== 'object' || !Array.isArray(json.alarmsGroupedByDate)) {
            return callback(new Error('Unexpected response from HFC alerts history API'));
        }

        callback(null, json);
    }).catch(function (err) {
        callback(new Error('Failed to retrieve alerts history from HFC API: ' + err.message));
    });
}

function flattenAlarms(json) {
    var items = [];

    for (var group of json.alarmsGroupedByDate) {
        if (Array.isArray(group.value)) {
            items = items.concat(group.value);
        }
    }

    return items;
}

// Unix millis for an alarm (date is dd.MM.yyyy, time is HH:mm:ss, both Israel time)
function getAlarmTime(alarm) {
    var dateParts = (alarm.date || '').split('.');
    var timeParts = (alarm.time || '').split(':');

    if (dateParts.length === 3 && timeParts.length === 3) {
        return toIsraelTime(+dateParts[2], +dateParts[1], +dateParts[0], +timeParts[0], +timeParts[1], +timeParts[2]);
    }

    // Fallback to the (minute-precision) ISO date time
    var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(alarm.dateTime || '');

    if (match) {
        return toIsraelTime(+match[1], +match[2], +match[3], +match[4], +match[5], +match[6]);
    }

    return NaN;
}

function toIsraelTime(year, month, day, hour, minute, second) {
    var utc = Date.UTC(year, month - 1, day, hour, minute, second);

    // Find Israel's UTC offset at that moment
    var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(new Date(utc));

    var p = {};

    for (var part of parts) {
        p[part.type] = +part.value;
    }

    var offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utc;

    return utc - offset;
}

// The API expects YYYY-MM-DDTHH:mm:ss (Israel time)
function formatDate(date) {
    if (typeof date === 'string') {
        return date;
    }

    var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(new Date(date));

    var p = {};

    for (var part of parts) {
        p[part.type] = part.value;
    }

    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second;
}
