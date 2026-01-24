const mongoose = require("mongoose");
const { Schema } = mongoose;

const OrderSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // UPDATED: Changed to String to store padded numbers like "000001"
  orderNumber: {
    type: String,
  },
  orderType: {
    type: String,
    enum: ["DINE_IN", "TAKEAWAY"],
    required: true,
  },
  numberOfPeople: {
    type: Number,
    validate: {
      validator: function (v) {
        return this.orderType === "DINE_IN" ? v != null && v > 0 : true;
      },
      message: "Number of people is required for Dine-in orders.",
    },
    default: 0,
  },
  scheduledTime: {
    type: Date,
  },
  items: [
    {
      menuItemId: {
        type: Schema.Types.ObjectId,
        ref: "MenuItem",
        required: true,
      },
      name: String,
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      unitPrice: {
        type: Number,
        required: true,
      },
      variant: {
        type: String,
        enum: ["SINGLE", "HALF", "FULL"],
        default: "SINGLE",
      },
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
  paymentId: {
    type: Schema.Types.ObjectId,
    ref: "Payment",
  },
  transactionId: {
    type: String,
  },
  paymentStatus: {
    type: String,
    enum: ["PENDING", "PAID", "FAILED", "REFUND_INITIATED", "REFUNDED"],
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

module.exports = mongoose.model("Order", OrderSchema);
