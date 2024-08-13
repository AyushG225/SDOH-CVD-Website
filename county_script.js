let cachedMostImportantFeatures = {}; // Cache to store most important features for each county and year

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

                L.control.zoom({ position: 'bottomright' }).addTo(map);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
                const geoJsonLayer = L.geoJSON(county, {
                    style: {
                        color: "#ff7800",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.1
                    }
                }).addTo(map);

                map.fitBounds(geoJsonLayer.getBounds());
                cacheAllFeatureWeights(countyGEOID); // Cache feature weights on page load
                initializeSliderAndMap(countyGEOID, geoJsonLayer);
                loadAndCreateChart(countyGEOID);
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

    // Combine the sliders into one
    const yearSlider = document.getElementById('year-slider'); // Use a single slider element
    yearSlider.addEventListener('input', function () {
        const selectedYear = parseInt(this.value);
        document.getElementById('selected-year').textContent = selectedYear;

        const mostImportantFeature = cachedMostImportantFeatures[countyGEOID][selectedYear].mostImportantFeature;
        updateCountyColor(geoJsonLayer, mostImportantFeature);
        displayFeatureWeights(cachedMostImportantFeatures[countyGEOID][selectedYear].important_features);
    });
});

function cacheAllFeatureWeights(countyGEOID) {
    return new Promise((resolve, reject) => {
        const years = [...Array(11).keys()].map(i => i + 2015); // [2015, 2016, ..., 2025]

        Promise.all([
            fetch('SDOH+HeartData2.json').then(response => response.json()),
            fetch('percentile_county_data.json').then(response => response.json()),
            fetch('feature_importances.json').then(response => response.json()),
            fetch('feature_importances_forecast.json').then(response => response.json())
        ]).then(([countyData, percentileData, featureImportances, featureImportancesForecast]) => {
            cachedMostImportantFeatures[countyGEOID] = {};

            years.forEach(year => {
                const isForecastYear = year >= 2024;
                const dataYear = isForecastYear ? year - 2 : year;
                const importances = isForecastYear ? featureImportancesForecast : featureImportances;

                let { mostImportantFeature, importantFeatures } = calculateMostImportantFeature(countyData, percentileData, dataYear, countyGEOID, importances);
                cachedMostImportantFeatures[countyGEOID][year] = { mostImportantFeature, important_features: importantFeatures };
            });

            resolve(); // Resolve the promise after caching is complete
        }).catch(error => {
            console.error('Error caching most important features:', error);
            reject(error);
        });
    });
}


function calculateMostImportantFeature(countyData, percentileData, year, countyCode, featureImportances) {
    const countyYearData = Object.values(countyData).find(entry => entry['county code'] === countyCode && entry.year === year);
    const percentileYearData = Object.values(percentileData).find(entry => entry['county code'] === countyCode && entry.year == year);

    if (!countyYearData || !percentileYearData) {
        console.error(`County code ${countyCode} not found for year ${year}`);
        return { mostImportantFeature: 'None Found', importantFeatures: [] };
    }

    let maxWeight = -1;
    let mostImportantFeature = 'None Found';
    let importantFeatures = [];

    for (let key in featureImportances) {
        const feature = featureImportances[key].Feature;
        const importance = featureImportances[key].Importance;

        // Skip the "year" feature and only include features that exist in percentileYearData
        if (feature !== 'year' && percentileYearData.hasOwnProperty(feature)) {
            let featureVal = percentileYearData[feature];
            if (flipRankMapping[feature] === 1) {
                featureVal = 1 - featureVal;
            }
            const weight = featureVal * importance;

            importantFeatures.push({ Feature: feature, Weight: weight });

            if (weight > maxWeight) {
                maxWeight = weight;
                mostImportantFeature = feature;
            }
        }
    }

    importantFeatures.sort((a, b) => b.Weight - a.Weight);

    return { mostImportantFeature, importantFeatures };
}

function initializeSliderAndMap(countyGEOID, geoJsonLayer) {
    const yearSlider = document.getElementById('year-slider');
    yearSlider.value = 2015; // Reset the slider to 2015
    document.getElementById('selected-year').textContent = 2015;

    // Immediately update the map color after caching the feature weights
    cacheAllFeatureWeights(countyGEOID).then(() => {
        const mostImportantFeature = cachedMostImportantFeatures[countyGEOID][2015].mostImportantFeature;
        updateCountyColor(geoJsonLayer, mostImportantFeature); // Update color based on the initial year (2015)
        displayFeatureWeights(cachedMostImportantFeatures[countyGEOID][2015].important_features); // Initial display for the default year 2015
    });

    yearSlider.addEventListener('input', function () {
        const selectedYear = parseInt(this.value);
        document.getElementById('selected-year').textContent = selectedYear;

        const mostImportantFeature = cachedMostImportantFeatures[countyGEOID][selectedYear].mostImportantFeature;
        updateCountyColor(geoJsonLayer, mostImportantFeature);
        displayFeatureWeights(cachedMostImportantFeatures[countyGEOID][selectedYear].important_features);
    });
}


function updateCountyColor(geoJsonLayer, mostImportantFeature) {
    const color = mostImportantFeature ? getColorByFeature(mostImportantFeature) : '#cccccc';
    geoJsonLayer.setStyle({
        color: color,
        fillColor: color,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.6
    });
}

function getColorByFeature(feature) {
    const featureColors = {
        "years of potential life lost rate": "#FF0000",
        "# uninsured_per_1000": "#00FF00",
        "# associations_per_1000": "#0000FF",
        "# some college_per_1000": "#FFFF00",
        "# injury deaths_per_1000": "#FFA500"
    };

    return featureColors[feature] || '#999999';
}

function displayFeatureWeights(importantFeatures) {
    const featureWeightsList = document.getElementById('feature-weights-list');
    featureWeightsList.innerHTML = ''; // Clear existing list

    // Only display the top 5 features
    importantFeatures.slice(0, 5).forEach(item => {
        const row = document.createElement('tr');
        const featureCell = document.createElement('td');
        const weightCell = document.createElement('td');

        featureCell.textContent = item.Feature;
        weightCell.textContent = item.Weight.toFixed(2);

        row.appendChild(featureCell);
        row.appendChild(weightCell);
        featureWeightsList.appendChild(row);
    });
}

function loadAndCreateChart(countyGEOID) {
    Promise.all([
        fetch('current_deaths.json').then(response => response.json()),
        fetch('deaths_forecast.json').then(response => response.json())
    ]).then(([currentData, forecastData]) => {
        const years = [];
        const currentDeaths = {};
        const forecastDeaths = {};

        for (let key in currentData) {
            if (currentData[key]['county code'] === countyGEOID) {
                const year = currentData[key].year;
                years.push(year);
                currentDeaths[year] = currentData[key].deaths_per_1000;
            }
        }

        for (let key in forecastData) {
            if (forecastData[key]['county code'] === countyGEOID) {
                const year = forecastData[key].year;
                if (!years.includes(year)) years.push(year);
                forecastDeaths[year] = forecastData[key].deaths_per_1000;
            }
        }

        years.sort((a, b) => a - b);

        const lastActualYear = Math.max(...Object.keys(currentDeaths).map(Number));

        const currentDataArray = years.map(year => currentDeaths[year] !== undefined ? currentDeaths[year] : null);
        const forecastDataArray = years.map(year => {
            if (year === lastActualYear) {
                return currentDeaths[year];
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
                    borderDash: [5, 5]
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
                        beginAtZero: true,
                        min: 0,  // Set the minimum value for the y-axis
                        max: 5  // Set the maximum value for the y-axis, adjust this based on what's comparable across counties
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
            const mostImportantFeature = cachedMostImportantFeatures[countyGEOID][year].mostImportantFeature;
            const tooltipContent = `County: ${layer.feature.properties.NAME}<br>Most Important Feature (${year}): ${mostImportantFeature}`;
            layer.bindTooltip(tooltipContent, {
                direction: 'auto',
                className: 'custom-tooltip',
                maxWidth: 400,
                sticky: true,
                pane: 'tooltipPane',
                autoPan: true
            }).openTooltip();
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

    if (year > 2022) {
        deathData = Object.values(forecastDeaths).find(entry => entry['county code'] === countyGEOID && entry.year === year);
        if (deathData) {
            return { deathRate: deathData.deaths_per_1000, isForecast: true };
        }
    }

    return { deathRate: null, isForecast: false };
}

const flipRankMapping = {
    'years of potential life lost rate': -1,
    '% children in poverty': -1,
    '80th percentile income': 1,
    '% severe housing problems': -1,
    'chlamydia rate': -1,
    'teen birth rate': -1,
    '20th percentile income': 1,
    '% long commute - drives alone': -1,
    'dentist rate': 1,
    '% physically inactive': -1,
    '% unemployed': -1,
    'food environment index': 1,
    'labor force': 1,
    'average daily pm2.5': -1,
    '% some college': 1,
    '% uninsured': -1,
    'injury death rate': -1,
    'income ratio': 1,
    'population': 1,
    'deaths_per_1000': -1,
    '# workers who drive alone_per_1000': -1,
    '# uninsured_per_1000': -1,
    '# associations_per_1000': 1,
    '# unemployed_per_1000': -1,
    '# dentists_per_1000': 1,
    '# injury deaths_per_1000': -1,
    '# chlamydia cases_per_1000': -1,
    '# alcohol-impaired driving deaths_per_1000': -1,
    '# driving deaths_per_1000': -1,
    '# primary care physicians_per_1000': 1,
    '# some college_per_1000': 1
};

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

document.getElementById('generate-report').addEventListener('click', function () {
    const { jsPDF } = window.jspdf;
    const countyGEOID = new URLSearchParams(window.location.search).get('county'); // Capture the countyGEOID

    if (!countyGEOID) {
        console.error('County GEOID is not defined');
        return;
    }

    const countyName = document.getElementById('county-name').textContent; // Get county name here

    const doc = new jsPDF();
    let pageWidth = doc.internal.pageSize.width;
    let pageHeight = doc.internal.pageSize.height; // Define pageHeight
    let y = 20;  // Adjusted for title
    const margin = 10;

    // Add title with county name
    doc.setFontSize(22);
    doc.text(countyName + " County Report", margin, y);
    y += 10;

    // Capture and adjust the line chart
    html2canvas(document.getElementById('deathsChart'), { backgroundColor: 'white' }).then(function (canvas) {
        const chartData = canvas.toDataURL('image/png');
        const chartWidth = pageWidth / 2 - margin;
        const chartHeight = canvas.height * (chartWidth / canvas.width);

        // Add the line chart on the left side
        doc.addImage(chartData, 'PNG', margin, y, chartWidth, chartHeight);
        y += chartHeight + 10;

        // Add the most important features over the years on the right side
        let tableY = y;
        const rightMargin = margin + chartWidth + 10;

        doc.setFontSize(14);
        doc.text('Top 3 Most Important Features Over the Years', rightMargin, tableY);
        tableY += 7;

        const maxFeaturesPerYear = 3; // Display top 3 features for each year

        const years = Object.keys(cachedMostImportantFeatures[countyGEOID]);
        let latestFeature = null;

        years.forEach(year => {
            const yearData = cachedMostImportantFeatures[countyGEOID][year];
            if (yearData.important_features.length > 0) { // Only include years with data
                doc.setFontSize(10);
                doc.text(`${year}:`, rightMargin, tableY);
                tableY += 5;
                yearData.important_features.slice(0, maxFeaturesPerYear).forEach((feature, index) => {
                    doc.text(`- ${feature.Feature}: ${feature.Weight.toFixed(2)}`, rightMargin + 5, tableY);
                    tableY += 5;
                });
                tableY += 3;

                // Keep track of the latest important feature for the map coloring
                if (!latestFeature || parseInt(year) >= parseInt(latestFeature.year)) {
                    latestFeature = { feature: yearData.important_features[0].Feature, year: year };
                }
            }
        });

        // Prepare the map with the outline and color based on the latest important feature
        const tempMapContainer = document.createElement('div');
        tempMapContainer.id = 'temp-county-map';
        tempMapContainer.style.width = '400px';
        tempMapContainer.style.height = '300px';
        tempMapContainer.style.margin = '0 auto'; // Center the map container
        document.body.appendChild(tempMapContainer);

        const tempMap = L.map(tempMapContainer, {
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            zoomControl: false,
            attributionControl: false
        });

        fetch('counties.geojson')
            .then(response => response.json())
            .then(data => {
                const county = data.features.find(f => f.properties.GEOID === countyGEOID);
                if (county) {
                    const geoJsonLayer = L.geoJSON(county, {
                        style: {
                            color: getColorByFeature(latestFeature.feature), // Set color based on the latest important feature
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.6
                        }
                    }).addTo(tempMap);
                    tempMap.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] }); // Centered and zoomed out to fit the county

                    setTimeout(() => {
                        html2canvas(tempMapContainer).then(function (canvas) {
                            const mapData = canvas.toDataURL('image/png');
                            const mapWidth = pageWidth / 2 - margin;
                            const mapHeight = canvas.height * (mapWidth / canvas.width);

                            // Position the map image below the line chart on the left side
                            const mapX = margin;
                            const mapY = y;

                            doc.addImage(mapData, 'PNG', mapX, mapY, mapWidth, mapHeight);

                            // Finalize and save the PDF
                            doc.save(`${countyName}_Report.pdf`);

                            // Remove the temporary map container
                            tempMap.remove();
                            document.body.removeChild(tempMapContainer);
                        });
                    }, 1000); // Adding a small delay to ensure the map is properly rendered
                }
            })
            .catch(error => {
                console.error('Error loading county data for map:', error);
            });
    });
});
