const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const {authMiddleware} = require('../middlewares/authMiddleware');
const {getUsers, getUserRoles, createUser, updateUser, deleteUser} = require('../controllers/userController');

const router = express.Router();
const userAvatarDirectory = path.join(__dirname, '..', 'uploads', 'users');
fs.mkdirSync(userAvatarDirectory, {recursive: true});
const uploadUserAvatar = multer({
	storage: multer.diskStorage({
		destination: (request, file, callback) => callback(null, userAvatarDirectory),
		filename: (request, file, callback) => callback(
			null,
			`${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
		),
	}),
	limits: {fileSize: 5 * 1024 * 1024},
	fileFilter: (request, file, callback) => callback(
		null,
		['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype),
	),
});
router.use(authMiddleware);
router.get('/roles', getUserRoles);
router.get('/', getUsers);
router.post('/', uploadUserAvatar.single('avatar'), createUser);
router.put('/:userId', uploadUserAvatar.single('avatar'), updateUser);
router.delete('/:userId', deleteUser);

module.exports = router;