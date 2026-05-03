#!/usr/bin/env node
/**
 * CLI wrapper for one-off IRS EO BMF import.
 * Usage: node scripts/import_irs_data.js [--force]
 *
 * --force  Import even if no new data is detected
 */
require('dotenv').config({ path: `${__dirname}/../server/.env` });
const mongoose = require('mongoose');
const { runImport, checkAndImportIfNew } = require('../server/src/services/irsImportService');

const force = process.argv.includes('--force');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/solar_harvest');
  console.log('Connected to MongoDB');

  const result = force
    ? await runImport('manual')
    : await checkAndImportIfNew();

  console.log('Result:', JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
