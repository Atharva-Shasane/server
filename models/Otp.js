const mongoose = require("mongoose");

const OtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  otp: {
    type: String,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300, // This is a TTL index: Document auto-deletes after 5 minutes (300 seconds)
  },
});

module.exports = mongoose.model("Otp", OtpSchema);
