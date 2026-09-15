const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const firebaseAdmin = require('../config/firebase');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const {getTokenFromRequest, revokeToken} = require('../middlewares/authMiddleware');

const getValue = value => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return value ?? null;
};

const sendPushNotificationToAdmin = async (adminEmail, notification) => {
  try {
    const adminUser = await Admin.findOne({
      email: String(adminEmail || '').trim().toLowerCase(),
    }).select('deviceToken email');

    if (!adminUser?.deviceToken) {
      console.error('Admin push failed: no device token');
      return {sent: false, reason: 'No admin device token'};
    }

    console.log('Attempting admin push notification', {
      adminEmail,
      title: notification?.title,
      type: notification?.type,
    });

    const message = {
      notification: {
        title: notification?.title || 'Workforce Update',
        body: notification?.message || 'You have a new notification',
        ...(notification?.avatarUrl ? {imageUrl: notification.avatarUrl} : {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'admin_notifications',
          ...(notification?.avatarUrl ? {imageUrl: notification.avatarUrl} : {}),
        },
      },
      data: {
        type: String(notification?.type || 'Notification'),
        title: String(notification?.title || 'Workforce Update'),
        message: String(notification?.message || 'You have a new notification'),
        avatarUrl: String(notification?.avatarUrl || ''),
        action: 'open_notification',
      },
      token: adminUser.deviceToken,
    };

    const messageId = await firebaseAdmin.messaging().send(message);

    console.log('Admin push sent successfully', {messageId, adminEmail});

    return {
      sent: true,
      messageId,
    };
  } catch (error) {
    console.error('Admin push notification error:', error);

    return {
      sent: false,
      reason: error.message || 'Unable to send admin push notification',
    };
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
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      rejectUnauthorized: false,
    },
    auth: {
      user: process.env.SMTP_USER || process.env.ADMIN_EMAIL,
      pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.ADMIN_PASSWORD || '').replace(/\s+/g, ''),
    },
  });
};

const adminLogin = async (request, response) => {
  try {
    const {email, password} = request.body;

    if (!email || !password) {
      return response.status(400).json({message: 'Email and password are required'});
    }

    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
      return response.status(500).json({message: 'Admin login configuration is missing'});
    }

    const normalizedEmail = email.toLowerCase().trim();
    let adminRecord = await Admin.findOne({email: normalizedEmail}).select('+password');

    if (!adminRecord
      && normalizedEmail === process.env.ADMIN_EMAIL.toLowerCase().trim()
      && password === process.env.ADMIN_PASSWORD) {
      const hashedPassword = await bcrypt.hash(password, 12);
      adminRecord = await Admin.create({
        email: normalizedEmail,
        password: hashedPassword,
      });
    }

    if (!adminRecord || !(await bcrypt.compare(password, adminRecord.password))) {
      return response.status(401).json({message: 'Invalid email or password'});
    }

    const token = jwt.sign(
      {adminId: adminRecord._id, email: adminRecord.email, role: adminRecord.role},
      process.env.JWT_SECRET,
      {expiresIn: '1d'},
    );

    return response.json({
      message: 'Admin login successful',
      token,
      admin: {
        id: adminRecord._id,
        name: adminRecord.name,
        email: adminRecord.email,
        role: adminRecord.role,
      },
    });
  } catch (error) {
    return response.status(500).json({message: 'Server error during admin login'});
  }
};

const adminLogout = (request, response) => {
  const token = getTokenFromRequest(request);

  if (!token) {
    return response.status(400).json({message: 'Bearer token is required'});
  }

  revokeToken(token);
  return response.json({message: 'Admin logout successful. Remove the token from the client.'});
};

const saveAdminDeviceToken = async (request, response) => {
  try {
    const deviceToken = getValue(request.body.deviceToken || request.body.token);

    if (!deviceToken) {
      return response.status(400).json({message: 'Device token is required'});
    }

    const adminUser = await Admin.findOneAndUpdate(
      {_id: request.admin.adminId},
      {deviceToken},
      {new: true},
    ).select('deviceToken email');

    if (!adminUser) {
      return response.status(404).json({message: 'Admin not found'});
    }

    return response.json({message: 'Admin device token registered', deviceToken: adminUser.deviceToken});
  } catch (error) {
    return response.status(500).json({message: 'Unable to save admin device token'});
  }
};

const getAdminNotifications = async (request, response) => {
  try {
    const adminRecord = await Admin.findById(request.admin.adminId).select('notifications');
    if (!adminRecord) {
      return response.status(404).json({message: 'Admin not found'});
    }

    const notifications = (adminRecord.notifications || [])
      .slice()
      .sort((first, second) => new Date(second.createdAt || second.date || 0) - new Date(first.createdAt || first.date || 0));

    const avatarBaseUrl = process.env.PUBLIC_API_URL || 'http://192.168.0.102:5000';
    const enrichedNotifications = await Promise.all(notifications.map(async notification => {
      if (notification.avatarUrl || notification.targetType !== 'leave' || !notification.referenceId) {
        return notification;
      }

      const leave = await Leave.findById(notification.referenceId).select('employeeId');
      const employee = leave
        ? await Employee.findOne({employeeId: leave.employeeId}).select('avatar')
        : null;
      const avatarPath = employee?.avatar?.path || '';
      return avatarPath
        ? {...notification.toObject(), avatarUrl: `${avatarBaseUrl}${avatarPath}`}
        : notification;
    }));

    return response.json({notifications: enrichedNotifications});
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch admin notifications'});
  }
};

const sendAdminResetCode = async (request, response) => {
  try {
    const email = String(request.body.email || '').trim().toLowerCase();
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

    if (!email) {
      return response.status(400).json({message: 'Admin email is required'});
    }
    if (!adminEmail || email !== adminEmail) {
      return response.status(401).json({message: 'This is not the admin email. Please enter the admin email.'});
    }

    const admin = await Admin.findOne({email}).select('+resetCode +resetCodeExpiresAt');
    if (!admin) {
      return response.status(404).json({message: 'Admin account was not found'});
    }

    const mailUser = process.env.SMTP_USER || process.env.ADMIN_EMAIL;
    const mailPassword = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.ADMIN_PASSWORD || '').replace(/\s+/g, '');
    if (!mailUser || !mailPassword) {
      return response.status(503).json({message: 'Email service is not configured'});
    }

    const resetCode = String(crypto.randomInt(100000, 1000000));
    await getMailTransporter().sendMail({
      from: process.env.SMTP_FROM || mailUser,
      to: email,
      subject: 'Your admin password reset code',
      text: `Your admin password reset code is ${resetCode}. It expires in 1 minute.`,
    });

    admin.resetCode = resetCode;
    admin.resetCodeExpiresAt = new Date(Date.now() + 60 * 1000);
    await admin.save();
    return response.json({message: 'OTP sent to the admin email'});
  } catch (error) {
    console.error('Admin reset code email error:', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
      message: error.message,
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpUserConfigured: Boolean(process.env.SMTP_USER || process.env.ADMIN_EMAIL),
      smtpPasswordConfigured: Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.ADMIN_PASSWORD),
    });
    return response.status(503).json({message: 'Email service is unavailable. Please check the server SMTP configuration.'});
  }
};

const verifyAdminResetCode = async (request, response) => {
  try {
    const email = String(request.body.email || '').trim().toLowerCase();
    const resetCode = String(request.body.resetCode || '').trim();
    const admin = await Admin.findOne({email}).select('+resetCode +resetCodeExpiresAt');

    if (!admin || !admin.resetCode || !admin.resetCodeExpiresAt || admin.resetCodeExpiresAt < new Date()) {
      return response.status(400).json({message: 'OTP has expired. Request a new OTP.'});
    }
    if (!resetCode || admin.resetCode !== resetCode) {
      return response.status(400).json({message: 'Invalid OTP'});
    }

    return response.json({message: 'OTP verified successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to verify OTP'});
  }
};

const resetAdminPassword = async (request, response) => {
  try {
    const email = String(request.body.email || '').trim().toLowerCase();
    const resetCode = String(request.body.resetCode || '').trim();
    const newPassword = String(request.body.newPassword || '');
    const admin = await Admin.findOne({email}).select('+password +resetCode +resetCodeExpiresAt');

    if (!admin || !resetCode || !newPassword) {
      return response.status(400).json({message: 'Email, OTP, and new password are required'});
    }
    if (!admin.resetCode || !admin.resetCodeExpiresAt || admin.resetCodeExpiresAt < new Date()) {
      return response.status(400).json({message: 'OTP has expired. Request a new OTP.'});
    }
    if (admin.resetCode !== resetCode) {
      return response.status(400).json({message: 'Invalid OTP'});
    }

    admin.password = await bcrypt.hash(newPassword, 12);
    admin.resetCode = '';
    admin.resetCodeExpiresAt = null;
    await admin.save();
    return response.json({message: 'Admin password changed successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to reset admin password'});
  }
};

module.exports = {
  adminLogin,
  adminLogout,
  sendAdminResetCode,
  verifyAdminResetCode,
  resetAdminPassword,
  getAdminNotifications,
  saveAdminDeviceToken,
  sendPushNotificationToAdmin,
};
