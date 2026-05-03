const https = require('https');

const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function buildAddressString(address) {
  const parts = [address.street, address.city, address.state, address.zip].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return address.raw || null;
}

function geocodeRequest(addressStr) {
  const url = `${GEOCODING_URL}?address=${encodeURIComponent(addressStr)}&key=${process.env.GOOGLE_SOLAR_API_KEY}`;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Returns { lat, lng, formattedAddress } or null if not found
async function geocodeAddress(address) {
  const addressStr = buildAddressString(address);
  if (!addressStr) return null;

  const data = await geocodeRequest(addressStr);

  if (data.status === 'ZERO_RESULTS' || !data.results?.length) return null;
  if (data.status !== 'OK') throw new Error(`Geocoding API error: ${data.status} — ${data.error_message || ''}`);

  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formattedAddress: data.results[0].formatted_address };
}

module.exports = { geocodeAddress };
