const cron = require('node-cron');
const { checkAndImportIfNew } = require('./irsImportService');
const { runBatchEnrichment } = require('./enrichmentService');
const { ensureIndexCurrent } = require('./irsIndexService');

// IRS EO BMF bulk data — daily at 02:00 UTC (IRS updates 2nd Tuesday monthly)
const IRS_IMPORT_SCHEDULE = process.env.IRS_CHECK_CRON || '0 2 * * *';

// 990 enrichment batch — every 6 hours, processes 50 highest-value nonprofits
const ENRICHMENT_SCHEDULE = process.env.ENRICHMENT_CRON || '0 */6 * * *';

// IRS filing index refresh — weekly on Sunday at 03:00 UTC
const INDEX_REFRESH_SCHEDULE = process.env.INDEX_REFRESH_CRON || '0 3 * * 0';

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

  console.log(`[Scheduler] IRS import:     ${IRS_IMPORT_SCHEDULE}`);
  console.log(`[Scheduler] 990 enrichment: ${ENRICHMENT_SCHEDULE}`);
  console.log(`[Scheduler] Index refresh:  ${INDEX_REFRESH_SCHEDULE}`);
}

module.exports = { start };
