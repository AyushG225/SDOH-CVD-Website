document.addEventListener("DOMContentLoaded", function () {
    var map = L.map('us-map').setView([37.8, -96], 4);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var geojsonLayer;
    var counties = [];
    var featureColors = {}; // Object to store color mapping for features
    var stateAbbreviations = {
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

    var mostImportantFeatures = [];  // Store the loaded features

    // Load the most important features data
    fetch('most_important_features_year.json')
        .then(response => response.json())
        .then(data => {
            mostImportantFeatures = Object.values(data);
        });

    fetch('most_important_features_year_forecast.json')
        .then(response => response.json())
        .then(data => {
            mostImportantFeatures.push(...Object.values(data)); // Merge with the previous data
        });

    // Adjust suggestions dropdown width to match the search bar width
    var searchInput = document.getElementById('search-input');
    var suggestions = document.getElementById('suggestions');

    function adjustSuggestionsWidth() {
        suggestions.style.width = searchInput.offsetWidth + 'px';
    }

    adjustSuggestionsWidth();
    window.addEventListener('resize', adjustSuggestionsWidth);

    // Function to generate a dark random color
    function getRandomColor() {
        const colors = [
            "#4B0082", // Indigo
            "#2F4F4F", // Dark Slate Gray
            "#483D8B", // Dark Slate Blue
            "#2C3E50", // Midnight Blue
            "#4B0082", // Dark Indigo
            "#1C1C1C", // Dark Gray
            "#0B3D91", // Duke Blue
            "#3D2B1F", // Bistre
            "#191970", // Midnight Blue
            "#000080"  // Navy
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function getColorByFeature(feature) {
        if (!featureColors[feature]) {
            featureColors[feature] = getRandomColor(); // Assign a random dark color to the feature
        }
        return featureColors[feature];
    }

    function getMostImportantFeatureForCounty(countyCode, year) {
        const featureEntry = mostImportantFeatures.find(entry => entry["county code"] === countyCode && entry.year === parseInt(year));
        return featureEntry ? featureEntry.most_important_feature : null;
    }

    function updateMapColor(year) {
        if (geojsonLayer) {
            geojsonLayer.eachLayer(function (layer) {
                var countyCode = layer.feature.properties.GEOID;
                var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);
                if (mostImportantFeature) {
                    var color = getColorByFeature(mostImportantFeature);

                    layer.setStyle({
                        color: color,
                        fillColor: color,
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.6
                    });

                    // Update popup content with the correct year information
                    var stateAbbr = stateAbbreviations[layer.feature.properties.STATEFP];
                    var popupContent = "County: " + layer.feature.properties.NAME + ", " + stateAbbr +
                        "<br>Most Important Feature (" + year + "): " + mostImportantFeature;

                    layer.bindPopup(popupContent);
                } else {
                    // If no data, set the county to a neutral style
                    layer.setStyle({
                        color: '#ccc',
                        fillColor: '#eee',
                        weight: 1,
                        opacity: 0.5,
                        fillOpacity: 0.2
                    });
                }
            });
        }
    }

    fetch('counties.geojson')  // Correct path to your GeoJSON file
        .then(response => response.json())
        .then(data => {
            counties = data.features;  // Store all county features for search
            geojsonLayer = L.geoJSON(data, {
                style: function (feature) {
                    var countyCode = feature.properties.GEOID;
                    var year = document.getElementById('year-slider').value;
                    var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);
                    if (mostImportantFeature) {
                        var color = getColorByFeature(mostImportantFeature);

                        return {
                            color: color,
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.6
                        };
                    } else {
                        return {
                            color: '#ccc',
                            fillColor: '#eee',
                            weight: 1,
                            opacity: 0.5,
                            fillOpacity: 0.2
                        };
                    }
                },
                onEachFeature: function (feature, layer) {
                    var countyCode = feature.properties.GEOID;
                    var year = document.getElementById('year-slider').value;
                    var stateAbbr = stateAbbreviations[feature.properties.STATEFP];
                    var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);

                    if (mostImportantFeature) {
                        var popupContent = "County: " + feature.properties.NAME + ", " + stateAbbr +
                            "<br>Most Important Feature (" + year + "): " + mostImportantFeature;

                        layer.bindPopup(popupContent);
                    } else {
                        layer.bindPopup("County: " + feature.properties.NAME + ", " + stateAbbr +
                            "<br>No data available for this year.");
                    }

                    let clickedOnce = false;

                    layer.on('click', function () {
                        if (!clickedOnce) {
                            map.fitBounds(layer.getBounds());
                            setTimeout(function () {
                                layer.openPopup();
                            }, 500);
                            clickedOnce = true;
                        } else {
                            window.location.href = `county_info.html?county=${feature.properties.GEOID}`;
                        }
                    });
                }
            }).addTo(map);

            // Initialize the map with the correct year
            var initialYear = document.getElementById('year-slider').value;
            updateMapColor(initialYear);
        })
        .catch(error => console.error('Error loading GeoJSON data:', error));

    var yearSlider = document.getElementById('year-slider');
    var selectedYearDisplay = document.getElementById('selected-year');

    // Set the initial displayed value to match the slider's initial position
    selectedYearDisplay.textContent = yearSlider.value;

    yearSlider.addEventListener('input', function () {
        var selectedYear = this.value;
        selectedYearDisplay.textContent = selectedYear;
        updateMapColor(selectedYear);
    });


    searchInput.addEventListener('input', function () {
        var query = this.value.toLowerCase();
        suggestions.innerHTML = '';  // Clear previous suggestions
        suggestions.style.display = 'none';

        if (query.length > 0) {
            var matches = counties.filter(function (feature) {
                return feature.properties.NAME.toLowerCase().includes(query) ||
                    feature.properties.GEOID.includes(query);
            });

            if (matches.length > 0) {
                suggestions.style.display = 'block';
                matches.forEach(function (match) {
                    var stateAbbr = stateAbbreviations[match.properties.STATEFP];
                    var item = document.createElement('li');
                    item.className = 'list-group-item';
                    item.textContent = match.properties.NAME + ", " + stateAbbr + ' (FIPS: ' + match.properties.GEOID + ')';
                    item.addEventListener('click', function () {
                        searchInput.value = match.properties.NAME + ", " + stateAbbr;  // Update search box with selected name
                        suggestions.innerHTML = '';  // Clear suggestions
                        suggestions.style.display = 'none';
                        zoomToFeature(match);  // Zoom to the selected county
                    });
                    suggestions.appendChild(item);
                });
            }
        }
    });

    function zoomToFeature(feature) {
        if (geojsonLayer) {
            geojsonLayer.eachLayer(function (layer) {
                if (layer.feature.properties.GEOID === feature.properties.GEOID) {
                    map.fitBounds(layer.getBounds());
                    setTimeout(function () {
                        layer.openPopup();
                    }, 500);  // Delay to allow for zooming
                }
            });
        }
    }
});
