const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const Order = require("../models/Order");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

// --- PUBLIC ROUTES ---

/**
 * @route GET api/menu
 * @desc Get all menu items
 */
router.get("/", async (req, res) => {
  try {
    const filter = req.query.all === "true" ? {} : { isAvailable: true };
    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route GET api/menu/recommendations
 * @desc Bridge to Python AI Model
 */
router.get("/recommendations", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Gather User History
    const userOrders = await Order.find({ userId }).select("items");
    const historyIds = userOrders.flatMap((order) =>
      order.items.map((i) => i.menuItemId)
    );

    // 2. Gather Full Menu for Context
    const fullMenu = await MenuItem.find({ isAvailable: true });

    // 3. Call the Python FastAPI (Assuming it runs on port 8000)
    // The AI developer just needs to listen for this POST request
    try {
      const aiResponse = await fetch("http://localhost:8000/aiml/recommend");

const recommendationData = await aiResponse.json();
// Flask returns: { recommendations: ["id1","id2"] }

const recommendedItems = await MenuItem.find({
  _id: { $in: recommendationData.recommendations },
});

res.json(recommendedItems);

     try {
  const aiResponse = await fetch("http://localhost:8000/aiml/recommend");

  const recommendationData = await aiResponse.json();
  // Flask returns: { recommendations: ["id1","id2"] }

  const recommendedItems = await MenuItem.find({
    _id: { $in: recommendationData.recommendations },
  });

  res.json(recommendedItems);

} catch (aiErr) {
  console.warn("AI Service unreachable, falling back to popularity logic.");
  const popularItems = await MenuItem.find({ isAvailable: true }).limit(4);
  res.json(popularItems);
}

    } catch (aiErr) {
      // FALLBACK: If AI is down, return top 4 most popular items instead
      console.warn("AI Service unreachable, falling back to popularity logic.");
      const popularItems = await MenuItem.find({ isAvailable: true }).limit(4);
      res.json(popularItems);
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// --- OWNER ROUTES ---

router.post("/", [auth, admin], async (req, res) => {
  try {
    const { name, category, subCategory, pricing, imageUrl, isAvailable } =
      req.body;
    const newItem = new MenuItem({
      name,
      category,
      subCategory,
      pricing,
      imageUrl,
      isAvailable,
    });
    const item = await newItem.save();
    res.json(item);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.put("/:id", [auth, admin], async (req, res) => {
  try {
    const updateFields = { ...req.body, updatedAt: Date.now() };
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );
    res.json(item);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.delete("/:id", [auth, admin], async (req, res) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id);
    res.json({ msg: "Item removed" });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;
