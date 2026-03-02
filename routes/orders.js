const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const Order = require("../models/Order");
const Counter = require("../models/Counter");
const mongoose = require("mongoose");

/**
 * @route   GET api/orders/status/volume
 * @desc    Public: Get current kitchen load and wait time.
 * FIXED: Placed at the top to avoid 404 conflicts with /:id
 */
router.get("/status/volume", async (req, res) => {
  try {
    const activeOrders = await Order.countDocuments({
      orderStatus: { $in: ["NEW", "PREPARING"] },
    });

    // Algorithm: 15 mins base + 3 mins per active order
    const waitTime = 15 + activeOrders * 3;

    res.json({ activeOrders, waitTime });
  } catch (err) {
    console.error("Volume Sync Error:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});

/**
 * @route   POST api/orders
 * @desc    Create a new order with Throttling and Table Mapping
 */
router.post("/", auth, async (req, res) => {
  try {
    const {
      orderType,
      items,
      totalAmount,
      paymentMethod,
      numberOfPeople,
      scheduledTime,
      paymentStatus,
      transactionId,
      tableNumber,
    } = req.body;

    // Kitchen Overload Check
    const activeOrderCount = await Order.countDocuments({
      orderStatus: { $in: ["NEW", "PREPARING"] },
    });

    if (activeOrderCount >= 20) {
      return res.status(429).json({
        msg: "Kitchen is currently overloaded. Please try again in 10 minutes.",
      });
    }

    // Atomic increment for order number
    let counter = await Counter.findOneAndUpdate(
      { id: "orderNumber" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    const paddedOrderNumber = counter.seq.toString().padStart(6, "0");

    const newOrder = new Order({
      userId: req.user.id,
      orderNumber: paddedOrderNumber,
      orderType, // Receives 'DINE_IN' or 'TAKEAWAY'
      tableNumber,
      items, // Instructions are passed here
      totalAmount,
      paymentMethod,
      numberOfPeople: numberOfPeople || 0,
      scheduledTime,
      paymentStatus: paymentStatus || "PENDING",
      transactionId: transactionId || "",
      orderStatus: "NEW",
    });

    const order = await newOrder.save();
    res.json(order);
  } catch (err) {
    console.error("Order Creation Error:", err.message);
    res.status(500).json({ msg: "Order failed: " + err.message });
  }
});

/**
 * @route   GET api/orders/my-orders
 */
router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "ratings",
          localField: "_id",
          foreignField: "orderId",
          as: "feedback",
        },
      },
      {
        $addFields: {
          feedback: {
            $cond: {
              if: { $gt: [{ $size: "$feedback" }, 0] },
              then: { $arrayElemAt: ["$feedback", 0] },
              else: null,
            },
          },
        },
      },
    ]);
    res.json(orders);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

/**
 * @route   PUT api/orders/:id/cancel
 */
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Order not found" });
    if (order.userId.toString() !== req.user.id)
      return res.status(401).json({ msg: "Not authorized" });
    if (order.orderStatus !== "NEW")
      return res.status(400).json({ msg: "Cannot cancel now" });

    order.orderStatus = "CANCELLED";
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

/**
 * @route   GET api/orders/owner/all
 */
router.get("/owner/all", [auth, admin], async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "name mobile email")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

/**
 * @route   PUT api/orders/owner/:id/status
 */
router.put("/owner/:id/status", [auth, admin], async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    order.orderStatus = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    order.updatedAt = Date.now();

    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;
