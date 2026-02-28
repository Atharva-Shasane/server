const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Enhanced Rating Schema
 * Strictly linked to OrderId to prevent duplicate feedback.
 * Includes isSubmitted flag to track completion.
 */
const RatingSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
    required: true,
    unique: true, // Prevents multiple feedback entries for the same order
  },
  rating: {
    type: Number,
    required: true,
    min: 0, // 0 indicates the user dismissed the prompt
    max: 5,
  },
  comment: {
    type: String,
    maxlength: 500,
    default: "",
  },
  isSubmitted: {
    type: Boolean,
    default: false, // False if user chose "Later" or dismissed
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Unique index to ensure one rating per order
RatingSchema.index({ orderId: 1 }, { unique: true });

module.exports = mongoose.model("Rating", RatingSchema);
