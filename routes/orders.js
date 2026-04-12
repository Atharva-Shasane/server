const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Counter = require("../models/Counter");
const OrderStatusLog = require("../models/OrderStatusLog");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

/**
 * Helper: Maps frontend diningStyle values to valid Order schema enum values.
 * Schema enum: ["DINE IN", "TAKEAWAY"]
 */
const mapOrderType = (diningStyle) => {
  if (!diningStyle) return "DINE IN";
  const normalized = diningStyle.toString().toUpperCase().trim();
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
  return "DINE IN";
};

/**
 * FIX: Atomic order number generation using the Counter collection.
 * Replaces the race-condition-prone findOne().sort() pattern.
 * findOneAndUpdate with $inc is atomic — two simultaneous orders
 * will always get different sequential numbers.
 */
const getNextOrderNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { id: "orderId" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  // Start order numbers at 1001 by offsetting the seq value
  return counter.seq + 1000;
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

    // FIX: Use atomic Counter-based order number — eliminates race conditions
    const orderNumber = await getNextOrderNumber();

    const orderType = mapOrderType(diningStyle);

    const scheduledTime = scheduledTimeRaw
      ? new Date(scheduledTimeRaw)
      : new Date();

    const resolvedTableNumbers =
      tableNumbers && tableNumbers.length
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
      scheduledTime: scheduledTime,
      transactionId: transactionId || "",
      orderStatus: "NEW",
      paymentStatus: paymentMethod === "CASH" ? "PENDING" : "PAID",
      createdAt: new Date(),
    });

    const savedOrder = await newOrder.save();

    // IMPROVEMENT: Write initial status log entry
    await OrderStatusLog.create({
      orderId: savedOrder._id,
      status: "NEW",
      changedBy: "SYSTEM",
    });

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
 * PERFORMANCE FIX: Added pagination and $project to avoid loading all fields.
 * Use ?page=1&limit=20 query params. Defaults to page 1, 20 orders.
 */
router.get("/owner/all", [auth, admin], async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.aggregate([
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
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
            "user.createdAt": 0,
            "user.lastLogin": 0,
          },
        },
      ]),
      Order.countDocuments(),
    ]);

    res.json({
      orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN ORDERS FETCH FAILED]:", err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route PUT api/orders/owner/:id/status
 * IMPROVEMENT: Now writes an OrderStatusLog entry on every status change.
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

    if (!order) return res.status(404).json({ msg: "Order not found" });

    // IMPROVEMENT: Log the status change with who made it
    if (status) {
      await OrderStatusLog.create({
        orderId: order._id,
        status: status,
        changedBy: "OWNER",
      });
    }

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
      return res.status(400).json({ msg: "Order is already being prepared" });

    order.orderStatus = "CANCELLED";
    await order.save();

    // Log the cancellation
    await OrderStatusLog.create({
      orderId: order._id,
      status: "CANCELLED",
      changedBy: "SYSTEM",
    }).catch(() => {}); // Non-blocking — cancellation succeeds even if log fails

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

    const activeOrders = await Order.countDocuments({
      orderStatus: { $in: ["NEW", "PREPARING", "READY"] },
      createdAt: { $gte: twelveHoursAgo },
    });

    const activeTableOrders = await Order.find({
      orderStatus: { $in: ["NEW", "PREPARING", "READY"] },
      tableNumbers: { $exists: true, $not: { $size: 0 } },
    }).select("tableNumbers");

    const occupiedTablesSet = new Set();
    activeTableOrders.forEach((order) => {
      (order.tableNumbers || []).forEach((t) =>
        occupiedTablesSet.add(Number(t))
      );
    });

    const occupiedTables = Array.from(occupiedTablesSet);

    console.log(
      `📊 [STATUS/VOLUME] Active: ${activeOrders} | Occupied tables: [${occupiedTables.join(", ")}]`
    );

    const waitTime = activeOrders * 8 + 5;
    res.json({ activeOrders, waitTime, occupiedTables });
  } catch (err) {
    console.error("❌ [VOLUME ERROR]:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});

module.exports = router;