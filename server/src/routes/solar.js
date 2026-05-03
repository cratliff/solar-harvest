const express = require('express');
const router = express.Router();
const { enrichEin, runSolarBatch } = require('../services/solarEnrichmentService');

// POST /api/solar/enrich/:ein — geocode + solar enrich all addresses for one org
router.post('/enrich/:ein', async (req, res) => {
  try {
    const result = await enrichEin(req.params.ein);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// POST /api/solar/batch — manually trigger one geocode + solar batch cycle
router.post('/batch', async (req, res) => {
  // Fire async, return immediately
  runSolarBatch().catch(err => console.error('[Solar batch]', err.message));
  res.status(202).json({ message: 'Solar batch started' });
});

module.exports = router;
