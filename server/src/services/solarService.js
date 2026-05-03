const Nonprofit = require('../models/Nonprofit');

// Placeholder — will call Google Project Sunroof Data Explorer API
// Docs: https://developers.google.com/maps/documentation/solar/overview
async function fetchSunroofData(lat, lng) {
  // TODO: implement Google Solar API call using lat/lng
  // GET https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=...&location.longitude=...&key=API_KEY
  throw new Error('Solar API integration not yet implemented');
}

// Score formula: weighted combination of solar potential and financial need
function computeSolarBenefitScore(nonprofit, sunroof) {
  if (!sunroof?.solarPotentialKwhYear) return null;
  const savingsFactor = sunroof.solarPotentialKwhYear * 0.12; // ~$0.12/kWh avg commercial rate
  const needFactor = nonprofit.revenue > 0 ? Math.min(savingsFactor / nonprofit.revenue, 1) : 0.5;
  return Math.round((savingsFactor * 0.6 + needFactor * 100000 * 0.4) / 1000);
}

async function enrichNonprofit(ein) {
  const nonprofit = await Nonprofit.findOne({ ein });
  if (!nonprofit) throw new Error(`Nonprofit ${ein} not found`);
  if (!nonprofit.lat || !nonprofit.lng) throw new Error(`No coordinates for ${ein}`);

  const sunroof = await fetchSunroofData(nonprofit.lat, nonprofit.lng);
  const score = computeSolarBenefitScore(nonprofit, sunroof);

  return Nonprofit.findOneAndUpdate(
    { ein },
    {
      sunroof: { ...sunroof, lastUpdated: new Date() },
      solarBenefitScore: score,
      estimatedAnnualSavings: sunroof.solarPotentialKwhYear * 0.12,
    },
    { new: true }
  );
}

module.exports = { enrichNonprofit, computeSolarBenefitScore };
