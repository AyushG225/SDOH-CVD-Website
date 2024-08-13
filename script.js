document.addEventListener("DOMContentLoaded", function () {
    // Show the loading spinner
    document.getElementById('loading-spinner').style.display = 'block';

    var map = L.map('us-map', {
        maxBounds: [
            [24.396308, -125.0], // Southwest coordinates of the US
            [49.384358, -66.93457] // Northeast coordinates of the US
        ],
        maxBoundsViscosity: 1.0 // Prevent panning beyond these bounds
    }).setView([37.8, -96], 4);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var geojsonLayer;
    var counties = [];
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

    var mostImportantFeaturesCurrent = [];  // Store the loaded current features
    var mostImportantFeaturesForecast = [];  // Store the loaded forecast features
    var cachedDataCurrent = {}; // Cache for current years' data
    var cachedDataForecast = {}; // Cache for forecast years' data

    // Load the most important features data
    Promise.all([
        fetch('most_important_features_year.json').then(response => response.json()),
        fetch('most_important_features_year_forecast.json').then(response => response.json())
    ])
    .then(data => {
        mostImportantFeaturesCurrent = [...Object.values(data[0])];
        mostImportantFeaturesForecast = [...Object.values(data[1])];

        // Cache the data by year and county code for current years
        mostImportantFeaturesCurrent.forEach(entry => {
            const year = entry.year;
            const countyCode = entry["county code"];
            if (!cachedDataCurrent[year]) {
                cachedDataCurrent[year] = {};
            }
            cachedDataCurrent[year][countyCode] = entry.most_important_feature;
        });

        // Cache the data by year and county code for forecast years
        mostImportantFeaturesForecast.forEach(entry => {
            const year = entry.year + 2; // Adjust year to match the actual forecast year
            const countyCode = entry["county code"];
            if (!cachedDataForecast[year]) {
                cachedDataForecast[year] = {};
            }
            cachedDataForecast[year][countyCode] = entry.most_important_feature;
        });

        // Now load the GeoJSON
        return fetch('counties.geojson');
    })
    .then(response => response.json())
    .then(data => {
        counties = data.features;  // Store all county features for search
        geojsonLayer = L.geoJSON(data, {
            style: function (feature) {
                return getCountyStyle(feature);
            },
            onEachFeature: onEachFeature
        }).addTo(map);

        // Initialize the map with the correct year
        var initialYear = document.getElementById('year-slider').value;
        updateMapColor(initialYear);

        // Hide the loading spinner once the map is fully loaded
        document.getElementById('loading-spinner').style.display = 'none';
    })
    .catch(error => {
        console.error('Error loading data:', error);
        // Hide the spinner if there is an error loading data
        document.getElementById('loading-spinner').style.display = 'none';
    });

    function getColorByFeature(feature) {
        // Predefined colors for specific features
        const featureColors = {
            "years of potential life lost rate": "#FF0000", // Red
            "# uninsured_per_1000": "#00FF00", // Green
            "# associations_per_1000": "#0000FF", // Blue
            "# some college_per_1000": "#FFFF00",  // Yellow
            "# injury deaths_per_1000": "#FFA500" // Orange
        };

        // Return the predefined color or a fallback color if the feature is not listed
        return featureColors[feature] || '#999999';  // Use grey as a fallback color for undefined features
    }

    function getMostImportantFeatureForCounty(countyCode, year) {
        // Determine whether to use current or forecast data
        if (year <= 2023) {
            return cachedDataCurrent[year] ? cachedDataCurrent[year][countyCode] : null;
        } else {
            return cachedDataForecast[year] ? cachedDataForecast[year][countyCode] : null;
        }
    }

    function getCountyStyle(feature) {
        var countyCode = feature.properties.GEOID;
        var year = document.getElementById('year-slider').value;
        var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);

        if (mostImportantFeature) {
            var color = getColorByFeature(mostImportantFeature);
            return {
                color: color,
                fillColor: color,
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
    }

    function updateMapColor(year) {
        if (geojsonLayer) {
            geojsonLayer.eachLayer(function (layer) {
                var countyCode = layer.feature.properties.GEOID;
                var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);
                var newColor = mostImportantFeature ? getColorByFeature(mostImportantFeature) : '#eee';

                layer.setStyle({
                    color: newColor,
                    fillColor: newColor,
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.6
                });
            });
        }
    }

    function onEachFeature(feature, layer) {
        var countyCode = feature.properties.GEOID;
        var stateAbbr = stateAbbreviations[feature.properties.STATEFP];
    
        // Store the original style
        const originalStyle = getCountyStyle(feature);
    
        // Set the initial style
        layer.setStyle(originalStyle);
    
        function updateTooltipContent() {
            var year = document.getElementById('year-slider').value;
            var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);
            let tooltipContent = "County: " + feature.properties.NAME + ", " + stateAbbr;
            if (mostImportantFeature) {
                tooltipContent += "<br>Most Important Feature (" + year + "): " + mostImportantFeature;
            } else {
                tooltipContent += "<br>No data available for this year.";
            }
            layer.bindTooltip(tooltipContent, {
                permanent: false, // The tooltip only appears when hovering
                direction: 'auto'
            });
        }
    
        let activeTooltip = null; // Variable to track the active tooltip
    
        layer.on('mouseover', function () {
            if (activeTooltip) {
                activeTooltip.closeTooltip(); // Close any existing active tooltip
            }
            updateTooltipContent();  // Update the tooltip content on hover
            layer.openTooltip();  // Show tooltip on hover
            activeTooltip = layer; // Set the current layer as the active tooltip
        });
    
        layer.on('mouseout', function () {
            layer.closeTooltip();  // Hide tooltip when not hovering
            activeTooltip = null; // Clear the active tooltip when the mouse leaves
        });
    
        let clickedOnce = false; // Flag to track the first click
    
        layer.on('click', function () {
            if (!clickedOnce) {
                map.fitBounds(layer.getBounds()); // Zoom to county on first click
                clickedOnce = true;
            } else {
                window.location.href = `county_info.html?county=${feature.properties.GEOID}`; // Navigate to county page on second click
            }
        });
    }

    // Debounce function to limit how often the updateMapColor function is called
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    var yearSlider = document.getElementById('year-slider');
    var selectedYearDisplay = document.getElementById('selected-year');

    // Set the initial displayed value to match the slider's initial position
    selectedYearDisplay.textContent = yearSlider.value;

    yearSlider.addEventListener('input', debounce(function () {
        var selectedYear = this.value;
        selectedYearDisplay.textContent = selectedYear;
        updateMapColor(selectedYear);
    }, 200)); // Adjust the debounce delay (200ms) as needed

    var searchInput = document.getElementById('search-input');
    var suggestions = document.getElementById('suggestions');

    // Adjust suggestions dropdown width to match the search bar width
    function adjustSuggestionsWidth() {
        suggestions.style.width = searchInput.offsetWidth + 'px';
    }

    adjustSuggestionsWidth();
    window.addEventListener('resize', adjustSuggestionsWidth);

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
