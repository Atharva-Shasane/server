const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const MenuItem = require("../models/MenuItem");
const Counter = require("../models/Counter");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

/**
 * @route   POST api/orders
 * @desc    Create a new order with server-side price validation and 6-digit sequential ID
 * @access  Private
 */
router.post("/", auth, async (req, res) => {
  try {
    const {
      orderType,
      items,
      paymentMethod,
      numberOfPeople,
      scheduledTime,
      paymentStatus,
      transactionId,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ msg: "No items in order" });
    }

    // --- SECURITY ENHANCEMENT: SERVER-SIDE PRICE VALIDATION ---
    let validatedTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const dbItem = await MenuItem.findById(item.menuItemId);
      if (!dbItem || !dbItem.isAvailable) {
        return res
          .status(400)
          .json({ msg: `Item ${item.name} is no longer available.` });
      }

      let currentPrice = 0;
      // Determine the correct price based on the variant from the DB, not the request
      if (item.variant === "SINGLE") {
        currentPrice = dbItem.pricing.price || 0;
      } else if (item.variant === "HALF") {
        currentPrice = dbItem.pricing.priceHalf || 0;
      } else if (item.variant === "FULL") {
        currentPrice = dbItem.pricing.priceFull || 0;
      } else {
        return res.status(400).json({ msg: "Invalid variant specified." });
      }

      const itemTotal = currentPrice * item.quantity;
      validatedTotal += itemTotal;

      validatedItems.push({
        menuItemId: dbItem._id,
        name: dbItem.name,
        quantity: item.quantity,
        unitPrice: currentPrice,
        variant: item.variant,
      });
    }

    // Apply Tax (5% as per business logic in frontend)
    const totalWithTax = Math.round(validatedTotal * 1.05);

    // 1. Increment sequence for order number
    let counter = await Counter.findOneAndUpdate(
      { id: "orderNumber" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    // 2. Pad the sequence to 6 digits (e.g., 1 becomes "000001")
    const paddedOrderNumber = counter.seq.toString().padStart(6, "0");

    // 3. Create order with validated data
    const newOrder = new Order({
      userId: req.user.id,
      orderNumber: paddedOrderNumber,
      orderType,
      items: validatedItems,
      totalAmount: totalWithTax,
      paymentMethod,
      numberOfPeople,
      scheduledTime,
      paymentStatus: paymentStatus || "PENDING",
      transactionId: transactionId || null,
    });

    const order = await newOrder.save();
    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error during order creation");
  }
});

/**
 * @route   GET api/orders/my-orders
 * @desc    Get logged in user's orders
 * @access  Private
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
 * @route   PUT api/orders/:id/cancel
 * @desc    Cancel a new order
 * @access  Private
 */
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ msg: "Order not found" });

    if (order.userId.toString() !== req.user.id)
      return res.status(401).json({ msg: "User not authorized" });

    // Only "NEW" orders can be cancelled
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
 * @route   GET api/orders/owner/all
 * @desc    Get all orders for the dashboard
 * @access  Private/Admin
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
 * @route   PUT api/orders/owner/:id/status
 * @desc    Update order status
 * @access  Private/Admin
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
