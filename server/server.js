const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Ensure uploads/resources folder exists on server startup
const uploadDir = path.join(__dirname, 'uploads', 'resources');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const courseReviewUploadDir = path.join(__dirname, 'uploads', 'coursereviews');
if (!fs.existsSync(courseReviewUploadDir)) {
  fs.mkdirSync(courseReviewUploadDir, { recursive: true });
}

const avatarUploadDir = path.join(__dirname, 'uploads', 'avatars');
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

// Middleware
app.use(cors({
     origin: process.env.FRONTEND_URL || 'http://localhost:5173',
     exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());

// Serve uploads folder statically for direct file access if needed
   // Only expose resources' own public files statically, not the whole uploads/ tree
   app.use('/uploads/resources', express.static(path.join(__dirname, 'uploads', 'resources')));
app.use('/uploads/avatars', express.static(avatarUploadDir));

// Routes
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const courseReviewsRoutes = require('./routes/courseReviews');
const performanceRoutes = require('./routes/performance');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const profileRoutes = require('./routes/profile');
const topContributorsRoutes = require('./routes/topContributors');

app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/course-reviews', courseReviewsRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/top-contributors' , topContributorsRoutes)
app.use('/api/notifications', notificationRoutes);
app.use('/api/profile', profileRoutes);



// Root route
app.get('/', (req, res) => {
  res.send('API Running');
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
