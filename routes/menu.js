const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const upload = require("../middleware/multer");
const axios = require("axios");

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
// @desc Get recommendations from Python Service
router.post("/recommendations", async (req, res) => {
  try {
    const { userId } = req.body;
    let pythonResponse;

    // Use environment variable for the URL to support Render hosting.
    // Ensure RECOMMENDER_URL is set to https://killa-aiml.onrender.com/aiml/recommend in Render dashboard.
    const AIML_URL =
      process.env.RECOMMENDER_URL || "http://localhost:8000/aiml/recommend";

    try {
      pythonResponse = await axios.post(
        AIML_URL,
        { userId: userId || null },
        { timeout: 5000 }, // Increased timeout slightly for cold starts on Render
      );
    } catch (aiErr) {
      // Fallback if AI service is down or slow
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
      { new: true },
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
