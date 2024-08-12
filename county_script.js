document.addEventListener("DOMContentLoaded", function () {
    const urlParams = new URLSearchParams(window.location.search);
    const countyGEOID = urlParams.get('county');

    if (!countyGEOID) {
        document.getElementById('county-name').textContent = "County Not Found";
        document.getElementById('county-description').textContent = "No county GEOID provided.";
        return;
    }

    fetch('counties.geojson')  // Adjust the path as necessary
        .then(response => response.json())
        .then(data => {
            const county = data.features.find(f => f.properties.GEOID === countyGEOID);
            if (county) {
                const stateAbbr = stateAbbreviations[county.properties.STATEFP];
                document.getElementById('county-name').textContent = county.properties.NAME + ", " + stateAbbr;
                document.getElementById('county-description').textContent = `Detailed information about ${county.properties.NAME} County, ${stateAbbr}.`;

                // Initialize the map in the top-right corner
                const map = L.map('county-map', {
                    dragging: false,
                    scrollWheelZoom: false,
                    doubleClickZoom: false,
                    zoomControl: false,
                    attributionControl: false
                });

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 18,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);

                // Add county GeoJSON layer and fit the map to the county bounds
                const geoJsonLayer = L.geoJSON(county, {
                    style: {
                        color: "#ff7800",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.1
                    }
                }).addTo(map);

                map.fitBounds(geoJsonLayer.getBounds());
            } else {
                document.getElementById('county-name').textContent = "County Not Found";
                document.getElementById('county-description').textContent = "No county found with the provided GEOID.";
            }
        })
        .catch(error => {
            console.error('Error loading county data:', error);
            document.getElementById('county-name').textContent = "Error";
            document.getElementById('county-description').textContent = "Failed to load county data.";
        });
});

const stateAbbreviations = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
    "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
    "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
    "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
    "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
    "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
    "56": "WY"
};
