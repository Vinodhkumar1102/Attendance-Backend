const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^DV\d{2,}$/,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    gender: {type: String, enum: ['Male', 'Female', 'Other'], default: ''},
    maritalStatus: {type: String, enum: ['Married', 'Unmarried', 'Divorced'], default: ''},
    bloodGroup: {type: String, default: '', trim: true},
    city: {type: String, trim: true, default: ''},
    state: {type: String, trim: true, required: true},
    pincode: {type: String, trim: true, default: ''},
    district: {type: String, trim: true, required: true},
    relationship: {type: String, trim: true, default: ''},
    relationshipPhoneNumber: {type: String, trim: true, default: ''},
    phoneNumber: {type: String, trim: true, default: ''},
    dateOfBirth: {type: Date, default: null},
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    departmentName: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {type: String, trim: true, default: ''},
    officeLocation: {type: String, trim: true, default: ''},
    joiningDate: {type: Date, required: true},
    password: {type: String, required: true, select: false},
    deviceToken: {type: String, default: '', trim: true},
    resetCode: {type: String, default: '', select: false},
    resetCodeExpiresAt: {type: Date, default: null, select: false},
    avatar: {
      originalName: String,
      fileName: String,
      path: String,
      mimeType: String,
      size: Number,
    },
    resume: {
      originalName: {type: String, default: ''},
      fileName: {type: String, default: ''},
      path: {type: String, default: ''},
      mimeType: {type: String, default: ''},
      size: {type: Number, default: 0},
    },
    notifications: {
      type: [
        {
          id: {type: String, required: true},
          type: {type: String, default: 'Profile Update'},
          status: {type: String, default: 'Info'},
          title: {type: String, default: 'Profile Updated'},
          message: {type: String, default: ''},
          date: {type: Date, default: Date.now},
          unread: {type: Boolean, default: true},
          createdAt: {type: Date, default: Date.now},
        },
      ],
      default: [],
    },
  },
  {timestamps: true},
);

module.exports = mongoose.model('Employee', employeeSchema);
