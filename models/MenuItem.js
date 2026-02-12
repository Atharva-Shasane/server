const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * MenuItem Schema
 * Strict validation for Category and SubCategory as per new requirements:
 * Categories: veg, non-veg, drinks
 * SubCategories: INDIAN, CHINESE, STARTERS, SIDES, DRINKS
 */
const MenuItemSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // Simple categories
  category: {
    type: String,
    required: true,
    enum: ["veg", "non-veg", "drinks"],
    lowercase: true,
  },
  // Strict sub-categories
  subCategory: {
    type: String,
    required: true,
    enum: ["INDIAN", "CHINESE", "STARTERS", "SIDES", "DRINKS"],
  },
  pricing: {
    type: {
      type: String,
      enum: ["SINGLE", "HALF_FULL"],
      required: true,
    },
    price: { type: Number },
    priceHalf: { type: Number },
    priceFull: { type: Number },
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp on save
MenuItemSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("MenuItem", MenuItemSchema);
