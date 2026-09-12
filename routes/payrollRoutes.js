const express = require('express');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {employeeAuthMiddleware} = require('../middlewares/employeeAuthMiddleware');
const {getPayrolls, getEmployeePayrolls, getEmployeePayrollMonths, getEmployeePayroll, createPayroll, updatePayrollStatus} = require('../controllers/payrollController');

const router = express.Router();

router.get('/employee/months', employeeAuthMiddleware, getEmployeePayrollMonths);
router.get('/employee/:id', employeeAuthMiddleware, getEmployeePayroll);
router.get('/employee', employeeAuthMiddleware, getEmployeePayrolls);
router.get('/', authMiddleware, getPayrolls);
router.post('/', authMiddleware, createPayroll);
router.patch('/:id/status', authMiddleware, updatePayrollStatus);

module.exports = router;
