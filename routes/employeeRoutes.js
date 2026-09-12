const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {employeeAuthMiddleware} = require('../middlewares/employeeAuthMiddleware');
const {
  getStates,
  getDistrictsForState,
  getCitiesForDistrict,
  employeeLogin,
  sendEmployeeResetCode,
  resetEmployeePassword,
  changeEmployeePassword,
  verifyEmployeeResetCode,
  lookupEmployeeEmail,
  getEmployees,
  getEmployeeNotifications,
  saveEmployeeDeviceToken,
  downloadResume,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require('../controllers/employeeController');

const resumeDirectory = path.join(__dirname, '..', 'uploads', 'resumes');
const avatarDirectory = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(resumeDirectory, {recursive: true});
fs.mkdirSync(avatarDirectory, {recursive: true});

const storage = multer.diskStorage({
  destination: (request, file, callback) => callback(
    null,
    file.fieldname === 'avatar' ? avatarDirectory : resumeDirectory,
  ),
  filename: (request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const allowedResumeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const allowedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const uploadResume = multer({
  storage,
  limits: {fileSize: 5 * 1024 * 1024},
  fileFilter: (request, file, callback) => {
    const isAllowed = file.fieldname === 'avatar'
      ? allowedAvatarTypes.has(file.mimetype)
      : allowedResumeTypes.has(file.mimetype);
    callback(null, isAllowed);
  },
});

const router = express.Router();

router.post('/login', employeeLogin);
router.get('/lookup-email', lookupEmployeeEmail);
router.post('/forgot-password', sendEmployeeResetCode);
router.post('/reset-password', resetEmployeePassword);
router.post('/verify-reset-code', verifyEmployeeResetCode);
router.post('/change-password', employeeAuthMiddleware, changeEmployeePassword);
router.post('/device-token', employeeAuthMiddleware, saveEmployeeDeviceToken);
router.get('/notifications', employeeAuthMiddleware, getEmployeeNotifications);
router.get('/:employeeId/resume/download', downloadResume);
router.use(authMiddleware);
router.get('/locations/states', getStates);
router.get('/locations/states/:stateCode/districts', getDistrictsForState);
router.get('/locations/states/:stateCode/districts/:district/cities/:stateName', getCitiesForDistrict);
router.get('/', getEmployees);
router.post('/', uploadResume.fields([
  {name: 'avatar', maxCount: 1},
  {name: 'resume', maxCount: 1},
]), createEmployee);
router.put('/:employeeId', uploadResume.fields([
  {name: 'avatar', maxCount: 1},
  {name: 'resume', maxCount: 1},
]), updateEmployee);
router.delete('/:employeeId', deleteEmployee);

module.exports = router;
