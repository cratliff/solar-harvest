const express = require('express');
const router = express.Router();
const DataImport = require('../models/DataImport');
const { runImport, checkAndImportIfNew, hasNewData } = require('../services/irsImportService');

// GET /api/imports — list import history
router.get('/', async (req, res) => {
  try {
    const imports = await DataImport.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-files.url'); // omit verbose file list from list view
    res.json(imports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/imports/latest — most recent completed import
router.get('/latest', async (req, res) => {
  try {
    const latest = await DataImport.findOne({ status: 'completed' }).sort({ createdAt: -1 });
    res.json(latest || { message: 'No completed imports yet' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/imports/:id — single import details
router.get('/:id', async (req, res) => {
  try {
    const doc = await DataImport.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/imports/check — check for new data without importing
router.post('/check', async (req, res) => {
  try {
    const newData = await hasNewData();
    res.json({ newDataAvailable: newData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/imports/trigger — manually trigger a full import
router.post('/trigger', async (req, res) => {
  const running = await DataImport.findOne({ status: 'in_progress' });
  if (running) {
    return res.status(409).json({ error: 'Import already in progress', importId: running._id });
  }

  // Kick off async — don't block the response
  runImport('manual').catch(err => console.error('[Manual Import] Failed:', err.message));

  const pending = await DataImport.findOne({ status: 'in_progress' }).sort({ createdAt: -1 });
  res.status(202).json({ message: 'Import started', importId: pending?._id });
});

module.exports = router;
