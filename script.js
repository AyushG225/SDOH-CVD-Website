document.addEventListener("DOMContentLoaded", function () {
    
    document.getElementById('loading-spinner').style.display = 'block';

    var map = L.map('us-map', {
        maxBounds: [
            [24.396308, -125.0], 
            [49.384358, -66.93457] 
        ],
        maxBoundsViscosity: 1.0 
    }).setView([37.8, -96], 4);

    
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

    var mostImportantFeaturesCurrent = [];  
    var mostImportantFeaturesForecast = [];  
    var cachedDataCurrent = {}; 
    var cachedDataForecast = {}; 

    var selectedFeature = null; 

    
    Promise.all([
        fetch('most_important_features_year2.json').then(response => response.json()),
        fetch('most_important_features_year_forecast2.json').then(response => response.json())
    ])
        .then(data => {
            mostImportantFeaturesCurrent = [...Object.values(data[0])];
            mostImportantFeaturesForecast = [...Object.values(data[1])];

            
            mostImportantFeaturesCurrent.forEach(entry => {
                const year = entry.year;
                const countyCode = entry["county code"];
                if (!cachedDataCurrent[year]) {
                    cachedDataCurrent[year] = {};
                }
                cachedDataCurrent[year][countyCode] = entry.most_important_feature;
            });

            
            mostImportantFeaturesForecast.forEach(entry => {
                const year = entry.year + 2; 
                const countyCode = entry["county code"];
                if (!cachedDataForecast[year]) {
                    cachedDataForecast[year] = {};
                }
                cachedDataForecast[year][countyCode] = entry.most_important_feature;
            });

            
            return fetch('counties.geojson');
        })
        .then(response => response.json())
        .then(data => {
            counties = data.features;  
            geojsonLayer = L.geoJSON(data, {
                style: function (feature) {
                    return getCountyStyle(feature);
                },
                onEachFeature: onEachFeature
            }).addTo(map);

            
            var initialYear = document.getElementById('year-slider').value;
            updateMapColor(initialYear);

            
            document.getElementById('loading-spinner').style.display = 'none';

            
            addLegend(map);

        })
        .catch(error => {
            console.error('Error loading data:', error);
            
            document.getElementById('loading-spinner').style.display = 'none';
        });

    function getColorByFeature(feature) {
        
        const featureColors = {
            "years of potential life lost rate": "#FF0000",
            "# uninsured_per_1000": "#00FF00",
            "# associations_per_1000": "#0000FF",
            "# some college_per_1000": "#FFFF00",
            "# injury deaths_per_1000": "#FFA500",
            "average daily pm2.5": "#A020F0",
            "# workers who drive alone_per_1000": "#FF00FF"
        };

        
        return featureColors[feature] || '#999999';  
    }

    function getMostImportantFeatureForCounty(countyCode, year) {
        
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

    let activeTooltip = null; 
    let tooltipOpened = false; 

    function onEachFeature(feature, layer) {
        var countyCode = feature.properties.GEOID;
        var stateAbbr = stateAbbreviations[feature.properties.STATEFP];

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
                permanent: false, 
                direction: 'auto'
            });
        }

        layer.on('mouseover', function () {
            if (activeTooltip) {
                activeTooltip.closeTooltip(); 
            }
            updateTooltipContent();  
            layer.openTooltip();  
            activeTooltip = layer; 
            tooltipOpened = true; 
        });

        layer.on('mouseout', function () {
            if (tooltipOpened) {
                layer.closeTooltip();  
                activeTooltip = null; 
                tooltipOpened = false; 
            }
        });

        layer.on('click', function () {
            var currentZoom = map.getZoom();
            if (currentZoom > 5) {  
                window.location.href = `county_info.html?county=${feature.properties.GEOID}`;
            } else {
                map.flyToBounds(layer.getBounds(), {
                    duration: 1.5, 
                    easeLinearity: 0.25 
                });
            }
        });
    }

    
    map.on('movestart', function () {
        if (activeTooltip) {
            activeTooltip.closeTooltip();
            activeTooltip = null;
            tooltipOpened = false; 
        }
    });

    
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    var yearSlider = document.getElementById('year-slider');
    var selectedYearDisplay = document.getElementById('selected-year');

    
    selectedYearDisplay.textContent = yearSlider.value;

    yearSlider.addEventListener('input', debounce(function () {
        var selectedYear = this.value;
        selectedYearDisplay.textContent = selectedYear;
        updateMapColor(selectedYear);

        
        updateLegendContent(document.querySelector('.info.legend'));
    }, 200)); 

    var initialView = {
        center: [37.8, -96],
        zoom: 4
    };

    
    function resetMap() {
        
        map.flyTo(initialView.center, initialView.zoom, {
            duration: 0.8, 
            easeLinearity: 0.25 
        });

        
        geojsonLayer.eachLayer(function (layer) {
            layer.setStyle({
                fillOpacity: 0.6,
                opacity: 1,
            });
        });

        
        selectedFeature = null;
    }

    
    document.getElementById('reset-map').addEventListener('click', debounce(resetMap, 150));


    var searchInput = document.getElementById('search-input');
    var suggestions = document.getElementById('suggestions');

    
    function adjustSuggestionsWidth() {
        suggestions.style.width = searchInput.offsetWidth + 'px';
    }

    adjustSuggestionsWidth();
    window.addEventListener('resize', adjustSuggestionsWidth);

    searchInput.addEventListener('input', function () {
        var query = this.value.toLowerCase();
        suggestions.innerHTML = '';  
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
                        searchInput.value = match.properties.NAME + ", " + stateAbbr;  
                        suggestions.innerHTML = '';  
                        suggestions.style.display = 'none';
                        zoomToFeature(match);  
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
                    
                    map.flyToBounds(layer.getBounds(), {
                        duration: 1.5, 
                        easeLinearity: 0.25 
                    });

                    
                    setTimeout(function () {
                        layer.openTooltip();
                    }, 1500);  
                }
            });
        }
    }

    function addLegend(map) {
        var legend = L.control({ position: 'topright' });

        legend.onAdd = function (map) {
            var div = L.DomUtil.create('div', 'info legend');
            updateLegendContent(div); 

            
            var infoButton = L.DomUtil.create('button', 'btn btn-info btn-sm', div);
            infoButton.id = 'info-button';
            infoButton.title = 'Go to Variable Descriptions';
            infoButton.innerHTML = '<i class="fas fa-info-circle"></i>';
            infoButton.style.marginTop = '10px'; 
            infoButton.style.display = 'block'; 

            
            infoButton.addEventListener('click', function () {
                
                document.getElementById('description-section').scrollIntoView({ behavior: 'smooth' });

                
                var descriptionTable = document.getElementById('variable-description-table');

                
                descriptionTable.classList.add('glow');

                
                setTimeout(function () {
                    descriptionTable.classList.remove('glow');
                }, 2000);
            });

            return div;
        };

        legend.addTo(map);
    }



    function updateLegendContent(div) {
        var year = document.getElementById('year-slider').value;
        var features = new Set();

        
        geojsonLayer.eachLayer(function (layer) {
            var countyCode = layer.feature.properties.GEOID;
            var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);
            if (mostImportantFeature) {
                features.add(mostImportantFeature);
            }
        });

        div.innerHTML = ''; 

        features.forEach(function (feature) {
            div.innerHTML +=
                '<i style="background:' + getColorByFeature(feature) + '"></i> ' +
                feature + '<br>';
        });

        
        div.querySelectorAll('i').forEach(function (element, index) {
            element.addEventListener('click', function () {
                var clickedFeature = Array.from(features)[index];
                filterMapByFeature(clickedFeature);
            });
        });
    }

    function filterMapByFeature(feature) {
        if (selectedFeature === feature) {
            
            selectedFeature = null;
            geojsonLayer.eachLayer(function (layer) {
                layer.setStyle({
                    fillOpacity: 0.6,
                    opacity: 1,
                }).bringToFront(); 
            });
        } else {
            
            selectedFeature = feature;
            geojsonLayer.eachLayer(function (layer) {
                var countyCode = layer.feature.properties.GEOID;
                var year = document.getElementById('year-slider').value;
                var mostImportantFeature = getMostImportantFeatureForCounty(countyCode, year);

                if (mostImportantFeature === selectedFeature) {
                    layer.setStyle({
                        fillOpacity: 0.6,
                        opacity: 1,
                    }).bringToFront(); 
                } else {
                    layer.setStyle({
                        fillOpacity: 0.1,
                        opacity: 0.1,
                    }).bringToBack(); 
                }
            });
        }
    }



});