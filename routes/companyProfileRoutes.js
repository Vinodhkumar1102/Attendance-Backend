const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {employeeAuthMiddleware} = require('../middlewares/employeeAuthMiddleware');
const {
  getCompanyProfile,
  updateCompanyProfile,
} = require('../controllers/companyProfileController');

const companyDirectory = path.join(__dirname, '..', 'uploads', 'company');
fs.mkdirSync(companyDirectory, {recursive: true});

const storage = multer.diskStorage({
  destination: (request, file, callback) => callback(null, companyDirectory),
  filename: (request, file, callback) => {
    callback(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const uploadCompanyAvatar = multer({
  storage,
  limits: {fileSize: 5 * 1024 * 1024},
  fileFilter: (request, file, callback) => {
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (supportedTypes.includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error('Only image files are allowed for the avatar.'));
  },
});

const router = express.Router();

router.get('/employee', employeeAuthMiddleware, getCompanyProfile);
router.use(authMiddleware);
router.get('/', getCompanyProfile);
router.put('/', uploadCompanyAvatar.single('avatar'), updateCompanyProfile);

module.exports = router;