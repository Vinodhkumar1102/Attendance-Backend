const express = require('express');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {employeeAuthMiddleware} = require('../middlewares/employeeAuthMiddleware');
const {
  createLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
  cancelLeave,
} = require('../controllers/leaveController');

const router = express.Router();

router.post('/', employeeAuthMiddleware, createLeave);
router.get('/my', employeeAuthMiddleware, getMyLeaves);
router.get('/', authMiddleware, getAllLeaves);
router.patch('/:id/status', authMiddleware, updateLeaveStatus);
router.delete('/:id', employeeAuthMiddleware, cancelLeave);

module.exports = router;
