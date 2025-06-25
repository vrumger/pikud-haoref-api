const co = require('co');
const config = require('../config');
const request = require('co-request');
const archive = require('../cities.json');
const geolocation = require('../util/geolocation');
const timeIdentifiers = require('../metadata/timeIdentifiers');
const lifeshieldShelters = require('../metadata/lifeshieldShelters');

module.exports = function (callback, options) {
    // Fallback options param
    options = options || {};

    // Chrome user agent to avoid being blocked (strange 404 error)
    options.headers = {
        'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
    };

    // Make sure Google Maps API key passed in
    if (!options.googleMapsApiKey) {
        return callback(
            new Error('Please provide a Google Maps API Key and try again.'),
        );
    }

    // Magical ES6 generator wrapper
    co(function* () {
        try {
            // Fetch city list in Hebrew from Pikud Haoref's official website
            const cities = yield extractCitiesFromUrl(
                config.hfc.website.citiesJson,
                options,
            );

            // Support for additional languages
            for (const lang in config.hfc.website.translatedCitiesJson) {
                // Fetch translated cities from Pikud Haoref's official website
                const translatedCities = yield extractCitiesFromUrl(
                    config.hfc.website.translatedCitiesJson[lang],
                    options,
                );

                // Traverse result
                for (const translatedCityId in translatedCities) {
                    // Find Hebrew city obj
                    for (const hebrewCityId in cities) {
                        // Match?
                        if (translatedCityId === hebrewCityId) {
                            // Update Hebrew city object with translation
                            cities[hebrewCityId]['translation_' + lang] =
                                translatedCities[translatedCityId];
                            break;
                        }
                    }
                }
            }

            // Fetch more accurate zone names from HFC website in each language
            for (const lang in config.hfc.website.translatedZonesJson) {
                // Fetch translated accurate zone names
                const translatedZones = yield extractCitiesFromUrl(
                    config.hfc.website.translatedZonesJson[lang],
                    options,
                );

                // Traverse results
                for (const translatedCityId in translatedZones) {
                    // Find Hebrew city obj
                    for (const hebrewCityId in cities) {
                        // Match?
                        if (translatedCityId === hebrewCityId) {
                            // Hebrew language?
                            if (lang === 'he') {
                                // Update zone
                                cities[hebrewCityId].zone =
                                    translatedZones[translatedCityId].zone;
                            } else {
                                // Update translated zone name
                                cities[hebrewCityId]['zone_' + lang] =
                                    translatedZones[translatedCityId].zone;
                            }

                            // Done with this city
                            break;
                        }
                    }
                }
            }

            // Fetch segments in Hebrew from Pikud Haoref's segments API
            const segments = yield extractCitiesFromSegmentsUrl(
                config.hfc.website.segmentsJson,
                options,
            );

            // Support for additional languages
            for (const lang in config.hfc.website.translatedCitiesJson) {
                // Fetch translated segments from Pikud Haoref's segments API
                const translatedSegments = yield extractCitiesFromSegmentsUrl(
                    config.hfc.website.translatedSegmentsJson[lang],
                    options,
                );

                // Traverse result
                for (const translatedSegmentId in translatedSegments) {
                    // Find Hebrew city obj
                    for (const hebrewCityId in segments) {
                        // Match?
                        if (translatedSegmentId === hebrewCityId) {
                            // Update Hebrew city object with translation
                            segments[hebrewCityId]['translation_' + lang] =
                                translatedSegments[translatedSegmentId];
                            break;
                        }
                    }
                }
            }

            // Traverse segments
            // Add missing cities to cities[] array
            for (const segmentId in segments) {
                // Get current object
                const segment = segments[segmentId];

                // Keep track of whether this city already exists
                let found = false;

                // Loop over cities
                for (const cityId in cities) {
                    // Fetch city by unique ID
                    const city = cities[cityId];

                    // City name match?
                    if (city.name === segment.name) {
                        found = true;

                        // Update lat,lng from HFC segments file
                        city.lat = segment.lat;
                        city.lng = segment.lng;
                        break;
                    }
                }

                // This segment is a new city
                if (!found) {
                    // Log this
                    console.log('New segment city: ' + segment.name);

                    // Add to cities obj
                    cities[segmentId] = {
                        id: segment.polygonId,
                        name: segment.name,
                        lat: segment.lat,
                        lng: segment.lng,
                        time: segment.time,
                        translation_ar: segment.translation_ar,
                        translation_en: segment.translation_en,
                        translation_ru: segment.translation_ru,
                    };
                }
            }

            // Final cities metadata array
            // Add first entry for Android / iOS app select-all functionality
            const metadata = [
                {
                    id: 0,
                    name: 'בחר הכל',
                    name_en: 'Select All',
                    name_ru: 'Выбрать все',
                    name_ar: 'اختر الكل',
                    zone: '',
                    zone_en: '',
                    zone_ru: '',
                    zone_ar: '',
                    countdown: 0,
                    lat: 0,
                    lng: 0,
                    value: 'all',
                },
            ];

            // Unique values object
            const cityNames = {};

            // Loop over hebrew cities
            for (const cityId in cities) {
                // Fetch city by unique ID
                const city = cities[cityId];

                // Ignore new HFC "Entire Country" city object
                if (city.name === 'כל הארץ' || city.name === 'ברחבי הארץ') {
                    continue;
                }

                // Check for cached city ID / geolocation for this city (speed things up)
                for (const cityArchive of archive) {
                    if (cityArchive.name === city.name) {
                        // Preserve city polygon ID
                        if (cityArchive.id) {
                            city.id = cityArchive.id;
                        }

                        // Check for cached geolocation
                        if (
                            cityArchive.lat &&
                            cityArchive.lng &&
                            !city.lat &&
                            !city.lng
                        ) {
                            city.lat = cityArchive.lat;
                            city.lng = cityArchive.lng;
                        }

                        // Keep track of archive obj for later
                        city.archive = cityArchive;

                        // Use cached countdown for city
                        // Comment this line to fetch updated countdowns
                        city.countdown = cityArchive.countdown;

                        // Stop iterating over cities
                        break;
                    }
                }

                // If lat/lng not extracted from Pikud Haoref's website, geocode using Google Maps API
                if (!city.lat || !city.lng) {
                    // Fetch geolocation info from Google Maps
                    const location = yield geocodeCity(city, options);

                    // Match?
                    if (location.lat != 0) {
                        city.lat = location.lat;
                        city.lng = location.lng;
                    }
                }

                // Prepare city object with hebrew city name
                const result = {
                    id: city.id,
                    name: city.name,
                };

                // Add translated city names
                for (const lang in config.hfc.website.translatedCitiesJson) {
                    // No translation?
                    if (!city['translation_' + lang]) {
                        // Use translation from old city object
                        if (city.archive['name_' + lang]) {
                            result['name_' + lang] =
                                city.archive['name_' + lang];
                        } else {
                            // Ask developer to translate manually
                            result['name_' + lang] = 'TRANSLATE_MANUALLY';

                            // Log to console
                            console.log(
                                'No translation for city, translate manually: ' +
                                    city.name,
                            );
                        }
                    } else {
                        // Add translated zone
                        result['name_' + lang] =
                            city['translation_' + lang].name;
                    }
                }

                // No zone? (HFC segments don't have zones)
                if (!city.zone) {
                    // Try to determine zone based on other cities
                    setZoneOfClosestCity(city, cities);
                }

                // Add hebrew zone name
                result.zone = city.zone;

                // Add translated zone names
                for (const lang in config.hfc.website.translatedCitiesJson) {
                    // Already translated zone (HFC segments)?
                    if (city['zone_' + lang]) {
                        result['zone_' + lang] = city['zone_' + lang];
                        continue;
                    }

                    if (!city['translation_' + lang]) {
                        // Use translation from old city object
                        if (city.archive['zone_' + lang]) {
                            result['zone_' + lang] =
                                city.archive['zone_' + lang];
                        } else {
                            // Ask developer to translate manually
                            result['zone_' + lang] = 'TRANSLATE_MANUALLY';

                            // Log to console
                            console.log(
                                'No translation for city, translate manually: ' +
                                    city.name,
                            );
                        }
                    } else {
                        result['zone_' + lang] =
                            city['translation_' + lang].zone;
                    }
                }

                // Get countdown object if city.time is missing
                result.countdown =
                    city.countdown != undefined
                        ? city.countdown
                        : yield getCountdownForCity(city, options);

                // Add the rest of city params
                result.lat = city.lat;
                result.lng = city.lng;
                result.value = city.name;

                // Lifeshield shelter count exists for this city?
                if (lifeshieldShelters[city.name]) {
                    result.shelters = lifeshieldShelters[city.name];
                }

                // Ignore new HFC "All Areas" cities as they are too difficult to support
                if (result.name_en.includes('All Areas')) {
                    console.log('Ignoring "All areas" city: ' + result.value);
                    continue;
                }

                // Ensure no duplicate city entries
                if (cityNames[result.name]) {
                    console.log('Duplicate city: ' + result.name);
                } else {
                    // First time encountering this city
                    metadata.push(result);

                    // Ensure no duplicate city entries
                    cityNames[result.name] = 1;
                }
            }

            // Sort cities by name ASC
            metadata.sort(function (a, b) {
                // Order "Select All" element as first element
                if (a.value == 'all' && b.value != 'all') {
                    return -1;
                }
                if (a.value != 'all' && b.value == 'all') {
                    return 1;
                }

                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                return 0;
            });

            // Haifa: override Menashe invalid region
            for (const city of metadata) {
                // Haifa city IDs
                if ([1292, 1336, 1270, 1878].indexOf(city.id) !== -1) {
                    city.zone = 'המפרץ';
                    city.zone_en = 'HaMifratz';
                    city.zone_ru = 'Ха-Мифрац';
                    city.zone_ar = 'همفراتس';
                }
            }

            // All done
            callback(null, metadata);
        } catch (err) {
            // Error
            callback(err);
        }
    });
};

function setZoneOfClosestCity(segmentCity, cities) {
    // Keep track of city with closest distance to segment
    let shortestDistance = 1000,
        closestCity = null;

    // Traverse cities
    for (const id in cities) {
        // Get current city obj
        const tmpCity = cities[id];

        // Same as segment ID or zone missing?
        if (tmpCity.id === segmentCity.id || !tmpCity.zone) {
            continue;
        }

        // Get distance of geocoded city from Israel's center
        const distance = geolocation.getDistance(tmpCity, segmentCity);

        // Closer than previously found closest city?
        if (distance < shortestDistance) {
            shortestDistance = distance;
            closestCity = tmpCity;
        }
    }

    // Found something?
    if (closestCity) {
        // Update segment city's zone with cloest city's zone
        segmentCity.zone = closestCity.zone;
        segmentCity.zone_en = closestCity.translation_en.zone;
        segmentCity.zone_ru = closestCity.translation_ru.zone;
        segmentCity.zone_ar = closestCity.translation_ar.zone;

        // Log this
        console.log(
            'Setting zone for ' +
                segmentCity.name +
                ' as zone of ' +
                closestCity.name +
                ' (' +
                segmentCity.zone +
                ', ' +
                shortestDistance +
                ' km)',
        );
    }
}

function* extractCitiesFromUrl(url, options) {
    // Execute GET request
    const json = yield request(url, options);

    // Parse into JSON array
    const cities = JSON.parse(json.body);

    // Ensure JSON parse worked
    if (cities.length === 0) {
        throw new Error('Unable to parse JSON.');
    }

    // Final cities result array
    const citiesResult = {};

    // Traverse cities array from Pikud Haoref
    for (const city of cities) {
        // Empty city label?
        if (!city.label) {
            continue;
        }

        // Districts file (accurate zone names)
        // Split label into city name and zone name
        if (city.label.includes(' I ')) {
            city.label = city.label.split(' I ');

            // Extract city and area
            city.name = city.label[0];
            city.areaname = city.label[1];
        } else if (city.label.includes(' | ')) {
            // Denominator changes every so often
            city.label = city.label.split(' | ');

            // Extract city and area
            city.name = city.label[0];
            city.areaname = city.label[1];
        } else {
            // Standard GetDistricts.aspx file
            city.name = city.label;
        }

        // Log missing area
        if (!city.areaname) {
            console.log('Missing area for city: ' + city.label);
            continue;
        }

        // Remove region prefix/suffix
        city.areaname = city.areaname.replace('אזור ', '');
        city.areaname = city.areaname.replace('Western ', 'West ');
        city.areaname = city.areaname.replace(' Area', '');
        city.areaname = city.areaname.replace('Район ', '');
        city.areaname = city.areaname.replace(' منطقة', '');
        city.areaname = city.areaname.replace('منطقة ', '');

        // Revert to old HFC zone names for Pub/Sub topic consistency
        if (city.areaname === 'Samaria') city.areaname = 'Shomron';

        if (city.areaname === 'West Lakhish') city.areaname = 'West Lachish';

        if (city.areaname === "Beit Sha'an Valley")
            city.areaname = "Beit She'an Valley";

        // Remove whitespace
        city.areaname = city.areaname.trim();

        // Eliminate double spacing
        city.name = city.name.replace(/ {2}/g, ' ').trim();

        // Capitalize every English word in city and zone names
        city.name = uppercaseWords(city.name);
        city.areaname = uppercaseWords(city.areaname);

        // Lowercase ' of '
        city.name = city.name.replace(' Of ', ' of ');

        // Remove duplicate single quote
        city.name = city.name.replace(/''/g, "'");

        // Add city to result
        citiesResult[city.id] = {
            name: city.name,
            zone: city.areaname,
            cityId: city.id,
        };
    }

    // Done with cities
    return citiesResult;
}

function* extractCitiesFromSegmentsUrl(url, options) {
    // Execute GET request
    const json = yield request(url, options);

    // Parse into JSON object
    const result = JSON.parse(json.body);

    // Ensure JSON parse worked
    if (result.length === 0) {
        throw new Error('Unable to parse JSON.');
    }

    // Final cities result array
    const citiesResult = {};

    // Traverse segments array from Pikud Haoref
    for (const id in result.segments) {
        // Get current segment
        const segment = result.segments[id];

        // Empty city name?
        if (!segment.name) {
            continue;
        }

        // Skip test segments / compound cities
        if (segment.id >= 5003000) {
            console.log('Skipping segment: ' + segment.name);
            continue;
        }

        // Clean segment name duplicate single quote
        segment.name = segment.name.replace("''", "'");

        // Add city to result
        citiesResult[segment.id] = {
            name: segment.name,
            polygonId: segment.id - 5000000, // Subtract 5M from ID to arrive at polygon ID
            time: segment.sz,
            lat: parseFloat(parseFloat(segment.centerY).toFixed(5)),
            lng: parseFloat(parseFloat(segment.centerX).toFixed(5)),
        };
    }

    // Done with cities
    return citiesResult;
}

function* getCountdownForCity(city, options) {
    // Execute GET request
    const json = yield request(
        config.hfc.website.cityNotesJson + city.cityId,
        options,
    );

    // Log progress
    console.log('Fetching countdown for city: ' + city.name);

    // Parse into JSON array
    const result = JSON.parse(json.body);

    // Ensure JSON parse worked
    if (!result || result.notes.length === 0) {
        throw new Error('Unable to parse JSON.');
    }

    // Get countdown object
    const timeIdentifier = timeIdentifiers[result.notes[0].time_notes];

    // No match?
    if (!timeIdentifier) {
        console.log('Unexpected time identifier: ' + result.time_notes);
    }

    // All done
    return timeIdentifier.countdown;
}

function uppercaseWords(str) {
    // Use regex for a more robusy solution
    return str.replace(/(^| )(\w)/g, function (x) {
        return x.toUpperCase();
    });
}

function* geocodeCity(city, options) {
    // Geocode city by name
    const json = yield request({
        url:
            'https://maps.googleapis.com/maps/api/geocode/json?address=' +
            encodeURIComponent(city.name + ', Israel') +
            '&region=il&key=' +
            options.googleMapsApiKey,
        json: true,
    });

    // Failed?
    if (json.body.status != 'OK' && json.body.status != 'ZERO_RESULTS') {
        // Output error
        throw new Error(`Geocoding error: ${json.body.status}`);
    }

    // Traverse results
    for (const result of json.body.results) {
        // Is result within Israel?
        if (isWithinIsraeliBorders(result.geometry.location)) {
            return result.geometry.location;
        } else {
            // Output error
            console.error(
                `Geocoding failed for ${city.name}, result is outside Israel`,
            );
        }
    }

    // Output error
    console.error(`Geocoding failed for ${city.name}`);

    // Fallback coordinates
    return { lat: 0, lng: 0 };
}

function isWithinIsraeliBorders(location) {
    // Get distance of geocoded city from Israel's center in KM
    const distance = geolocation.getDistance(config.israel.center, location);

    // Within allowed radius?
    return distance <= config.israel.radius;
}
