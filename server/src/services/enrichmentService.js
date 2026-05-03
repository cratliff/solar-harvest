const Nonprofit = require('../models/Nonprofit');
const NonprofitLocation = require('../models/NonprofitLocation');
const { findLatestFiling } = require('./irsIndexService');
const { fetch990Data } = require('./form990Service');

const BATCH_SIZE = 50;
const ENRICHMENT_TTL_DAYS = 180;
const REQUEST_DELAY_MS = 300; // be polite to IRS S3

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function enrich990(nonprofit) {
  const filing = await findLatestFiling(nonprofit.ein);
  if (!filing) return { ein: nonprofit.ein, skipped: 'no_filing_found' };

  const data = await fetch990Data(filing.objectId, filing.taxYear);
  if (!data) return { ein: nonprofit.ein, skipped: 'xml_unavailable' };

  const { financials, narrativeLocations } = data;

  // Update Nonprofit with fresher financial data from 990
  const updates = {
    form990EnrichedAt: new Date(),
    latestFilingYear: filing.taxYear,
  };
  if (financials.revenue != null) updates.revenue = financials.revenue;
  if (financials.assets != null) updates.assets = financials.assets;
  if (financials.propertyNetBookValue != null) updates.propertyNetBookValue = financials.propertyNetBookValue;

  await Nonprofit.updateOne({ ein: nonprofit.ein }, { $set: updates });

  // Upsert discovered locations — deduplicate by raw address text
  let locationCount = 0;
  for (const loc of narrativeLocations) {
    const exists = await NonprofitLocation.findOne({
      ein: nonprofit.ein,
      'address.raw': loc.address.raw,
    });
    if (!exists) {
      await NonprofitLocation.create({ ein: nonprofit.ein, ...loc });
      locationCount++;
    }
  }

  return { ein: nonprofit.ein, taxYear: filing.taxYear, newLocations: locationCount };
}

async function runBatchEnrichment() {
  const cutoff = new Date(Date.now() - ENRICHMENT_TTL_DAYS * 86400 * 1000);

  // Prioritize nonprofits with significant assets (more likely to own buildings)
  // that haven't been enriched yet or are past TTL
  const queue = await Nonprofit.find({
    $and: [
      { $or: [{ form990EnrichedAt: { $exists: false } }, { form990EnrichedAt: { $lt: cutoff } }] },
      { assets: { $gt: 100000 } },
    ],
  })
    .sort({ assets: -1 })
    .limit(BATCH_SIZE)
    .select('ein assets');

  if (!queue.length) {
    console.log('[Enrichment] No nonprofits to enrich');
    return { processed: 0 };
  }

  console.log(`[Enrichment] Processing ${queue.length} nonprofits`);
  const results = { processed: 0, newLocations: 0, skipped: 0, errors: 0 };

  for (const nonprofit of queue) {
    try {
      const result = await enrich990(nonprofit);
      if (result.skipped) {
        results.skipped++;
      } else {
        results.processed++;
        results.newLocations += result.newLocations || 0;
      }
    } catch (err) {
      results.errors++;
      console.error(`[Enrichment] Error for EIN ${nonprofit.ein}:`, err.message);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[Enrichment] Done — processed: ${results.processed}, new locations: ${results.newLocations}, skipped: ${results.skipped}, errors: ${results.errors}`);
  return results;
}

module.exports = { runBatchEnrichment, enrich990 };
