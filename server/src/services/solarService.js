const https = require('https');
const { NATIONAL_AVG } = require('./rateService');

// Lazy-require to avoid circular dep at load time
function getGrid() { return require('../models/SolarGrid'); }

const PVWATTS_URL       = 'https://developer.nrel.gov/api/pvwatts/v8.json';
const DEFAULT_SYSTEM_KW = 100;
const MAX_GRID_DIST_M   = 20_000; // ignore grid cells more than 20 km away

function pvwattsRequest(lat, lng, systemKw) {
  const key    = process.env.NREL_API_KEY || 'DEMO_KEY';
  const params = new URLSearchParams({
    api_key: key, lat: lat.toFixed(5), lon: lng.toFixed(5),
    system_capacity: systemKw,
    azimuth: 180, tilt: 20, array_type: 1, module_type: 1, losses: 14,
  });
  return new Promise((resolve, reject) => {
    https.get(`${PVWATTS_URL}?${params}`, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function buildSunroof(kwhYear, systemKw) {
  return {
    solarPotentialKwhYear:      Math.round(kwhYear),
    panelCapacityWatts:         systemKw * 1000,
    solradAnnual:               null,
    roofSegmentCount:           null,
    carbonOffsetFactorKgPerMwh: null,
    percentCovered:             null,
    lastUpdated:                new Date(),
  };
}

// Returns parsed solar object or null when location has no PVWatts coverage.
// Grid lookup is attempted first; falls back to live API when grid is not populated.
async function fetchBuildingInsights(lat, lng, systemKw = DEFAULT_SYSTEM_KW) {
  // ── 1. Grid lookup (fast, zero API quota) ────────────────────────────────
  try {
    const SolarGrid = getGrid();
    const cell = await SolarGrid.findOne({
      loc: {
        $near: {
          $geometry:    { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: MAX_GRID_DIST_M,
        },
      },
    }).select('kwhPerKw').lean();

    if (cell?.kwhPerKw) {
      return buildSunroof(cell.kwhPerKw * systemKw, systemKw);
    }
  } catch { /* grid collection not yet created — fall through to live API */ }

  // ── 2. Live PVWatts call (consumes API quota) ─────────────────────────────
  const { status, body } = await pvwattsRequest(lat, lng, systemKw);

  if (status !== 200) throw new Error(`PVWatts HTTP ${status}: ${JSON.stringify(body)}`);

  if (body.errors?.length) {
    const msg = body.errors.join(', ');
    if (/outside|invalid|not.*cover/i.test(msg)) return null;
    throw new Error(`PVWatts error: ${msg}`);
  }

  const out = body.outputs;
  if (!out?.ac_annual) return null;
  return buildSunroof(out.ac_annual, systemKw);
}

// Score 0–100:  50% solar yield · 35% financial impact · 15% roof quality
function computeSolarBenefitScore(entity, sunroof, ratePerKwh = NATIONAL_AVG) {
  if (!sunroof?.solarPotentialKwhYear) return null;

  const kwhYear = sunroof.solarPotentialKwhYear;
  const savings = kwhYear * ratePerKwh;
  const revenue = entity.revenue ?? 0;

  const yieldScore  = Math.min(100, (kwhYear / 500_000) * 100);
  const impactScore = revenue > 0 ? Math.min(100, (savings / (revenue * 0.10)) * 100) : 50;
  const roofScore   = sunroof.percentCovered != null ? sunroof.percentCovered * 100 : 50;

  return Math.round(Math.min(100, 0.50 * yieldScore + 0.35 * impactScore + 0.15 * roofScore));
}

module.exports = { fetchBuildingInsights, computeSolarBenefitScore, DEFAULT_SYSTEM_KW };
