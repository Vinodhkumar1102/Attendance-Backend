const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const {sendPushNotificationToEmployee} = require('./employeeController');
const {sendPushNotificationToAdmin} = require('./adminController');

const validLeaveTypes = ['Emergency Leave', 'Work From Home', 'Casual Leave', 'Sick Leave'];
const validStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

const toDate = value => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildAdminLeaveNotification = leave => {
  const startDate = toDate(leave.startDate);
  const endDate = toDate(leave.endDate);
  const totalDays = getTotalDays(startDate, endDate);
  const employeeName = leave.employeeName || leave.employeeId || 'Employee';

  return {
    id: `admin-leave-${leave._id || leave.id || Date.now()}`,
    type: 'Leave',
    title: 'New Leave Request',
    message: `${employeeName} requested ${leave.leaveType || 'Leave'} for ${totalDays} day${totalDays === 1 ? '' : 's'}.`,
    status: leave.status || 'Pending',
    targetType: 'leave',
    referenceId: leave._id || leave.id || '',
    avatarUrl: leave.avatarUrl || '',
    date: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    unread: true,
  };
};

const getTotalDays = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 0;
  }

  const startKey = getDateKey(startDate);
  const endKey = getDateKey(endDate);
  const startDay = new Date(`${startKey}T00:00:00.000Z`);
  const endDay = new Date(`${endKey}T00:00:00.000Z`);
  const diffInDays = Math.round((endDay - startDay) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffInDays + 1);
};

const getDateKey = date => new Date(date).toISOString().slice(0, 10);

const syncApprovedLeaveAttendance = async leave => {
  const attendanceStatus = leave.leaveType === 'Work From Home' ? 'Work From Home' : 'Leave';
  const startDate = new Date(leave.startDate);
  const endDate = new Date(leave.endDate);
  const dateKeys = [];

  for (const date = new Date(startDate); date <= endDate; date.setUTCDate(date.getUTCDate() + 1)) {
    dateKeys.push(getDateKey(date));
  }

  const existingRecords = await Attendance.find({
    employeeId: leave.employeeId,
    date: {$in: dateKeys},
  }).select('date checkIn status');
  const recordsByDate = new Map(existingRecords.map(record => [record.date, record]));
  const operations = dateKeys
    .filter(date => !recordsByDate.get(date)?.checkIn && recordsByDate.get(date)?.status !== 'Holiday')
    .map(date => ({
      updateOne: {
        filter: {employeeId: leave.employeeId, date},
        update: {
          $set: {status: attendanceStatus, checkIn: null, checkOut: null, workingMinutes: 0},
          $setOnInsert: {employeeId: leave.employeeId, date},
        },
        upsert: true,
      },
    }));

  if (operations.length) {
    await Attendance.bulkWrite(operations);
  }
};

const serializeLeave = leave => ({
  id: leave._id,
  leaveType: leave.leaveType,
  startDate: leave.startDate,
  endDate: leave.endDate,
  reason: leave.reason,
  status: leave.status,
  totalDays: getTotalDays(leave.startDate, leave.endDate),
  createdAt: leave.createdAt,
  updatedAt: leave.updatedAt,
});

const createLeave = async (request, response) => {
  try {
    const employeeId = request.employee?.employeeId || request.body.employeeId;
    const employeeName = request.employee?.fullName || request.body.employeeName || '';
    const leaveType = request.body.leaveType;
    const startDate = toDate(request.body.startDate);
    const endDate = toDate(request.body.endDate);
    const reason = typeof request.body.reason === 'string' ? request.body.reason.trim() : '';

    if (!leaveType || !validLeaveTypes.includes(leaveType)) {
      return response.status(400).json({message: 'Please select a valid leave type'});
    }

    if (!startDate || !endDate) {
      return response.status(400).json({message: 'Start date and end date are required'});
    }

    if (endDate < startDate) {
      return response.status(400).json({message: 'End date cannot be before start date'});
    }

    if (!reason) {
      return response.status(400).json({message: 'Reason is required'});
    }

    if (!employeeId) {
      return response.status(400).json({message: 'Employee session is required'});
    }

    const leave = await Leave.create({
      employeeId,
      employeeName,
      leaveType,
      startDate,
      endDate,
      reason,
      status: 'Pending',
    });

    const employeeRecord = await Employee.findOne({employeeId}).select('avatar.path');
    const avatarPath = employeeRecord?.avatar?.path || '';
    const avatarBaseUrl = process.env.PUBLIC_API_URL || 'http://192.168.0.102:5000';
    const adminNotification = buildAdminLeaveNotification({
      ...(leave.toObject ? leave.toObject() : leave),
      avatarUrl: avatarPath ? `${avatarBaseUrl}${avatarPath}` : '',
    });
    const adminEmail = String(process.env.ADMIN_EMAIL || 'datavibes80@gmail.com').trim().toLowerCase();
    const Admin = require('../models/Admin');
    const admin = await Admin.findOne({email: adminEmail}).select('_id email notifications deviceToken');

    if (admin) {
      const notifications = Array.isArray(admin.notifications) ? admin.notifications : [];
      admin.notifications = [adminNotification, ...notifications].slice(0, 50);
      await admin.save();
      console.log('Admin leave notification stored in database', {
        adminEmail,
        notificationId: adminNotification.id,
        notificationTitle: adminNotification.title,
      });
    }

    const pushResult = await sendPushNotificationToAdmin(adminEmail, adminNotification);
    console.log('Admin push attempt result for leave request', {
      adminEmail,
      sent: pushResult?.sent,
      reason: pushResult?.reason,
      messageId: pushResult?.messageId,
    });

    if (!pushResult?.sent) {
      console.error('Admin leave push failed to deliver on real device', {
        adminEmail,
        leaveId: leave._id,
        reason: pushResult?.reason,
      });
    }

    return response.status(201).json({
      message: 'Leave applied successfully',
      leave: serializeLeave(leave),
    });
  } catch (error) {
    const message = error.message || 'Unable to apply leave';
    return response.status(500).json({message});
  }
};

const getMyLeaves = async (request, response) => {
  try {
    const employeeId = request.employee?.employeeId;

    if (!employeeId) {
      return response.status(400).json({message: 'Employee session is required'});
    }

    const requestedStatuses = typeof request.query.status === 'string'
      ? request.query.status.split(',').filter(status => validStatuses.includes(status))
      : [];
    const filter = {employeeId};
    if (requestedStatuses.length) {
      filter.status = {$in: requestedStatuses};
    }

    const leaves = await Leave.find(filter).sort({createdAt: -1});
    return response.json({leaves: leaves.map(serializeLeave)});
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch employee leave requests'});
  }
};

const getAllLeaves = async (request, response) => {
  try {
    const {status} = request.query;
    const filter = status && validStatuses.includes(status) ? {status} : {};

    const leaves = await Leave.find(filter).sort({createdAt: -1});
    const employeeIds = [...new Set(leaves.map(leave => leave.employeeId).filter(Boolean))];
    const employees = await Employee.find({employeeId: {$in: employeeIds}}).select('employeeId fullName avatar');
    const employeeDetails = new Map(employees.map(employee => [employee.employeeId, employee]));
    return response.json({leaves: leaves.map(leave => ({
      ...serializeLeave(leave),
      employeeId: leave.employeeId,
      employeeName: leave.employeeName || employeeDetails.get(leave.employeeId)?.fullName || leave.employeeId,
      avatar: employeeDetails.get(leave.employeeId)?.avatar || null,
    }))});
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch leave requests'});
  }
};

const updateLeaveStatus = async (request, response) => {
  try {
    const {status} = request.body;

    if (!status || !validStatuses.includes(status)) {
      return response.status(400).json({message: 'Invalid leave status'});
    }

    const leave = await Leave.findByIdAndUpdate(
      request.params.id,
      {status},
      {new: true},
    );

    if (!leave) {
      return response.status(404).json({message: 'Leave request not found'});
    }

    if (status === 'Approved') {
      await syncApprovedLeaveAttendance(leave);
    }

    const leaveNotification = {
      id: `employee-leave-${leave._id}-${Date.now()}`,
      type: 'Leave',
      title: `Leave Request - ${status}`,
      message: `Your leave request was ${status.toLowerCase()}.`,
      status,
      targetType: 'leave',
      referenceId: String(leave._id),
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      unread: true,
    };

    const employee = await Employee.findOne({employeeId: leave.employeeId}).select('notifications');
    if (employee) {
      const notifications = Array.isArray(employee.notifications) ? employee.notifications : [];
      employee.notifications = [leaveNotification, ...notifications].slice(0, 50);
      await employee.save();
    }

    await sendPushNotificationToEmployee(leave.employeeId, leaveNotification);

    return response.json({
      message: 'Leave status updated successfully',
      leave: serializeLeave(leave),
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to update leave status'});
  }
};

const cancelLeave = async (request, response) => {
  try {
    const leave = await Leave.findById(request.params.id);

    if (!leave) {
      return response.status(404).json({message: 'Leave request not found'});
    }

    leave.status = 'Cancelled';
    await leave.save();

    return response.json({
      message: 'Leave request cancelled successfully',
      leave: serializeLeave(leave),
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to cancel leave request'});
  }
};

module.exports = {
  createLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
  cancelLeave,
  syncApprovedLeaveAttendance,
  buildAdminLeaveNotification,
};
