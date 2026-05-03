const cron = require('node-cron');
const { checkAndImportIfNew } = require('./irsImportService');
const { runBatchEnrichment } = require('./enrichmentService');
const { ensureIndexCurrent } = require('./irsIndexService');
const { runSolarBatch } = require('./solarEnrichmentService');

// IRS EO BMF bulk data — daily at 02:00 UTC (IRS updates 2nd Tuesday monthly)
const IRS_IMPORT_SCHEDULE    = process.env.IRS_CHECK_CRON      || '0 2 * * *';
// 990 enrichment — every 6 hours, 50 highest-asset nonprofits
const ENRICHMENT_SCHEDULE    = process.env.ENRICHMENT_CRON     || '0 */6 * * *';
// IRS filing index — weekly Sunday 03:00 UTC
const INDEX_REFRESH_SCHEDULE = process.env.INDEX_REFRESH_CRON  || '0 3 * * 0';
// Geocoding + Solar API — every 4 hours, 100 geocodes + 20 solar calls
const SOLAR_SCHEDULE         = process.env.SOLAR_CRON          || '0 */4 * * *';

function start() {
  console.log('[Scheduler] Starting scheduled jobs');

  cron.schedule(IRS_IMPORT_SCHEDULE, async () => {
    try { await checkAndImportIfNew(); }
    catch (err) { console.error('[Scheduler] IRS import failed:', err.message); }
  }, { timezone: 'UTC' });

  cron.schedule(ENRICHMENT_SCHEDULE, async () => {
    try { await runBatchEnrichment(); }
    catch (err) { console.error('[Scheduler] 990 enrichment failed:', err.message); }
  }, { timezone: 'UTC' });

  cron.schedule(INDEX_REFRESH_SCHEDULE, async () => {
    try { await ensureIndexCurrent(); }
    catch (err) { console.error('[Scheduler] Index refresh failed:', err.message); }
  }, { timezone: 'UTC' });

  cron.schedule(SOLAR_SCHEDULE, async () => {
    try { await runSolarBatch(); }
    catch (err) { console.error('[Scheduler] Solar batch failed:', err.message); }
  }, { timezone: 'UTC' });

  console.log(`[Scheduler] IRS import:     ${IRS_IMPORT_SCHEDULE}`);
  console.log(`[Scheduler] 990 enrichment: ${ENRICHMENT_SCHEDULE}`);
  console.log(`[Scheduler] Index refresh:  ${INDEX_REFRESH_SCHEDULE}`);
  console.log(`[Scheduler] Solar batch:    ${SOLAR_SCHEDULE}`);
}

module.exports = { start };
