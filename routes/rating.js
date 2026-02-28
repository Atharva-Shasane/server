const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const Rating = require("../models/Rating");
const Order = require("../models/Order");

/**
 * @route   GET api/rating/check-pending
 * @desc    Check for latest unrated completed order
 */
router.get("/check-pending", auth, async (req, res) => {
  try {
    const lastOrder = await Order.findOne({
      userId: req.user.id,
      orderStatus: "COMPLETED",
    }).sort({ createdAt: -1 });

    if (!lastOrder) return res.json({ pending: false });

    const existingRating = await Rating.findOne({ orderId: lastOrder._id });

    // If a record exists AND it was submitted, it's not pending.
    // If it exists but wasn't submitted (rating 0), it's also not pending (user said 'Later')
    if (existingRating) return res.json({ pending: false });

    res.json({
      pending: true,
      order: {
        _id: lastOrder._id,
        orderNumber: lastOrder.orderNumber,
        items: lastOrder.items,
        totalAmount: lastOrder.totalAmount,
      },
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

/**
 * @route   POST api/rating
 * @desc    Submit or update feedback for an order
 */
router.post("/", auth, async (req, res) => {
  const { orderId, rating, comment } = req.body;

  try {
    let feedback = await Rating.findOne({ orderId });

    // FIX: If the user clicks "Later" (rating 0) but it's already rated, just return success
    if (rating === 0 && feedback && feedback.isSubmitted) {
      return res.json({ msg: "Already rated, ignoring dismiss." });
    }

    // Block updating an actual review once submitted
    if (feedback && feedback.isSubmitted) {
      return res
        .status(400)
        .json({ msg: "Feedback already submitted for this order." });
    }

    const ratingData = {
      userId: req.user.id,
      orderId,
      rating,
      comment: comment || "",
      isSubmitted: rating > 0,
    };

    if (feedback) {
      feedback = await Rating.findOneAndUpdate(
        { orderId },
        { $set: ratingData },
        { new: true },
      );
    } else {
      feedback = new Rating(ratingData);
      await feedback.save();
    }

    res.json(feedback);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

/**
 * @route   GET api/rating/admin/all
 * @desc    Get all submitted feedback (Owner only)
 */
router.get("/admin/all", [auth, admin], async (req, res) => {
  try {
    const feedbackList = await Rating.find({ isSubmitted: true })
      .populate("userId", "name email mobile")
      .populate({
        path: "orderId",
        select: "orderNumber orderType totalAmount",
      })
      .sort({ createdAt: -1 });

    res.json(feedbackList);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;
