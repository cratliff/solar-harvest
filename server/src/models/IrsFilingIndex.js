const mongoose = require('mongoose');

// Mirrors the IRS 990 S3 index CSV: RETURN_ID,FILING_TYPE,EIN,TAX_PERIOD,SUB_DATE,TAXPAYER_NAME,RETURN_TYPE,DLN,OBJECT_ID
const irsFilingIndexSchema = new mongoose.Schema({
  ein: { type: String, required: true, index: true },
  taxYear: { type: Number, required: true },
  taxPeriod: String,       // YYYYMM
  objectId: { type: String, required: true },
  returnType: String,      // '990', '990EZ', '990PF'
  submissionDate: Date,
  taxpayerName: String,
}, { timestamps: false });

irsFilingIndexSchema.index({ ein: 1, taxYear: -1 });
irsFilingIndexSchema.index({ objectId: 1 }, { unique: true });

module.exports = mongoose.model('IrsFilingIndex', irsFilingIndexSchema);
