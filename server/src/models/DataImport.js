const mongoose = require('mongoose');

const fileResultSchema = new mongoose.Schema({
  url: String,
  lastModified: String,
  contentLength: Number,
  recordsProcessed: Number,
  wasUpdated: Boolean,
}, { _id: false });

const dataImportSchema = new mongoose.Schema({
  source: { type: String, required: true, default: 'irs_eo_bmf' },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  triggeredBy: { type: String, enum: ['scheduler', 'manual'], default: 'scheduler' },
  files: [fileResultSchema],
  totalRecords: { type: Number, default: 0 },
  startedAt: Date,
  completedAt: Date,
  error: String,
}, { timestamps: true });

// Used to quickly find the most recent successful import for version comparison
dataImportSchema.index({ source: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('DataImport', dataImportSchema);
