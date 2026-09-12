const express = require('express');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/departmentController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', getDepartments);
router.post('/', createDepartment);
router.put('/:departmentId', updateDepartment);
router.delete('/:departmentId', deleteDepartment);

module.exports = router;
