const https = require('https');

const SEARCH_RADIUS_M   = 60;   // metres around the geocoded point
const KW_PER_M2         = 0.15; // 150 W/m² — standard commercial panel density
const USABLE_FRACTION   = 0.75; // ~75% of footprint area is usable roof space
const MIN_SYSTEM_KW     = 5;
const MAX_SYSTEM_KW     = 1000;

function overpassPost(query) {
  const body = `data=${encodeURIComponent(query)}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'overpass-api.de',
        path: '/api/interpreter',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Shoelace formula projected to metres via equirectangular approximation.
function polygonAreaM2(coords) {
  if (!coords || coords.length < 3) return 0;
  const R = 6_371_000;
  const latMid = coords.reduce((s, c) => s + c.lat, 0) / coords.length * (Math.PI / 180);
  const pts = coords.map(c => ({
    x: c.lon * (Math.PI / 180) * R * Math.cos(latMid),
    y: c.lat * (Math.PI / 180) * R,
  }));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
}

// Returns { roofAreaM2, systemKw } or null when no building is found / on error.
async function fetchBuildingSystemKw(lat, lng) {
  const query = `
    [out:json][timeout:15];
    (
      way["building"](around:${SEARCH_RADIUS_M},${lat},${lng});
      relation["building"](around:${SEARCH_RADIUS_M},${lat},${lng});
    );
    out geom;
  `;

  let data;
  try {
    data = await overpassPost(query);
  } catch {
    return null; // Overpass unreachable — caller falls back to default
  }

  if (!data?.elements?.length) return null;

  // Pick the building with the largest footprint (most likely the nonprofit's main structure)
  let maxArea = 0;
  for (const el of data.elements) {
    let coords;
    if (el.type === 'way') {
      coords = el.geometry;
    } else if (el.type === 'relation') {
      // For multipolygon relations use the first outer ring
      const outer = el.members?.find(m => m.role === 'outer');
      coords = outer?.geometry;
    }
    const area = polygonAreaM2(coords);
    if (area > maxArea) maxArea = area;
  }

  if (maxArea === 0) return null;

  const usableM2 = maxArea * USABLE_FRACTION;
  const rawKw    = usableM2 * KW_PER_M2;
  const systemKw = Math.round(Math.min(MAX_SYSTEM_KW, Math.max(MIN_SYSTEM_KW, rawKw)));

  return { roofAreaM2: Math.round(maxArea), systemKw };
}

module.exports = { fetchBuildingSystemKw };
