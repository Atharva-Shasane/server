const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

// @route   GET api/menu
// @desc    Get all menu items (Public)
router.get("/", async (req, res) => {
  try {
    // If query param ?all=true and user is admin, return everything.
    // Otherwise, only return available items.
    const filter = req.query.all === "true" ? {} : { isAvailable: true };
    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   POST api/menu
// @desc    Add new item (Owner Only)
router.post("/", [auth, admin], async (req, res) => {
  try {
    const { name, category, subCategory, pricing, imageUrl, isAvailable } =
      req.body;

    // Basic Validation
    if (!name || !category || !pricing || !imageUrl) {
      return res
        .status(400)
        .json({ msg: "Please include all required fields" });
    }

    // Pricing Validation: Ensure prices are numbers and match the type
    if (pricing.type === "SINGLE" && typeof pricing.price !== "number") {
      return res.status(400).json({ msg: "Single price must be a number" });
    }
    if (
      pricing.type === "HALF_FULL" &&
      (typeof pricing.priceHalf !== "number" ||
        typeof pricing.priceFull !== "number")
    ) {
      return res
        .status(400)
        .json({ msg: "Half and Full prices must be numbers" });
    }

    const newItem = new MenuItem({
      name,
      category,
      subCategory,
      pricing,
      imageUrl,
      isAvailable: isAvailable !== undefined ? isAvailable : true,
    });

    const item = await newItem.save();
    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   PUT api/menu/:id
// @desc    Update item (Owner Only)
router.put("/:id", [auth, admin], async (req, res) => {
  try {
    const { name, category, subCategory, pricing, imageUrl, isAvailable } =
      req.body;

    // Build update object safely (Protection against over-posting)
    const updateFields = {};
    if (name) updateFields.name = name;
    if (category) updateFields.category = category;
    if (subCategory) updateFields.subCategory = subCategory;
    if (pricing) updateFields.pricing = pricing;
    if (imageUrl) updateFields.imageUrl = imageUrl;
    if (isAvailable !== undefined) updateFields.isAvailable = isAvailable;
    updateFields.updatedAt = Date.now();

    let item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ msg: "Item not found" });

    item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );

    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE api/menu/:id
// @desc    Delete item (Owner Only)
router.delete("/:id", [auth, admin], async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ msg: "Item not found" });

    await MenuItem.findByIdAndDelete(req.params.id);
    res.json({ msg: "Item removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
