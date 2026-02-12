const mongoose = require("mongoose");
const { Schema } = mongoose;

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
  rating: {
    type: Number,
    required: true,
    min: 0, // 0 indicates the user dismissed the feedback prompt
    max: 5,
  },
  comment: {
    type: String,
    maxlength: 500,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

RatingSchema.index({ orderId: 1 }, { unique: true });

module.exports = mongoose.model("Rating", RatingSchema);
