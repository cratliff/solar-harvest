const mongoose = require('mongoose');

const utilityRateCacheSchema = new mongoose.Schema({
  zip:        { type: String, required: true, unique: true, index: true },
  state:      String,
  ratePerKwh: Number,
  source:     String,  // 'urdb' | 'eia_state_avg' | 'default'
  utility:    String,
  cachedAt:   { type: Date, default: Date.now },
});

// Auto-expire after 90 days so rates stay reasonably fresh
utilityRateCacheSchema.index({ cachedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('UtilityRateCache', utilityRateCacheSchema);
