const https = require('https');

const SOLAR_API_URL = 'https://solar.googleapis.com/v1/buildingInsights:findClosest';
const COMMERCIAL_RATE_PER_KWH = 0.12;

function solarApiRequest(lat, lng) {
  const url = `${SOLAR_API_URL}?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=MEDIUM&key=${process.env.GOOGLE_SOLAR_API_KEY}`;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
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

// Maps the Google Solar API BuildingInsights response to our sunroof schema
function parseBuildingInsights(body) {
  const sp = body.solarPotential;
  if (!sp) return null;

  // Max annual energy = last panel config (most panels)
  const configs = sp.solarPanelConfigs || [];
  const maxConfig = configs[configs.length - 1];
  const kwhYear = maxConfig?.yearlyEnergyDcKwh ?? null;

  const roofAreaM2 = sp.wholeRoofStats?.areaMeters2 ?? null;
  const panelAreaM2 = (sp.panelHeightMeters ?? 1.879) * (sp.panelWidthMeters ?? 1.045);
  const panelCount = sp.maxArrayPanelsCount ?? null;
  const percentCovered = (roofAreaM2 && panelCount)
    ? Math.min(1, (panelCount * panelAreaM2) / roofAreaM2)
    : null;

  return {
    solarPotentialKwhYear: kwhYear,
    panelCount,
    panelCapacityWatts: sp.panelCapacityWatts ?? null,
    roofSegmentCount: sp.roofSegmentStats?.length ?? null,
    roofAreaM2,
    carbonOffsetFactorKgPerMwh: sp.carbonOffsetFactorKgPerMwh ?? null,
    percentCovered,
    maxSunshineHoursPerYear: sp.maxSunshineHoursPerYear ?? null,
    imageryQuality: body.imageryQuality ?? null,
    lastUpdated: new Date(),
  };
}

// Fetch building solar insights for a lat/lng.
// Returns parsed sunroof object, or null if location has no coverage.
async function fetchBuildingInsights(lat, lng) {
  const { status, body } = await solarApiRequest(lat, lng);

  if (status === 404) return null; // no Sunroof coverage for this location
  if (status !== 200) throw new Error(`Solar API HTTP ${status}: ${body.error?.message ?? JSON.stringify(body)}`);

  return parseBuildingInsights(body);
}

// Score (0–100) weighing solar yield, financial impact, and roof quality.
//   50% solar yield     — how much energy can be generated
//   35% financial impact — savings as % of org revenue (higher for smaller orgs)
//   15% roof quality    — % of roof usable for panels
function computeSolarBenefitScore(entity, sunroof) {
  if (!sunroof?.solarPotentialKwhYear) return null;

  const kwhYear = sunroof.solarPotentialKwhYear;
  const savings = kwhYear * COMMERCIAL_RATE_PER_KWH;
  const revenue = entity.revenue ?? 0;

  const yieldScore  = Math.min(100, (kwhYear / 500_000) * 100);
  const impactScore = revenue > 0 ? Math.min(100, (savings / (revenue * 0.10)) * 100) : 50;
  const roofScore   = sunroof.percentCovered != null ? sunroof.percentCovered * 100 : 50;

  return Math.round(Math.min(100, 0.50 * yieldScore + 0.35 * impactScore + 0.15 * roofScore));
}

module.exports = { fetchBuildingInsights, computeSolarBenefitScore, COMMERCIAL_RATE_PER_KWH };
