document.addEventListener("DOMContentLoaded", function () {
    const urlParams = new URLSearchParams(window.location.search);
    const countyGEOID = urlParams.get('county');

    if (!countyGEOID) {
        document.getElementById('county-name').textContent = "County Not Found";
        document.getElementById('county-description').textContent = "No county GEOID provided.";
        return;
    }

    fetch('counties.geojson')
        .then(response => response.json())
        .then(data => {
            const county = data.features.find(f => f.properties.GEOID === countyGEOID);
            if (county) {
                const stateAbbr = stateAbbreviations[county.properties.STATEFP];
                document.getElementById('county-name').textContent = county.properties.NAME + ", " + stateAbbr;
                document.getElementById('county-description').textContent = `Detailed information about ${county.properties.NAME} County, ${stateAbbr}.`;

                const map = L.map('county-map', {
                    dragging: false,
                    scrollWheelZoom: false,
                    doubleClickZoom: false,
                    zoomControl: false,
                    attributionControl: false
                });

                // Add a custom zoom control at the bottom
                L.control.zoom({
                    position: 'bottomright'
                }).addTo(map);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 18,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);

                const geoJsonLayer = L.geoJSON(county, {
                    style: {
                        color: "#ff7800",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.1
                    }
                }).addTo(map);

                map.fitBounds(geoJsonLayer.getBounds());

                // Initialize the slider to 2015 and update the map color accordingly
                initializeSliderAndMap(countyGEOID, geoJsonLayer);

                // Load the deaths data and create the chart
                loadAndCreateChart(countyGEOID);

                // Add hover functionality to show tooltip with information
                addHoverInfo(geoJsonLayer, countyGEOID);
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

function initializeSliderAndMap(countyGEOID, geoJsonLayer) {
    const yearSlider = document.getElementById('year-slider');
    yearSlider.value = 2015; // Reset the slider to 2015
    document.getElementById('selected-year').textContent = 2015;

    // Update the map color based on the initial year (2015)
    fetch('most_important_features_year.json')
        .then(response => response.json())
        .then(mostImportantFeatures => {
            fetch('most_important_features_year_forecast.json')
                .then(response => response.json())
                .then(forecastFeatures => {
                    const featureData = getFeatureDataForYear(countyGEOID, 2015, mostImportantFeatures, forecastFeatures);
                    if (featureData) {
                        updateCountyColor(geoJsonLayer, featureData.most_important_feature);
                    } else {
                        // No feature data found, set color to gray
                        updateCountyColor(geoJsonLayer, null);
                    }
                });
        });

    // Add the year slider functionality
    setupYearSlider(countyGEOID, geoJsonLayer);
}

function setupYearSlider(countyGEOID, geoJsonLayer) {
    const yearSlider = document.getElementById('year-slider');
    yearSlider.addEventListener('input', function () {
        const selectedYear = parseInt(this.value);
        document.getElementById('selected-year').textContent = selectedYear;

        fetch('most_important_features_year.json')
            .then(response => response.json())
            .then(mostImportantFeatures => {
                fetch('most_important_features_year_forecast.json')
                    .then(response => response.json())
                    .then(forecastFeatures => {
                        const featureData = getFeatureDataForYear(countyGEOID, selectedYear, mostImportantFeatures, forecastFeatures);
                        if (featureData) {
                            updateCountyColor(geoJsonLayer, featureData.most_important_feature);
                        } else {
                            // No feature data found, set color to gray
                            updateCountyColor(geoJsonLayer, null);
                        }
                    });
            });
    });
}

function getFeatureDataForYear(countyGEOID, year, mostImportantFeatures, forecastFeatures) {
    const featureData = Object.values(mostImportantFeatures).find(entry => entry['county code'] === countyGEOID && entry.year === year);

    if (!featureData && (year - 2) >= 2022) {
        return Object.values(forecastFeatures).find(entry => entry['county code'] === countyGEOID && entry.year === year - 2);
    }

    return featureData;
}

function updateCountyColor(geoJsonLayer, mostImportantFeature) {
    const color = mostImportantFeature ? getColorByFeature(mostImportantFeature) : '#cccccc'; // Gray if no data
    geoJsonLayer.setStyle({
        color: color,
        fillColor: color,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.6
    });
}

function getColorByFeature(feature) {
    // Predefined colors for specific features
    const featureColors = {
        "years of potential life lost rate": "#FF0000", // Red
        "# uninsured_per_1000": "#00FF00", // Green
        "# associations_per_1000": "#0000FF", // Blue
        "# some college_per_1000": "#FFFF00",  // Yellow
        "# injury deaths_per_1000": "#FFA500" //Orange
    };

    // Return the predefined color or a fallback color if the feature is not listed
    return featureColors[feature] || '#999999';  // Use grey as a fallback color for undefined features
}

function loadAndCreateChart(countyGEOID) {
    Promise.all([
        fetch('current_deaths.json').then(response => response.json()),
        fetch('deaths_forecast.json').then(response => response.json())
    ]).then(([currentData, forecastData]) => {
        const years = [];
        const currentDeaths = {};
        const forecastDeaths = {};

        // Gather current data
        for (let key in currentData) {
            if (currentData[key]['county code'] === countyGEOID) {
                const year = currentData[key].year;
                years.push(year);
                currentDeaths[year] = currentData[key].deaths_per_1000;
            }
        }

        // Gather forecast data
        for (let key in forecastData) {
            if (forecastData[key]['county code'] === countyGEOID) {
                const year = forecastData[key].year;
                if (!years.includes(year)) years.push(year);
                forecastDeaths[year] = forecastData[key].deaths_per_1000;
            }
        }

        // Sort the years in ascending order
        years.sort((a, b) => a - b);

        // Find the last year with actual data
        const lastActualYear = Math.max(...Object.keys(currentDeaths).map(Number));

        // Prepare datasets
        const currentDataArray = years.map(year => currentDeaths[year] !== undefined ? currentDeaths[year] : null);
        const forecastDataArray = years.map(year => {
            // Include forecast data starting from the year after the last year of actual data
            if (year === lastActualYear) {
                return currentDeaths[year];  // Include the last actual data point
            }
            return year > lastActualYear ? forecastDeaths[year] : null;
        });

        const ctx = document.getElementById('deathsChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Deaths per 1000 (Current)',
                    data: currentDataArray,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false,
                    spanGaps: false
                }, {
                    label: 'Deaths per 1000 (Forecast)',
                    data: forecastDataArray,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    spanGaps: true,
                    borderDash: [5, 5] // Dashed line for forecast
                }]
            },
            options: {
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Year'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Deaths per 1000'
                        },
                        beginAtZero: true
                    }
                }
            }
        });

    }).catch(error => {
        console.error('Error loading deaths data:', error);
        document.getElementById('county-description').textContent += " Failed to load deaths data.";
    });
}

function addHoverInfo(geoJsonLayer, countyGEOID) {
    geoJsonLayer.eachLayer(function (layer) {
        layer.on('mouseover', function () {
            const year = parseInt(document.getElementById('year-slider').value);

            // Fetch both current and forecast death data
            Promise.all([
                fetch('current_deaths.json').then(response => response.json()),
                fetch('deaths_forecast.json').then(response => response.json())
            ]).then(([currentDeaths, forecastDeaths]) => {
                fetch('most_important_features_year.json')
                    .then(response => response.json())
                    .then(mostImportantFeatures => {
                        fetch('most_important_features_year_forecast.json')
                            .then(response => response.json())
                            .then(forecastFeatures => {
                                const featureData = getFeatureDataForYear(countyGEOID, year, mostImportantFeatures, forecastFeatures);
                                let tooltipContent = `County: ${layer.feature.properties.NAME}`;
                                
                                if (featureData) {
                                    tooltipContent += `<br>Most Important Feature (${year}): ${featureData.most_important_feature}`;
                                } else {
                                    tooltipContent += `<br>No feature data available for this year.`;
                                }

                                // Get death rate from the current and forecast data
                                const { deathRate, isForecast } = getDeathRateForYear(countyGEOID, year, currentDeaths, forecastDeaths);
                                tooltipContent += `<br>Death Rate: ${deathRate !== null ? deathRate : 'Data not available'}`;
                                if (deathRate !== null) {
                                    tooltipContent += isForecast ? " (Forecast)" : " (Actual)";
                                }

                                layer.bindTooltip(tooltipContent, {
                                    direction: 'auto',
                                    className: 'custom-tooltip',
                                    maxWidth: 400,
                                    sticky: true,
                                    pane: 'tooltipPane',
                                    autoPan: true
                                }).openTooltip();
                            });
                    });
            });
        });

        layer.on('mouseout', function () {
            layer.closeTooltip();
        });
    });
}

function getDeathRateForYear(countyGEOID, year, currentDeaths, forecastDeaths) {
    let deathData = Object.values(currentDeaths).find(entry => entry['county code'] === countyGEOID && entry.year === year);

    if (deathData) {
        return { deathRate: deathData.deaths_per_1000, isForecast: false };
    }

    if (year > 2022) {  // Check forecast data for future years
        deathData = Object.values(forecastDeaths).find(entry => entry['county code'] === countyGEOID && entry.year === year);
        if (deathData) {
            return { deathRate: deathData.deaths_per_1000, isForecast: true };
        }
    }

    return { deathRate: null, isForecast: false };
}

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
