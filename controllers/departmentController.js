const Counter = require('../models/Counter');
const Department = require('../models/Department');

const createDepartmentId = async () => {
  const counter = await Counter.findOneAndUpdate(
    {name: 'department'},
    {$inc: {value: 1}},
    {new: true, upsert: true, setDefaultsOnInsert: true},
  );

  return `DP${String(counter.value).padStart(3, '0')}`;
};

const getDepartmentPayload = body => ({
  departmentName: body.departmentName?.trim(),
  description: body.description?.trim() || '',
  location: body.location?.trim() || '',
});

const getDepartments = async (request, response) => {
  try {
    const departments = await Department.find().sort({departmentId: 1});
    return response.json(departments);
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch departments'});
  }
};

const createDepartment = async (request, response) => {
  try {
    const payload = getDepartmentPayload(request.body);

    if (!payload.departmentName) {
      return response.status(400).json({message: 'Department name is required'});
    }

    const department = await Department.create({
      departmentId: await createDepartmentId(),
      ...payload,
    });

    return response.status(201).json(department);
  } catch (error) {
    return response.status(500).json({message: 'Unable to create department'});
  }
};

const updateDepartment = async (request, response) => {
  try {
    const payload = getDepartmentPayload(request.body);

    if (!payload.departmentName) {
      return response.status(400).json({message: 'Department name is required'});
    }

    const department = await Department.findOneAndUpdate(
      {departmentId: request.params.departmentId},
      payload,
      {new: true, runValidators: true},
    );

    if (!department) {
      return response.status(404).json({message: 'Department not found'});
    }

    return response.json(department);
  } catch (error) {
    return response.status(500).json({message: 'Unable to update department'});
  }
};

const deleteDepartment = async (request, response) => {
  try {
    const department = await Department.findOneAndDelete({
      departmentId: request.params.departmentId,
    });

    if (!department) {
      return response.status(404).json({message: 'Department not found'});
    }

    return response.json({message: 'Department deleted successfully'});
  } catch (error) {
    return response.status(500).json({message: 'Unable to delete department'});
  }
};

module.exports = {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
