// routes/profile.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const {
  getUserBasicProfile,
  updateUserBio,
  updateUserAvatar,
  getUserResources,
  getUserReviews
} = require('../models/profile');
const { verifyToken } = require('../middleware/auth');

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', 'avatars'),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${req.user.user_id}-${Date.now()}${extension}`);
    }
  }),
  fileFilter: (req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype));
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

// GET /api/profile/:userId
// Fetches only the top-level user info (name, bio, avatar, email)
router.get('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });

    const profile = await getUserBasicProfile(userId);

    if (!profile) 
      return res.status(404).json({ message: 'User not found.' });
    
    return res.json(profile);
  } 
  catch (err) {
    console.error('Error fetching user profile:', err);
    return res.status(500).json({ message: 'Server error loading profile.' });
  }
});

router.patch('/:userId', verifyToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : null;

    if (isNaN(userId)) 
      return res.status(400).json({ message: 'Invalid user ID' });

    if (req.user.user_id !== userId) 
      return res.status(403).json({ message: 'You can only edit your own bio.' });

    if (bio === null || bio.length > 500) {
      return res.status(400).json({ message: 'Bio must be text up to 500 characters.' });
    }

    const profile = await updateUserBio(userId, bio);
    if (!profile) 
      return res.status(404).json({ message: 'User not found.' });

    return res.json(profile);
  } 
  catch (err) {
    console.error('Error updating user bio:', err);
    return res.status(500).json({ message: 'Server error updating bio.' });
  }
});

router.patch('/:userId/avatar', verifyToken, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Catch Multer's built-in file size error
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Image size too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ message: 'Unknown error occurred during upload.' });
    }
    // If no error, proceed to the main route logic
    next();
  });
}, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) 
      return res.status(400).json({ message: 'Invalid user ID' });
      
    if (req.user.user_id !== userId) 
      return res.status(403).json({ message: 'You can only edit your own avatar.' });
      
    if (!req.file) 
      return res.status(400).json({ message: 'Please choose a valid image.' });

    // NOTE: We completely removed the `req.file.fileSize > limits` check!
    // Multer already guaranteed the file is under 10MB by the time we reach this line.

    const previousProfile = await getUserBasicProfile(userId);
    const profile = await updateUserAvatar(userId, `/uploads/avatars/${req.file.filename}`);
    
    if (!profile) 
      return res.status(404).json({ message: 'User not found.' });

    if (previousProfile?.avatar_path && previousProfile.avatar_path !== profile.avatar_path) {
      const previousFilename = path.basename(previousProfile.avatar_path);
      await fs.unlink(path.join(__dirname, '..', 'uploads', 'avatars', previousFilename)).catch(() => {});
    }

    return res.json(profile);
  } catch (err) {
    console.error('Error updating avatar:', err);
    return res.status(500).json({ message: 'Server error updating avatar.' });
  }
});

// GET /api/profile/:userId/resources
// Handles searching and sorting specifically for this user's uploaded resources
// Query Params: ?search=CSE204&sortBy=votes&order=desc
router.get('/:userId/resources', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { search, sortBy = 'default', order = 'desc' } = req.query;

    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });

    // Same visibility rule as GET /:userId — a banned or nonexistent user's
    // resources shouldn't be reachable just by hitting this sub-route
    // directly, even though this route itself has no separate ban logic.
    const profile = await getUserBasicProfile(userId);
    if (!profile) return res.status(404).json({ message: 'User not found.' });

    const resources = await getUserResources({
      userId,
      search,
      sortBy,
      order
    });

    return res.json(resources);
  } 
  catch (err) {
    console.error('Error fetching user resources:', err);
    return res.status(500).json({ message: 'Server error loading user resources.' });
  }
});

// GET /api/profile/:userId/reviews
// Handles searching and sorting specifically for this user's written reviews
// Query Params: ?search=CSE204&sortBy=usefulness&order=desc
router.get('/:userId/reviews', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { search, sortBy = 'date', order = 'desc' } = req.query;

    if (isNaN(userId)) 
      return res.status(400).json({ message: 'Invalid user ID' });

    const profile = await getUserBasicProfile(userId);

    if (!profile) 
      return res.status(404).json({ message: 'User not found.' });

    const reviews = await getUserReviews({
      userId,
      search,
      sortBy,
      order
    });

    return res.json(reviews);
  } 
  catch (err) {
    console.error('Error fetching user reviews:', err);
    return res.status(500).json({ message: 'Server error loading user reviews.' });
  }
});

module.exports = router;