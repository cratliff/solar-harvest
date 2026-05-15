const https = require('https');

// Lazy-required to avoid circular deps at module load time
function getRateCache() { return require('../models/UtilityRateCache'); }

// EIA Electric Power Monthly, Table 5.6.B — commercial rates $/kWh (2024 annual avg)
const STATE_RATES = {
  AL:0.0942, AK:0.2221, AZ:0.0978, AR:0.0793, CA:0.2002, CO:0.0852, CT:0.1837,
  DE:0.1100, FL:0.1065, GA:0.0847, HI:0.3461, ID:0.0668, IL:0.0902, IN:0.0822,
  IA:0.0793, KS:0.0861, KY:0.0770, LA:0.0799, ME:0.1644, MD:0.1218, MA:0.1997,
  MI:0.0980, MN:0.0905, MS:0.0929, MO:0.0808, MT:0.0892, NE:0.0792, NV:0.0942,
  NH:0.1838, NJ:0.1308, NM:0.0918, NY:0.1642, NC:0.0868, ND:0.0866, OH:0.0917,
  OK:0.0818, OR:0.0939, PA:0.1039, RI:0.1828, SC:0.0829, SD:0.0895, TN:0.0892,
  TX:0.0850, UT:0.0788, VT:0.1635, VA:0.0798, WA:0.0611, WV:0.0805, WI:0.1001,
  WY:0.0719, DC:0.1358,
};
const NATIONAL_AVG = 0.0900;

function urdbGet(zip) {
  const key = process.env.NREL_API_KEY || 'DEMO_KEY';
  const url  = `https://api.openei.org/utility_rates?version=8&format=json` +
    `&api_key=${key}&address=${zip}&sector=Commercial&limit=20&detail=full`;

  return new Promise(resolve => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function extractFlatRate(item) {
  if (item.averageretailprice > 0) {
    const r = item.averageretailprice / 100;
    if (r > 0.01 && r < 2) return r;
  }
  const s = item.energyratestructure;
  if (Array.isArray(s) && s.length >= 1 && Array.isArray(s[0]) && s[0].length >= 1) {
    const r = s[0][0]?.rate;
    if (typeof r === 'number' && r > 0.01 && r < 2) return r;
  }
  return null;
}

// Returns { rate: $/kWh, source: string }.
// Lookup order: MongoDB cache → live URDB API → EIA state average → national default.
async function getRateForLocation(zip, state) {
  const cleanZip = (zip || '').replace(/\D/g, '').slice(0, 5);

  if (cleanZip.length === 5) {
    // 1. MongoDB cache (populated by cache_utility_rates.js or saved from prior live lookup)
    try {
      const UtilityRateCache = getRateCache();
      const cached = await UtilityRateCache.findOne({ zip: cleanZip }).select('ratePerKwh source').lean();
      if (cached?.ratePerKwh) return { rate: cached.ratePerKwh, source: cached.source };
    } catch { /* model not yet connected — fall through */ }

    // 2. Live URDB lookup; save result to cache for next time
    const body  = await urdbGet(cleanZip);
    const items = body?.items ?? [];
    const rates = items.map(extractFlatRate).filter(Boolean);

    if (rates.length > 0) {
      const avg    = rates.reduce((a, b) => a + b, 0) / rates.length;
      const rate   = +avg.toFixed(4);
      const result = { rate, source: 'urdb' };
      try {
        const UtilityRateCache = getRateCache();
        await UtilityRateCache.findOneAndUpdate(
          { zip: cleanZip },
          { zip: cleanZip, state: (state || '').toUpperCase(), ratePerKwh: rate, source: 'urdb', cachedAt: new Date() },
          { upsert: true }
        );
      } catch { /* ignore cache write failure */ }
      return result;
    }
  }

  // 3. EIA state average
  const stateRate = STATE_RATES[(state || '').toUpperCase()];
  if (stateRate) return { rate: stateRate, source: 'eia_state_avg' };

  return { rate: NATIONAL_AVG, source: 'default' };
}

module.exports = { getRateForLocation, STATE_RATES, NATIONAL_AVG };
