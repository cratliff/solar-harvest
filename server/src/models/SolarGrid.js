const mongoose = require('mongoose');

const solarGridSchema = new mongoose.Schema({
  // GeoJSON point for $near spatial queries — coordinates are [lng, lat]
  loc: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  lat:      { type: Number, required: true },
  lng:      { type: Number, required: true },
  // Annual AC output per installed kW (kWh/kW/year) from PVWatts with a 1 kW system
  kwhPerKw: { type: Number, required: true },
  fetchedAt:{ type: Date, default: Date.now },
});

solarGridSchema.index({ loc: '2dsphere' });
solarGridSchema.index({ lat: 1, lng: 1 }, { unique: true });

module.exports = mongoose.model('SolarGrid', solarGridSchema);
