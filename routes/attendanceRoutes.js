const express = require('express');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {employeeAuthMiddleware} = require('../middlewares/employeeAuthMiddleware');
const {
  getTodayAttendance,
  checkIn,
  checkOut,
  getAttendanceHistory,
  getMonthlySummary,
  downloadMonthlySummaryPdf,
  getAdminTodaySummary,
  getAdminAttendance,
  getAdminEmployeeAttendance,
} = require('../controllers/attendanceController');

const router = express.Router();

router.get('/admin-summary', authMiddleware, getAdminTodaySummary);
router.get('/admin-records', authMiddleware, getAdminAttendance);
router.get('/admin-employee-records', authMiddleware, getAdminEmployeeAttendance);
router.use(employeeAuthMiddleware);
router.get('/today', getTodayAttendance);
router.get('/monthly-summary-pdf', downloadMonthlySummaryPdf);
router.get('/history', getAttendanceHistory);
router.get('/summary', getMonthlySummary);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);

module.exports = router;
