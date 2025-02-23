// Add CSS styles dynamically
const style = document.createElement('style');
style.textContent = `
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
  }
  #container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    height: 100%;
  }
  #map-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: calc(100% - 50px); /* Adjust height to leave space for the title */
    width: 100%;
  }
  #map {
    width: 100%;    /* Adjust width to your desired size */
    height: 100%;   /* Adjust height to your desired size */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); /* Optional: subtle shadow for effect */
    border-radius: 8px; /* Optional: rounded corners */
    position: relative; /* Ensure the SVG is positioned correctly */
  }
  svg {
    position: absolute;
    z-index: 1;
    width: 100%;
    height: 100%;
    pointer-events: none; /* Allow map interactions */
  }
  h1 {
    margin: 20px 0;
  }
  circle {
    fill-opacity: 0.6;
    stroke: white;
    stroke-width: 1;
    pointer-events: auto; /* Allow pointer events on circles */
    --color-departures: steelblue;
    --color-arrivals: darkorange;
    --color: color-mix(
      in oklch,
      var(--color-departures) calc(100% * var(--departure-ratio)),
      var(--color-arrivals)
    );
    fill: var(--color);
  }
  .legend {
    display: flex;
    gap: 1em;
    margin-block: 1em;
  }
  .legend > div {
    --color-departures: steelblue;
    --color-arrivals: darkorange;
    --color: color-mix(
      in oklch,
      var(--color-departures) calc(100% * var(--departure-ratio)),
      var(--color-arrivals)
    );
    background-color: var(--color);
    padding: 0.5em;
    border-radius: 0.25em;
  }
`;
document.head.appendChild(style);

mapboxgl.accessToken = 'pk.eyJ1IjoiYWx0aWxhcGlhIiwiYSI6ImNtN2dyYjExYjEwenYya3EzY2ZoY2JhaHIifQ.HmwrtVFXP-cCN_0vAC8Fpg';

const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/navigation-night-v1', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

let timeFilter = -1; // Set initial value to -1 to show circles for all times by default
let trips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

map.on('load', () => { 
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });

  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4
    }
  });

  // Select the SVG element inside the map container
  const svg = d3.select('#map').append('svg');
  let stations = [];

  // Define a helper function to convert coordinates
  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
  }

  // Load the nested JSON file
  const jsonurl = './bluebikes-stations.json'; // Corrected path to the JSON file
  d3.json(jsonurl).then(jsonData => {
    // console.log('Loaded JSON Data:', jsonData);  // Log to verify structure

    stations = jsonData.data.stations;
    // console.log('Stations Array:', stations); // Log to verify stations array

    // Load the traffic data
    const trafficUrl = './bluebikes-traffic-2024-03.csv'; // Replace with actual URL
    d3.csv(trafficUrl).then(tripsData => {
      // console.log('Loaded Traffic Data:', tripsData);  // Log to verify structure

      trips = tripsData.map(trip => {
        // Debugging statements
        // console.log('Start Time:', trip.started_at);
        // console.log('End Time:', trip.ended_at);

        return {
          ...trip,
          started_at: new Date(trip.started_at),
          ended_at: new Date(trip.ended_at)
        };
      });

      // Function to calculate minutes since midnight
      function minutesSinceMidnight(date) {
        return date.getHours() * 60 + date.getMinutes();
      }

      trips.forEach(trip => {
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);

        departuresByMinute[startedMinutes].push(trip);
        arrivalsByMinute[endedMinutes].push(trip);
      });

      // Function to filter trips by minute
      function filterByMinute(tripsByMinute, minute) {
        let minMinute = (minute - 60 + 1440) % 1440;
        let maxMinute = (minute + 60) % 1440;

        if (minMinute > maxMinute) {
          let beforeMidnight = tripsByMinute.slice(minMinute);
          let afterMidnight = tripsByMinute.slice(0, maxMinute);
          return beforeMidnight.concat(afterMidnight).flat();
        } else {
          return tripsByMinute.slice(minMinute, maxMinute).flat();
        }
      }

      // Function to filter trips by time
      function filterTripsByTime() {
        if (timeFilter === -1) {
          filteredDepartures = trips;
          filteredArrivals = trips;
        } else {
          filteredDepartures = filterByMinute(departuresByMinute, timeFilter);
          filteredArrivals = filterByMinute(arrivalsByMinute, timeFilter);
        }

        // Calculate filtered arrivals and departures
        const arrivalsMap = d3.rollup(
          filteredArrivals,
          v => v.length,
          d => d.end_station_id
        );

        const departuresMap = d3.rollup(
          filteredDepartures,
          v => v.length,
          d => d.start_station_id
        );

        // Update filtered stations
        filteredStations = stations.map(station => {
          let id = station.short_name;
          station = { ...station };
          station.arrivals = arrivalsMap.get(id) ?? 0;
          station.departures = departuresMap.get(id) ?? 0;
          station.totalTraffic = station.arrivals + station.departures;
          return station;
        });

        // Debugging statement to check totalTraffic values
        filteredStations.forEach(station => {
          console.log(`Station ${station.short_name}: totalTraffic = ${station.totalTraffic}`);
        });

        // Update the visualization
        updateVisualization();
      }

      // Create a square root scale for circle radius
      function getRadiusScale() {
        return d3.scaleSqrt()
          .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
          .range([0, 25]);
      }

      // Create a quantize scale for circle color
      const stationFlow = d3.scaleQuantize()
        .domain([0, 1])
        .range([0, 0.5, 1]);

      // Append circles to the SVG for each station
      let circles = svg.selectAll('circle')
        .data(filteredStations)
        .enter()
        .append('circle')
        .attr('r', d => getRadiusScale()(d.totalTraffic)) // Radius based on total traffic
        .style("--departure-ratio", d => {
          const ratio = d.totalTraffic > 0 ? stationFlow(d.departures / d.totalTraffic) : 0.5;
          return ratio;
        })
        .each(function(d) {
          // Add <title> for browser tooltips
          d3.select(this)
            .append('title')
            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });

      // Function to update circle positions when the map moves/zooms
      function updatePositions() {
        circles
          .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
          .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
      }

      // Function to update the visualization
      function updateVisualization() {
        circles = svg.selectAll('circle')
          .data(filteredStations);

        circles.enter()
          .append('circle')
          .merge(circles)
          .attr('r', d => getRadiusScale()(d.totalTraffic)) // Radius based on total traffic
          .style("--departure-ratio", d => {
            const ratio = d.totalTraffic > 0 ? stationFlow(d.departures / d.totalTraffic) : 0.5;
            return ratio;
          })
          .each(function(d) {
            // Add <title> for browser tooltips
            d3.select(this)
              .append('title')
              .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
          });

        updatePositions();
      }

      // Initial position update when map loads
      updatePositions();

      // Reposition markers on map interactions
      map.on('move', updatePositions);     // Update during map movement
      map.on('zoom', updatePositions);     // Update during zooming
      map.on('resize', updatePositions);   // Update on window resize
      map.on('moveend', updatePositions);  // Final adjustment after movement ends

      // Add event listener for the time slider
      const timeSlider = document.getElementById('time-slider');
      const selectedTime = document.getElementById('selected-time');
      const anyTimeLabel = document.getElementById('any-time');

      function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
        return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
      }

      function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value);  // Get slider value

        if (timeFilter === -1) {
          selectedTime.textContent = '';  // Clear time display
          anyTimeLabel.style.display = 'block';  // Show "(any time)"
        } else {
          selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
          anyTimeLabel.style.display = 'none';  // Hide "(any time)"
        }

        // Trigger filtering logic
        filterTripsByTime();
      }

      timeSlider.addEventListener('input', updateTimeDisplay);

      // Set the initial display state
      updateTimeDisplay();

    }).catch(error => {
      console.error('Error loading traffic data:', error);  // Handle errors if CSV loading fails
    });

  }).catch(error => {
    console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
  });
});