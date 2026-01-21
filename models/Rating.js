const mongoose = require("mongoose");

const RatingSchema = new mongoose.Schema({
  userId: String,
  dishId: String,
  rating: Number
});

module.exports = mongoose.model("Rating", RatingSchema);
