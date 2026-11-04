pikud-haoref-api
===================
[![npm version](https://badge.fury.io/js/pikud-haoref-api.svg)](https://www.npmjs.com/package/pikud-haoref-api)

A Node.js wrapper library for Pikud Haoref's unofficial alerts API. It allows you to easily query for the currently active alerts in Israel.

**Note:** This API is only accessible from within Israel. Either run the script on an Israeli machine, or use a proxy.

Usage
---

First, install the package using npm:
```shell
npm install pikud-haoref-api --save
```

Then, use the following code to poll for the currently-active alerts:

```js
var pikudHaoref = require('pikud-haoref-api');

// Set polling interval in millis
var interval = 5000;

// Define polling function
var poll = function () {
    // Optional Israeli proxy if running outside Israeli borders
    var options = {
        proxy: 'http://user:pass@hostname:port/'
    };

    // Get currently active alerts
    // Example response (array):
    // [{ 
    //    id: '134168709720000000',
    //    type: 'missiles', 
    //    cities: ['תל אביב - מזרח', 'חיפה - כרמל ועיר תחתית', 'עין גדי'],
    //    instructions: 'היכנסו למבנה, נעלו את הדלתות וסגרו את החלונות'
    // }]
    pikudHaoref.getActiveAlerts(function (err, alerts) {
        // Schedule polling in X millis
        setTimeout(poll, interval);
        
        // Log errors
        if (err) {
            return console.log('Retrieving active alerts failed: ', err);
        }

        // Alert header
        console.log('Currently active alerts:');

        // Log the alerts (if any)
        console.log(alerts);

        // Line break for readability
        console.log();
    }, options);
}

// Start polling for active alerts
poll();
```

Sample Alert Objects
---
When there is a missle alert:
```
[{
    id: '134168709720000000',
    type: 'missiles', 
    cities: ['תל אביב - מזרח', 'חיפה - כרמל ועיר תחתית', 'עין גדי'],
    instructions: 'היכנסו למבנה, נעלו את הדלתות וסגרו את החלונות'
}]
```

**Note:** The `id` is optional and may be ommitted. When present, it can be used for change tracking.

**Note:** There are limitations on simultaneous alerts. See below.

---

When there is no active alert, an empty array is returned:
```
[]
```

---

When there are multiple alerts:

Currently, only the history API (invoked with `alertsHistoryJson` in the passed options) will ever return more than one alert at the same time.

As for the real-time alerts, when there are multiple alert types at the same time, the response is updated quite frequently, so it is best to poll for new alerts every second or two to monitor for changes and new alert types.

This is a historic design choice, as the upstream Pikud Haoref JSON returned had not needed to support more than one alert type at the same time.

Alerts History
---

Use `getAlertsHistory` to fetch past alerts from the API behind [oref.org.il/heb/alerts-history](https://www.oref.org.il/heb/alerts-history). Results are returned newest first, and all pages are fetched automatically.

```js
pikudHaoref.getAlertsHistory(function (err, alerts) {
    if (err) {
        return console.log('Retrieving alerts history failed: ', err);
    }

    // [{
    //    rid: 706608,
    //    data: 'אביתר',
    //    date: '19.10.2026',
    //    time: '20:31:16',
    //    dateTime: '2026-10-19T20:31:00',
    //    category: 13,
    //    category_Desc: 'הוסר החשש לחדירת מחבלים',
    //    matrixId: 0
    // }]
    console.log(alerts);
}, options);
```

Options (all optional):

* `period` - `1` for the last day (default), `2` for the last month
* `from` / `to` - a date range (`Date` or `YYYY-MM-DDTHH:mm:ss` string in Israel time), used instead of `period`
* `since` - a `Date`; stop paginating once alerts older than this are reached (useful for polling)
* `cities` - a city name or array of city names to filter by
* `categoryIds` - a category ID or array of category IDs to filter by
* `lang` - `heb` (default), `eng`, `rus` or `arb`
* `maxPages` - max number of pages (200 alerts each) to fetch, defaults to `500`
* `proxy` / `httpsAgent` - passed on to axios

**Note:** `date` and `time` are in Israel time. `dateTime` is only precise to the minute.

Alert Types
---

**Breaking changes** in version `5.0.0`:

* `pikudHaoref.getActiveAlert()` - this method has been renamed to `pikudHaoref.getActiveAlerts()` and now returns an array of alerts with potentially different types, as Pikud Haoref's historical alerts JSON may return several new alerts with different types at the same time.
* `none` -  removed this alert type (an empty array is returned when there are no alerts)

**Breaking change** in version `4.0.0`:

* `newsFlash` - `earlyWarning` has been renamed to `newsFlash` as Pikud Haoref has recently started issuing "safe to leave shelter" alerts using the same category number as early warnings. Check `alert.instructions` to determine the type of action required from civilians.

Added in version `3.0.7`:

* ~~`earlyWarning`~~ - no longer in use

Added in version `3.0.0`:

* `none`
* `missiles`
* `radiologicalEvent`
* `earthQuake`
* `tsunami`
* `hostileAircraftIntrusion`
* `hazardousMaterials`
* `terroristInfiltration`
* `missilesDrill`
* `earthQuakeDrill`
* `radiologicalEventDrill`
* `tsunamiDrill`
* `hostileAircraftIntrusionDrill`
* `hazardousMaterialsDrill`
* `terroristInfiltrationDrill`
* `unknown`

Requirements
---
* Node.js v4.2.x+ for ES6's `for-of` loop support

Special Thanks
---

* Thanks to  Noam Hashmonai for the Spanish translation
* Thanks to the developers of the Tzofar app for the map polygon data

License
---
Apache 2.0
