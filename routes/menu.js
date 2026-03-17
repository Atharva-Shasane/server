const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin"); // Import admin middleware
const upload = require("../middleware/multer"); // Import Cloudinary/Multer middleware
const axios = require("axios");

/**
 * @route   GET api/menu
 * @desc    Get all menu items
 */
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
        { userId: userId || null },
        { timeout: 3000 },
      );
    } catch (aiErr) {
      console.warn(
        "[AI OFFLINE] Falling back to manual popularity logic:",
        aiErr.message,
      );
      const popularityFallback = await MenuItem.find({
        isAvailable: true,
        category: { $ne: "drinks" },
      }).limit(4);
      return res.json(popularityFallback);
    }

    const itemIds = pythonResponse.data.recommendations;

    // 2. Handle Case: Cold Start
    if (!itemIds || itemIds.length === 0) {
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
  } catch (err) {
    console.error("Critical Recommendation Bridge Error:", err.message);
    res.status(500).send("Recommendation Bridge Error");
  }
});

/**
 * @route   POST api/menu
 * @desc    Add new menu item (Owner only)
 * @access  Private/Admin
 */
router.post("/", [auth, admin, upload.single("image")], async (req, res) => {
  try {
    // 1. Check if file was uploaded
    if (!req.file) {
      return res
        .status(400)
        .json({ msg: "Please upload an image for the dish." });
    }

    // 2. Parse the text data from the form
    // When using FormData, pricing needs to be parsed from a string
    const menuData = { ...req.body };
    if (typeof menuData.pricing === "string") {
      menuData.pricing = JSON.parse(menuData.pricing);
    }

    // 3. Set the image URL to the Cloudinary URL provided by multer-storage-cloudinary
    menuData.imageUrl = req.file.path;

    const newItem = new MenuItem(menuData);
    const item = await newItem.save();
    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error: " + err.message);
  }
});

/**
 * @route   PUT api/menu/:id
 * @desc    Update menu item
 * @access  Private/Admin
 */
router.put("/:id", [auth, admin, upload.single("image")], async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Parse pricing if it's sent as a string (common with FormData)
    if (typeof updateData.pricing === "string") {
      updateData.pricing = JSON.parse(updateData.pricing);
    }

    // If a new image was uploaded, update the imageUrl
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
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route   DELETE api/menu/:id
 * @desc    Delete menu item
 * @access  Private/Admin
 */
router.delete("/:id", [auth, admin], async (req, res) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id);
    res.json({ msg: "Item removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
