const express = require('express');
const router = express.Router();
const NonprofitLocation = require('../models/NonprofitLocation');
const { enrich990 } = require('../services/enrichmentService');
const Nonprofit = require('../models/Nonprofit');

// GET /api/nonprofits/:ein/locations — all known locations for an org
router.get('/:ein/locations', async (req, res) => {
  try {
    const locations = await NonprofitLocation.find({ ein: req.params.ein }).sort({ confidence: -1 });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/nonprofits/:ein/enrich — trigger 990 enrichment for one org
router.post('/:ein/enrich', async (req, res) => {
  try {
    const nonprofit = await Nonprofit.findOne({ ein: req.params.ein }).select('ein assets');
    if (!nonprofit) return res.status(404).json({ error: 'Nonprofit not found' });

    const result = await enrich990(nonprofit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations — browse all locations with filters
router.get('/', async (req, res) => {
  try {
    const { state, source, minConfidence = 0, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (state) filter['address.state'] = state.toUpperCase();
    if (source) filter.source = source;
    if (minConfidence) filter.confidence = { $gte: Number(minConfidence) };

    const [results, total] = await Promise.all([
      NonprofitLocation.find(filter)
        .sort({ solarBenefitScore: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      NonprofitLocation.countDocuments(filter),
    ]);

    res.json({ results, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
