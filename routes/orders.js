const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Counter = require("../models/Counter");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

/**
 * @route POST api/orders
 * @desc Create a new order with 6-digit sequential ID (e.g., 000001)
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

    // 1. Increment sequence
    let counter = await Counter.findOneAndUpdate(
      { id: "orderNumber" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    // 2. Pad the sequence to 6 digits (e.g., 1 becomes "000001")
    const paddedOrderNumber = counter.seq.toString().padStart(6, "0");

    // 3. Create order with the padded string
    const newOrder = new Order({
      userId: req.user.id,
      orderNumber: paddedOrderNumber,
      orderType,
      items,
      totalAmount,
      paymentMethod,
      numberOfPeople,
      scheduledTime,
      paymentStatus: paymentStatus || "PENDING",
      transactionId: transactionId || "",
    });

    const order = await newOrder.save();
    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route GET api/orders/my-orders
 */
router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route PUT api/orders/:id/cancel
 */
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Order not found" });
    if (order.userId.toString() !== req.user.id)
      return res.status(401).json({ msg: "User not authorized" });
    if (order.orderStatus !== "NEW")
      return res.status(400).json({ msg: "Cannot cancel order in progress" });

    order.orderStatus = "CANCELLED";
    await order.save();
    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route GET api/orders/owner/all
 */
router.get("/owner/all", [auth, admin], async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "name mobile email")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route PUT api/orders/owner/:id/status
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
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
