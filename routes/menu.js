const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const RecommendationLog = require("../models/RecommendationLog");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const upload = require("../middleware/multer");
const axios = require("axios");

// Use env variable — consistent with rating.js fix
const AIML_URL = process.env.AIML_URL || "http://localhost:8000";

// @route GET api/menu
// @desc Get all menu items
router.get("/", async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ category: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route POST api/menu/recommendations
// @desc Get recommendations from Python AI service
router.post("/recommendations", async (req, res) => {
  try {
    const { userId } = req.body;
    let pythonResponse;

    try {
      pythonResponse = await axios.post(
        `${AIML_URL}/aiml/recommend`,
        { userId: userId || null },
        { timeout: 5000 }
      );
    } catch (aiErr) {
      // Fallback if AI service is down or cold-starting
      const popularityFallback = await MenuItem.find({
        isAvailable: true,
        category: { $ne: "drinks" },
      }).limit(4);
      return res.json(popularityFallback);
    }

    const itemIds = pythonResponse.data.recommendations;

    if (!itemIds || itemIds.length === 0) {
      const fallbackItems = await MenuItem.find({
        isAvailable: true,
        category: { $ne: "drinks" },
      }).limit(4);
      return res.json(fallbackItems);
    }

    const recommendedDishes = await MenuItem.find({
      _id: { $in: itemIds },
    });

    const sortedDishes = itemIds
      .map((id) => recommendedDishes.find((d) => d._id.toString() === id))
      .filter(Boolean);

    // IMPROVEMENT: Save recommendation log so the owner can track AI suggestions.
    // Non-blocking — log failure does not affect the response.
    if (userId && sortedDishes.length > 0) {
      RecommendationLog.create({
        userId,
        recommendedItems: sortedDishes.map((d) => ({
          menuItemId: d._id,
          name: d.name,
          score: 0, // Score not returned by API; enrich later if needed
        })),
      }).catch((err) =>
        console.warn("[MENU] RecommendationLog save failed:", err.message)
      );
    }

    return res.json(sortedDishes);
  } catch (err) {
    res.status(500).send("Recommendation Bridge Error");
  }
});

// @route POST api/menu
// @desc Add new menu item (Owner only)
router.post("/", [auth, admin, upload.single("image")], async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ msg: "Please upload an image for the dish." });
    }
    const menuData = { ...req.body };
    if (typeof menuData.pricing === "string") {
      menuData.pricing = JSON.parse(menuData.pricing);
    }
    menuData.imageUrl = req.file.path;
    const newItem = new MenuItem(menuData);
    const item = await newItem.save();
    res.json(item);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route PUT api/menu/:id
// @desc Update menu item
router.put("/:id", [auth, admin, upload.single("image")], async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (typeof updateData.pricing === "string") {
      updateData.pricing = JSON.parse(updateData.pricing);
    }
    if (req.file) {
      updateData.imageUrl = req.file.path;
    }
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );
    if (!item) return res.status(404).json({ msg: "Item not found" });
    res.json(item);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route DELETE api/menu/:id
// @desc Delete menu item
router.delete("/:id", [auth, admin], async (req, res) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id);
    res.json({ msg: "Item removed" });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;