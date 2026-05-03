const express = require('express');
const router = express.Router();
const solarService = require('../services/solarService');

// POST /api/solar/enrich — trigger solar data enrichment for a single EIN
router.post('/enrich/:ein', async (req, res) => {
  try {
    const result = await solarService.enrichNonprofit(req.params.ein);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
