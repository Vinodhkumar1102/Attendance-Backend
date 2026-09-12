const mongoose = require('mongoose');

const userRoles = ['Super Admin', 'HR', 'Employee', 'Team Lead', 'Manager'];

const userSchema = new mongoose.Schema(
  {
    fullName: {type: String, required: true, trim: true},
    email: {type: String, required: true, unique: true, lowercase: true, trim: true},
    phone: {type: String, trim: true, default: ''},
    password: {type: String, required: true, select: false},
    role: {type: String, enum: userRoles, default: 'Employee'},
    department: {type: String, trim: true, default: ''},
    status: {type: String, enum: ['Active', 'Inactive'], default: 'Active'},
    avatar: {
      originalName: String,
      fileName: String,
      path: String,
      mimeType: String,
      size: Number,
    },
  },
  {timestamps: true},
);

module.exports = {User: mongoose.model('User', userSchema), userRoles};