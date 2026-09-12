const express = require('express');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {getHolidays, createHoliday, deleteHoliday} = require('../controllers/holidayController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', getHolidays);
router.post('/', createHoliday);
router.delete('/:id', deleteHoliday);

module.exports = router;