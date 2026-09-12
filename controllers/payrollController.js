const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const validStatuses = ['Draft', 'Pending', 'Paid'];

const buildPayrollNotification = (employee, payroll, mode = 'Created') => {
  const employeeId = employee?.employeeId || payroll?.employeeId || 'Unknown';
  const payMonth = payroll?.payMonth || 'Current month';
  const status = payroll?.status || 'Pending';
  const title = mode === 'Status Updated' ? 'Payroll Updated' : 'Payroll Created';
  const type = 'Payroll';
  const message = mode === 'Status Updated'
    ? `${employee?.fullName || 'Your'} payroll for ${payMonth} was updated to ${status}.`
    : `${employee?.fullName || 'Your'} payroll for ${payMonth} has been created and is ready to review.`;

  return {
    id: `payroll-${employeeId}-${payMonth}-${Date.now()}`,
    type,
    status,
    targetType: 'payroll',
    referenceId: String(payroll?._id || ''),
    payMonth,
    title,
    message,
    date: new Date().toISOString(),
    unread: true,
    createdAt: new Date().toISOString(),
  };
};

const addPayrollNotificationToEmployee = async (employeeId, payload) => {
  const employee = await Employee.findOne({employeeId}).select('notifications');
  if (!employee) {
    return;
  }

  const notifications = Array.isArray(employee.notifications) ? employee.notifications : [];
  employee.notifications = [payload, ...notifications].slice(0, 50);
  await employee.save();
};

const serializePayroll = payroll => ({
  id: payroll._id,
  employeeId: payroll.employeeId,
  employeeName: payroll.employeeName,
  departmentName: payroll.departmentName,
  designation: payroll.designation || '',
  phoneNumber: payroll.phoneNumber || '',
  officeLocation: payroll.officeLocation || '',
  avatar: payroll.avatar,
  payMonth: payroll.payMonth,
  amount: payroll.amount,
  leaveDeduction: payroll.leaveDeduction || 0,
  netSalary: payroll.netSalary ?? payroll.remainingAmount ?? (payroll.amount - (payroll.leaveDeduction || 0)),
  remainingAmount: payroll.remainingAmount,
  status: validStatuses.includes(payroll.status) ? payroll.status : 'Pending',
  paidDate: payroll.paidDate || null,
  upiId: payroll.upiId || '',
  utrNumber: payroll.utrNumber || '',
  notes: payroll.notes || '',
  attendanceSummary: payroll.attendanceSummary,
  createdAt: payroll.createdAt,
});

const getPayrolls = async (request, response) => {
  try {
    const payrolls = await Payroll.find().sort({createdAt: -1});
    const employeeIds = payrolls.map(payroll => payroll.employeeId);
    const employees = await Employee.find({employeeId: {$in: employeeIds}}).select('employeeId designation phoneNumber officeLocation avatar');
    const avatarsByEmployeeId = new Map(employees.map(employee => [employee.employeeId, employee.avatar]));
    const designationsByEmployeeId = new Map(employees.map(employee => [employee.employeeId, employee.designation || '']));
    const phoneNumbersByEmployeeId = new Map(employees.map(employee => [employee.employeeId, employee.phoneNumber || '']));
    const officeLocationsByEmployeeId = new Map(employees.map(employee => [employee.employeeId, employee.officeLocation || '']));
    return response.json(payrolls.map(payroll => ({
      ...serializePayroll(payroll),
      designation: payroll.designation || designationsByEmployeeId.get(payroll.employeeId) || '',
      phoneNumber: payroll.phoneNumber || phoneNumbersByEmployeeId.get(payroll.employeeId) || '',
      officeLocation: payroll.officeLocation || officeLocationsByEmployeeId.get(payroll.employeeId) || '',
      avatar: avatarsByEmployeeId.get(payroll.employeeId) || payroll.avatar || {},
    })));
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch monthly payroll'});
  }
};

const getEmployeePayrolls = async (request, response) => {
  try {
    const payrolls = await Payroll.find({
      employeeId: request.employee.employeeId,
    }).sort({createdAt: -1});
    return response.json(payrolls.map(serializePayroll));
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch payslips'});
  }
};

const getEmployeePayrollMonths = async (request, response) => {
  try {
    const payrolls = await Payroll.find({
      employeeId: request.employee.employeeId,
    }).select('_id payMonth paidDate status').sort({createdAt: -1});
    return response.json(payrolls.map(payroll => ({
      id: payroll._id,
      payMonth: payroll.payMonth,
      paidDate: payroll.paidDate || null,
      status: validStatuses.includes(payroll.status) ? payroll.status : 'Pending',
    })));
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch completed months'});
  }
};

const getEmployeePayroll = async (request, response) => {
  try {
    const payroll = await Payroll.findOne({
      _id: request.params.id,
      employeeId: request.employee.employeeId,
    });
    if (!payroll) {
      return response.status(404).json({message: 'Payslip not found'});
    }
    return response.json(serializePayroll(payroll));
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch payslip details'});
  }
};

const createPayroll = async (request, response) => {
  try {
    const {employeeId, payMonth, amount, leaveDeduction, attendanceSummary} = request.body;
    const employee = await Employee.findOne({employeeId}).select('employeeId fullName departmentName designation phoneNumber officeLocation avatar');
    const numericAmount = Number(amount);
    const numericLeaveDeduction = Number(leaveDeduction || 0);

    if (!employee) {
      return response.status(400).json({message: 'Selected employee was not found'});
    }
    if (!payMonth || !/^([A-Za-z]+)\s+(\d{4})$/.test(payMonth)) {
      return response.status(400).json({message: 'Pay month is required'});
    }
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return response.status(400).json({message: 'A valid amount is required'});
    }
    if (!Number.isFinite(numericLeaveDeduction) || numericLeaveDeduction < 0 || numericLeaveDeduction > numericAmount) {
      return response.status(400).json({message: 'Leave deduction must be between 0 and the amount'});
    }

    const payroll = await Payroll.create({
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      departmentName: employee.departmentName,
      designation: employee.designation || '',
      phoneNumber: employee.phoneNumber || '',
      officeLocation: employee.officeLocation || '',
      avatar: employee.avatar || {},
      payMonth: payMonth.trim(),
      amount: numericAmount,
      leaveDeduction: numericLeaveDeduction,
      remainingAmount: numericAmount - numericLeaveDeduction,
      status: 'Pending',
      attendanceSummary: attendanceSummary || {},
    });

    const payrollNotification = buildPayrollNotification(employee, payroll, 'Created');
    await addPayrollNotificationToEmployee(employee.employeeId, payrollNotification);
    await require('./employeeController').sendPushNotificationToEmployee(employee.employeeId, payrollNotification);

    return response.status(201).json({message: 'Payslip saved successfully', payroll: serializePayroll(payroll)});
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({message: 'Payslip already exists for this employee and month'});
    }
    return response.status(500).json({message: 'Unable to save payslip'});
  }
};

const updatePayrollStatus = async (request, response) => {
  try {
    const {status, notes, paidDate, upiId, utrNumber, leaveDeduction} = request.body;
    if (!validStatuses.includes(status)) {
      return response.status(400).json({message: 'Invalid payroll status'});
    }

    const existingPayroll = await Payroll.findById(request.params.id);
    if (!existingPayroll) {
      return response.status(404).json({message: 'Payslip not found'});
    }
    if (existingPayroll.status === 'Paid') {
      return response.status(400).json({message: 'Paid payslips cannot be edited'});
    }

    const update = {status};
    if (typeof notes === 'string') {
      update.notes = notes.trim();
    }
    if (typeof upiId === 'string') {
      update.upiId = upiId.trim();
    }
    if (status === 'Paid') {
      if (typeof utrNumber !== 'string' || !utrNumber.trim()) {
        return response.status(400).json({message: 'UTR number is required for paid payslips'});
      }
      update.utrNumber = utrNumber.trim();
    } else {
      update.utrNumber = '';
    }
    if (leaveDeduction !== undefined) {
      const numericLeaveDeduction = Number(leaveDeduction || 0);
      if (!Number.isFinite(numericLeaveDeduction) || numericLeaveDeduction < 0 || numericLeaveDeduction > existingPayroll.amount) {
        return response.status(400).json({message: 'Leave deduction must be between 0 and the amount'});
      }
      update.leaveDeduction = numericLeaveDeduction;
      update.remainingAmount = existingPayroll.amount - numericLeaveDeduction;
    }
    if (status === 'Paid') {
      const parsedPaidDate = paidDate ? new Date(paidDate) : new Date();
      if (Number.isNaN(parsedPaidDate.getTime())) {
        return response.status(400).json({message: 'A valid paid date is required'});
      }
      update.paidDate = parsedPaidDate;
    } else {
      update.paidDate = null;
    }
    const payroll = await Payroll.findByIdAndUpdate(
      request.params.id,
      update,
      {new: true, runValidators: true},
    );
    if (!payroll) {
      return response.status(404).json({message: 'Payslip not found'});
    }

    const employee = await Employee.findOne({employeeId: payroll.employeeId}).select('employeeId fullName notifications');
    const payrollNotification = buildPayrollNotification(employee, payroll, 'Status Updated');
    await addPayrollNotificationToEmployee(payroll.employeeId, payrollNotification);
    await require('./employeeController').sendPushNotificationToEmployee(payroll.employeeId, payrollNotification);

    return response.json({message: 'Payslip status updated', payroll: serializePayroll(payroll)});
  } catch (error) {
    return response.status(500).json({message: 'Unable to update payslip status'});
  }
};

module.exports = {
  buildPayrollNotification,
  getPayrolls,
  getEmployeePayrolls,
  getEmployeePayrollMonths,
  getEmployeePayroll,
  createPayroll,
  updatePayrollStatus,
};
