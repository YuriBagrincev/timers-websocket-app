const mongoose = require("mongoose");

const timerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  description: { type: String, required: true },
  start: { type: Date, default: Date.now },
  end: { type: Date },
  duration: { type: Number },
  isActive: { type: Boolean, default: true, index: true },
});

module.exports = mongoose.model("Timer", timerSchema);
