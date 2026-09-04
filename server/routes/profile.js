const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { verifyToken, requireActiveUser } = require('../middleware/auth');
const { getProfile, getCompletedTermCount, updateProfile, updateAvatar, getPasswordHash, updatePassword } = require('../models/profile');

const router = express.Router();
const avatarDirectory = path.join(__dirname, '..', 'uploads', 'avatars');
const profileSchema = Joi.object({ name: Joi.string().trim().min(2).max(255).required(), bio: Joi.string().trim().max(1000).allow('').optional() });
const passwordSchema = Joi.object({ current_password: Joi.string().min(6).max(100).required(), new_password: Joi.string().min(8).max(100).required() });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarDirectory),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`)
  }),
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
  limits: { fileSize: 3 * 1024 * 1024 }
});

router.use(verifyToken, requireActiveUser);

router.get('/', async (req, res) => {
  try {
    const [profile, completedTerms] = await Promise.all([getProfile(req.activeUser.user_id), getCompletedTermCount(req.activeUser.user_id)]);
    if (!profile) return res.status(404).json({ message: 'Profile not found.' });
    return res.json({ profile: { ...profile, completed_performance_terms: completedTerms } });
  } catch (err) { console.error('Profile load error:', err); return res.status(500).json({ message: 'Could not load profile.' }); }
});

router.patch('/', async (req, res) => {
  const { error, value } = profileSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  try { return res.json({ user: await updateProfile(req.activeUser.user_id, value) }); }
  catch (err) { console.error('Profile update error:', err); return res.status(500).json({ message: 'Could not update profile.' }); }
});

router.post('/avatar', (req, res, next) => upload.single('avatar')(req, res, (err) => {
  if (err) return res.status(400).json({ message: err.message });
  if (!req.file) return res.status(400).json({ message: 'Choose a JPG, PNG, or WebP image up to 3 MB.' });
  next();
}), async (req, res) => {
  try {
    const current = await getProfile(req.activeUser.user_id);
    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    const user = await updateAvatar(req.activeUser.user_id, avatarPath);
    if (current?.avatar_path?.startsWith('/uploads/avatars/')) await fs.unlink(path.join(avatarDirectory, path.basename(current.avatar_path))).catch(() => {});
    return res.json({ user });
  } catch (err) { await fs.unlink(req.file.path).catch(() => {}); console.error('Avatar update error:', err); return res.status(500).json({ message: 'Could not update profile picture.' }); }
});

router.patch('/password', async (req, res) => {
  const { error, value } = passwordSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  try {
    const currentHash = await getPasswordHash(req.activeUser.user_id);
    if (!currentHash || !(await bcrypt.compare(value.current_password, currentHash))) return res.status(400).json({ message: 'Your current password is incorrect.' });
    if (await bcrypt.compare(value.new_password, currentHash)) return res.status(400).json({ message: 'Choose a new password that is different from the current password.' });
    await updatePassword(req.activeUser.user_id, await bcrypt.hash(value.new_password, 10));
    return res.json({ message: 'Password changed successfully.' });
  } catch (err) { console.error('Password update error:', err); return res.status(500).json({ message: 'Could not change password.' }); }
});

module.exports = router;
