const mongoose = require('mongoose');
const { Schema } = mongoose;

const PaymentSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  paymentMethod: {
    type: String,
    enum: ["ONLINE"],
    required: true
  },
  provider: { type: String, required: true },
  transactionId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["SUCCESS", "FAILED"],
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Payment", PaymentSchema);
