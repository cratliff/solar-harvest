#!/usr/bin/env node
/**
 * Imports IRS Tax Exempt Organization bulk data into MongoDB.
 * Source: https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads
 * Downloads a CSV, geocodes addresses, and upserts into the nonprofits collection.
 */
require('dotenv').config({ path: '../server/.env' });
const mongoose = require('mongoose');
const Nonprofit = require('../server/src/models/Nonprofit');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Starting IRS data import...');
  // TODO: download and parse IRS Publication 78 CSV
  // TODO: geocode addresses via Google Maps Geocoding API
  // TODO: bulk upsert into nonprofits collection
  console.log('Import placeholder — implementation pending');
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
