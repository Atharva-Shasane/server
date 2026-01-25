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

    // 1. Call the Python Microservice
    // Defaulting to localhost:8000 (standard FastAPI port)
    // Implement exponential backoff for retries
    let pythonResponse;
    try {
      pythonResponse = await axios.post(
        "http://localhost:8000/recommend",
        {
          userId: userId || null,
        },
        { timeout: 3000 },
      );
    } catch (pyErr) {
      // Fallback: If Python service is down, return latest 5 items as emergency backup
      console.error("Python Recommender Offline. Using fallback.");
      const fallbackItems = await MenuItem.find({
        category: { $ne: "drinks" },
      }).limit(5);
      return res.json(fallbackItems);
    }

    const itemIds = pythonResponse.data.recommendations;

    // 2. Fetch full details for the IDs returned by Python
    // We maintain the order returned by the Python model
    const recommendedDishes = await MenuItem.find({
      _id: { $in: itemIds },
    });

    // Re-sort to match the Python model's priority
    const sortedDishes = itemIds
      .map((id) => recommendedDishes.find((d) => d._id.toString() === id))
      .filter(Boolean);

    res.json(sortedDishes);
  } catch (err) {
    console.error(err.message);
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
