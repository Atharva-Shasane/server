const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Order = require("../models/Order");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

/**
 * Helper: Maps frontend diningStyle values to valid Order schema enum values.
 * Schema enum: ["DINE IN", "TAKEAWAY"]
 */
const mapOrderType = (diningStyle) => {
  if (!diningStyle) return "DINE IN";
  const normalized = diningStyle.toString().toUpperCase().trim();
  // Handle all common variants from the frontend
  if (
    normalized === "DINE_IN" ||
    normalized === "DINE IN" ||
    normalized === "DINEIN" ||
    normalized === "DINE-IN"
  ) {
    return "DINE IN";
  }
  if (
    normalized === "TAKEAWAY" ||
    normalized === "TAKE_AWAY" ||
    normalized === "TAKE AWAY" ||
    normalized === "TAKE-AWAY"
  ) {
    return "TAKEAWAY";
  }
  // Default fallback
  return "DINE IN";
};

/**
 * @route GET api/orders/my-orders
 * @desc Fetch user orders including feedback and admin replies
 */
router.get("/my-orders", auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const orders = await Order.aggregate([
      { $match: { userId: userId } },
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
          feedback: { $arrayElemAt: ["$feedback", 0] },
        },
      },
    ]);
    res.json(orders);
  } catch (err) {
    console.error("❌ [MY-ORDERS FETCH ERROR]:", err.message);
    res.status(500).json({ msg: "Failed to fetch orders" });
  }
});

/**
 * @route POST api/orders
 * @desc Create a new order.
 * FIX: mapOrderType() correctly normalizes diningStyle to schema enum values.
 */
router.post("/", auth, async (req, res) => {
  try {
    const {
      items,
      totalAmount,
      paymentMethod,
      tableNumber,
      tableNumbers,
      diningStyle,
      scheduledTime: scheduledTimeRaw,
      numberOfPeople,
      transactionId,
    } = req.body;

    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ msg: "Authentication context missing. Please re-login." });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ msg: "No items provided in the order." });
    }

    const lastOrder = await Order.findOne().sort({ createdAt: -1 });
    const orderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1001;

    // FIX: Use mapOrderType() to convert any frontend variant to the
    // correct schema enum value ("DINE IN" or "TAKEAWAY")
    const orderType = mapOrderType(diningStyle);

    // FIX: Use the scheduledTime sent by the frontend (the user's chosen
    // arrival/pickup slot). Fall back to now only if nothing was sent.
    const scheduledTime = scheduledTimeRaw
      ? new Date(scheduledTimeRaw)
      : new Date();

    // Normalize tableNumbers: accept both array (new) and scalar (legacy)
    const resolvedTableNumbers = tableNumbers && tableNumbers.length
      ? tableNumbers
      : tableNumber
      ? [tableNumber]
      : [];

    const newOrder = new Order({
      userId: req.user.id,
      orderNumber,
      items,
      totalAmount,
      paymentMethod,
      tableNumbers: resolvedTableNumbers,
      numberOfPeople: numberOfPeople || 1,
      diningStyle,
      orderType: orderType,
      scheduledTime: scheduledTime,   // ✅ User's chosen arrival/pickup time
      transactionId: transactionId || "",
      orderStatus: "NEW",
      paymentStatus: paymentMethod === "CASH" ? "PENDING" : "PAID",
      createdAt: new Date(),
    });

    const savedOrder = await newOrder.save();
    console.log(
      `✅ [ORDER SUCCESS]: #${orderNumber} placed by user ${req.user.id} | orderType: "${orderType}"`
    );
    res.json(savedOrder);
  } catch (err) {
    console.error("❌ [ORDER PLACEMENT FAILED]:", err);
    res.status(500).json({
      msg: "Internal server error while processing order.",
      error: err.message,
    });
  }
});

/**
 * @route GET api/orders/owner/all
 */
router.get("/owner/all", [auth, admin], async (req, res) => {
  try {
    const orders = await Order.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
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
          user: { $arrayElemAt: ["$userDetails", 0] },
          feedback: { $arrayElemAt: ["$feedback", 0] },
        },
      },
      {
        $project: {
          userDetails: 0,
          "user.passwordHash": 0,
        },
      },
    ]);
    res.json(orders);
  } catch (err) {
    console.error("❌ [ADMIN ORDERS FETCH FAILED]:", err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route PUT api/orders/owner/:id/status
 */
router.put("/owner/:id/status", [auth, admin], async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const updateData = {};
    if (status) updateData.orderStatus = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).send("Update Failed");
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
      return res.status(401).json({ msg: "Unauthorized" });
    if (order.orderStatus !== "NEW")
      return res
        .status(400)
        .json({ msg: "Order is already being prepared" });

    order.orderStatus = "CANCELLED";
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).send("Cancellation Failed");
  }
});

/**
 * @route GET api/orders/status/volume
 */
router.get("/status/volume", async (req, res) => {
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // Count active orders for wait time estimate
    const activeOrders = await Order.countDocuments({
      orderStatus: { $in: ["NEW", "PREPARING", "READY"] },
      createdAt: { $gte: twelveHoursAgo },
    });

    // CORRECT LOGIC: A table is occupied from the moment an order is placed
    // on it until that order is marked COMPLETED or CANCELLED by the owner.
    // NO time-window filter — if an order is active (NEW/PREPARING/READY)
    // on that table, the table is blocked regardless of when the customer arrives.
    // This prevents double-booking entirely.
    const activeTableOrders = await Order.find({
      orderStatus: { $in: ["NEW", "PREPARING", "READY"] },
      tableNumbers: { $exists: true, $not: { $size: 0 } },
    }).select("tableNumbers");

    // Flatten all tableNumbers from all active orders into one unique set
    const occupiedTablesSet = new Set();
    activeTableOrders.forEach(order => {
      (order.tableNumbers || []).forEach(t => occupiedTablesSet.add(Number(t)));
    });
    const occupiedTables = Array.from(occupiedTablesSet);

    console.log(`📊 [STATUS/VOLUME] Active: ${activeOrders} | Occupied tables: [${occupiedTables.join(", ")}]`);

    const waitTime = activeOrders * 8 + 5;
    res.json({ activeOrders, waitTime, occupiedTables });
  } catch (err) {
    console.error("❌ [VOLUME ERROR]:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});

module.exports = router;