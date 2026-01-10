const mongoose = require('mongoose');
const { Schema } = mongoose;

const AnalyticsDailySchema = new Schema({
  date: { type: String, required: true, unique: true },
  totalOrders: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  orderTypeBreakdown: {
    dineIn: { type: Number, default: 0 },
    takeaway: { type: Number, default: 0 }
  },
  paymentBreakdown: {
    cash: { type: Number, default: 0 },
    online: { type: Number, default: 0 }
  },
  topSellingItems: [
    {
      menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem" },
      name: String,
      count: Number
    }
  ]
});

module.exports = mongoose.model("AnalyticsDaily", AnalyticsDailySchema);
