const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
const firebaseAdmin = require('../config/firebase');
const Counter = require('../models/Counter');
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const mongoose = require('mongoose');

const {getAllStates, getDistricts} = require('india-state-district');

const createEmployeeId = async () => {
  const counter = await Counter.findOneAndUpdate(
    {name: 'employee'},
    {$inc: {value: 1}},
    {new: true, upsert: true, setDefaultsOnInsert: true},
  );

  return `DV${String(counter.value).padStart(2, '0')}`;
};

const getValue = (value, fallback = '') => (
  typeof value === 'string' ? value.trim() : fallback
);

const findDepartment = async departmentValue => {
  if (!departmentValue) {
    return null;
  }

  const departmentText = typeof departmentValue === 'string'
    ? departmentValue.trim()
    : departmentValue.departmentName?.trim();

  if (!departmentText) {
    return null;
  }

  if (mongoose.isValidObjectId(departmentValue)) {
    return Department.findOne({
      $or: [
        {departmentId: departmentText},
        {_id: departmentText},
      ],
    });
  }

  return Department.findOne({
    $or: [
      {departmentId: departmentText},
      {departmentName: new RegExp(`^${departmentText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')},
    ],
  });
};

const validateLocation = (stateCode, district) => {
  const state = getAllStates().find(item => (
    item.code === stateCode || item.name.toLowerCase() === stateCode.toLowerCase()
  ));

  if (!state) {
    return 'Select a valid Indian state';
  }

  if (!getDistricts(state.code).includes(district)) {
    return 'Select a valid district for the selected state';
  }

  return null;
};

const getEmployeePayload = request => ({
  fullName: getValue(request.body.fullName),
  gender: getValue(request.body.gender),
  maritalStatus: getValue(request.body.maritalStatus),
  bloodGroup: getValue(request.body.bloodGroup),
  city: getValue(request.body.city || request.body.City),
  state: getValue(request.body.state),
  pincode: getValue(request.body.pincode),
  district: getValue(request.body.district),
  relationship: getValue(request.body.relationship),
  relationshipPhoneNumber: getValue(request.body.relationshipPhoneNumber),
  phoneNumber: getValue(request.body.phoneNumber),
  dateOfBirth: request.body.dateOfBirth || null,
  email: getValue(request.body.email).toLowerCase(),
  departmentName: getValue(request.body.departmentName || request.body.department),
  designation: getValue(request.body.designation),
  officeLocation: getValue(request.body.officeLocation),
  joiningDate: request.body.joiningDate,
});

const attachResume = (employee, file) => {
  if (!file) {
    return;
  }

  employee.resume = {
    originalName: file.originalname,
    fileName: file.filename,
    path: `/uploads/resumes/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
  };
};

const attachAvatar = (employee, file) => {
  if (!file) {
    return;
  }

  employee.avatar = {
    originalName: file.originalname,
    fileName: file.filename,
    path: `/uploads/avatars/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
  };
};

const getStates = (request, response) => response.json(getAllStates());

const getDistrictsForState = (request, response) => {
  const state = getAllStates().find(item => (
    item.code === request.params.stateCode
    || item.name.toLowerCase() === request.params.stateCode.toLowerCase()
  ));

  if (!state) {
    return response.status(404).json({message: 'State not found'});
  }

  return response.json({state, districts: getDistricts(state.code)});
};

const postalDistrictAliases = {
  'Parvathipuram Manyam': ['Vizianagaram'],
  'Alluri Sitharama Raju': ['Visakhapatnam', 'East Godavari'],
  Anakapalli: ['Visakhapatnam'],
  Kakinada: ['East Godavari'],
  'Dr. B.R. Ambedkar Konaseema': ['East Godavari'],
  Eluru: ['West Godavari'],
  NTR: ['Krishna'],
  Bapatla: ['Guntur'],
  Palnadu: ['Guntur'],
  Tirupati: ['Chittoor'],
  'Sri Sathya Sai': ['Anantapur'],
  Annamayya: ['Y.S.R. Kadapa'],
  Nandyal: ['Kurnool'],
};

const getCitiesForDistrict = async (request, response) => {
  try {
    const district = decodeURIComponent(request.params.district);
    const districtNames = [district, ...(postalDistrictAliases[district] || [])];
    let offices = [];

    for (const districtName of districtNames) {
      const result = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(districtName)}`);
      const payload = await result.json();
      offices = payload?.[0]?.PostOffice || [];
      if (offices.length) {
        break;
      }
    }

    const cities = offices
      .map(office => ({name: office.Name, pincode: office.Pincode}))
      .filter(office => office.name && office.pincode)
      .filter((office, index, list) => list.findIndex(item => (
        item.name === office.name && item.pincode === office.pincode
      )) === index)
      .sort((first, second) => first.name.localeCompare(second.name));

    return response.json({cities});
  } catch (error) {
    return response.status(502).json({message: 'Unable to load cities for this district'});
  }
};

const getEmployees = async (request, response) => {
  try {
    const employees = await Employee.find()
      .select('-password')
      .sort({employeeId: 1});

    return response.json(employees);
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch employees'});
  }
};

const buildProfileUpdateNotification = (employee, timestamp = new Date()) => {
  const fullName = employee?.fullName || 'Employee';
  const dateValue = timestamp instanceof Date ? timestamp : new Date(timestamp);

  return {
    id: `profile-${employee?.employeeId || employee?._id || Date.now()}-${Date.now()}`,
    type: 'Profile Update',
    status: 'Info',
    title: 'Profile Updated',
    message: `${fullName}'s profile was updated by the admin. Please review your updated information.`,
    date: dateValue.toISOString(),
    unread: true,
    createdAt: dateValue.toISOString(),
  };
};

const getEmployeeNotifications = async (request, response) => {
  try {
    const employee = await Employee.findOne({employeeId: request.employee.employeeId}).select('notifications');

    if (!employee) {
      return response.status(404).json({message: 'Employee not found'});
    }

    const notifications = (employee.notifications || [])
      .slice()
      .sort((first, second) => new Date(second.createdAt || second.date || 0) - new Date(first.createdAt || first.date || 0));

    return response.json(notifications);
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch employee notifications'});
  }
};

const sendPushNotificationToEmployee = async (employeeId, notification) => {
  try {
    const employee = await Employee.findOne({employeeId}).select('deviceToken fullName');

    if (!employee?.deviceToken) {
      return {
        sent: false,
        reason: 'No device token',
      };
    }

    const message = {
      notification: {
        title: notification?.title || 'Workforce Update',
        body: notification?.message || 'You have a new notification',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'employee_notifications',
        },
      },
      data: {
        type: String(notification?.type || 'Notification'),
        employeeId: String(employeeId),
        status: String(notification?.status || 'Info'),
        referenceId: String(notification?.referenceId || ''),
        notificationId: String(notification?.id || ''),
        title: String(notification?.title || 'Workforce Update'),
        message: String(notification?.message || 'You have a new notification'),
        action: 'open_notification',
        date: String(notification?.date || notification?.holidayDate || ''),
        holidayDate: String(notification?.holidayDate || notification?.date || ''),
        avatarUrl: String(notification?.avatarUrl || ''),
      },
      token: employee.deviceToken,
    };

    const messageId = await firebaseAdmin.messaging().send(message);

    console.log('Employee push sent successfully', {employeeId, messageId});

    return {
      sent: true,
      messageId,
    };
  } catch (error) {
    console.error('Employee push notification error:', error);

    return {
      sent: false,
      reason: error.message || 'Unable to send employee push notification',
    };
  }
};

const saveEmployeeDeviceToken = async (request, response) => {
  try {
    const deviceToken = getValue(request.body.deviceToken || request.body.token);

    if (!deviceToken) {
      return response.status(400).json({message: 'Device token is required'});
    }

    const employee = await Employee.findOneAndUpdate(
      {employeeId: request.employee.employeeId},
      {deviceToken},
      {new: true},
    ).select('deviceToken employeeId');

    if (!employee) {
      return response.status(404).json({message: 'Employee not found'});
    }

    return response.json({message: 'Device token registered', deviceToken: employee.deviceToken});
  } catch (error) {
    return response.status(500).json({message: 'Unable to save device token'});
  }
};

const employeeLogin = async (request, response) => {
  try {
    const login = getValue(request.body.login || request.body.email || request.body.employeeId);
    const password = getValue(request.body.password);

    if (!login || !password) {
      return response.status(400).json({message: 'Email or employee ID and password are required'});
    }

    if (!process.env.JWT_SECRET) {
      return response.status(500).json({message: 'Employee login configuration is missing'});
    }

    const normalizedLogin = login.toLowerCase();
    const employee = await Employee.findOne({
      $or: [
        {email: normalizedLogin},
        {employeeId: login.toUpperCase()},
      ],
    }).select('+password');

    if (!employee) {
      return response.status(401).json({message: 'Email is incorrect or enter a valid employee ID'});
    }

    if (!(await bcrypt.compare(password, employee.password))) {
      return response.status(401).json({message: 'Password is incorrect'});
    }

    const token = jwt.sign(
      {employeeId: employee.employeeId, email: employee.email, role: 'employee'},
      process.env.JWT_SECRET,
      {expiresIn: '1d'},
    );

    return response.json({
      message: 'Employee login successful',
      token,
      employee: {
        id: employee._id,
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        email: employee.email,
        departmentName: employee.departmentName,
        designation: employee.designation,
        officeLocation: employee.officeLocation,
        avatar: employee.avatar,
      },
    });
  } catch (error) {
    return response.status(500).json({message: 'Server error during employee login'});
  }
};

const lookupEmployeeEmail = async (request, response) => {
  try {
    const login = getValue(request.query.login || request.query.email || request.query.employeeId);
    if (!login) {
      return response.status(400).json({message: 'Employee email or ID is required'});
    }

    const employee = await Employee.findOne({
      $or: [
        {email: login.toLowerCase()},
        {employeeId: login.toUpperCase()},
      ],
    }).select('email');

    if (!employee) {
      return response.status(404).json({message: 'Employee not found'});
    }

    return response.json({email: employee.email});
  } catch (error) {
    return response.status(500).json({message: 'Unable to find employee email'});
  }
};

const getMailTransporter = () => {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure,
    requireTLS: true,
    tls: {
      rejectUnauthorized: false,
    },
    auth: {
      user: process.env.SMTP_USER || process.env.ADMIN_EMAIL,
      pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.ADMIN_PASSWORD || '').replace(/\s+/g, ''),
    },
  });
};

const sendEmployeeResetCode = async (request, response) => {
  try {
    const email = getValue(request.body.email).toLowerCase();
    if (!email) {
      return response.status(400).json({message: 'Registered employee email is required'});
    }

    const employee = await Employee.findOne({email}).select('+resetCode +resetCodeExpiresAt');
    if (!employee) {
      return response.status(404).json({message: 'This email is not registered for an employee'});
    }

    const mailUser = process.env.SMTP_USER || process.env.ADMIN_EMAIL;
    const mailPassword = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.ADMIN_PASSWORD || '').replace(/\s+/g, '');
    if (!mailUser || !mailPassword) {
      return response.status(503).json({message: 'Email service is not configured'});
    }

    const resetCode = String(crypto.randomInt(100000, 1000000));
    await getMailTransporter().sendMail({
      from: process.env.SMTP_FROM || mailUser,
      to: employee.email,
      subject: 'Your VibeWork password reset code',
      text: `Your password reset code is ${resetCode}. It expires in 1 minute.`,
    });

    employee.resetCode = resetCode;
    employee.resetCodeExpiresAt = new Date(Date.now() + 60 * 1000);
    await employee.save();
    return response.json({message: 'A reset code was sent to your registered email'});
  } catch (error) {
    console.error('Employee reset code email error:', error.message);
    return response.status(500).json({message: 'Unable to send reset code to this email'});
  }
};

const resetEmployeePassword = async (request, response) => {
  try {
    const email = getValue(request.body.email).toLowerCase();
    const resetCode = getValue(request.body.resetCode);
    const newPassword = getValue(request.body.newPassword);
    if (!email || !resetCode || !newPassword) {
      return response.status(400).json({message: 'Email, reset code, and new password are required'});
    }

    const employee = await Employee.findOne({email}).select('+password +resetCode +resetCodeExpiresAt');
    if (!employee) {
      return response.status(404).json({message: 'This email is not registered for an employee'});
    }
    if (!employee.resetCode || !employee.resetCodeExpiresAt || employee.resetCodeExpiresAt < new Date()) {
      return response.status(400).json({message: 'OTP has expired. Request a new OTP.'});
    }
    if (employee.resetCode !== resetCode) {
      return response.status(400).json({message: 'Invalid OTP'});
    }

    employee.password = await bcrypt.hash(newPassword, 10);
    employee.resetCode = '';
    employee.resetCodeExpiresAt = null;
    await employee.save();
    return response.json({message: 'Password changed successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to reset password'});
  }
};

const changeEmployeePassword = async (request, response) => {
  try {
    const oldPassword = getValue(request.body.oldPassword);
    const newPassword = getValue(request.body.newPassword);
    if (!oldPassword || !newPassword) {
      return response.status(400).json({message: 'Old and new passwords are required'});
    }

    const employee = await Employee.findOne({employeeId: request.employee.employeeId}).select('+password');
    if (!employee || !(await bcrypt.compare(oldPassword, employee.password))) {
      return response.status(401).json({message: 'Old password is incorrect'});
    }

    employee.password = await bcrypt.hash(newPassword, 12);
    await employee.save();
    return response.json({message: 'Password updated successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to update password'});
  }
};

const verifyEmployeeResetCode = async (request, response) => {
  try {
    const email = getValue(request.body.email).toLowerCase();
    const resetCode = getValue(request.body.resetCode);
    const employee = await Employee.findOne({email}).select('+resetCode +resetCodeExpiresAt');

    if (!employee) {
      return response.status(404).json({message: 'This email is not registered for an employee'});
    }
    if (!employee.resetCode || !employee.resetCodeExpiresAt || employee.resetCodeExpiresAt < new Date()) {
      return response.status(400).json({message: 'OTP has expired. Request a new OTP.'});
    }
    if (!resetCode || employee.resetCode !== resetCode) {
      return response.status(400).json({message: 'Invalid OTP'});
    }

    return response.json({message: 'OTP verified successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to verify OTP'});
  }
};

const downloadResume = async (request, response) => {
  try {
    const employee = await Employee.findOne({employeeId: request.params.employeeId}).select('resume');
    const resume = employee?.resume;

    if (!resume?.fileName) {
      return response.status(404).json({message: 'Resume not found'});
    }

    const fileName = path.basename(resume.fileName);
    const filePath = path.join(__dirname, '..', 'uploads', 'resumes', fileName);

    if (!fs.existsSync(filePath)) {
      return response.status(404).json({message: 'Resume file not found'});
    }

    return response.download(filePath, resume.originalName || fileName, {
      headers: {
        'Content-Type': resume.mimeType || 'application/octet-stream',
      },
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to download resume'});
  }
};

const createEmployee = async (request, response) => {
  try {
    const payload = getEmployeePayload(request);
    const locationError = validateLocation(payload.state, payload.district);
    const department = await findDepartment(payload.departmentName);

    if (!payload.fullName || !payload.email || !payload.joiningDate || !payload.departmentName || !request.body.password) {
      return response.status(400).json({message: 'Name, email, joining date, password, and department are required'});
    }
    if (locationError) {
      return response.status(400).json({message: locationError});
    }
    if (!department) {
      return response.status(400).json({message: `Department not found: ${payload.departmentName}`});
    }

    const employee = new Employee({
      employeeId: await createEmployeeId(),
      ...payload,
      departmentName: department.departmentName,
      password: await bcrypt.hash(request.body.password, 12),
    });
    attachAvatar(employee, request.files?.avatar?.[0]);
    attachResume(employee, request.files?.resume?.[0]);
    await employee.save();

    employee.password = undefined;
    return response.status(201).json(employee);
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({message: 'Employee email already exists'});
    }
    return response.status(500).json({message: 'Unable to create employee'});
  }
};

const updateEmployee = async (request, response) => {
  try {
    const payload = getEmployeePayload(request);
    const employee = await Employee.findOne({employeeId: request.params.employeeId}).select('+password');

    if (!employee) {
      return response.status(404).json({message: 'Employee not found'});
    }

    const locationError = validateLocation(payload.state, payload.district);
    const department = await findDepartment(payload.departmentName);

    if (locationError) {
      return response.status(400).json({message: locationError});
    }
    if (!department) {
      return response.status(400).json({message: `Department not found: ${payload.departmentName}`});
    }

    Object.assign(employee, payload, {departmentName: department.departmentName});
    if (request.body.password) {
      employee.password = await bcrypt.hash(request.body.password, 12);
    }
    attachAvatar(employee, request.files?.avatar?.[0]);
    attachResume(employee, request.files?.resume?.[0]);

    const profileUpdateNotification = buildProfileUpdateNotification(employee);
    employee.notifications = [profileUpdateNotification, ...(employee.notifications || [])].slice(0, 50);
    await employee.save();
    await sendPushNotificationToEmployee(employee.employeeId, profileUpdateNotification);

    employee.password = undefined;
    return response.json(employee);
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({message: 'Employee email already exists'});
    }
    return response.status(500).json({message: 'Unable to update employee'});
  }
};

const deleteEmployee = async (request, response) => {
  try {
    const employee = await Employee.findOneAndDelete({employeeId: request.params.employeeId});

    if (!employee) {
      return response.status(404).json({message: 'Employee not found'});
    }

    return response.json({message: 'Employee deleted successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to delete employee'});
  }
};

module.exports = {
  employeeLogin,
  sendEmployeeResetCode,
  resetEmployeePassword,
  changeEmployeePassword,
  verifyEmployeeResetCode,
  lookupEmployeeEmail,
  getStates,
  getDistrictsForState,
  getCitiesForDistrict,
  getEmployees,
  getEmployeeNotifications,
  saveEmployeeDeviceToken,
  sendPushNotificationToEmployee,
  buildProfileUpdateNotification,
  downloadResume,
  createEmployee,
  updateEmployee,
  deleteEmployee,
};
