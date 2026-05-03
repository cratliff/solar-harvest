const mongoose = require('mongoose');

const nonprofitLocationSchema = new mongoose.Schema({
  ein: { type: String, required: true, index: true },
  source: {
    type: String,
    enum: ['irs_primary', 'form_990_narrative', 'form_990_scheduleO', 'county_assessor', 'google_places'],
    required: true,
  },
  sourceDetail: {
    filingYear: Number,
    objectId: String,
    field: String,        // e.g. 'ProgramSrvcAccomplishmentGrp[0]'
  },
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    raw: String,          // original extracted string before normalization
  },
  lat: Number,
  lng: Number,
  geocoded: { type: Boolean, default: false },
  geocodeFailed: { type: Boolean, default: false },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },

  sunroof: {
    solarPotentialKwhYear: Number,
    panelCount: Number,
    panelCapacityWatts: Number,
    roofSegmentCount: Number,
    roofAreaM2: Number,
    carbonOffsetFactorKgPerMwh: Number,
    percentCovered: Number,
    maxSunshineHoursPerYear: Number,
    imageryQuality: String,
    noCoverage: Boolean,
    lastUpdated: Date,
  },
  solarBenefitScore: Number,
  estimatedAnnualSavings: Number,
}, { timestamps: true });

nonprofitLocationSchema.index({ ein: 1, source: 1 });
nonprofitLocationSchema.index({ 'address.state': 1, solarBenefitScore: -1 });

module.exports = mongoose.model('NonprofitLocation', nonprofitLocationSchema);
