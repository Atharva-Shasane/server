const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const Order = require("../models/Order");
const Counter = require("../models/Counter");

/**
 * @route   POST api/orders
 * @desc    Create a new order with validation for hours and category
 */
router.post("/", auth, async (req, res) => {
  try {
    const { orderType, items, tableNumbers } = req.body;

    // 1. Operational Hours Check (11 AM - 10 PM)
    const hour = new Date().getHours();
    if (hour < 11 || hour >= 22) {
      return res.status(403).json({ msg: "Restaurant is closed. Operating hours: 11 AM - 10 PM." });
    }

    // 2. Drinks Only Validation
    const hasFood = items.some(item => item.category !== 'drinks');
    if (!hasFood) {
      return res.status(400).json({ msg: "Your feast must include at least one Veg or Non-Veg item." });
    }

    // 3. Table Availability Check
    if (orderType === "DINE IN" && tableNumbers?.length > 0) {
      const isOccupied = await Order.findOne({
        tableNumbers: { $in: tableNumbers },
        orderStatus: { $in: ["NEW", "PREPARING", "READY"] }
      });
      if (isOccupied) return res.status(400).json({ msg: "Selected table is occupied." });
    }

    // 4. Generate Sequence Number
    let counter = await Counter.findOneAndUpdate(
      { id: "orderNumber" }, 
      { $inc: { seq: 1 } }, 
      { new: true, upsert: true }
    );
    
    const order = new Order({
      ...req.body,
      userId: req.user.id,
      orderNumber: counter.seq.toString().padStart(6, "0"),
      orderStatus: "NEW",
      scheduledTime: new Date()
    });

    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ msg: "Internal Server Error during order placement." });
  }
});

/**
 * @route   PUT api/orders/:id/cancel
 * @desc    Cancel order (ALLOWED: NEW only) - FIXED: Restored this route
 */
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Order not found" });
    
    // Authorization check
    if (order.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: "Unauthorized" });
    }

    // Status check
    if (order.orderStatus !== "NEW") {
      return res.status(400).json({ msg: "Cannot cancel order once it is in preparation." });
    }

    order.orderStatus = "CANCELLED";
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ msg: "Server Error during cancellation." });
  }
});

/**
 * @route   GET api/orders/status/volume
 */
router.get("/status/volume", async (req, res) => {
  try {
    const activeOrdersCount = await Order.countDocuments({
      orderStatus: { $in: ["NEW", "PREPARING"] },
    });
    const occupiedOrders = await Order.find({
      orderStatus: { $in: ["NEW", "PREPARING", "READY"] },
      orderType: "DINE IN"
    }).select("tableNumbers");

    let occupiedTables = [];
    occupiedOrders.forEach(order => {
      if (order.tableNumbers) occupiedTables = [...occupiedTables, ...order.tableNumbers];
    });

    res.json({ 
      activeOrders: activeOrdersCount, 
      waitTime: 15 + activeOrdersCount * 3,
      occupiedTables: [...new Set(occupiedTables)] 
    });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.get("/owner/all", [auth, admin], async (req, res) => {
  try {
    const orders = await Order.find().populate("userId", "name mobile").sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.put("/owner/:id/status", [auth, admin], async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    order.orderStatus = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;