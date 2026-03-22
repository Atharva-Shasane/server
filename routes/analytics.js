const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Expense = require("../models/Expense");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

/**
 * Helper: Calculates start and end of day in IST (India Standard Time)
 * Render servers are UTC, so we adjust to Mumbai time (UTC + 5:30).
 */
const getISTTimeRange = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;

  // Calculate current IST time
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDayIST = new Date(istNow);
  startOfDayIST.setUTCHours(0, 0, 0, 0);

  // Convert IST start of day back to UTC for MongoDB queries
  const start = new Date(startOfDayIST.getTime() - istOffset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
};

/**
 * @route   POST /api/analytics/expenses
 * @desc    Add a manual business expense (Admin Only)
 */
router.post("/expenses", [auth, admin], async (req, res) => {
  try {
    const { description, amount, month, year } = req.body;
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthIndex = monthNames.indexOf(month);
    const expenseDate = new Date(year, monthIndex, 1);

    const newExpense = new Expense({
      description,
      amount: Number(amount),
      date: expenseDate,
      month,
      year,
      category: "General"
    });

    await newExpense.save();
    res.status(201).json({ msg: "Expense Added Successfully" });
  } catch (err) {
    console.error("❌ [ADD EXPENSE ERROR]:", err.message);
    res.status(500).json({ msg: "Failed to add expense" });
  }
});

/**
 * @route   GET /api/analytics/profit-loss-annual
 * @desc    Annual report including legacy "N/A" data and IST adjusted revenue
 */
router.get("/profit-loss-annual", [auth, admin], async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    // Define UTC boundaries for the requested IST year
    const istOffset = 5.5 * 60 * 60 * 1000;
    const startOfYearUTC = new Date(Date.UTC(year, 0, 1, 0, 0, 0) - istOffset);
    const endOfYearUTC = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999) - istOffset);

    // 1. Revenue aggregation using createdAt (aligned with orders.js)
    const revenueData = await Order.aggregate([
      {
        $match: {
          orderStatus: "COMPLETED",
          createdAt: { $gte: startOfYearUTC, $lte: endOfYearUTC }
        }
      },
      {
        $group: {
          _id: { $month: { $add: ["$createdAt", istOffset] } }, // Adjust month extraction to IST
          revenue: { $sum: "$totalAmount" }
        }
      }
    ]);

    // 2. Fetch expenses (Legacy month strings + Date objects)
    const expenses = await Expense.find({
      $or: [
        { year: year },
        { date: { $gte: startOfYearUTC, $lte: endOfYearUTC } }
      ]
    });

    // 3. Mapping into monthly report
    const monthlyReport = monthNames.map((mName, index) => {
      const monthNum = index + 1;
      const rev = revenueData.find((r) => r._id === monthNum)?.revenue || 0;

      const exp = expenses
        .filter((e) => {
          const matchesString = e.month === mName && e.year == year;
          const matchesDate = e.date && 
                              new Date(e.date.getTime() + istOffset).getUTCMonth() === index && 
                              new Date(e.date.getTime() + istOffset).getUTCFullYear() === year;
          return matchesString || matchesDate;
        })
        .reduce((sum, current) => sum + current.amount, 0);

      return {
        month: mName.substring(0, 3).toUpperCase(),
        revenue: rev,
        expenses: exp,
        profit: rev - exp
      };
    });

    res.json(monthlyReport);
  } catch (err) {
    console.error("❌ [ANNUAL ANALYTICS ERROR]:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});

/**
 * @route   GET /api/analytics/today
 * @desc    Today's stats adjusted for IST (Mumbai Time)
 */
router.get("/today", [auth, admin], async (req, res) => {
  try {
    const { start, end } = getISTTimeRange();

    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          orderStatus: "COMPLETED"
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: "$totalAmount" }
        }
      }
    ]);

    const result = stats[0] || { totalRevenue: 0, orderCount: 0, avgOrderValue: 0 };
    
    // Rename fields to match frontend expectations
    res.json({
      totalOrders: result.orderCount,
      totalRevenue: result.totalRevenue,
      avgOrderValue: result.avgOrderValue
    });
  } catch (err) {
    console.error("❌ [TODAY ANALYTICS ERROR]:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});

/**
 * @route   GET /api/analytics/expenses/list
 */
router.get("/expenses/list", [auth, admin], async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

/**
 * @route   DELETE /api/analytics/expenses/:id
 */
router.delete("/expenses/:id", [auth, admin], async (req, res) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ msg: "Expense not found" });
    res.json({ msg: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Delete failed" });
  }
});

/**
 * @route   PUT /api/analytics/expenses/:id
 */
router.put("/expenses/:id", [auth, admin], async (req, res) => {
  try {
    const { description, amount, month, year } = req.body;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const expenseDate = new Date(year, monthNames.indexOf(month), 1);

    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      { description, amount: Number(amount), month, year, date: expenseDate },
      { new: true }
    );
    res.json({ msg: "Updated successfully", data: updatedExpense });
  } catch (err) {
    res.status(500).json({ msg: "Update failed" });
  }
});

/**
 * @route   GET /api/analytics/payment-comparison
 * @desc    Compare Daily Revenue by Payment Method (IST Adjusted)
 */
router.get("/payment-comparison", [auth, admin], async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    const istOffset = 5.5 * 60 * 60 * 1000;
    const startOfMonthUTC = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - istOffset);
    const endOfMonthUTC = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999) - istOffset);

    const paymentData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          orderStatus: "COMPLETED"
        }
      },
      {
        $group: {
          _id: { 
            day: { $dayOfMonth: { $add: ["$createdAt", istOffset] } }, 
            method: { $toUpper: "$paymentMethod" } 
          },
          totalAmount: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyStats = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, online: 0, offline: 0 }));
    let totalOnlineCount = 0;
    let totalOfflineCount = 0;

    paymentData.forEach((d) => {
      const dayIndex = d._id.day - 1;
      if (dayIndex >= 0 && dayIndex < daysInMonth) {
        if (d._id.method === "ONLINE") {
          dailyStats[dayIndex].online = d.totalAmount;
          totalOnlineCount += d.count;
        } else {
          dailyStats[dayIndex].offline = d.totalAmount;
          totalOfflineCount += d.count;
        }
      }
    });

    res.json({ dailyStats, totalOnlineCount, totalOfflineCount });
  } catch (err) {
    console.error("❌ [PAYMENT COMPARISON ERROR]:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});

module.exports = router;