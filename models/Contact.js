const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    contactKey: {type: String, unique: true, default: 'default'},
    phone: {type: String, trim: true, default: ''},
    email: {type: String, trim: true, lowercase: true, default: ''},
    address: {type: String, trim: true, default: ''},
    question: {type: String, trim: true, default: ''},
    paragraph: {type: String, trim: true, default: ''},
    faqs: {
      type: [{
        question: {type: String, trim: true, default: ''},
        paragraph: {type: String, trim: true, default: ''},
      }],
      default: [],
    },
  },
  {timestamps: true},
);

module.exports = mongoose.model('Contact', contactSchema);
