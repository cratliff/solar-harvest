const https = require('https');
const http = require('http');
const { parse } = require('csv-parse');
const Nonprofit = require('../models/Nonprofit');
const DataImport = require('../models/DataImport');

const BATCH_SIZE = 500;

// IRS EO BMF regional files — updated monthly on the 2nd Tuesday
// https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
const EO_BMF_URLS = [
  'https://www.irs.gov/pub/irs-soi/eo1.csv',
  'https://www.irs.gov/pub/irs-soi/eo2.csv',
  'https://www.irs.gov/pub/irs-soi/eo3.csv',
  'https://www.irs.gov/pub/irs-soi/eo4.csv',
];

function mapRecord(row, importId) {
  const zip = (row.ZIP || '').trim();
  return {
    ein: (row.EIN || '').trim(),
    name: (row.NAME || row.SORT_NAME || '').trim(),
    address: {
      street: (row.STREET || '').trim(),
      city: (row.CITY || '').trim(),
      state: (row.STATE || '').trim(),
      zip: zip.length > 5 ? `${zip.slice(0, 5)}-${zip.slice(5)}` : zip,
    },
    nteeCode: (row.NTEE_CD || '').trim() || undefined,
    revenue: row.REVENUE_AMT ? Number(row.REVENUE_AMT) : undefined,
    income: row.INCOME_AMT ? Number(row.INCOME_AMT) : undefined,
    assets: row.ASSET_AMT ? Number(row.ASSET_AMT) : undefined,
    subsection: (row.SUBSECTION || '').trim() || undefined,
    deductibility: (row.DEDUCTIBILITY || '').trim() || undefined,
    foundation: (row.FOUNDATION || '').trim() || undefined,
    taxPeriod: (row.TAX_PERIOD || '').trim() || undefined,
    irsStatus: (row.STATUS || '').trim() || undefined,
    irsImportId: importId,
    irsLastUpdated: new Date(),
  };
}

async function bulkUpsert(records) {
  const ops = records
    .filter(r => r.ein)
    .map(r => ({
      updateOne: {
        filter: { ein: r.ein },
        update: { $set: r },
        upsert: true,
      },
    }));
  if (ops.length) await Nonprofit.bulkWrite(ops, { ordered: false });
  return ops.length;
}

function headRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, { method: 'HEAD' }, res => {
      // Follow one redirect (IRS sometimes redirects)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return headRequest(res.headers.location).then(resolve).catch(reject);
      }
      resolve({
        lastModified: res.headers['last-modified'] || null,
        contentLength: res.headers['content-length'] ? Number(res.headers['content-length']) : null,
        etag: res.headers['etag'] || null,
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getStream(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getStream(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      resolve({ stream: res, lastModified: res.headers['last-modified'] || null, contentLength: res.headers['content-length'] ? Number(res.headers['content-length']) : null });
    }).on('error', reject);
  });
}

async function importFile(url, importId) {
  const { stream, lastModified, contentLength } = await getStream(url);
  const parser = stream.pipe(parse({ columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }));

  let batch = [];
  let total = 0;

  for await (const row of parser) {
    batch.push(mapRecord(row, importId));
    if (batch.length >= BATCH_SIZE) {
      total += await bulkUpsert(batch);
      batch = [];
      if (total % 10000 === 0) console.log(`  [${url.split('/').pop()}] ${total.toLocaleString()} records...`);
    }
  }
  if (batch.length) total += await bulkUpsert(batch);

  return { url, lastModified, contentLength, recordsProcessed: total, wasUpdated: true };
}

// Returns true if any file has changed since the last successful import
async function hasNewData() {
  const lastImport = await DataImport.findOne({ source: 'irs_eo_bmf', status: 'completed' }).sort({ createdAt: -1 });

  for (const url of EO_BMF_URLS) {
    try {
      const meta = await headRequest(url);
      if (!lastImport) return true;

      const prevFile = lastImport.files.find(f => f.url === url);
      if (!prevFile) return true;

      // Content-Length change is a reliable signal when Last-Modified isn't available
      if (meta.lastModified && prevFile.lastModified && meta.lastModified !== prevFile.lastModified) return true;
      if (meta.contentLength && prevFile.contentLength && meta.contentLength !== prevFile.contentLength) return true;
      if (!meta.lastModified && !meta.contentLength) return true; // can't tell — assume new
    } catch (err) {
      console.warn(`HEAD check failed for ${url}: ${err.message}`);
    }
  }
  return false;
}

async function runImport(triggeredBy = 'scheduler') {
  const importDoc = await DataImport.create({ source: 'irs_eo_bmf', triggeredBy, startedAt: new Date(), status: 'in_progress' });
  console.log(`[IRS Import] Starting import ${importDoc._id} (triggered by: ${triggeredBy})`);

  try {
    const fileResults = [];
    let total = 0;

    for (const url of EO_BMF_URLS) {
      console.log(`[IRS Import] Downloading ${url}`);
      const result = await importFile(url, importDoc._id);
      fileResults.push(result);
      total += result.recordsProcessed;
      console.log(`[IRS Import] ${url.split('/').pop()} — ${result.recordsProcessed.toLocaleString()} records`);
    }

    await DataImport.findByIdAndUpdate(importDoc._id, {
      status: 'completed',
      files: fileResults,
      totalRecords: total,
      completedAt: new Date(),
    });

    console.log(`[IRS Import] Complete — ${total.toLocaleString()} total records`);
    return { success: true, totalRecords: total, importId: importDoc._id };
  } catch (err) {
    await DataImport.findByIdAndUpdate(importDoc._id, {
      status: 'failed',
      error: err.message,
      completedAt: new Date(),
    });
    console.error(`[IRS Import] Failed:`, err.message);
    throw err;
  }
}

async function checkAndImportIfNew() {
  const alreadyRunning = await DataImport.findOne({ source: 'irs_eo_bmf', status: 'in_progress' });
  if (alreadyRunning) {
    console.log('[IRS Import] Import already in progress, skipping check');
    return { skipped: true, reason: 'import_in_progress' };
  }

  console.log('[IRS Import] Checking for new IRS data...');
  const newData = await hasNewData();

  if (!newData) {
    console.log('[IRS Import] No new data detected');
    return { skipped: true, reason: 'no_new_data' };
  }

  console.log('[IRS Import] New data detected, starting import');
  return runImport('scheduler');
}

module.exports = { checkAndImportIfNew, runImport, hasNewData };
