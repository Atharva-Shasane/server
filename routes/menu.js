const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const Order = require("../models/Order");
const auth = require("../middleware/auth");
const axios = require("axios");

// @route   GET api/menu
// @desc    Get all menu items
router.get("/", async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ category: 1 });
    res.json(items);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route   POST api/menu/recommendations
 * @desc    Get recommendations from Python Service
 * @access  Public (Optional Auth)
 */
router.post("/recommendations", async (req, res) => {
  try {
    const { userId } = req.body;

    // 1. Attempt to call the Python Microservice
    let pythonResponse;
    try {
      pythonResponse = await axios.post(
        "http://localhost:8000/aiml/recommend",
        {
          userId: userId || null,
        },
        { timeout: 3000 },
      );

      const itemIds = pythonResponse.data.recommendations;

      // 2. Handle Case: AI is working but there are no orders in DB yet (Cold Start)
      if (!itemIds || itemIds.length === 0) {
        console.log(
          `[AI INFO] No sales data available for user ${userId}. Returning popular items.`,
        );
        const fallbackItems = await MenuItem.find({
          isAvailable: true,
          category: { $ne: "drinks" },
        }).limit(4);
        return res.json(fallbackItems);
      }

      // 3. Fetch full details for the IDs returned by Python
      const recommendedDishes = await MenuItem.find({
        _id: { $in: itemIds },
      });

      // 4. Maintain AI priority order
      const sortedDishes = itemIds
        .map((id) => recommendedDishes.find((d) => d._id.toString() === id))
        .filter(Boolean);

      return res.json(sortedDishes);
    } catch (aiErr) {
      // 5. Handle Case: AI Service is actually offline or crashed
      console.warn(
        `[AI OFFLINE] Falling back to manual popularity logic: ${aiErr.message}`,
      );

      const popularityFallback = await MenuItem.find({
        isAvailable: true,
        category: { $ne: "drinks" },
      }).limit(4);

      return res.json(popularityFallback);
    }
  } catch (err) {
    console.error("Critical Recommendation Bridge Error:", err.message);
    res.status(500).send("Recommendation Bridge Error");
  }
});

// @route   POST api/menu
// @desc    Add new menu item (Owner only)
router.post("/", auth, async (req, res) => {
  try {
    const newItem = new MenuItem(req.body);
    const item = await newItem.save();
    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   PUT api/menu/:id
// @desc    Update menu item
router.put("/:id", auth, async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true },
    );
    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE api/menu/:id
// @desc    Delete menu item
router.delete("/:id", auth, async (req, res) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id);
    res.json({ msg: "Item removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
