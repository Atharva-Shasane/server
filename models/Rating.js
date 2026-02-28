const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Advanced Granular Rating Schema
 * Linked to OrderId with support for Dish-Level feedback and AI Sentiment.
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
    unique: true,
  },
  // Overall experience score (1-5)
  rating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  // NEW: Individual dish ratings for the AIML discovery engine
  dishRatings: [
    {
      menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem" },
      name: String,
      rating: { type: Number, min: 1, max: 5 },
    },
  ],
  comment: {
    type: String,
    maxlength: 500,
    default: "",
  },
  // NEW: Owner Response capability
  ownerReply: {
    type: String,
    maxlength: 500,
    default: "",
  },
  // AI field populated by Python microservice (-1.0 to 1.0)
  sentimentScore: {
    type: Number,
    default: 0,
  },
  isSubmitted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

RatingSchema.index({ orderId: 1 }, { unique: true });

module.exports = mongoose.model("Rating", RatingSchema);
