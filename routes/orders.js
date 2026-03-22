const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Order = require("../models/Order");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

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
          as: "feedback"
        }
      },
      {
        $addFields: {
          feedback: { $arrayElemAt: ["$feedback", 0] }
        }
      }
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
 * Includes safety checks for user session and explicit logging for debugging 500 errors.
 */
router.post("/", auth, async (req, res) => {
  try {
    const { items, totalAmount, paymentMethod, tableNumber, diningStyle } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ msg: "Authentication context missing. Please re-login." });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ msg: "No items provided in the order." });
    }

    const lastOrder = await Order.findOne().sort({ createdAt: -1 });
    const orderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1001;

    const newOrder = new Order({
      userId: req.user.id,
      orderNumber,
      items,
      totalAmount,
      paymentMethod,
      tableNumber,
      diningStyle,
      orderStatus: "NEW",
      paymentStatus: paymentMethod === "CASH" ? "PENDING" : "COMPLETED",
      createdAt: new Date() // Server stores UTC, Frontend converts to local IST
    });

    const savedOrder = await newOrder.save();
    console.log(`✅ [ORDER SUCCESS]: #${orderNumber} placed by user ${req.user.id}`);
    res.json(savedOrder);
  } catch (err) {
    console.error("❌ [ORDER PLACEMENT FAILED]:", err);
    res.status(500).json({ 
      msg: "Internal server error while processing order.", 
      error: err.message 
    });
  }
});

/**
 * @route GET api/orders/owner/all
 * @desc Admin: Fetch all orders with user and feedback details
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
          as: "userDetails"
        }
      },
      {
        $lookup: {
          from: "ratings",
          localField: "_id",
          foreignField: "orderId",
          as: "feedback"
        }
      },
      {
        $addFields: {
          user: { $arrayElemAt: ["$userDetails", 0] },
          feedback: { $arrayElemAt: ["$feedback", 0] }
        }
      },
      {
        $project: {
          userDetails: 0,
          "user.passwordHash": 0
        }
      }
    ]);
    res.json(orders);
  } catch (err) {
    console.error("❌ [ADMIN ORDERS FETCH FAILED]:", err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route PUT api/orders/owner/:id/status
 * @desc Admin: Update order/payment status
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
 * @desc User: Cancel order if still in NEW state
 */
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Order not found" });
    if (order.userId.toString() !== req.user.id) return res.status(401).json({ msg: "Unauthorized" });
    if (order.orderStatus !== "NEW") return res.status(400).json({ msg: "Order is already being prepared" });

    order.orderStatus = "CANCELLED";
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).send("Cancellation Failed");
  }
});

/**
 * @route GET api/orders/status/volume
 * @desc UI Utility: Kitchen load calculation for the current shift (last 12 hours)
 */
router.get("/status/volume", async (req, res) => {
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const activeOrders = await Order.countDocuments({
      orderStatus: { $in: ["NEW", "PREPARING", "READY"] },
      createdAt: { $gte: twelveHoursAgo }
    });
    
    const occupiedTables = await Order.distinct("tableNumber", {
      orderStatus: { $in: ["NEW", "PREPARING", "READY"] },
      tableNumber: { $exists: true }
    });

    const waitTime = activeOrders * 8 + 5; 

    res.json({ activeOrders, waitTime, occupiedTables });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

module.exports = router;