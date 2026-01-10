const mongoose = require('mongoose');
const { Schema } = mongoose;

const RecommendationLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  inputFeatures: {
    preferredCategory: String,
    totalOrders: Number,
    avgOrderValue: Number
  },
  recommendedItems: [
    {
      menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem" },
      name: String,
      score: Number
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("RecommendationLog", RecommendationLogSchema);
