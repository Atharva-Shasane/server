const mongoose = require('mongoose');

/**
 * Expense Schema
 * Tracks manual business costs like Rent, Utilities, and Supplies
 */
const ExpenseSchema = new mongoose.Schema({
  description: { 
    type: String, 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  category: { 
    type: String, 
    required: true 
  },
  date: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Expense', ExpenseSchema);