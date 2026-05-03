const mongoose = require('mongoose');

const nonprofitSchema = new mongoose.Schema({
  ein: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
  },
  lat: Number,
  lng: Number,
  geocodeFailed: Boolean,

  nteeCode: String,
  revenue: Number,
  income: Number,
  assets: Number,
  subsection: String,       // IRS subsection code (03 = 501c3, etc.)
  deductibility: String,    // IRS deductibility code
  foundation: String,       // IRS foundation code
  taxPeriod: String,        // YYYYMM of most recent 990
  irsStatus: String,        // IRS organization status

  // Google Solar API data
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

  // Derived scoring
  solarBenefitScore: Number,
  estimatedAnnualSavings: Number,

  // 990 enrichment data
  propertyNetBookValue: Number,  // Schedule D total land/buildings book value
  latestFilingYear: Number,
  form990EnrichedAt: Date,

  // Source tracking
  irsImportId: { type: mongoose.Schema.Types.ObjectId, ref: 'DataImport' },
  irsLastUpdated: Date,
}, { timestamps: true });

nonprofitSchema.index({ 'address.state': 1, solarBenefitScore: -1 });
nonprofitSchema.index({ nteeCode: 1 });

module.exports = mongoose.model('Nonprofit', nonprofitSchema);
