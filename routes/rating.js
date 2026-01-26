const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Rating = require("../models/Rating");
const Order = require("../models/Order");

/**
 * @route GET api/rating/check-pending
 * @desc Check if user has a completed order that hasn't been rated or dismissed
 */
router.get("/check-pending", auth, async (req, res) => {
  try {
    const lastOrder = await Order.findOne({
      userId: req.user.id,
      orderStatus: "COMPLETED",
    }).sort({ createdAt: -1 });

    if (!lastOrder) {
      return res.json({ pending: false });
    }

    const existingRating = await Rating.findOne({ orderId: lastOrder._id });

    if (existingRating) {
      return res.json({ pending: false });
    }

    res.json({
      pending: true,
      order: {
        _id: lastOrder._id,
        orderNumber: lastOrder.orderNumber,
        items: lastOrder.items,
        totalAmount: lastOrder.totalAmount,
        createdAt: lastOrder.createdAt,
      },
    });
  } catch (err) {
    console.error("Check Pending Error:", err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route POST api/rating/dismiss
 * @desc Permanently ignore feedback for a specific order
 */
router.post("/dismiss", auth, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ msg: "Order ID required" });

  try {
    const existing = await Rating.findOne({ orderId });
    if (existing) return res.json({ msg: "Already processed" });

    const dismissedRating = new Rating({
      userId: req.user.id,
      orderId,
      rating: 0, // 0 marks it as dismissed
      comment: "USER_DISMISSED",
    });

    await dismissedRating.save();
    res.json({ msg: "Feedback invitation dismissed." });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

/**
 * @route POST api/rating
 * @desc Submit a new rating
 */
router.post("/", auth, async (req, res) => {
  const { orderId, rating, comment } = req.body;

  if (!orderId) return res.status(400).json({ msg: "Order ID required" });
  if (!rating || rating < 1 || rating > 5) {
    return res
      .status(400)
      .json({ msg: "Please provide a valid rating between 1 and 5." });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order || order.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: "Unauthorized" });
    }

    const existingRating = await Rating.findOne({ orderId });
    if (existingRating) {
      return res.status(400).json({ msg: "Already rated." });
    }

    const newRating = new Rating({
      userId: req.user.id,
      orderId,
      rating,
      comment: comment || "",
    });

    await newRating.save();
    res.json({ msg: "Feedback submitted." });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ msg: "Already processed." });
    res.status(500).send("Server Error");
  }
});

module.exports = router;
