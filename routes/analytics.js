const express = require('express');
const router = express.Router();
const Order = require('../models/Order'); // Ensure this matches your order model filename
const Expense = require('../models/Expense');

/**
 * GET /api/analytics/profit-loss-annual
 * Uses 'scheduledTime' to calculate monthly revenue
 */
router.get('/profit-loss-annual', async (req, res) => {
  try {
    const year = new Date().getFullYear();

    // 1. Aggregate Revenue from the Orders collection
    const revenueData = await Order.aggregate([
      { 
        $project: { 
          year: { $year: "$scheduledTime" }, 
          month: { $month: "$scheduledTime" }, 
          totalAmount: 1,
          orderStatus: 1
        } 
      },
      { $match: { year: year, orderStatus: "COMPLETED" } }, // Only count completed orders
      { $group: { _id: "$month", revenue: { $sum: "$totalAmount" } } }
    ]);

    // 2. Aggregate Expenses
    const expenseData = await Expense.aggregate([
      { 
        $project: { 
          year: { $year: "$date" }, 
          month: { $month: "$date" }, 
          amount: 1 
        } 
      },
      { $match: { year: year } },
      { $group: { _id: "$month", expenses: { $sum: "$amount" } } }
    ]);

    // 3. Map to 12-month report
    const monthlyReport = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const rev = revenueData.find(r => r._id === monthNum)?.revenue || 0;
      const exp = expenseData.find(e => e._id === monthNum)?.expenses || 0;
      return {
        month: new Date(0, i).toLocaleString('default', { month: 'short' }),
        revenue: rev,
        expenses: exp,
        profit: rev - exp
      };
    });

    res.json(monthlyReport);
  } catch (err) { 
    console.error("Aggregation Error:", err);
    res.status(500).json({ msg: "Server Error" }); 
  }
});

/**
 * GET /api/analytics/today
 * Calculates KPIs for the current calendar day
 */
router.get('/today', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayOrders = await Order.find({
      scheduledTime: { $gte: startOfDay, $lte: endOfDay },
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

module.exports = router;