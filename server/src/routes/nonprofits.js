const express = require('express');
const router = express.Router();
const Nonprofit = require('../models/Nonprofit');
const NonprofitLocation = require('../models/NonprofitLocation');

// GET /api/nonprofits/states — distinct states (drives filter dropdowns)
router.get('/states', async (req, res) => {
  try {
    const states = await Nonprofit.distinct('address.state', { 'address.state': { $nin: [null, ''] } });
    res.json(states.sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nonprofits/cities?state=KY
router.get('/cities', async (req, res) => {
  try {
    if (!req.query.state) return res.status(400).json({ error: 'state is required' });
    const cities = await Nonprofit.distinct('address.city', {
      'address.state': req.query.state.toUpperCase(),
      'address.city': { $nin: [null, ''] },
    });
    res.json(cities.sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nonprofits — filterable paginated list ranked by solar score then assets
router.get('/', async (req, res) => {
  try {
    const { state, city, ntee, minScore, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (state) filter['address.state'] = state.toUpperCase();
    if (city)  filter['address.city']  = new RegExp(`^${city}$`, 'i');
    if (ntee)  filter.nteeCode = new RegExp(`^${ntee}`, 'i');
    if (minScore) filter.solarBenefitScore = { $gte: Number(minScore) };

    const [results, total] = await Promise.all([
      Nonprofit.find(filter)
        .sort({ solarBenefitScore: -1, assets: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .select('ein name address nteeCode assets revenue solarBenefitScore estimatedAnnualSavings sunroof'),
      Nonprofit.countDocuments(filter),
    ]);

    res.json({ results, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nonprofits/:ein/locations — primary address + all 990-discovered buildings
// NOTE: must be defined before /:ein to avoid Express matching "locations" as an EIN
router.get('/:ein/locations', async (req, res) => {
  try {
    const [nonprofit, locs] = await Promise.all([
      Nonprofit.findOne({ ein: req.params.ein })
        .select('ein address lat lng sunroof solarBenefitScore estimatedAnnualSavings'),
      NonprofitLocation.find({ ein: req.params.ein })
        .sort({ solarBenefitScore: -1, confidence: -1 })
        .select('source sourceDetail address lat lng geocoded confidence sunroof solarBenefitScore estimatedAnnualSavings'),
    ]);

    if (!nonprofit) return res.status(404).json({ error: 'Not found' });

    // Synthesise the primary IRS address as the first entry
    const primary = {
      _id: nonprofit._id,
      source: 'irs_primary',
      address: nonprofit.address,
      lat: nonprofit.lat,
      lng: nonprofit.lng,
      geocoded: nonprofit.lat != null,
      confidence: 1.0,
      sunroof: nonprofit.sunroof ?? null,
      solarBenefitScore: nonprofit.solarBenefitScore ?? null,
      estimatedAnnualSavings: nonprofit.estimatedAnnualSavings ?? null,
    };

    res.json([primary, ...locs]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nonprofits/:ein
router.get('/:ein', async (req, res) => {
  try {
    const nonprofit = await Nonprofit.findOne({ ein: req.params.ein });
    if (!nonprofit) return res.status(404).json({ error: 'Not found' });
    res.json(nonprofit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
