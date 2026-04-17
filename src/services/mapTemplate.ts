import { RenderMapParams } from "../utils/validators";

export interface RenderRouteMapParams {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  width: number;
  height: number;
}

export interface RenderOrderedRouteMapParams {
  points: Array<{
    lat: number;
    lng: number;
  }>;
  width: number;
  height: number;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildMapHtml(params: RenderMapParams): string {
  const { lat, lng, zoom, width, height } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
    crossorigin=""
  />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #f4f4f4;
    }

    #map {
      width: ${width}px;
      height: ${height}px;
    }
  </style>
</head>
<body>
  <div id="map" aria-label="Single pin map"></div>

  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
    crossorigin=""
  ></script>
  <script>
    (function () {
      const center = [${lat}, ${lng}];
      const map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView(center, ${zoom});

      const marker = L.marker(center).addTo(map);
      marker.bindTooltip(${JSON.stringify(escapeHtml(`Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`))}, {
        permanent: false,
        direction: 'top'
      });

      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      window.__MAP_READY__ = false;
      tileLayer.once('load', function () {
        map.invalidateSize();
        window.__MAP_READY__ = true;
      });

      setTimeout(function () {
        window.__MAP_READY__ = true;
      }, 5000);
    })();
  </script>
</body>
</html>`;
}

export function buildRouteMapHtml(params: RenderRouteMapParams): string {
  const { startLat, startLng, endLat, endLng, width, height } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
    crossorigin=""
  />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #f4f4f4;
    }

    #map {
      width: ${width}px;
      height: ${height}px;
    }
  </style>
</head>
<body>
  <div id="map" aria-label="Route map between two EXIF points"></div>

  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
    crossorigin=""
  ></script>
  <script>
    (function () {
      const start = [${startLat}, ${startLng}];
      const end = [${endLat}, ${endLng}];

      const map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      });

      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      L.marker(start).addTo(map).bindTooltip('Start', { direction: 'top' });
      L.marker(end).addTo(map).bindTooltip('End', { direction: 'top' });

      const routeLine = L.polyline([start, end], {
        color: '#1976d2',
        weight: 4,
        opacity: 0.9
      }).addTo(map);

      map.fitBounds(routeLine.getBounds(), {
        padding: [35, 35]
      });

      window.__MAP_READY__ = false;
      tileLayer.once('load', function () {
        map.invalidateSize();
        window.__MAP_READY__ = true;
      });

      setTimeout(function () {
        window.__MAP_READY__ = true;
      }, 5000);
    })();
  </script>
</body>
</html>`;
}

export function buildOrderedRouteMapHtml(params: RenderOrderedRouteMapParams): string {
  const { points, width, height } = params;
  const serializedPoints = JSON.stringify(points.map((point) => [point.lat, point.lng]));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
    crossorigin=""
  />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #f4f4f4;
    }

    #map {
      width: ${width}px;
      height: ${height}px;
    }
  </style>
</head>
<body>
  <div id="map" aria-label="Ordered route map from EXIF points"></div>

  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
    crossorigin=""
  ></script>
  <script>
    (function () {
      const points = ${serializedPoints};

      const map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      });

      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      points.forEach(function (point, index) {
        const label = index === 0 ? 'Start' : index === points.length - 1 ? 'End' : String(index + 1);
        L.marker(point).addTo(map).bindTooltip(label, { direction: 'top' });
      });

      const routeLine = L.polyline(points, {
        color: '#d94f04',
        weight: 4,
        opacity: 0.92
      }).addTo(map);

      map.fitBounds(routeLine.getBounds(), {
        padding: [40, 40]
      });

      window.__MAP_READY__ = false;
      tileLayer.once('load', function () {
        map.invalidateSize();
        window.__MAP_READY__ = true;
      });

      setTimeout(function () {
        window.__MAP_READY__ = true;
      }, 5000);
    })();
  </script>
</body>
</html>`;
}
