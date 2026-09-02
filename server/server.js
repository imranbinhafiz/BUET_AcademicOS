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

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploads folder statically for direct file access if needed
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const courseReviewsRoutes = require('./routes/courseReviews');
const performanceRoutes = require('./routes/performance');

app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/course-reviews', courseReviewsRoutes);
app.use('/api/performance', performanceRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('API Running');
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
