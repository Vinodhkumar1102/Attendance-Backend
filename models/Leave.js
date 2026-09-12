const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    employeeName: {
      type: String,
      trim: true,
      default: '',
    },

    leaveType: {
      type: String,
      required: true,
      enum: [
        'Emergency Leave',
        'Work From Home',
        'Casual Leave',
        'Sick Leave',
      ],
      trim: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
  },
  {
    timestamps: true,
  }
);

// Mongoose 9 compatible middleware
leaveSchema.pre('validate', function validateLeaveDates() {
  if (
    this.startDate &&
    this.endDate &&
    new Date(this.endDate) < new Date(this.startDate)
  ) {
    throw new Error('End date cannot be before start date');
  }
});

module.exports = mongoose.model('Leave', leaveSchema);