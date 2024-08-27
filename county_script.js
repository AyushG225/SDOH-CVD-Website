let cachedMostImportantFeatures = {};

document.addEventListener("DOMContentLoaded", function () {
    const mapInfoButton = document.getElementById('map-info-button');
    const chartInfoButton = document.getElementById('chart-info-button');
    const weightsInfoButton = document.getElementById('weights-info-button');

    const mapInfoModal = document.getElementById('map-info-modal');
    const mapModalContent = mapInfoModal.querySelector('.info-modal-content');

    const weightsInfoModal = document.getElementById('weights-info-modal');
    const weightsModalContent = weightsInfoModal.querySelector('.info-modal-content');

    const chartModal = document.getElementById('chart-info-modal');
    const weightsModal = document.getElementById('weights-info-modal');

    const closeButtons = document.querySelectorAll('.close-modal');

    mapInfoButton.addEventListener('click', function () {
        adjustModalSize(mapModalContent);
        mapInfoModal.style.display = 'block';
    });

    chartInfoButton.addEventListener('click', function () {
        chartModal.style.display = 'block';
    });

    weightsInfoButton.addEventListener('click', function () {
        adjustModalSize(weightsModalContent);
        weightsModal.style.display = 'block';
    });

    closeButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            button.parentElement.parentElement.style.display = 'none';
        });
    });

    window.addEventListener('click', function (event) {
        if (event.target.classList.contains('info-modal')) {
            event.target.style.display = 'none';
        }
    });

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


                cacheAllFeatureWeights(countyGEOID).then(() => {
                    initializeSliderAndMap(countyGEOID, geoJsonLayer);


                    const mostImportantFeature = cachedMostImportantFeatures[countyGEOID][2015].mostImportantFeature;
                    updateCountyColor(geoJsonLayer, mostImportantFeature);
                    displayFeatureWeights(cachedMostImportantFeatures[countyGEOID][2015].important_features);
                    addLegend(map, geoJsonLayer);


                    addHoverInfo(geoJsonLayer, countyGEOID);


                    loadAndCreateChart(countyGEOID);
                });
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

    const yearSlider = document.getElementById('year-slider');
    yearSlider.addEventListener('input', function () {
        const selectedYear = parseInt(this.value);
        document.getElementById('selected-year').textContent = selectedYear;

        const mostImportantFeature = cachedMostImportantFeatures[countyGEOID][selectedYear].mostImportantFeature;
        updateCountyColor(geoJsonLayer, mostImportantFeature);
        displayFeatureWeights(cachedMostImportantFeatures[countyGEOID][selectedYear].important_features);

        updateLegendContent(document.getElementById('legend-container'), geoJsonLayer);
    });
});

function adjustModalSize(modalContent) {
    const contentHeight = modalContent.scrollHeight;
    const windowHeight = window.innerHeight;

    if (contentHeight > windowHeight * 0.8) {
        modalContent.style.height = '80vh';
    } else {
        modalContent.style.height = 'auto';
    }

    const contentWidth = modalContent.scrollWidth;
    if (contentWidth > 900) {
        modalContent.style.width = '90%';
    } else {
        modalContent.style.width = '80%';
    }
}

function cacheAllFeatureWeights(countyGEOID) {
    return new Promise((resolve, reject) => {
        const years = [...Array(11).keys()].map(i => i + 2015);

        Promise.all([
            fetch('SDOH+HeartData2.json').then(response => response.json()),
            fetch('nonlinear_county_data.json').then(response => response.json()),
            fetch('nonlinear_forecast_county_data.json').then(response => response.json()),
            fetch('feature_importances3.json').then(response => response.json())
        ]).then(([countyData, nonlinearData, nonlinearForecastData, featureImportances]) => {
            cachedMostImportantFeatures[countyGEOID] = {};

            years.forEach(year => {
                const data = {...nonlinearData, ...nonlinearForecastData};

                let { mostImportantFeature, importantFeatures } = calculateMostImportantFeature(countyData, data, year, countyGEOID, featureImportances);
                cachedMostImportantFeatures[countyGEOID][year] = { mostImportantFeature, important_features: importantFeatures };
            });

            resolve();
        }).catch(error => {
            console.error('Error caching most important features:', error);
            reject(error);
        });
    });
}

function calculateMostImportantFeature(countyData, nonlinearData, year, countyCode, featureImportances) {
    // const countyYearData = Object.values(countyData).find(entry => entry['county code'] === countyCode && entry.year === year);
    const nonlinearYearData = Object.values(nonlinearData).find(entry => entry['county code'] === countyCode && entry.year == year);
    // console.log(nonlinearYearData);
    if (!nonlinearYearData) {
        console.error(`County code ${countyCode} not found for year ${year}`);
        return { mostImportantFeature: 'None Found', importantFeatures: [] };
    }

    let maxWeight = -1;
    let mostImportantFeature = 'None Found';
    let importantFeatures = [];

    for (let key in featureImportances) {
        const feature = featureImportances[key].Feature;
        const importance = featureImportances[key].Importance;


        if (feature !== 'year' && nonlinearYearData.hasOwnProperty(feature)) {
            // console.log(feature);
            let featureVal = nonlinearYearData[feature];
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
    yearSlider.value = 2015;
    document.getElementById('selected-year').textContent = 2015;


    cacheAllFeatureWeights(countyGEOID).then(() => {
        const mostImportantFeature = cachedMostImportantFeatures[countyGEOID][2015].mostImportantFeature;
        updateCountyColor(geoJsonLayer, mostImportantFeature);
        displayFeatureWeights(cachedMostImportantFeatures[countyGEOID][2015].important_features);
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
        'years of potential life lost rate': '#FF5733',    // -1
        '% children in poverty': '#33FFBD',               // -1
        '80th percentile income': '#3385FF',              // 1
        '% severe housing problems': '#FF33A6',           // -1
        'chlamydia rate': '#FFD133',                      // -1
        'teen birth rate': '#33FF57',                     // -1
        '20th percentile income': '#33D1FF',              // 1
        '% long commute - drives alone': '#FF8333',       // -1
        'dentist rate': '#BD33FF',                        // 1
        '% physically inactive': '#FF3333',               // -1
        '% unemployed': '#33FF83',                        // -1
        'food environment index': '#5733FF',              // 1
        'labor force': '#33FFA6',                         // 1
        'average daily pm2.5': '#FF3385',                 // -1
        '% some college': '#D1FF33',                      // 1
        '% uninsured': '#3385FF',                         // -1
        'injury death rate': '#FF5733',                   // -1
        'income ratio': '#3383FF',                        // -1
        'population': '#A6FF33',                          // 1
        'deaths_per_1000': '#FF3333',                     // -1
        '# workers who drive alone_per_1000': '#33FFBD',  // -1
        '# uninsured_per_1000': '#FF5733',                // -1
        '# associations_per_1000': '#3357FF',             // 1
        '# unemployed_per_1000': '#FF33A6',               // -1
        '# dentists_per_1000': '#5733FF',                 // 1
        '# injury deaths_per_1000': '#FF8333',            // -1
        '# chlamydia cases_per_1000': '#FFD133',          // -1
        '# alcohol-impaired driving deaths_per_1000': '#33FF57',  // -1
        '# driving deaths_per_1000': '#FF3385',           // -1
        '# primary care physicians_per_1000': '#33D1FF',  // 1
        '# some college_per_1000': '#D1FF33'              // 1
    };

    return featureColors[feature] || '#999999';
}

function displayFeatureWeights(importantFeatures) {
    const featureWeightsList = document.getElementById('feature-weights-list');
    featureWeightsList.innerHTML = '';


    importantFeatures.slice(0, 5).forEach(item => {
        const row = document.createElement('tr');
        const featureCell = document.createElement('td');
        const weightCell = document.createElement('td');

        featureCell.textContent = item.Feature;
        weightCell.textContent = item.Weight.toFixed(4);

        row.appendChild(featureCell);
        row.appendChild(weightCell);
        featureWeightsList.appendChild(row);
    });
}

function loadAndCreateChart(countyGEOID) {
    Promise.all([
        fetch('current_deaths.json').then(response => response.json()),
        fetch('deaths_forecast2.json').then(response => response.json())
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
                forecastDeaths[year] = forecastData[key].deaths_per_1000_predicted;
                // console.log(forecastDeaths[year]);
            }
        }

        years.sort((a, b) => a - b);

        const lastActualYear = Math.max(...Object.keys(currentDeaths).map(Number));
        // console.log(lastActualYear);
        const currentDataArray = years.map(year => currentDeaths[year] !== undefined ? currentDeaths[year] : null);
        const forecastDataArray = years.map(year => {
            if (year === lastActualYear) {
                return currentDeaths[year];
            }
            return year > lastActualYear ? forecastDeaths[year] : null;
        });
        console.log(forecastDataArray);

        const ctx = document.getElementById('deathsChart').getContext('2d');


        const maxDataValue = Math.max(...currentDataArray, ...forecastDataArray);


        const yAxisMax = maxDataValue > 5 ? Math.ceil(maxDataValue) : 5;

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Deaths per 1000 (Current)',
                    data: currentDataArray,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    fill: false,
                }, {
                    label: 'Deaths per 1000 (Forecast)',
                    data: forecastDataArray,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    fill: false,
                    borderDash: [5, 5],
                }]
            },
            options: {
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Year',
                            color: '#ddd'
                        },
                        ticks: {
                            color: '#ddd'
                        },
                        grid: {
                            color: '#555'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Deaths per 1000',
                            color: '#ddd'
                        },
                        ticks: {
                            color: '#ddd'
                        },
                        grid: {
                            color: '#555'
                        },
                        beginAtZero: true,
                        max: yAxisMax,
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#ddd'
                        }
                    }
                },
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 20,
                        bottom: 20
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
    'income ratio': -1,
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

function addLegend(map, geoJsonLayer) {
    const legendContainer = document.getElementById('legend-container');
    updateLegendContent(legendContainer, geoJsonLayer);

    document.getElementById('year-slider').addEventListener('input', function () {
        updateLegendContent(legendContainer, geoJsonLayer);
    });
}

function updateLegendContent(container, geoJsonLayer) {
    const year = document.getElementById('year-slider').value;
    const features = new Set();


    geoJsonLayer.eachLayer(function (layer) {
        const countyCode = layer.feature.properties.GEOID;
        const mostImportantFeature = cachedMostImportantFeatures[countyCode] && cachedMostImportantFeatures[countyCode][year]
            ? cachedMostImportantFeatures[countyCode][year].mostImportantFeature
            : null;
        if (mostImportantFeature) {
            features.add(mostImportantFeature);
        }
    });

    container.innerHTML = '';

    features.forEach(function (feature) {
        container.innerHTML +=
            '<i style="background:' + getColorByFeature(feature) + '"></i> ' +
            feature + '<br>';
    });
}

document.getElementById('generate-report').addEventListener('click', function () {
    const { jsPDF } = window.jspdf;
    const countyGEOID = new URLSearchParams(window.location.search).get('county');

    if (!countyGEOID) {
        console.error('County GEOID is not defined');
        return;
    }

    const doc = new jsPDF();
    let pageHeight = doc.internal.pageSize.height;
    let pageWidth = doc.internal.pageSize.width;
    let y = 10;
    const margin = 10;


    const countyName = document.getElementById('county-name').textContent;
    const countyDescription = document.getElementById('county-description').textContent;
    doc.setFontSize(14);
    doc.text(countyName, margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(countyDescription, margin, y);
    y += 8;


    const years = Object.keys(cachedMostImportantFeatures[countyGEOID]);
    let tableY = y + 5;

    doc.setFontSize(12);
    doc.text('Most Important Features Over the Years', margin, tableY);
    tableY += 7;

    const maxFeaturesPerYear = 3;

    years.forEach(year => {
        const yearData = cachedMostImportantFeatures[countyGEOID][year];
        doc.setFontSize(10);
        doc.text(`${year}:`, margin, tableY);
        tableY += 5;
        yearData.important_features.slice(0, maxFeaturesPerYear).forEach((feature, index) => {
            doc.text(`- ${feature.Feature}: ${feature.Weight.toFixed(2)}`, margin + 5, tableY);
            tableY += 5;
        });
        tableY += 3;
    });


    const tempMapContainer = document.createElement('div');
    tempMapContainer.id = 'temp-county-map';
    tempMapContainer.style.width = '300px';
    tempMapContainer.style.height = '200px';
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
                const geoJsonLayer = L.geoJSON(county).addTo(tempMap);
                tempMap.fitBounds(geoJsonLayer.getBounds(), { padding: [10, 10] });

                setTimeout(() => {
                    html2canvas(tempMapContainer).then(function (canvas) {
                        const imgData = canvas.toDataURL('image/png');
                        const mapWidth = pageWidth / 4;
                        const mapHeight = canvas.height * (mapWidth / canvas.width);


                        doc.addImage(imgData, 'PNG', pageWidth - mapWidth - margin, margin, mapWidth, mapHeight);


                        html2canvas(document.getElementById('deathsChart')).then(function (canvas) {
                            const chartData = canvas.toDataURL('image/png');
                            const chartWidth = pageWidth - 2 * margin;
                            const chartHeight = canvas.height * (chartWidth / canvas.width);


                            const remainingHeight = pageHeight - (tableY + mapHeight + 10);
                            const chartY = tableY + mapHeight + 10 + Math.max(0, remainingHeight - chartHeight);

                            doc.addImage(chartData, 'PNG', margin, chartY, chartWidth, chartHeight);


                            doc.save(`${countyName}_Report.pdf`);


                            tempMap.remove();
                            document.body.removeChild(tempMapContainer);
                        });
                    });
                }, 1000);
            }
        })
        .catch(error => {
            console.error('Error loading county data for map:', error);
        });
});
