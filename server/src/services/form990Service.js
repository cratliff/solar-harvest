const https = require('https');
const { XMLParser } = require('fast-xml-parser');
const { extractAddressesFromText } = require('../utils/addressExtractor');

const XML_BASE = 'https://s3.amazonaws.com/irs-form-990';
const xmlParser = new XMLParser({ ignoreAttributes: true, isArray: (name) => ARRAY_FIELDS.has(name) });

// Fields that should always be treated as arrays even when only one element exists
const ARRAY_FIELDS = new Set([
  'ProgramSrvcAccomplishmentGrp',
  'SupplementalInformationDetail',
]);

function toNum(val) {
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function fetchXml(objectId) {
  const url = `${XML_BASE}/${objectId}_public.xml`;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 404) return resolve(null);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseFinancials(doc) {
  const f = doc?.Return?.ReturnData?.IRS990 || {};
  const sched = doc?.Return?.ReturnData?.IRS990ScheduleD || {};

  return {
    revenue: toNum(f.TotalRevenueAmt ?? f.CYTotalRevenueAmt),
    assets: toNum(f.TotalAssetsEOYAmt ?? f.TotalAssetsAmt),
    propertyNetBookValue: toNum(sched.LandBldgEquipNetBookValueAmt),
  };
}

function parseNarrativeLocations(doc, objectId, taxYear) {
  const f = doc?.Return?.ReturnData?.IRS990 || {};
  const schedO = doc?.Return?.ReturnData?.IRS990ScheduleO;
  const locations = [];

  const addFromText = (text, field, source) => {
    for (const raw of extractAddressesFromText(text)) {
      locations.push({
        source,
        sourceDetail: { filingYear: taxYear, objectId, field },
        address: { raw },
        confidence: 0.4,
      });
    }
  };

  // Part III — Program Service Accomplishments
  for (const [i, grp] of (f.ProgramSrvcAccomplishmentGrp || []).entries()) {
    if (grp.Desc) addFromText(grp.Desc, `ProgramSrvcAccomplishmentGrp[${i}]`, 'form_990_narrative');
  }

  // Schedule O — Supplemental Information
  const supplemental = schedO?.SupplementalInformationDetail || [];
  for (const [i, detail] of supplemental.entries()) {
    if (detail.ExplanationTxt) addFromText(detail.ExplanationTxt, `ScheduleO[${i}]`, 'form_990_scheduleO');
  }

  return locations;
}

async function fetch990Data(objectId, taxYear) {
  const xml = await fetchXml(objectId);
  if (!xml) return null;

  const doc = xmlParser.parse(xml);
  return {
    financials: parseFinancials(doc),
    narrativeLocations: parseNarrativeLocations(doc, objectId, taxYear),
  };
}

module.exports = { fetch990Data };
