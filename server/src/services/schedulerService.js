const cron = require('node-cron');
const { checkAndImportIfNew } = require('./irsImportService');

// Runs daily at 02:00 UTC — IRS publishes updates on the 2nd Tuesday monthly
const IRS_CHECK_SCHEDULE = process.env.IRS_CHECK_CRON || '0 2 * * *';

function start() {
  console.log(`[Scheduler] IRS data check scheduled: ${IRS_CHECK_SCHEDULE}`);

  cron.schedule(IRS_CHECK_SCHEDULE, async () => {
    try {
      await checkAndImportIfNew();
    } catch (err) {
      console.error('[Scheduler] IRS import job failed:', err.message);
    }
  }, { timezone: 'UTC' });
}

module.exports = { start };
