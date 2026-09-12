const express = require('express');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {employeeAuthMiddleware} = require('../middlewares/employeeAuthMiddleware');
const {getContact, updateContact} = require('../controllers/contactController');

const router = express.Router();

router.get('/employee', employeeAuthMiddleware, getContact);
router.use(authMiddleware);
router.get('/', getContact);
router.put('/', updateContact);

module.exports = router;
