const https = require('https');
const { parse } = require('csv-parse');
const IrsFilingIndex = require('../models/IrsFilingIndex');

// IRS publishes one index file per year; update check looks at Content-Length
const INDEX_BASE_URL = 'https://s3.amazonaws.com/irs-form-990';
const BATCH_SIZE = 1000;

// How many years back to index — most nonprofits file annually, 3 years covers gaps
const YEARS_TO_INDEX = 3;

function normalizeEin(raw) {
  return String(raw).replace(/\D/g, '').padStart(9, '0');
}

function getIndexUrl(year) {
  return `${INDEX_BASE_URL}/index_${year}.csv`;
}

function fetchContentLength(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD' }, res => {
      resolve(res.headers['content-length'] ? Number(res.headers['content-length']) : null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function isIndexCurrent(year) {
  // We consider an index current if we have records for that year and
  // the remote file size hasn't changed since we last saw it
  const count = await IrsFilingIndex.countDocuments({ taxYear: year });
  if (count === 0) return false;

  // Store the last known Content-Length in a sentinel document
  const sentinel = await IrsFilingIndex.findOne({ taxYear: year, objectId: `__sentinel_${year}` });
  if (!sentinel) return false;

  const remoteSize = await fetchContentLength(getIndexUrl(year));
  return remoteSize !== null && remoteSize === sentinel.taxpayerName; // repurpose taxpayerName to store size
}

async function downloadYearIndex(year) {
  const url = getIndexUrl(year);
  console.log(`[IRS Index] Downloading ${url}`);

  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));

      const contentLength = res.headers['content-length'] ? Number(res.headers['content-length']) : null;
      const parser = res.pipe(parse({ columns: true, skip_empty_lines: true, trim: true }));

      let batch = [];
      let total = 0;

      const flush = async () => {
        if (!batch.length) return;
        const ops = batch.map(doc => ({
          updateOne: {
            filter: { objectId: doc.objectId },
            update: { $setOnInsert: doc },
            upsert: true,
          },
        }));
        await IrsFilingIndex.bulkWrite(ops, { ordered: false });
        total += batch.length;
        batch = [];
      };

      const processRecord = async (row) => {
        const returnType = (row.RETURN_TYPE || '').trim();
        if (!['990', '990EZ', '990PF'].includes(returnType)) return;

        const ein = normalizeEin(row.EIN || '');
        if (!ein || ein === '000000000') return;

        batch.push({
          ein,
          taxYear: year,
          taxPeriod: (row.TAX_PERIOD || '').trim(),
          objectId: (row.OBJECT_ID || '').trim(),
          returnType,
          submissionDate: row.SUB_DATE ? new Date(row.SUB_DATE) : undefined,
          taxpayerName: (row.TAXPAYER_NAME || '').trim(),
        });
      };

      // Accumulate records and flush in batches
      const records = [];
      parser.on('readable', () => {
        let record;
        while ((record = parser.read()) !== null) records.push(record);
      });

      parser.on('end', async () => {
        try {
          for (const row of records) await processRecord(row);
          await flush();

          // Store sentinel with Content-Length for future change detection
          if (contentLength) {
            await IrsFilingIndex.updateOne(
              { objectId: `__sentinel_${year}` },
              { $set: { objectId: `__sentinel_${year}`, taxYear: year, ein: '000000000', taxpayerName: String(contentLength) } },
              { upsert: true }
            );
          }

          console.log(`[IRS Index] Year ${year}: ${total.toLocaleString()} filings indexed`);
          resolve(total);
        } catch (err) {
          reject(err);
        }
      });

      parser.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureIndexCurrent() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_TO_INDEX }, (_, i) => currentYear - i);
  const results = [];

  for (const year of years) {
    if (await isIndexCurrent(year)) {
      console.log(`[IRS Index] Year ${year} index is current, skipping`);
      results.push({ year, skipped: true });
    } else {
      const count = await downloadYearIndex(year);
      results.push({ year, count });
    }
  }
  return results;
}

async function findLatestFiling(ein) {
  const normalized = normalizeEin(ein);
  return IrsFilingIndex.findOne(
    { ein: normalized, returnType: { $in: ['990', '990EZ'] }, objectId: { $not: /^__sentinel/ } }
  ).sort({ taxYear: -1, taxPeriod: -1 });
}

module.exports = { ensureIndexCurrent, findLatestFiling };
