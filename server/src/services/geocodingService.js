const https = require('https');

// Census Geocoder — free, US addresses only, no API key required
// https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

// Google Maps Geocoding API — paid fallback, used only when key is configured
const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function buildAddressString(address) {
  const parts = [address.street, address.city, address.state, address.zip].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return address.raw || null;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Returns { lat, lng, formattedAddress, source: 'census' } or null
async function censusGeocode(addressStr) {
  const url = `${CENSUS_URL}?address=${encodeURIComponent(addressStr)}&benchmark=Public_AR_Current&format=json`;
  const { status, body } = await httpGet(url);

  if (status !== 200) return null;

  const matches = body?.result?.addressMatches;
  if (!matches?.length) return null;

  const match = matches[0];
  // Census returns x=longitude, y=latitude
  return {
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    formattedAddress: match.matchedAddress,
    source: 'census',
  };
}

// Returns { lat, lng, formattedAddress, source: 'google' } or null
async function googleGeocode(addressStr) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const url = `${GOOGLE_URL}?address=${encodeURIComponent(addressStr)}&key=${key}`;
  const { body } = await httpGet(url);

  if (body.status === 'ZERO_RESULTS' || !body.results?.length) return null;
  if (body.status !== 'OK') throw new Error(`Google Geocoding error: ${body.status} — ${body.error_message || ''}`);

  const { lat, lng } = body.results[0].geometry.location;
  return {
    lat,
    lng,
    formattedAddress: body.results[0].formatted_address,
    source: 'google',
  };
}

// Primary: Census Geocoder (free). Fallback: Google (only if API key is set).
async function geocodeAddress(address) {
  const addressStr = buildAddressString(address);
  if (!addressStr) return null;

  const censusResult = await censusGeocode(addressStr);
  if (censusResult) return censusResult;

  // Census returned no match — try Google if key is available
  const googleResult = await googleGeocode(addressStr);
  return googleResult;
}

module.exports = { geocodeAddress };
