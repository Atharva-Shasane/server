const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const Rating = require("../models/Rating");
const Order = require("../models/Order");
const axios = require("axios");

// FIX: Use environment variable for AIML service URL — never hardcode localhost.
// In production (Render), set AIML_URL=https://killa-aiml.onrender.com
// In development it falls back to localhost automatically.
const AIML_URL = process.env.AIML_URL || "http://localhost:8000";

// @route GET api/rating/check-pending
// @desc Check for the latest completed order without a submitted rating
router.get("/check-pending", auth, async (req, res) => {
  try {
    const lastOrder = await Order.findOne({
      userId: req.user.id,
      orderStatus: "COMPLETED",
    }).sort({ createdAt: -1 });

    if (!lastOrder) return res.json({ pending: false });

    const existingRating = await Rating.findOne({ orderId: lastOrder._id });

    if (existingRating && existingRating.isSubmitted) {
      return res.json({ pending: false });
    }

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

// @route POST api/rating
// @desc Submit granular dish and order feedback
router.post("/", auth, async (req, res) => {
  const { orderId, rating, comment, dishRatings } = req.body;

  if (!orderId) {
    return res.status(400).json({ msg: "Order ID is required" });
  }

  try {
    let feedback = await Rating.findOne({ orderId });

    // If rating is 0, the user dismissed the modal
    if (rating === 0) {
      if (!feedback) {
        feedback = new Rating({
          userId: req.user.id,
          orderId,
          rating: 0,
          isSubmitted: false,
        });
        await feedback.save();
      }
      return res.json({ msg: "Rating dismissed" });
    }

    // Prevent duplicate submissions
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
      dishRatings: dishRatings || [],
      isSubmitted: true,
      createdAt: new Date(),
    };

    if (feedback) {
      feedback = await Rating.findOneAndUpdate(
        { orderId },
        { $set: ratingData },
        { new: true }
      );
    } else {
      feedback = new Rating(ratingData);
      await feedback.save();
    }

    // FIX: Use AIML_URL env variable instead of hardcoded localhost.
    // This was silently failing in production — dish ratings never updated.
    if (dishRatings && dishRatings.length > 0) {
      dishRatings.forEach((dish) => {
        axios
          .post(
            `${AIML_URL}/aiml/update-rating`,
            { dishId: dish.menuItemId },
            { timeout: 5000 }
          )
          .catch((err) => {
            // Non-blocking — rating save succeeds even if AI sync fails
            console.warn(
              `[RATING] AI sync failed for dish ${dish.menuItemId}:`,
              err.message
            );
          });
      });
    }

    res.json(feedback);
  } catch (err) {
    // Mongoose Duplicate Key Error
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ msg: "This order has already been rated." });
    }
    res.status(500).send("Server Error");
  }
});

// @route GET api/rating/admin/all
router.get("/admin/all", [auth, admin], async (req, res) => {
  try {
    const feedbackList = await Rating.find({ isSubmitted: true })
      .populate("userId", "name email mobile")
      .populate({
        path: "orderId",
        select: "orderNumber totalAmount items createdAt",
      })
      .sort({ createdAt: -1 });
    res.json(feedbackList);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route PUT api/rating/admin/reply/:id
router.put("/admin/reply/:id", [auth, admin], async (req, res) => {
  try {
    const { reply } = req.body;
    const feedback = await Rating.findByIdAndUpdate(
      req.params.id,
      { $set: { ownerReply: reply } },
      { new: true }
    );
    if (!feedback)
      return res.status(404).json({ msg: "Record not found" });
    res.json(feedback);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;