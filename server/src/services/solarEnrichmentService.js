const Nonprofit = require('../models/Nonprofit');
const NonprofitLocation = require('../models/NonprofitLocation');
const { geocodeAddress } = require('./geocodingService');
const { fetchBuildingInsights, computeSolarBenefitScore, DEFAULT_SYSTEM_KW } = require('./solarService');
const { fetchBuildingSystemKw } = require('./osmService');
const { getRateForLocation } = require('./rateService');

const SOLAR_TTL_DAYS = 180;
const GEOCODE_BATCH = 100;
const SOLAR_BATCH = 500;
const REQUEST_DELAY_MS = 200;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function staleCutoff() {
  return new Date(Date.now() - SOLAR_TTL_DAYS * 86400 * 1000);
}

// Returns a geo match condition scoped to ENRICHMENT_STATE + ENRICHMENT_CITY (both optional).
function stateFilter(stateField = 'address.state', cityField = 'address.city') {
  const state = (process.env.ENRICHMENT_STATE || '').trim().toUpperCase();
  const city  = (process.env.ENRICHMENT_CITY  || '').trim();
  const filter = {};
  if (state) filter[stateField] = state;
  if (city)  filter[cityField]  = new RegExp(`^${city}$`, 'i');
  return filter;
}

// ── Single-record enrichment ──────────────────────────────────────────────────

async function geocodeAndSaveLocation(loc) {
  const result = await geocodeAddress(loc.address);
  if (!result) {
    await NonprofitLocation.updateOne({ _id: loc._id }, { $set: { geocodeFailed: true } });
    return null;
  }
  await NonprofitLocation.updateOne(
    { _id: loc._id },
    { $set: { lat: result.lat, lng: result.lng, geocoded: true, geocodeFailed: false } }
  );
  return result;
}

async function geocodeAndSaveNonprofit(nonprofit) {
  const result = await geocodeAddress(nonprofit.address);
  if (!result) {
    await Nonprofit.updateOne({ _id: nonprofit._id }, { $set: { geocodeFailed: true } });
    return null;
  }
  await Nonprofit.updateOne(
    { _id: nonprofit._id },
    { $set: { lat: result.lat, lng: result.lng, geocodeFailed: false } }
  );
  return result;
}

async function enrichLocationWithSolar(loc) {
  const [footprint, { rate, source: rateSource }] = await Promise.all([
    fetchBuildingSystemKw(loc.lat, loc.lng),
    getRateForLocation(loc.address?.zip, loc.address?.state),
  ]);
  const systemKw = footprint?.systemKw ?? DEFAULT_SYSTEM_KW;

  const sunroof = await fetchBuildingInsights(loc.lat, loc.lng, systemKw);
  if (!sunroof) {
    await NonprofitLocation.updateOne(
      { _id: loc._id },
      { $set: { 'sunroof.lastUpdated': new Date(), 'sunroof.noCoverage': true } }
    );
    return null;
  }

  const fullSunroof = {
    ...sunroof,
    roofAreaM2:  footprint?.roofAreaM2  ?? null,
    ratePerKwh:  rate,
    rateSource,
  };

  const nonprofit = await Nonprofit.findOne({ ein: loc.ein }).select('revenue');
  const score   = computeSolarBenefitScore(nonprofit || {}, fullSunroof, rate);
  const savings = sunroof.solarPotentialKwhYear * rate;

  await NonprofitLocation.updateOne(
    { _id: loc._id },
    { $set: { sunroof: fullSunroof, solarBenefitScore: score, estimatedAnnualSavings: savings } }
  );

  // Bubble best building score up to the parent Nonprofit for ranking
  if (score != null) {
    await Nonprofit.updateOne(
      { ein: loc.ein, $or: [{ solarBenefitScore: { $lt: score } }, { solarBenefitScore: { $exists: false } }] },
      { $set: { solarBenefitScore: score, estimatedAnnualSavings: savings } }
    );
  }

  return score;
}

async function enrichNonprofitWithSolar(nonprofit) {
  const [footprint, { rate, source: rateSource }] = await Promise.all([
    fetchBuildingSystemKw(nonprofit.lat, nonprofit.lng),
    getRateForLocation(nonprofit.address?.zip, nonprofit.address?.state),
  ]);
  const systemKw = footprint?.systemKw ?? DEFAULT_SYSTEM_KW;

  const sunroof = await fetchBuildingInsights(nonprofit.lat, nonprofit.lng, systemKw);
  if (!sunroof) {
    await Nonprofit.updateOne(
      { _id: nonprofit._id },
      { $set: { 'sunroof.lastUpdated': new Date(), 'sunroof.noCoverage': true } }
    );
    return null;
  }

  const fullSunroof = {
    ...sunroof,
    roofAreaM2:  footprint?.roofAreaM2  ?? null,
    ratePerKwh:  rate,
    rateSource,
  };

  const score   = computeSolarBenefitScore(nonprofit, fullSunroof, rate);
  const savings = sunroof.solarPotentialKwhYear * rate;

  await Nonprofit.updateOne(
    { _id: nonprofit._id },
    { $set: { sunroof: fullSunroof, solarBenefitScore: score, estimatedAnnualSavings: savings } }
  );
  return score;
}

// ── Batch jobs ────────────────────────────────────────────────────────────────

async function runGeocodeLocations() {
  const sf = stateFilter('address.state');
  const docs = await NonprofitLocation.find({
    ...sf,
    geocoded: { $ne: true },
    geocodeFailed: { $ne: true },
    $or: [{ 'address.street': { $exists: true, $ne: '' } }, { 'address.raw': { $exists: true, $ne: '' } }],
  }).limit(GEOCODE_BATCH).select('_id address');

  let ok = 0, failed = 0;
  for (const loc of docs) {
    try {
      const r = await geocodeAndSaveLocation(loc);
      r ? ok++ : failed++;
    } catch (err) {
      failed++;
      console.error(`[Geocode] Location ${loc._id}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[Geocode] Locations — ok: ${ok}, failed: ${failed}`);
  return { ok, failed };
}

async function runGeocodeNonprofits() {
  const sf = stateFilter('address.state');
  const docs = await Nonprofit.find({
    ...sf,
    lat: { $exists: false },
    geocodeFailed: { $ne: true },
    'address.street': { $exists: true, $ne: '' },
  }).sort({ assets: -1 }).limit(GEOCODE_BATCH).select('_id address assets');

  let ok = 0, failed = 0;
  for (const np of docs) {
    try {
      const r = await geocodeAndSaveNonprofit(np);
      r ? ok++ : failed++;
    } catch (err) {
      failed++;
      console.error(`[Geocode] Nonprofit ${np._id}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[Geocode] Nonprofits — ok: ${ok}, failed: ${failed}`);
  return { ok, failed };
}

async function runSolarLocations() {
  const cutoff = staleCutoff();
  const sf = stateFilter('address.state');
  const docs = await NonprofitLocation.find({
    ...sf,
    geocoded: true,
    $or: [
      { 'sunroof.lastUpdated': { $exists: false } },
      { 'sunroof.lastUpdated': { $lt: cutoff } },
    ],
    'sunroof.noCoverage': { $ne: true },
  }).sort({ confidence: -1 }).limit(SOLAR_BATCH).select('_id ein lat lng address');

  let enriched = 0, noData = 0;
  for (const loc of docs) {
    try {
      const score = await enrichLocationWithSolar(loc);
      score != null ? enriched++ : noData++;
    } catch (err) {
      console.error(`[Solar] Location ${loc._id}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[Solar] Locations — enriched: ${enriched}, no coverage: ${noData}`);
  return { enriched, noData };
}

async function runSolarNonprofits() {
  const cutoff = staleCutoff();
  const sf = stateFilter('address.state');
  const docs = await Nonprofit.find({
    ...sf,
    lat: { $exists: true },
    lng: { $exists: true },
    $or: [
      { 'sunroof.lastUpdated': { $exists: false } },
      { 'sunroof.lastUpdated': { $lt: cutoff } },
    ],
    'sunroof.noCoverage': { $ne: true },
  }).sort({ assets: -1 }).limit(SOLAR_BATCH).select('_id ein lat lng revenue address');

  let enriched = 0, noData = 0;
  for (const np of docs) {
    try {
      const score = await enrichNonprofitWithSolar(np);
      score != null ? enriched++ : noData++;
    } catch (err) {
      console.error(`[Solar] Nonprofit ${np.ein}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[Solar] Nonprofits — enriched: ${enriched}, no coverage: ${noData}`);
  return { enriched, noData };
}

async function runSolarBatch() {
  const state = (process.env.ENRICHMENT_STATE || '').trim().toUpperCase() || 'all states';
  const city  = (process.env.ENRICHMENT_CITY  || '').trim() || 'all cities';
  console.log(`[Solar] Running batch for: ${state} / ${city}`);
  const geo = await Promise.all([runGeocodeLocations(), runGeocodeNonprofits()]);
  await sleep(1000);
  const solar = await Promise.all([runSolarLocations(), runSolarNonprofits()]);
  return { geocoding: geo, solar };
}

async function enrichEin(ein) {
  const nonprofit = await Nonprofit.findOne({ ein });
  if (!nonprofit) throw new Error(`Nonprofit ${ein} not found`);

  const results = { geocoded: 0, solar: 0, locations: [] };

  if (!nonprofit.lat) {
    const g = await geocodeAndSaveNonprofit(nonprofit);
    if (g) { results.geocoded++; nonprofit.lat = g.lat; nonprofit.lng = g.lng; }
  }
  if (nonprofit.lat) {
    const score = await enrichNonprofitWithSolar(nonprofit);
    if (score != null) results.solar++;
  }

  const locs = await NonprofitLocation.find({ ein });
  for (const loc of locs) {
    if (!loc.geocoded) {
      const g = await geocodeAndSaveLocation(loc);
      if (g) { results.geocoded++; loc.lat = g.lat; loc.lng = g.lng; loc.geocoded = true; }
    }
    if (loc.geocoded) {
      const score = await enrichLocationWithSolar(loc);
      results.locations.push({ locationId: loc._id, score });
      if (score != null) results.solar++;
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return results;
}

module.exports = { runSolarBatch, enrichEin };
