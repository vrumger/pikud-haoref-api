// Copyright
// @mattpowell (https://gist.github.com/mattpowell/3380070)

// Converts numeric degrees to radians
if (typeof Number.prototype.toRad === 'undefined') {
    Number.prototype.toRad = function () {
        return (this * Math.PI) / 180;
    };
}

// Returns distance between two points in kilometers
exports.getDistance = function (start, end, decimals) {
    decimals = decimals || 2;
    const earthRadius = 6371; // km

    let lat1 = parseFloat(start.lat);
    let lat2 = parseFloat(end.lat);
    const lon1 = parseFloat(start.lng);
    const lon2 = parseFloat(end.lng);

    const dLat = (lat2 - lat1).toRad();
    const dLon = (lon2 - lon1).toRad();
    lat1 = lat1.toRad();
    lat2 = lat2.toRad();

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) *
            Math.sin(dLon / 2) *
            Math.cos(lat1) *
            Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = earthRadius * c;

    return Math.round(d * Math.pow(10, decimals)) / Math.pow(10, decimals);
};
