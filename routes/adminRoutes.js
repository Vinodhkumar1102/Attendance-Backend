const express = require('express');
const {
	adminLogin,
	adminLogout,
	sendAdminResetCode,
	verifyAdminResetCode,
	resetAdminPassword,
	getAdminNotifications,
	saveAdminDeviceToken,
} = require('../controllers/adminController');
const {authMiddleware} = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/login', adminLogin);
router.post('/logout', adminLogout);
router.post('/device-token', authMiddleware, saveAdminDeviceToken);
router.get('/notifications', authMiddleware, getAdminNotifications);
router.post('/forgot-password', sendAdminResetCode);
router.post('/verify-reset-code', verifyAdminResetCode);
router.post('/reset-password', resetAdminPassword);

module.exports = router;
