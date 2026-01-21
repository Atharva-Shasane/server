const express = require("express");
const router = express.Router();
const Rating = require("../models/Rating");

// Save rating
router.post("/rate", async (req, res) => {
  const { userId, dishId, rating } = req.body;

  await Rating.create({ userId, dishId, rating });
  res.json({ message: "Rating saved" });
});

// Get average rating
router.get("/average/:dishId", async (req, res) => {
  const ratings = await Rating.find({ dishId: req.params.dishId });

  const avg =
    ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length || 0;

  res.json({
    average: avg,
    total: ratings.length
  });
});

module.exports = router;
