const mongoose = require('mongoose');

const baileysAuthSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  keyId: { type: String, required: true, index: true },
  data: { type: String, required: true }
}, { timestamps: true });

baileysAuthSchema.index({ sessionId: 1, keyId: 1 }, { unique: true });

module.exports = mongoose.models.BaileysAuth || mongoose.model('BaileysAuth', baileysAuthSchema);
