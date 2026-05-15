/**
 * populate_solar_grid.js
 *
 * Pre-computes a PVWatts kWh/kW/year value for every 0.1° grid cell covering
 * one or more US states. Results are stored in the SolarGrid collection so that
 * all future building-level solar scoring is a fast local $near lookup rather
 * than a live API call.
 *
 * Usage (inside the server container):
 *   node scripts/populate_solar_grid.js [STATE [STATE ...]]
 *   node scripts/populate_solar_grid.js KY OH TN   # multiple states
 *
 * Defaults to ENRICHMENT_STATE env var, then KY if unset.
 *
 * Rate: ~250 ms between requests → ~200–240 calls/min, well under 300/min cap.
 * Kentucky (~2,000 points) takes roughly 8–10 minutes.
 */

require('dotenv').config();
const https    = require('https');
const mongoose = require('mongoose');
const SolarGrid = require('../src/models/SolarGrid');

// ── State bounding boxes ──────────────────────────────────────────────────────
// Extend this table when adding new states.
const STATE_BOUNDS = {
  KY: { minLat: 36.5, maxLat: 39.2, minLng: -89.6, maxLng: -81.8 },
  TN: { minLat: 34.9, maxLat: 36.7, minLng: -90.3, maxLng: -81.6 },
  OH: { minLat: 38.4, maxLat: 42.0, minLng: -84.8, maxLng: -80.5 },
  IN: { minLat: 37.7, maxLat: 41.8, minLng: -88.1, maxLng: -84.8 },
  VA: { minLat: 36.5, maxLat: 39.5, minLng: -83.7, maxLng: -75.2 },
  WV: { minLat: 37.2, maxLat: 40.6, minLng: -82.6, maxLng: -77.7 },
};

const GRID_STEP       = 0.1;    // degrees
const REQUEST_DELAY   = 3700;   // ms between calls — NREL free tier: 1,000 req/hr = one per 3.6s
const PVWATTS_URL     = 'https://developer.nrel.gov/api/pvwatts/v8.json';
const MAX_DIST_DEG    = 0.15;   // reject grid cells further than this from US land (sanity)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function round1(n) { return Math.round(n * 10) / 10; }

function pvwattsUnit(lat, lng) {
  const key = process.env.NREL_API_KEY || 'DEMO_KEY';
  const params = new URLSearchParams({
    api_key: key, lat: lat.toFixed(4), lon: lng.toFixed(4),
    system_capacity: 1,  // unit capacity → result = kWh/kW/year
    azimuth: 180, tilt: 20, array_type: 1, module_type: 1, losses: 14,
  });
  return new Promise((resolve, reject) => {
    https.get(`${PVWATTS_URL}?${params}`, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (body.errors?.length) { resolve(null); return; }
          const kwhPerKw = body.outputs?.ac_annual;
          resolve(kwhPerKw > 0 ? kwhPerKw : null);
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function populateState(stateCode) {
  const bounds = STATE_BOUNDS[stateCode.toUpperCase()];
  if (!bounds) { console.error(`No bounds defined for ${stateCode}`); return; }

  // Build the full list of grid points for this state
  const points = [];
  for (let lat = bounds.minLat; lat <= bounds.maxLat + 0.001; lat = round1(lat + GRID_STEP)) {
    for (let lng = bounds.minLng; lng <= bounds.maxLng + 0.001; lng = round1(lng + GRID_STEP)) {
      points.push({ lat: round1(lat), lng: round1(lng) });
    }
  }

  // Find which points are already in the DB to skip them
  const existing = await SolarGrid.find({
    lat: { $gte: bounds.minLat, $lte: bounds.maxLat + GRID_STEP },
    lng: { $gte: bounds.minLng, $lte: bounds.maxLng + GRID_STEP },
  }).select('lat lng').lean();
  const done = new Set(existing.map(p => `${p.lat},${p.lng}`));

  const todo = points.filter(p => !done.has(`${p.lat},${p.lng}`));
  console.log(`[Grid] ${stateCode}: ${points.length} total, ${done.size} already populated, ${todo.length} to fetch`);

  if (todo.length === 0) { console.log(`[Grid] ${stateCode}: nothing to do`); return; }

  let ok = 0, skipped = 0, failed = 0;
  const startTime = Date.now();

  for (const { lat, lng } of todo) {
    try {
      const kwhPerKw = await pvwattsUnit(lat, lng);
      if (kwhPerKw != null) {
        await SolarGrid.findOneAndUpdate(
          { lat, lng },
          { lat, lng, loc: { type: 'Point', coordinates: [lng, lat] }, kwhPerKw, fetchedAt: new Date() },
          { upsert: true }
        );
        ok++;
      } else {
        skipped++; // outside dataset or ocean
      }
    } catch (err) {
      console.error(`  Error at (${lat}, ${lng}): ${err.message}`);
      failed++;
    }

    await sleep(REQUEST_DELAY);

    const done2 = ok + skipped + failed;
    if (done2 % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const eta     = Math.round(((todo.length - done2) * REQUEST_DELAY) / 1000);
      console.log(`[Grid] ${stateCode}: ${done2}/${todo.length} — ok:${ok} skipped:${skipped} failed:${failed} | ${elapsed}s elapsed, ~${eta}s remaining`);
    }
  }

  console.log(`[Grid] ${stateCode} DONE — ok:${ok}, skipped:${skipped}, failed:${failed}`);
}

async function main() {
  const stateCodes = process.argv.slice(2).map(s => s.toUpperCase());
  if (stateCodes.length === 0) {
    const env = (process.env.ENRICHMENT_STATE || 'KY').trim().toUpperCase();
    stateCodes.push(env);
  }

  console.log(`[Grid] Connecting to MongoDB…`);
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/solar_harvest');
  console.log(`[Grid] Connected. States to populate: ${stateCodes.join(', ')}`);

  for (const state of stateCodes) {
    await populateState(state);
  }

  await mongoose.disconnect();
  console.log('[Grid] All done. Disconnect OK.');
}

main().catch(err => { console.error(err); process.exit(1); });
