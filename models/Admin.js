const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'Administrator',
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    deviceToken: {type: String, default: '', trim: true},
    resetCode: {
      type: String,
      default: '',
      select: false,
    },
    resetCodeExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    role: {
      type: String,
      default: 'admin',
      enum: ['admin'],
    },
    notifications: {
      type: [
        {
          id: {type: String, required: true},
          type: {type: String, default: 'Leave'},
          status: {type: String, default: 'Pending'},
          title: {type: String, default: 'New Leave Request'},
          message: {type: String, default: ''},
          date: {type: Date, default: Date.now},
          unread: {type: Boolean, default: true},
          createdAt: {type: Date, default: Date.now},
          targetType: {type: String, default: 'leave'},
          referenceId: {type: String, default: ''},
          avatarUrl: {type: String, default: ''},
          eventDate: {type: String, default: ''},
          eventTime: {type: String, default: ''},
        },
      ],
      default: [],
    },
  },
  {timestamps: true},
);

module.exports = mongoose.model('Admin', adminSchema);
