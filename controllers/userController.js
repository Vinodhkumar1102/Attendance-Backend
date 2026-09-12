const bcrypt = require('bcryptjs');
const {User, userRoles} = require('../models/User');

const getUserPayload = body => ({
  fullName: body.fullName?.trim(),
  email: body.email?.trim().toLowerCase(),
  phone: body.phone?.trim() || '',
  role: body.role?.trim() || 'Employee',
  department: body.department?.trim() || '',
  status: body.status === 'Inactive' ? 'Inactive' : 'Active',
});

const getUsers = async (request, response) => {
  try {
    const users = await User.find().select('-password').sort({createdAt: -1});
    return response.json(users);
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch users'});
  }
};

const getUserRoles = (request, response) => response.json(userRoles);

const createUser = async (request, response) => {
  try {
    const payload = getUserPayload(request.body);
    if (!payload.fullName || !payload.email || !request.body.password) {
      return response.status(400).json({message: 'Name, email, and password are required'});
    }
    const user = await User.create({
      ...payload,
      password: await bcrypt.hash(request.body.password, 12),
      ...(request.file ? {avatar: {
        originalName: request.file.originalname,
        fileName: request.file.filename,
        path: `/uploads/users/${request.file.filename}`,
        mimeType: request.file.mimetype,
        size: request.file.size,
      }} : {}),
    });
    user.password = undefined;
    return response.status(201).json(user);
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({message: 'User email already exists'});
    }
    return response.status(500).json({message: 'Unable to create user'});
  }
};

const updateUser = async (request, response) => {
  try {
    const payload = getUserPayload(request.body);
    if (!payload.fullName || !payload.email) {
      return response.status(400).json({message: 'Name and email are required'});
    }
    const user = await User.findById(request.params.userId).select('+password');
    if (!user) {
      return response.status(404).json({message: 'User not found'});
    }
    Object.assign(user, payload);
    if (request.file) {
      user.avatar = {
        originalName: request.file.originalname,
        fileName: request.file.filename,
        path: `/uploads/users/${request.file.filename}`,
        mimeType: request.file.mimetype,
        size: request.file.size,
      };
    }
    if (request.body.password) {
      user.password = await bcrypt.hash(request.body.password, 12);
    }
    await user.save();
    user.password = undefined;
    return response.json(user);
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({message: 'User email already exists'});
    }
    return response.status(500).json({message: 'Unable to update user'});
  }
};

const deleteUser = async (request, response) => {
  try {
    const user = await User.findByIdAndDelete(request.params.userId);
    if (!user) {
      return response.status(404).json({message: 'User not found'});
    }
    return response.json({message: 'User deleted successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to delete user'});
  }
};

module.exports = {getUsers, getUserRoles, createUser, updateUser, deleteUser};