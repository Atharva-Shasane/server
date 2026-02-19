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

/**
 * @route   GET /api/analytics/expenses/list
 * @desc    Get all manual expenses for the current year
 */
router.get('/expenses/list', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const expenses = await Expense.find({
      date: { 
        $gte: new Date(`${year}-01-01`), 
        $lte: new Date(`${year}-12-31`) 
      }
    }).sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

/**
 * @route   PUT /api/analytics/expenses/:id
 * @desc    Update an existing expense
 */
router.put('/expenses/:id', async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      { description, amount: Number(amount), category },
      { new: true }
    );
    res.json({ msg: "Updated successfully", data: updatedExpense });
  } catch (err) {
    res.status(500).json({ msg: "Update failed" });
  }
});

/**
 * @route   GET /api/analytics/payment-comparison
 * @desc    Get daily online vs offline payment totals for a specific month
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
          _id: { 
            day: { $dayOfMonth: "$scheduledTime" }, 
            method: "$paymentMethod" 
          },
          totalAmount: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format data for the line graph (Days 1 to End of Month)
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyStats = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      online: 0,
      offline: 0
    }));

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

router.get('/payment-comparison', async (req, res) => {
  try {
    // These lines ensure the year is dynamic
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
          _id: { 
            day: { $dayOfMonth: "$scheduledTime" }, 
            method: "$paymentMethod" 
          },
          totalAmount: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      }
    ]);
    // ... remaining logic to format dailyStats, totalOnlineCount, etc
    res.json({ dailyStats, totalOnlineCount, totalOfflineCount });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
}); 

module.exports = router;