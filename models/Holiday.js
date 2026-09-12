const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    date: {type: Date, required: true},
    description: {type: String, required: true, trim: true},
  },
  {timestamps: true},
);

holidaySchema.index({date: 1});

module.exports = mongoose.model('Holiday', holidaySchema);