const mongoose = require('mongoose');
const { Schema } = mongoose;

const MenuItemSchema = new Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  subCategory: { type: String, required: true },
  pricing: {
    type: {
      type: String,
      enum: ["SINGLE", "HALF_FULL"],
      required: true
    },
    price: { type: Number },
    priceHalf: { type: Number },
    priceFull: { type: Number }
  },
  isAvailable: { type: Boolean, default: true },
  imageUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("MenuItem", MenuItemSchema);
