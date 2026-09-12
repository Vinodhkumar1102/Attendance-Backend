const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const PDFDocument = require('pdfkit');
const Admin = require('../models/Admin');
const {sendPushNotificationToAdmin} = require('./adminController');

const LATE_MINUTES = 9 * 60 + 45;
const LEAVE_MINUTES = 11 * 60;
const DAILY_WORKING_MINUTES = 9 * 60;
const AUTO_CHECKOUT_MINUTES = 19 * 60;

const saveAdminAttendanceNotification = async (employeeId, action, record, eventDate) => {
  try {
    const employee = await Employee.findOne({employeeId}).select('fullName avatar');
    const event = new Date(eventDate);
    const eventDateText = event.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});
    const eventTimeText = event.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
    const avatarPath = employee?.avatar?.path || '';
    const avatarBaseUrl = process.env.PUBLIC_API_URL || 'http://192.168.0.102:5000';
    const notification = {
      id: `admin-attendance-${employeeId}-${action}-${Date.now()}`,
      type: 'Attendance',
      title: `${action} notification`,
      message: `${employee?.fullName || employeeId} ${action.toLowerCase()} at ${eventTimeText} on ${eventDateText}.`,
      status: record?.status || 'Info',
      targetType: 'attendance',
      referenceId: String(record?._id || record?.date || ''),
      avatarUrl: avatarPath ? `${avatarBaseUrl}${avatarPath}` : '',
      eventDate: eventDateText,
      eventTime: eventTimeText,
      date: event.toISOString(),
      createdAt: event.toISOString(),
      unread: true,
    };
    const adminEmail = String(process.env.ADMIN_EMAIL || 'datavibes80@gmail.com').trim().toLowerCase();
    const admin = await Admin.findOne({email: adminEmail}).select('notifications');
    if (admin) {
      admin.notifications = [notification, ...(admin.notifications || [])].slice(0, 50);
      await admin.save();
    }
    await sendPushNotificationToAdmin(adminEmail, notification);
  } catch (error) {
    console.error('Admin attendance notification failed', {employeeId, action, message: error.message});
  }
};

const getDateKey = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTimeInMinutes = date => date.getHours() * 60 + date.getMinutes();

const getReportStatus = record => {
  if (['Leave', 'Work From Home', 'Half Day'].includes(record.status) || !record.checkIn) {
    return record.status || 'Unknown';
  }

  return getTimeInMinutes(new Date(record.checkIn)) >= LATE_MINUTES ? 'Late' : 'Present';
};

const getAdminMonthlyReportStatus = record => {
  if (['Leave', 'Work From Home', 'Half Day', 'Absent', 'Holiday'].includes(record.status)) {
    return record.status;
  }

  if (record.checkOut && getTimeInMinutes(new Date(record.checkOut)) < 14 * 60) {
    return 'Half Day';
  }

  return 'Present';
};

const getAdminDailyAttendanceStatus = record => {
  if (['Leave', 'Work From Home', 'Holiday'].includes(record.status)) {
    return record.status;
  }

  if (record.checkIn || record.checkOut) {
    if (record.status === 'Absent' && record.checkIn) {
      return getTimeInMinutes(new Date(record.checkIn)) >= LATE_MINUTES ? 'Late' : 'Present';
    }

    if (record.checkOut) {
      return getTimeInMinutes(new Date(record.checkOut)) < 14 * 60 ? 'Half Day' : 'Present';
    }

    return record.status === 'Late' ? 'Late' : 'Present';
  }

  if (record.status === 'Absent') {
    return 'Absent';
  }

  return record.status === 'Late' ? 'Late' : 'Present';
};

const getStoredDateKey = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatWorkingMinutes = minutes => ({
  hours: Math.floor(minutes / 60),
  minutes: minutes % 60,
});

const resolveMissingAttendanceStatus = (date, isHoliday) => {
  if (date.getDay() === 0 || isHoliday) {
    return 'Holiday';
  }

  return 'Absent';
};

const sanitizeAttendanceRecord = record => {
  const isNonWorkingDay = ['Leave', 'Work From Home'].includes(record.status);
  return {
    ...record.toObject(),
    checkIn: isNonWorkingDay ? null : record.checkIn || null,
    checkOut: isNonWorkingDay ? null : record.checkOut || null,
    workingMinutes: isNonWorkingDay ? 0 : record.workingMinutes || 0,
  };
};

const isHolidayDate = async date => {
  if (date.getDay() === 0) {
    return true;
  }

  const holidays = await Holiday.find().select('date');
  const dateKey = getDateKey(date);
  return holidays.some(holiday => getDateKey(new Date(holiday.date)) === dateKey);
};

const getApprovedLeaveForDate = async (employeeId, date) => {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return Leave.findOne({
    employeeId,
    status: 'Approved',
    startDate: {$lte: dayEnd},
    endDate: {$gte: dayStart},
  }).select('leaveType');
};

const syncApprovedLeaveAttendance = async (employeeId, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const approvedLeaves = await Leave.find({
    employeeId,
    status: 'Approved',
    startDate: {$lte: monthEnd},
    endDate: {$gte: monthStart},
  }).select('startDate endDate leaveType');
  const statusByDate = new Map();

  approvedLeaves.forEach(leave => {
    const startDate = new Date(Math.max(new Date(leave.startDate).getTime(), monthStart.getTime()));
    const endDate = new Date(Math.min(new Date(leave.endDate).getTime(), monthEnd.getTime()));
    for (const date = startDate; date <= endDate; date.setUTCDate(date.getUTCDate() + 1)) {
      const dateKey = date.toISOString().slice(0, 10);
      const status = leave.leaveType === 'Work From Home' ? 'Work From Home' : 'Leave';
      if (status === 'Work From Home' || !statusByDate.has(dateKey)) {
        statusByDate.set(dateKey, status);
      }
    }
  });

  if (!statusByDate.size) {
    return;
  }

  const dateEntries = [...statusByDate].map(([date, status]) => ({date, status}));
  const dates = dateEntries.map(entry => entry.date);
  const existingRecords = await Attendance.find({employeeId, date: {$in: dates}}).select('date checkIn status');
  const recordsByDate = new Map(existingRecords.map(record => [record.date, record]));
  const operations = dateEntries
    .filter(entry => {
      const existingRecord = recordsByDate.get(entry.date);
      return !existingRecord || existingRecord.status === 'Holiday' || !existingRecord.checkIn;
    })
    .map(entry => ({
      updateOne: {
        filter: {employeeId, date: entry.date},
        update: {
          $set: {status: entry.status, checkIn: null, checkOut: null, workingMinutes: 0},
          $setOnInsert: {employeeId, date: entry.date},
        },
        upsert: true,
      },
    }));

  if (operations.length) {
    await Attendance.bulkWrite(operations);
  }
};

const syncMissingAttendance = async (employeeId, year, month, holidayDates, joiningDate) => {
  const today = new Date();
  const currentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const monthEnd = new Date(year, month, 0).getDate();
  const lastDay = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth() + 1)
    ? monthEnd
    : currentMonth && getTimeInMinutes(today) >= LEAVE_MINUTES ? today.getDate() : currentMonth ? today.getDate() - 1 : 0;
  const joiningDateKey = joiningDate ? getDateKey(new Date(joiningDate)) : '';
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  const existingRecords = await Attendance.find({employeeId, date: {$regex: `^${monthPrefix}`}}).select('date status');
  const existingDates = new Map(existingRecords.map(record => [record.date, record.status]));
  const operations = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateKey = `${monthPrefix}${String(day).padStart(2, '0')}`;
    const isHoliday = date.getDay() === 0 || holidayDates.has(dateKey);
    const existingStatus = existingDates.get(dateKey);

    if ((joiningDateKey && dateKey < joiningDateKey)) {
      continue;
    }

    if (existingStatus) {
      if (isHoliday && existingStatus !== 'Holiday') {
        operations.push({
          updateOne: {
            filter: {employeeId, date: dateKey},
            update: {$set: {status: 'Holiday', checkIn: null, checkOut: null, workingMinutes: 0}},
          },
        });
      }

      if (!isHoliday && existingStatus === 'Holiday') {
        operations.push({
          deleteOne: {
            filter: {employeeId, date: dateKey},
          },
        });
      }

      continue;
    }

    if (isHoliday) {
      operations.push({
        updateOne: {
          filter: {employeeId, date: dateKey},
          update: {$setOnInsert: {employeeId, date: dateKey, status: 'Holiday'}},
          upsert: true,
        },
      });
      continue;
    }

    operations.push({
      updateOne: {
        filter: {employeeId, date: dateKey},
        update: {$setOnInsert: {employeeId, date: dateKey, status: 'Absent'}},
        upsert: true,
      },
    });
  }

  if (operations.length) {
    await Attendance.bulkWrite(operations);
  }
};

const ensureTodayRecord = async employeeId => {
  const now = new Date();
  const date = getDateKey(now);
  let record = await Attendance.findOne({employeeId, date});

  if (await isHolidayDate(now)) {
    return record || {employeeId, date, status: 'Holiday'};
  }

  if (record && record.status === 'Absent' && !record.checkIn && !record.checkOut && getTimeInMinutes(now) < LEAVE_MINUTES) {
    await Attendance.deleteOne({_id: record._id});
    record = null;
  }

  if (record?.checkIn && !record.checkOut && getTimeInMinutes(now) >= AUTO_CHECKOUT_MINUTES) {
    const automaticCheckOut = new Date(now);
    automaticCheckOut.setHours(18, 30, 0, 0);
    record.checkOut = automaticCheckOut;
    record.workingMinutes = Math.max(0, Math.round((automaticCheckOut - record.checkIn) / 60000));
    await record.save();
  }

  if (getTimeInMinutes(now) >= LEAVE_MINUTES && !record?.checkIn) {
    if (!record) {
      record = await Attendance.create({employeeId, date, status: 'Absent'});
    } else if (!['Leave', 'Work From Home', 'Holiday'].includes(record.status)) {
      record.status = 'Absent';
      record.checkIn = null;
      record.checkOut = null;
      record.workingMinutes = 0;
      await record.save();
    }
  }

  return record;
};

const autoCheckoutPastRecords = async employeeId => {
  const todayKey = getDateKey(new Date());
  const openRecords = await Attendance.find({
    employeeId,
    date: {$lt: todayKey},
    checkIn: {$ne: null},
    checkOut: null,
    status: {$nin: ['Leave', 'Work From Home', 'Holiday']},
  });

  await Promise.all(openRecords.map(async record => {
    const [year, month, day] = record.date.split('-').map(Number);
    const automaticCheckOut = new Date(year, month - 1, day, 18, 30, 0, 0);
    record.checkOut = automaticCheckOut;
    record.workingMinutes = Math.max(0, Math.round((automaticCheckOut - record.checkIn) / 60000));
    await record.save();
  }));
};

const autoCheckoutMonthRecords = async (employeeId, year, month) => {
  const today = new Date();
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  const todayKey = getDateKey(today);
  const records = await Attendance.find({
    employeeId,
    date: {$regex: `^${monthPrefix}`, $lt: todayKey},
    checkIn: {$ne: null},
    checkOut: null,
    status: {$nin: ['Leave', 'Work From Home', 'Holiday']},
  });

  await Promise.all(records.map(async record => {
    const [recordYear, recordMonth, recordDay] = record.date.split('-').map(Number);
    const automaticCheckOut = new Date(recordYear, recordMonth - 1, recordDay, 18, 30, 0, 0);
    record.checkOut = automaticCheckOut;
    record.workingMinutes = Math.max(0, Math.round((automaticCheckOut - record.checkIn) / 60000));
    await record.save();
  }));
};

const getTodayAttendance = async (request, response) => {
  try {
    const now = new Date();
    if (await isHolidayDate(now)) {
      return response.json({
        date: getDateKey(now),
        record: {employeeId: request.employee.employeeId, date: getDateKey(now), status: 'Holiday'},
      });
    }

    const approvedLeave = await getApprovedLeaveForDate(request.employee.employeeId, now);
    if (approvedLeave) {
      const status = approvedLeave.leaveType === 'Work From Home' ? 'Work From Home' : 'Leave';
      return response.json({
        date: getDateKey(now),
        record: {employeeId: request.employee.employeeId, date: getDateKey(now), status},
      });
    }

    const record = await ensureTodayRecord(request.employee.employeeId);
    return response.json({
      date: getDateKey(new Date()),
      record,
      checkInOpen: getTimeInMinutes(new Date()) < LEAVE_MINUTES,
      thresholds: {lateAfter: '09:45', leaveAfter: '11:00'},
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch today attendance'});
  }
};

const checkIn = async (request, response) => {
  try {
    const now = new Date();
    const date = getDateKey(now);
    const currentMinutes = getTimeInMinutes(now);
    let record = await Attendance.findOne({employeeId: request.employee.employeeId, date});

    if (await isHolidayDate(now)) {
      return response.status(400).json({message: 'Today is a holiday. Check-in is not available', record: {date, status: 'Holiday'}});
    }

    const approvedLeave = await getApprovedLeaveForDate(request.employee.employeeId, now);
    if (approvedLeave) {
      const status = approvedLeave.leaveType === 'Work From Home' ? 'Work From Home' : 'Leave';
      return response.status(400).json({message: `${status} is approved for today. Check-in is not available`, record: {date, status}});
    }

    if (record?.checkIn) {
      return response.status(409).json({message: 'You have already checked in today', record});
    }

    if (currentMinutes >= LEAVE_MINUTES) {
      if (!record) {
        record = await Attendance.create({employeeId: request.employee.employeeId, date, status: 'Absent'});
      } else if (!record.checkIn && !['Leave', 'Work From Home', 'Holiday'].includes(record.status)) {
        record.status = 'Absent';
        record.checkOut = null;
        record.workingMinutes = 0;
        await record.save();
      }
      return response.status(400).json({message: 'Check-in is closed. You are marked Absent after 11:00 AM', record});
    }

    const status = currentMinutes >= LATE_MINUTES ? 'Late' : 'Present';
    record = record || new Attendance({employeeId: request.employee.employeeId, date, status});
    record.checkIn = now;
    record.status = status;
    await record.save();
    await saveAdminAttendanceNotification(request.employee.employeeId, 'Check-in', record, now);

    return response.status(201).json({message: status === 'Late' ? 'Check-in recorded as Late' : 'Check-in recorded', record});
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({message: 'Attendance already exists for today'});
    }
    return response.status(500).json({message: 'Unable to record check-in'});
  }
};

const checkOut = async (request, response) => {
  try {
    const now = new Date();
    const date = getDateKey(now);
    if (await isHolidayDate(now)) {
      return response.status(400).json({message: 'Today is a holiday. Check-out is not available'});
    }
    const approvedLeave = await getApprovedLeaveForDate(request.employee.employeeId, now);
    if (approvedLeave) {
      const status = approvedLeave.leaveType === 'Work From Home' ? 'Work From Home' : 'Leave';
      return response.status(400).json({message: `${status} is approved for today. Check-out is not available`});
    }
    const record = await ensureTodayRecord(request.employee.employeeId);

    if (!record?.checkIn) {
      return response.status(400).json({message: 'Check in before checking out'});
    }
    if (record.checkOut) {
      return response.status(409).json({message: 'You have already checked out today', record});
    }

    const checkOutTime = new Date();
    const workingMinutes = Math.max(0, Math.round((checkOutTime - record.checkIn) / 60000));
    record.checkOut = checkOutTime;
    record.workingMinutes = workingMinutes;
    record.status = getTimeInMinutes(checkOutTime) < 14 * 60 ? 'Half Day' : 'Present';
    await record.save();
    await saveAdminAttendanceNotification(request.employee.employeeId, 'Check-out', record, checkOutTime);

    return response.json({
      message: 'Check-out recorded',
      record,
      workingTime: formatWorkingMinutes(workingMinutes),
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to record check-out'});
  }
};

const getAttendanceHistory = async (request, response) => {
  try {
    const year = Number(request.query.year) || new Date().getFullYear();
    const month = Number(request.query.month) || new Date().getMonth() + 1;
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
    const employee = await Employee.findOne({employeeId: request.employee.employeeId}).select('joiningDate');
    await autoCheckoutPastRecords(request.employee.employeeId);
    await autoCheckoutMonthRecords(request.employee.employeeId, year, month);
    await syncApprovedLeaveAttendance(request.employee.employeeId, year, month);
    const [records, holidays] = await Promise.all([
      Attendance.find({
        employeeId: request.employee.employeeId,
        date: {$regex: `^${monthPrefix}`},
      }).sort({date: 1}),
      Holiday.find().select('date'),
    ]);
    const holidayDates = new Set(
      holidays
        .map(holiday => getStoredDateKey(holiday.date))
        .filter(dateKey => dateKey.startsWith(monthPrefix)),
    );
    await syncMissingAttendance(request.employee.employeeId, year, month, holidayDates, employee?.joiningDate);
    const refreshedRecords = await Attendance.find({
      employeeId: request.employee.employeeId,
      date: {$regex: `^${monthPrefix}`},
    }).sort({date: 1});

    return response.json(refreshedRecords.map(sanitizeAttendanceRecord));
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch attendance history'});
  }
};

const getMonthlySummary = async (request, response) => {
  try {
    const year = Number(request.query.year) || new Date().getFullYear();
    const month = Number(request.query.month) || new Date().getMonth() + 1;
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
    const employee = await Employee.findOne({employeeId: request.employee.employeeId}).select('joiningDate');
    await syncApprovedLeaveAttendance(request.employee.employeeId, year, month);
    const [records, holidays] = await Promise.all([
      Attendance.find({
        employeeId: request.employee.employeeId,
        date: {$regex: `^${monthPrefix}`},
      }).sort({date: 1}),
      Holiday.find().select('date'),
    ]);
    const holidayDates = new Set(
      holidays
        .map(holiday => getStoredDateKey(holiday.date))
        .filter(dateKey => dateKey.startsWith(monthPrefix)),
    );
    await syncMissingAttendance(request.employee.employeeId, year, month, holidayDates, employee?.joiningDate);
    const refreshedRecords = await Attendance.find({
      employeeId: request.employee.employeeId,
      date: {$regex: `^${monthPrefix}`},
    }).sort({date: 1});
    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays = 0;
    let holidayCount = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month - 1, day);
      if (date.getDay() === 0 || holidayDates.has(`${monthPrefix}${String(day).padStart(2, '0')}`)) {
        holidayCount += 1;
      } else {
        workingDays += 1;
      }
    }

    const completedRecords = refreshedRecords.filter(record => (
      Boolean(record.checkOut)
      || ['Leave', 'Work From Home', 'Absent', 'Holiday'].includes(record.status)
    )).filter(record => record.date <= getDateKey(new Date()));
    const summaryStatuses = completedRecords.map(getAdminMonthlyReportStatus);
    const presentDays = summaryStatuses.filter(status => ['Present', 'Work From Home'].includes(status)).length;
    const leaveDays = summaryStatuses.filter(status => status === 'Leave').length;
    const halfDayDays = summaryStatuses.filter(status => status === 'Half Day').length;
    const lateDays = summaryStatuses.filter(status => status === 'Late').length;
    const absentDays = summaryStatuses.filter(status => status === 'Absent').length;
    const totalWorkingMinutes = refreshedRecords.reduce((total, record) => total + (record.workingMinutes || 0), 0);

    return response.json({
      year,
      month,
      workingDays,
      presentDays,
      absentDays,
      lopDays: absentDays,
      leaveDays,
      halfDayDays,
      lateDays,
      holidayCount,
      totalDays: workingDays + holidayCount,
      totalWorkingMinutes,
      monthlyExpectedMinutes: workingDays * DAILY_WORKING_MINUTES,
      attendancePercentage: workingDays ? Math.round((presentDays / workingDays) * 100) : 0,
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch monthly attendance summary'});
  }
};

const downloadMonthlySummaryPdf = async (request, response) => {
  try {
    const year = Number(request.query.year) || new Date().getFullYear();
    const month = Number(request.query.month) || new Date().getMonth() + 1;
    const employeeId = request.employee.employeeId;
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
    const employee = await Employee.findOne({employeeId}).select('fullName employeeId departmentName');

    if (!employee) {
      return response.status(404).json({message: 'Employee not found'});
    }

    await syncApprovedLeaveAttendance(employeeId, year, month);
    let [records, holidays] = await Promise.all([
      Attendance.find({employeeId, date: {$regex: `^${monthPrefix}`}}).sort({date: 1}),
      Holiday.find().select('date'),
    ]);
    const holidayDates = new Set(holidays.map(holiday => getDateKey(new Date(holiday.date))));
    const staleHolidayRecords = records.filter(record => (
      record.status === 'Holiday'
      && new Date(`${record.date}T00:00:00`).getDay() !== 0
      && !holidayDates.has(record.date)
    ));

    if (staleHolidayRecords.length) {
      await Attendance.bulkWrite(staleHolidayRecords.map(record => ({
        updateOne: {
          filter: {employeeId, date: record.date, status: 'Holiday'},
          update: {$set: {status: 'Absent', checkIn: null, checkOut: null, workingMinutes: 0}},
        },
      })));
      records = await Attendance.find({employeeId, date: {$regex: `^${monthPrefix}`}}).sort({date: 1});
    }

    const todayKey = getDateKey(new Date());
    const completedRecords = records.filter(record => {
      if (record.date < todayKey) {
        return true;
      }

      if (record.date !== todayKey) {
        return false;
      }

      return Boolean(record.checkOut)
        || ['Leave', 'Work From Home', 'Half Day', 'Holiday', 'Absent'].includes(record.status);
    });
    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays = 0;
    let holidayCount = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month - 1, day);
      if (date.getDay() === 0 || holidayDates.has(getDateKey(date))) {
        holidayCount += 1;
      } else {
        workingDays += 1;
      }
    }

    const statuses = completedRecords.map(getAdminMonthlyReportStatus);
    const summary = {
      workingDays,
      presentDays: statuses.filter(status => ['Present', 'Work From Home'].includes(status)).length,
      leaveDays: statuses.filter(status => status === 'Leave').length,
      absentDays: statuses.filter(status => status === 'Absent').length,
      halfDayDays: statuses.filter(status => status === 'Half Day').length,
      holidayCount,
    };

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="monthly-summary-${year}-${String(month).padStart(2, '0')}.pdf"`);

    const document = new PDFDocument({margin: 42});
    document.pipe(response);
    document.fontSize(20).fillColor('#10224D').text('Monthly Summary');
    document.moveDown(0.4).fontSize(11).fillColor('#66758F').text(`${employee.fullName}  |  ${employee.employeeId}  |  ${employee.departmentName}`);
    document.moveDown(0.3).text(new Date(year, month - 1, 1).toLocaleDateString('en-US', {month: 'long', year: 'numeric'}));
    document.moveDown();
    document.fontSize(11).fillColor('#10224D').text('Monthly Attendance Summary');
    document.moveDown(0.3).fontSize(10).text(`Working Days: ${summary.workingDays}`);
    document.text(`Present Days: ${summary.presentDays}`);
    document.text(`Leave Days: ${summary.leaveDays}`);
    document.text(`Absent Days: ${summary.absentDays}`);
    document.text(`Holidays: ${summary.holidayCount}`);
    document.text(`Half Days: ${summary.halfDayDays}`);
    document.moveDown();
    document.fontSize(10).fillColor('#10224D').text('Date        Check In          Check Out         Status              Working Hours');
    document.moveDown(0.4);

    completedRecords.forEach((record, index) => {
      const status = statuses[index];
      const checkIn = record.checkIn ? new Date(record.checkIn).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}) : '--';
      const checkOut = record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}) : '--';
      const workingHours = `${Math.floor((record.workingMinutes || 0) / 60)}h ${String((record.workingMinutes || 0) % 60).padStart(2, '0')}m`;
      document.fillColor('#334155').text(`${record.date}   ${checkIn.padEnd(16)}${checkOut.padEnd(18)}${status.padEnd(20)}${workingHours}`);
      if ((index + 1) % 30 === 0) {
        document.addPage();
      }
    });

    document.end();
  } catch (error) {
    return response.status(500).json({message: 'Unable to generate monthly summary PDF'});
  }
};

const getAdminTodaySummary = async (request, response) => {
  try {
    const date = request.query.date || getDateKey(new Date());
    const employees = await Employee.find().select('employeeId');
    const selectedDate = new Date(`${date}T00:00:00`);
    if (date <= getDateKey(new Date())) {
      await Promise.all(employees.map(employee => (
        syncApprovedLeaveAttendance(employee.employeeId, selectedDate.getFullYear(), selectedDate.getMonth() + 1)
      )));
    }
    const records = await Attendance.find({date}).select('status checkIn checkOut');
    const employeeCount = employees.length;

    const present = records.filter(record => (
      record.status === 'Work From Home'
      || (record.checkIn && record.status !== 'Absent' && getAdminDailyAttendanceStatus(record) === 'Present')
      || (record.checkOut && getAdminMonthlyReportStatus(record) === 'Present')
    )).length;
    const halfDay = records.filter(record => (
      record.status === 'Half Day'
      || (record.checkIn && getAdminDailyAttendanceStatus(record) === 'Half Day')
      || (record.checkOut && getTimeInMinutes(new Date(record.checkOut)) < 14 * 60)
    )).length;
    const late = records.filter(record => (
      record.checkIn
      && getTimeInMinutes(new Date(record.checkIn)) >= LATE_MINUTES
    )).length;
    const leave = records.filter(record => record.status === 'Leave').length;
    const absent = records.filter(record => (
      record.status === 'Absent' && !record.checkIn && !record.checkOut
    )).length;
    const leaveCount = leave;

    return response.json({date, employeeCount, present, halfDay, late, absent, leave: leaveCount});
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch admin attendance summary'});
  }
};

const getAdminAttendance = async (request, response) => {
  try {
    const date = request.query.date || getDateKey(new Date());
    const todayKey = getDateKey(new Date());
    if (date > todayKey) {
      return response.json({date, records: [], checkedInRecords: [], absentEmployees: []});
    }
    const records = await Attendance.find({date})
      .select('employeeId checkIn checkOut workingMinutes status')
      .sort({createdAt: 1});
    const employees = await Employee.find()
      .select('employeeId fullName departmentName avatar');
    const selectedDate = new Date(`${date}T00:00:00`);
    await Promise.all(employees.map(employee => (
      syncApprovedLeaveAttendance(employee.employeeId, selectedDate.getFullYear(), selectedDate.getMonth() + 1)
    )));
    const refreshedRecords = await Attendance.find({date})
      .select('employeeId checkIn checkOut workingMinutes status')
      .sort({createdAt: 1});
    const recordsByEmployeeId = new Map(refreshedRecords.map(record => [record.employeeId, record]));
    const result = employees.map(employee => {
      const record = recordsByEmployeeId.get(employee.employeeId);
      return {
        id: employee.employeeId,
        name: employee.fullName || employee.employeeId,
        department: employee.departmentName || '',
        avatar: employee.avatar || null,
        inTime: record?.checkIn || null,
        outTime: record?.checkOut || null,
        workingMinutes: record?.workingMinutes || 0,
        status: record ? getAdminDailyAttendanceStatus(record) : 'Absent',
      };
    });
    const checkedInRecords = result.filter(record => (
      ['Present', 'Late', 'Half Day', 'Work From Home'].includes(record.status)
      || Boolean(record.inTime || record.outTime)
    ));
    const absentEmployees = result.filter(record => (
      record.status === 'Absent' && !record.inTime && !record.outTime
    ));

    return response.json({date, records: result, checkedInRecords, absentEmployees});
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch admin attendance'});
  }
};

const getAdminEmployeeAttendance = async (request, response) => {
  try {
    const {employeeId} = request.query;
    const year = Number(request.query.year);
    const month = Number(request.query.month);

    if (!employeeId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return response.status(400).json({message: 'Employee, year, and month are required'});
    }

    const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
    await autoCheckoutPastRecords(employeeId);
    await syncApprovedLeaveAttendance(employeeId, year, month);
    const [records, holidays] = await Promise.all([
      Attendance.find({
        employeeId,
        date: {$regex: `^${monthPrefix}`},
      })
        .select('date checkIn checkOut status workingMinutes')
        .sort({date: 1}),
      Holiday.find().select('date'),
    ]);
    const holidayDates = new Set(holidays.map(holiday => getDateKey(new Date(holiday.date))));
    const employee = await Employee.findOne({employeeId}).select('joiningDate');
    await syncMissingAttendance(employeeId, year, month, holidayDates, employee?.joiningDate);
    const refreshedRecords = await Attendance.find({
      employeeId,
      date: {$regex: `^${monthPrefix}`},
    })
      .select('date checkIn checkOut status workingMinutes')
      .sort({date: 1});
    records.splice(0, records.length, ...refreshedRecords);
    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays = 0;
    let holidayCount = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month - 1, day);
      if (date.getDay() === 0 || holidayDates.has(getDateKey(date))) {
        holidayCount += 1;
      } else {
        workingDays += 1;
      }
    }

    const reportableRecords = records.filter(record => record.date <= getDateKey(new Date()));
    const reportStatuses = reportableRecords.map(getAdminMonthlyReportStatus);
    const presentDays = reportStatuses.filter(status => ['Present', 'Work From Home'].includes(status)).length;
    const leaveDays = reportStatuses.filter(status => status === 'Leave').length;
    const halfDayDays = reportStatuses.filter(status => status === 'Half Day').length;
    const lateDays = reportStatuses.filter(status => status === 'Late').length;
    const absentDays = reportStatuses.filter(status => status === 'Absent').length;
    const lopDays = Math.max(0, workingDays - presentDays - leaveDays - absentDays);

    return response.json({
      employeeId,
      year,
      month,
      workingDays,
      presentDays,
      leaveDays,
      absentDays,
      halfDayDays,
      lateDays,
      lopDays,
      holidayCount,
      holidays: holidays
        .map(holiday => ({date: getStoredDateKey(holiday.date), description: holiday.description}))
        .filter(holiday => holiday.date.startsWith(monthPrefix)),
      records: records.map((record, index) => ({
        date: record.date,
        checkIn: ['Leave', 'Work From Home'].includes(record.status) ? null : record.checkIn || null,
        checkOut: ['Leave', 'Work From Home'].includes(record.status) ? null : record.checkOut || null,
        status: getAdminMonthlyReportStatus(record),
        workingMinutes: ['Leave', 'Work From Home'].includes(record.status) ? 0 : record.workingMinutes || 0,
      })),
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch employee attendance'});
  }
};

module.exports = {
  getTodayAttendance,
  checkIn,
  checkOut,
  getAttendanceHistory,
  getMonthlySummary,
  downloadMonthlySummaryPdf,
  getAdminTodaySummary,
  getAdminAttendance,
  getAdminEmployeeAttendance,
  resolveMissingAttendanceStatus,
  getReportStatus,
  getAdminMonthlyReportStatus,
};
