const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

/**
 * @route POST api/orders
 * @desc Create a new order
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

    const newOrder = new Order({
      userId: req.user.id,
      orderType,
      items,
      totalAmount,
      paymentMethod,
      numberOfPeople,
      scheduledTime,
      orderStatus: "NEW",
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
 * @desc Get current user's order history
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
 * @desc Cancel an order (Only if NEW)
 */
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    if (order.userId.toString() !== req.user.id)
      return res.status(401).json({ msg: "User not authorized" });

    if (order.orderStatus !== "NEW")
      return res
        .status(400)
        .json({ msg: "Cannot cancel order already in progress" });

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
 * @desc Fetch ALL orders for Owner Dashboard
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
 * @desc Update Order Status & optionally Payment Status
 */
router.put("/owner/:id/status", [auth, admin], async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ msg: "Order not found" });

    order.orderStatus = status;

    // If owner explicitly confirms payment during completion
    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    order.updatedAt = Date.now();
    await order.save();
    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});
module.exports = router;
