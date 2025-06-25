// Replace with require('pikud-haoref-api') if the package resides in node_modules
const pikudHaoref = require('../index');

// Set polling interval in millis
const interval = 5000;

// Keep track of recently alerted cities to avoid notifying multiple times for the same alert
const recentlyAlertedCities = {};

// Define polling function
const poll = function () {
    // Optional Israeli proxy if running outside Israeli borders
    const options = {
        // httpsAgent: new HttpsProxyAgent('http://user:pass@hostname:port/')
    };

    // Get currently active alert
    // Example response:
    // {
    //    type: 'missiles',
    //    cities: ['תל אביב - מזרח', 'חיפה - כרמל ועיר תחתית', 'עין גדי'],
    //    instructions: 'היכנסו למבנה, נעלו את הדלתות וסגרו את החלונות'
    // }
    pikudHaoref.getActiveAlert(function (err, alert) {
        // Schedule polling in X millis
        setTimeout(poll, interval);

        // Log errors
        if (err) {
            return console.log('Retrieving active alert failed: ', err);
        }

        // Extract new cities
        alert.cities = extractNewCities(alert.cities);

        // Print alert
        if (alert.cities.length > 0) {
            // Alert header
            console.log('Currently active alert:');

            // Log the alert (if any)
            console.log(alert);
        } else {
            // No current alert
            console.log('There is no currently active alert.');
        }

        // Line break for readability
        console.log();
    }, options);
};

function extractNewCities(alertCities) {
    // Result array
    const newCities = [];

    // Get current unix timstamp
    const now = Math.floor(Date.now() / 1000);

    // Traverse cities
    for (const city of alertCities) {
        // Haven't notified recently?
        if (
            !recentlyAlertedCities[city] ||
            recentlyAlertedCities[city] < now - 60 * 3
        ) {
            // New city
            newCities.push(city);

            // Update last alert timestamp for this city
            recentlyAlertedCities[city] = now;
        }
    }

    // Return result
    return newCities;
}

// Start polling for active alert
poll();
