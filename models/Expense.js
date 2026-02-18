const mongoose = require('mongoose');
const { Schema } = mongoose;

const ExpenseSchema = new Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { 
    type: String, 
    enum: ['SUPPLIES', 'SALARY', 'RENT', 'UTILITIES', 'MARKETING', 'OTHER'], 
    default: 'SUPPLIES' 
  },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Expense", ExpenseSchema);