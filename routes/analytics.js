const express = require('express');
const router = express.Router();
const AnalyticsDaily = require('../models/AnalyticsDaily');
const Expense = require('../models/Expense'); // This line was triggering the error

router.get('/profit-loss-annual', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    
    const revenueData = await AnalyticsDaily.aggregate([
      {
        $project: {
          year: { $year: { $toDate: "$date" } },
          month: { $month: { $toDate: "$date" } },
          totalRevenue: 1
        }
      },
      { $match: { year: year } },
      { $group: { _id: "$month", revenue: { $sum: "$totalRevenue" } } }
    ]);

    const expenseData = await Expense.aggregate([
      {
        $project: { year: { $year: "$date" }, month: { $month: "$date" }, amount: 1 }
      },
      { $match: { year: year } },
      { $group: { _id: "$month", expenses: { $sum: "$amount" } } }
    ]);

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
    res.status(500).json({ msg: "Server Error" });
  }
});

module.exports = router;