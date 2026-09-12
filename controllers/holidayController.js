const Holiday = require('../models/Holiday');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const {sendPushNotificationToEmployee} = require('./employeeController');

const getLocalDateKey = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getHolidays = async (request, response) => {
  try {
    const holidays = await Holiday.find().sort({date: 1});
    return response.json(holidays);
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch holidays'});
  }
};

const createHoliday = async (request, response) => {
  try {
    const description = request.body.description?.trim();
    const date = request.body.date;

    if (!date || !description) {
      return response.status(400).json({message: 'Date and description are required'});
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return response.status(400).json({message: 'Enter a valid holiday date'});
    }

    const holiday = await Holiday.create({date: parsedDate, description});
    const dateKey = getLocalDateKey(parsedDate);
    const employees = await Employee.find().select('employeeId deviceToken notifications fullName avatar');
    const attendanceOperations = employees.map(employee => ({
      updateOne: {
        filter: {employeeId: employee.employeeId, date: dateKey},
        update: {
          $set: {status: 'Holiday', checkIn: null, checkOut: null, workingMinutes: 0},
          $setOnInsert: {employeeId: employee.employeeId, date: dateKey},
        },
        upsert: true,
      },
    }));

    if (attendanceOperations.length) {
      await Attendance.bulkWrite(attendanceOperations);
    }

    const holidayNotification = {
      id: `holiday-${holiday._id}-${dateKey}`,
      type: 'Holiday',
      status: 'Holiday',
      title: 'New Holiday',
      message: `${description} is scheduled on ${dateKey}.`,
      date: dateKey,
      holidayDate: dateKey,
      createdAt: new Date().toISOString(),
      unread: true,
    };

    for (const employee of employees) {
      const notifications = Array.isArray(employee.notifications) ? employee.notifications : [];
      employee.notifications = [holidayNotification, ...notifications].slice(0, 50);
      await employee.save();
      await sendPushNotificationToEmployee(employee.employeeId, holidayNotification);
    }

    return response.status(201).json(holiday);
  } catch (error) {
    return response.status(500).json({message: 'Unable to create holiday'});
  }
};

const deleteHoliday = async (request, response) => {
  try {
    const {id} = request.params;

    if (!id) {
      return response.status(400).json({message: 'Holiday ID is required'});
    }

    const holiday = await Holiday.findByIdAndDelete(id);

    if (!holiday) {
      return response.status(404).json({message: 'Holiday not found'});
    }

    const dateKey = getLocalDateKey(holiday.date);
    const attendanceRecords = await Attendance.find({date: dateKey});

    if (attendanceRecords.length) {
      await Attendance.deleteMany({date: dateKey});
    }

    return response.json({message: 'Holiday deleted and attendance updated', holiday});
  } catch (error) {
    return response.status(500).json({message: 'Unable to delete holiday'});
  }
};

module.exports = {getHolidays, createHoliday, deleteHoliday};