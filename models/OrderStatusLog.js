const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrderStatusLogSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  status: {
    type: String,
    enum: ["NEW", "PREPARING", "READY", "COMPLETED"],
    required: true
  },
  changedBy: {
    type: String,
    enum: ["OWNER", "SYSTEM"],
    required: true
  },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("OrderStatusLog", OrderStatusLogSchema);
