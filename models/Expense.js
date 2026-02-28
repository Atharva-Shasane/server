const mongoose = require('mongoose');

/**
 * Expense Schema
 * Tracks business costs with specific Month and Year support
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
  date: { 
    type: Date, 
    required: true 
  },
  // Category is no longer required to prevent validation errors
  category: { 
    type: String, 
    required: false,
    default: 'General' 
  }, 
  // New fields to match frontend logic
  month: { 
    type: String, 
    required: true 
  },
  year: { 
    type: Number, 
    required: true 
  }
});

module.exports = mongoose.model('Expense', ExpenseSchema);