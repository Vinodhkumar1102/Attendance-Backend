const mongoose = require('mongoose');

const companyProfileSchema = new mongoose.Schema(
  {
    profileKey: {type: String, unique: true, default: 'default'},
    companyName: {type: String, trim: true, default: ''},
    description: {type: String, trim: true, default: ''},
    managerName: {type: String, trim: true, default: ''},
    email: {type: String, trim: true, lowercase: true, default: ''},
    phone: {type: String, trim: true, default: ''},
    address: {type: String, trim: true, default: ''},
    website: {type: String, trim: true, default: ''},
    aboutHeading: {type: String, trim: true, default: ''},
    about: {type: String, trim: true, default: ''},
    aboutSecondaryDescription: {type: String, trim: true, default: ''},
    aboutPoints: {type: [String], default: ['', '', '', '']},
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

module.exports = mongoose.model('CompanyProfile', companyProfileSchema);