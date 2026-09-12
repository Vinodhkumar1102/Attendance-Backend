const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    checkIn: {type: Date, default: null},
    checkOut: {type: Date, default: null},
    workingMinutes: {type: Number, default: 0, min: 0},
    status: {
      type: String,
      enum: ['Present', 'Late', 'Half Day', 'Leave', 'Work From Home', 'Holiday', 'Absent'],
      required: true,
    },
  },
  {timestamps: true},
);

attendanceSchema.index({employeeId: 1, date: 1}, {unique: true});

module.exports = mongoose.model('Attendance', attendanceSchema);
