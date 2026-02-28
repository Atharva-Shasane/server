const express = require('express');
const router = express.Router();
const Order = require('../models/Order'); 
const Expense = require('../models/Expense');

/**
 * @route   POST /api/analytics/expenses
 * @desc    Add a manual business expense
 */
router.post('/expenses', async (req, res) => {
  try {
    const { description, amount, month, year } = req.body;
    const monthNames = ["January", "February", "March", "April", "May", "June", 
                        "July", "August", "September", "October", "November", "December"];
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
    res.status(500).json({ msg: "Failed to add expense" });
  }
});

/**
 * @route   GET /api/analytics/profit-loss-annual
 * @desc    Fixed logic to include "N/A" (Legacy) data in the graph
 */
router.get('/profit-loss-annual', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const monthNames = ["January", "February", "March", "April", "May", "June", 
                        "July", "August", "September", "October", "November", "December"];

    // 1. Revenue aggregation
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

    const revenueData = await Order.aggregate([
      { 
        $match: { 
          orderStatus: "COMPLETED",
          scheduledTime: { $gte: startOfYear, $lte: endOfYear }
        } 
      },
      { 
        $group: { 
          _id: { $month: "$scheduledTime" }, 
          revenue: { $sum: "$totalAmount" } 
        } 
      }
    ]);

    // 2. Optimized Expense Fetching (Gets both new records and legacy N/A records)
    const expenses = await Expense.find({
      $or: [
        { year: year },
        { date: { $gte: startOfYear, $lte: endOfYear } }
      ]
    });

    // 3. Mapping
    const monthlyReport = monthNames.map((mName, index) => {
      const monthNum = index + 1;
      const rev = revenueData.find(r => r._id === monthNum)?.revenue || 0;
      
      // Check both the month string OR the date object for a match
      const exp = expenses
        .filter(e => {
            const matchesString = e.month === mName;
            const matchesDate = e.date && new Date(e.date).getMonth() === index && new Date(e.date).getFullYear() === year;
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
    res.status(500).json({ msg: "Server Error" }); 
  }
});

/**
 * @route   GET /api/analytics/today
 */
router.get('/today', async (req, res) => {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);

    const todayOrders = await Order.find({
      scheduledTime: { $gte: start, $lte: end },
      orderStatus: "COMPLETED"
    });

    const totalRevenue = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    res.json({
      totalOrders: todayOrders.length,
      totalRevenue: totalRevenue,
      avgOrderValue: todayOrders.length > 0 ? totalRevenue / todayOrders.length : 0
    });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

/**
 * @route   GET /api/analytics/expenses/list
 */
router.get('/expenses/list', async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

/**
 * @route   DELETE /api/analytics/expenses/:id
 */
router.delete('/expenses/:id', async (req, res) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ msg: "Not found" });
    res.json({ msg: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Delete failed" });
  }
});

/**
 * @route   PUT /api/analytics/expenses/:id
 */
router.put('/expenses/:id', async (req, res) => {
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
 */
router.get('/payment-comparison', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const paymentData = await Order.aggregate([
      {
        $match: {
          scheduledTime: { $gte: startOfMonth, $lte: endOfMonth },
          orderStatus: "COMPLETED"
        }
      },
      {
        $group: {
          _id: { day: { $dayOfMonth: "$scheduledTime" }, method: { $toUpper: "$paymentMethod" } },
          totalAmount: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyStats = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, online: 0, offline: 0 }));
    let totalOnlineCount = 0;
    let totalOfflineCount = 0;

    paymentData.forEach(d => {
      const dayIndex = d._id.day - 1;
      if (d._id.method === "ONLINE") {
        dailyStats[dayIndex].online = d.totalAmount;
        totalOnlineCount += d.count;
      } else {
        dailyStats[dayIndex].offline = d.totalAmount;
        totalOfflineCount += d.count;
      }
    });

    res.json({ dailyStats, totalOnlineCount, totalOfflineCount });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

module.exports = router;