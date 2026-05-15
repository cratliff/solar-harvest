const express = require('express');
const router  = express.Router();
const { enrichEin, runSolarBatch } = require('../services/solarEnrichmentService');
const SolarGrid        = require('../models/SolarGrid');
const UtilityRateCache = require('../models/UtilityRateCache');

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
  runSolarBatch().catch(err => console.error('[Solar batch]', err.message));
  res.status(202).json({ message: 'Solar batch started' });
});

// GET /api/solar/grid/status — how many grid cells are populated per state
router.get('/grid/status', async (req, res) => {
  try {
    const counts = await SolarGrid.aggregate([
      {
        $group: {
          _id: null,
          total:   { $sum: 1 },
          minLat:  { $min: '$lat' },
          maxLat:  { $max: '$lat' },
          minLng:  { $min: '$lng' },
          maxLng:  { $max: '$lng' },
          newestAt:{ $max: '$fetchedAt' },
        },
      },
    ]);
    const rateCount = await UtilityRateCache.countDocuments();
    res.json({ grid: counts[0] ?? { total: 0 }, cachedZips: rateCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/solar/grid/populate — start the grid population script for one or more states
// Body: { states: ['KY', 'TN'] }  — defaults to ENRICHMENT_STATE
router.post('/grid/populate', (req, res) => {
  const { spawn } = require('child_process');
  const states = (req.body?.states || [process.env.ENRICHMENT_STATE || 'KY'])
    .map(s => s.toUpperCase());

  const child = spawn('node', ['scripts/populate_solar_grid.js', ...states], {
    cwd: '/app',
    detached: true,
    stdio: 'inherit',
  });
  child.unref();

  res.status(202).json({ message: `Grid population started for: ${states.join(', ')}` });
});

// POST /api/solar/rates/cache — pre-warm URDB rate cache for a state
// Body: { state: 'KY' }
router.post('/rates/cache', (req, res) => {
  const { spawn } = require('child_process');
  const state = (req.body?.state || process.env.ENRICHMENT_STATE || 'KY').toUpperCase();

  const child = spawn('node', ['scripts/cache_utility_rates.js', state], {
    cwd: '/app',
    detached: true,
    stdio: 'inherit',
  });
  child.unref();

  res.status(202).json({ message: `Utility rate cache warming started for: ${state}` });
});

module.exports = router;
