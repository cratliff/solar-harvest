// Matches US street addresses embedded in narrative text.
// Captures: number + street name + suffix, optionally with unit and city/state/zip.
// Intentionally liberal — false positives are filtered downstream by geocoding.
const STREET_SUFFIX = 'Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|' +
  'Way|Court|Ct|Place|Pl|Terrace|Ter|Highway|Hwy|Parkway|Pkwy|Circle|Cir|' +
  'Trail|Trl|Pike|Route|Rte';

const ADDRESS_RE = new RegExp(
  `\\b(\\d{1,5}\\s+(?:[A-Za-z0-9]+\\s+){1,5}(?:${STREET_SUFFIX})\\.?` +
  `(?:\\s+(?:Suite|Ste|Unit|Apt|Floor|Fl|#)\\s*\\w+)?` +
  `(?:[,\\s]+[A-Za-z][A-Za-z\\s]{1,28}[,\\s]+[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)?)`,
  'gi'
);

function extractAddressesFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  let match;
  ADDRESS_RE.lastIndex = 0;
  while ((match = ADDRESS_RE.exec(text)) !== null) {
    const raw = match[1].trim().replace(/\s+/g, ' ');
    if (raw.length > 10) matches.push(raw);
  }
  return [...new Set(matches)];
}

module.exports = { extractAddressesFromText };
