const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const Order = require("../models/Order");
const Counter = require("../models/Counter");
const mongoose = require("mongoose");

/**
 * @route   POST api/orders
 * @desc    Create a new order with 6-digit sequential ID
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
    } = req.body;

    // Increment global order sequence
    let counter = await Counter.findOneAndUpdate(
      { id: "orderNumber" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    const paddedOrderNumber = counter.seq.toString().padStart(6, "0");

    const newOrder = new Order({
      userId: req.user.id,
      orderNumber: paddedOrderNumber,
      orderType,
      items,
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
    res.status(500).send("Server Error");
  }
});

/**
 * @route   GET api/orders/my-orders
 * @desc    Get user orders with aggregated feedback status
 */
router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.aggregate([
      {
        $match: { userId: new mongoose.Types.ObjectId(req.user.id) },
      },
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
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route   PUT api/orders/:id/cancel
 * @desc    User: Cancel an order (Only if status is NEW)
 */
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ msg: "Order not found" });

    // Security check: Ensure order belongs to requester
    if (order.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    // Business Logic: Only 'NEW' orders can be cancelled
    if (order.orderStatus !== "NEW") {
      return res.status(400).json({
        msg: "Cannot cancel order. The kitchen has already started preparation.",
      });
    }

    order.orderStatus = "CANCELLED";
    order.updatedAt = Date.now();
    await order.save();

    res.json(order);
  } catch (err) {
    console.error("Cancellation Error:", err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route   GET api/orders/owner/all
 * @desc    Fetch all orders for owner dashboard
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
 * @desc    Update order status (Owner only)
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
