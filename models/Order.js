const mongoose = require("mongoose");
const { Schema } = mongoose;

const OrderSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
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
        // Only required if orderType is DINE_IN
        return this.orderType === "DINE_IN" ? v != null && v > 0 : true;
      },
      message: "Number of people is required for Dine-in orders.",
    },
    default: 0,
  },

  scheduledTime: {
    type: Date,
  }, // Preserved for Dine-in arrival time feature

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
      }, // Snapshot of price at time of order
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
  }, // Preserved for Online payment reference strings

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
