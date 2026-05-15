/**
 * cache_utility_rates.js
 *
 * Pre-warms the UtilityRateCache MongoDB collection with URDB/EIA rates for
 * every zip code found in the Nonprofit collection for a given state. After
 * this runs, all enrichment-time rate lookups hit MongoDB instead of the
 * live URDB API.
 *
 * Usage (inside the server container):
 *   node scripts/cache_utility_rates.js [STATE]
 *
 * Defaults to ENRICHMENT_STATE env var, then KY.
 * Already-cached zips are skipped (idempotent).
 */

require('dotenv').config();
const mongoose         = require('mongoose');
const Nonprofit        = require('../src/models/Nonprofit');
const UtilityRateCache = require('../src/models/UtilityRateCache');
const { getRateForLocation } = require('../src/services/rateService');

const REQUEST_DELAY = 300; // ms — conservative to avoid URDB throttling

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const state = (process.argv[2] || process.env.ENRICHMENT_STATE || 'KY').trim().toUpperCase();

  console.log(`[Rates] Connecting to MongoDB…`);
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/solar_harvest');
  console.log(`[Rates] Connected. Pre-warming utility rate cache for ${state}…`);

  // All raw zip values for this state (includes zip+4 variants like 40508--2021)
  const rawZips = await Nonprofit.distinct('address.zip', {
    'address.state': state,
    'address.zip': { $exists: true, $ne: '' },
  });

  // Deduplicate to 5-digit zips
  const zips = [...new Set(rawZips.map(z => z.replace(/\D/g, '').slice(0, 5)).filter(z => z.length === 5))];
  console.log(`[Rates] ${zips.length} unique zip codes found for ${state}`);

  // Find already-cached zips
  const cached = await UtilityRateCache.find({ zip: { $in: zips } }).select('zip').lean();
  const cachedSet = new Set(cached.map(c => c.zip));
  const todo = zips.filter(z => !cachedSet.has(z));
  console.log(`[Rates] ${cachedSet.size} already cached, ${todo.length} to fetch`);

  let ok = 0, fallback = 0, failed = 0;
  for (const zip of todo) {
    try {
      const { rate, source } = await getRateForLocation(zip, state);

      await UtilityRateCache.findOneAndUpdate(
        { zip },
        { zip, state, ratePerKwh: rate, source, cachedAt: new Date() },
        { upsert: true }
      );

      if (source === 'urdb') ok++;
      else fallback++;

      if ((ok + fallback + failed) % 50 === 0) {
        console.log(`[Rates] Progress: urdb:${ok}, fallback:${fallback}, failed:${failed}`);
      }
    } catch (err) {
      console.error(`[Rates] Error for zip ${zip}: ${err.message}`);
      failed++;
    }
    await sleep(REQUEST_DELAY);
  }

  const total = await UtilityRateCache.countDocuments({ state });
  console.log(`[Rates] DONE — urdb:${ok}, fallback:${fallback}, failed:${failed}`);
  console.log(`[Rates] ${state} now has ${total} cached zip codes`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
