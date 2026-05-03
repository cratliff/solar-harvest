const express = require('express');
const router = express.Router();
const Nonprofit = require('../models/Nonprofit');

// GET /api/nonprofits — list with filters and pagination
router.get('/', async (req, res) => {
  try {
    const { state, ntee, minScore, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (state) filter['address.state'] = state.toUpperCase();
    if (ntee) filter.nteeCode = new RegExp(`^${ntee}`, 'i');
    if (minScore) filter.solarBenefitScore = { $gte: Number(minScore) };

    const [results, total] = await Promise.all([
      Nonprofit.find(filter)
        .sort({ solarBenefitScore: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      Nonprofit.countDocuments(filter),
    ]);

    res.json({ results, total, page: Number(page), limit: Number(limit) });
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
