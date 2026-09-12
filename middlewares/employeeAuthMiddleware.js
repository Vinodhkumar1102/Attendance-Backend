const jwt = require('jsonwebtoken');
const Employee = require('../models/Employee');
const {getTokenFromRequest} = require('./authMiddleware');

const employeeAuthMiddleware = async (request, response, next) => {
  const token = getTokenFromRequest(request);

  if (!token) {
    return response.status(401).json({message: 'Employee authentication token is required'});
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.role !== 'employee' || !payload.employeeId) {
      return response.status(403).json({message: 'Employee access is required'});
    }

    const employee = await Employee.findOne({employeeId: payload.employeeId}).select('_id employeeId fullName');

    if (!employee) {
      return response.status(401).json({message: 'Employee account not found'});
    }

    request.employee = employee;
    return next();
  } catch (error) {
    return response.status(401).json({message: 'Invalid or expired employee token'});
  }
};

module.exports = {employeeAuthMiddleware};
