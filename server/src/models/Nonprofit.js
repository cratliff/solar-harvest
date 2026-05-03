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
  nteeCode: String,        // National Taxonomy of Exempt Entities category
  revenue: Number,         // Annual revenue from IRS 990
  assets: Number,
  subsection: String,      // IRS subsection code (501c3, etc.)

  // Project Sunroof data
  sunroof: {
    solarPotentialKwhYear: Number,
    roofSegmentCount: Number,
    panelCapacityWatts: Number,
    carbonOffsetFactorKgPerMwh: Number,
    percentCovered: Number,
    lastUpdated: Date,
  },

  // Derived scoring
  solarBenefitScore: Number,
  estimatedAnnualSavings: Number,

  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Nonprofit', nonprofitSchema);
