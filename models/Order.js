const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const OrderSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  orderNumber: {
    type: String,
    required: true,
  },
  orderType: {
    type: String,
    enum: ["DINE IN", "TAKEAWAY"],
    required: true,
  },
  tableNumbers: [{ type: Number }],
  numberOfPeople: {
    type: Number,
    default: 1,
  },
  scheduledTime: {
    type: Date,
    required: true,
  },
  items: [
    {
      menuItemId: {
        type: Schema.Types.ObjectId,
        ref: "MenuItem",
        required: true,
      },
      name: { type: String, required: true },
      category: { type: String, required: true },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true },
      variant: { type: String, default: "SINGLE" },
      instructions: { type: String, default: "" },
    },
  ],
  totalAmount: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ["CASH", "ONLINE"],
    required: true,
  },
  transactionId: {
    type: String,
    default: "",
  },
  paymentStatus: {
    type: String,
    enum: ["PENDING", "PAID", "FAILED", "REFUND INITIATED", "REFUNDED"],
    default: "PENDING",
  },
  orderStatus: {
    type: String,
    enum: ["NEW", "PREPARING", "READY", "COMPLETED", "CANCELLED"],
    default: "NEW",
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

OrderSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// PERFORMANCE FIX: Add indexes for the most frequent query patterns.
// These eliminate full collection scans as the orders collection grows.

// My Orders page: find by userId, sorted by createdAt
OrderSchema.index({ userId: 1, createdAt: -1 });

// Owner dashboard & status filters: filter by status
OrderSchema.index({ orderStatus: 1, createdAt: -1 });

// Analytics routes: filter by scheduledTime range + status
OrderSchema.index({ scheduledTime: 1, orderStatus: 1 });

// Volume/table availability check: active orders by status
OrderSchema.index({ orderStatus: 1, tableNumbers: 1 });

module.exports = mongoose.model("Order", OrderSchema);