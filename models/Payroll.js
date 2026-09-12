const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    employeeId: {type: String, required: true, trim: true, index: true},
    employeeName: {type: String, required: true, trim: true},
    departmentName: {type: String, required: true, trim: true},
    designation: {type: String, default: '', trim: true},
    phoneNumber: {type: String, default: '', trim: true},
    officeLocation: {type: String, default: '', trim: true},
    avatar: {
      path: {type: String, default: ''},
      fileName: {type: String, default: ''},
    },
    payMonth: {type: String, required: true, trim: true},
    amount: {type: Number, required: true, min: 0},
    leaveDeduction: {type: Number, default: 0, min: 0},
    remainingAmount: {type: Number, required: true, min: 0},
    status: {type: String, enum: ['Draft', 'Pending', 'Paid'], default: 'Pending'},
    paidDate: {type: Date, default: null},
    upiId: {type: String, default: '', trim: true},
    utrNumber: {type: String, default: '', trim: true},
    notes: {type: String, default: '', trim: true},
    attendanceSummary: {
      workingDays: {type: Number, default: 0, min: 0},
      presentDays: {type: Number, default: 0, min: 0},
      leaveDays: {type: Number, default: 0, min: 0},
      halfDayDays: {type: Number, default: 0, min: 0},
      lateDays: {type: Number, default: 0, min: 0},
      holidayCount: {type: Number, default: 0, min: 0},
    },
  },
  {timestamps: true},
);

payrollSchema.index({employeeId: 1, payMonth: 1}, {unique: true});

module.exports = mongoose.model('Payroll', payrollSchema);
