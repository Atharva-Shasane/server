const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const Rating = require("../models/Rating");
const Order = require("../models/Order");
const axios = require("axios");

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

// @route POST api/rating
// @desc Submit granular dish and order feedback
router.post("/", auth, async (req, res) => {
  const { orderId, rating, comment, dishRatings } = req.body;

  try {
    let feedback = await Rating.findOne({ orderId });

    if (rating === 0 && feedback && feedback.isSubmitted) {
      return res.json({ msg: "Ignoring dismiss on existing record." });
    }

    if (feedback && feedback.isSubmitted) {
      return res.status(400).json({ msg: "Feedback already submitted." });
    }

    const ratingData = {
      userId: req.user.id,
      orderId,
      rating,
      comment: comment || "",
      dishRatings: dishRatings || [],
      isSubmitted: rating > 0,
    };

    if (feedback) {
      feedback = await Rating.findOneAndUpdate({ orderId }, { $set: ratingData }, { new: true });
    } else {
      feedback = new Rating(ratingData);
      await feedback.save();
    }

    // Update Average Ratings in MenuItems via Python AI microservice
    if (rating > 0 && dishRatings && dishRatings.length > 0) {
      for (const dish of dishRatings) {
        try {
          await axios.post("http://localhost:8000/aiml/update-rating", {
            dishId: dish.menuItemId,
          });
        } catch (aimlerr) {
          // Silent failure to avoid console spamming
        }
      }
    }

    res.json(feedback);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route PUT api/rating/admin/reply/:id
// @desc Owner: Respond to customer review
router.put("/admin/reply/:id", [auth, admin], async (req, res) => {
  try {
    const { reply } = req.body;

    const feedback = await Rating.findByIdAndUpdate(
      req.params.id,
      { $set: { ownerReply: reply } },
      { new: true }
    );

    if (!feedback) return res.status(404).json({ msg: "Record not found" });

    res.json(feedback);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route GET api/rating/admin/all
// @desc Fetch all reviews for Admin dashboard
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

module.exports = router;