const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Joi = require('joi');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const {
  getDepartments,
  getCourses,
  getCourseOfferings,
  getCourseReviews,
  getReviewById,
  createReview,
  updateReview,
  deleteReview,
  upsertReviewVote,
  getReviewVoteTally,
  createReport
} = require('../models/courseReviews');

// ---------------------------------------------------------------------
// Multer setup (for the optional 'attachment' file on a review)
// ---------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'coursereviews'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB — adjust as needed
  }
});

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

const SORT_OPTIONS = ['rating', 'difficulty', 'name'];
const ORDER_OPTIONS = ['asc', 'desc'];

const reviewSchema = Joi.object({
  course_code: Joi.string().max(20).trim().required(),
  offering_id: Joi.number().integer().positive().optional().allow(null, ''),
  // Remove .integer() from these two lines:
  difficulty: Joi.number().min(1).max(5).required(), 
  prereq_use: Joi.number().min(1).max(5).required(),
  comment: Joi.string().min(3).required()
});

const reviewUpdateSchema = Joi.object({
  // Remove .integer() from these two lines:
  difficulty: Joi.number().min(1).max(5),
  prereq_use: Joi.number().min(1).max(5),
  comment: Joi.string().min(3)
}).min(1);

const reportSchema = Joi.object({
  target_type: Joi.string().valid('coursereview').required(),
  target_id: Joi.number().integer().positive().required(),
  reason: Joi.string().min(3).required()
});

// ==========================================================================
// DEPARTMENTS
// ==========================================================================

// GET /api/departments
// Returns list of all departments (dept_code, dept_name) for the filter dropdown
router.get('/departments', async (req, res) => {
  // TODO: implement
  try{
    const depts = await getDepartments()
    res.json(depts);
  }
  catch(err){
    console.error('Error fetching departments:', err);
    return res.status(500).json({ message: 'Server error while fetching departmnents.' });
  }
});

// ==========================================================================
// COURSES
// ==========================================================================

// GET /api/courses
// Query params: search, dept_code, sortBy (rating | difficulty | name), order (asc | desc)
// Returns list of courses with aggregated avg_difficulty and avg_prereq_use
router.get('/courses', async (req, res) => {
  const { search, dept_code, sortBy, order } = req.query;


  if (sortBy && !SORT_OPTIONS.includes(sortBy)) {
    return res.status(400).json({
      message: `Invalid sortBy. Must be one of: ${SORT_OPTIONS.join(', ')}`
    });
  }
 
  if (order && !ORDER_OPTIONS.includes(order)) {
    return res.status(400).json({
      message: `Invalid order. Must be one of: ${ORDER_OPTIONS.join(', ')}`
    });
  }
  // TODO: implement
  try{
    const courses = await getCourses({search, deptCode: dept_code, sortBy, order});
    return res.status(200).json(courses);
  }
  catch(err){
    console.error('Error fetching courses:', err);
    return res.status(500).json({ message: 'Server error while fetching courses.' });
  }

});

// GET /api/courses/:courseCode/offerings
// Returns list of offerings (offering_id, teacher_name, semester) for a given course,
// used to populate the "Select Teacher" dropdown in the review form
router.get('/courses/:courseCode/offerings', async (req, res) => {
  const { courseCode } = req.params;
  // TODO: implement
  try{
    const offerings = await getCourseOfferings(courseCode);

    return res.json(offerings);
  }
  catch(err){
    console.error('Error fetching courses:', err);
    return res.status(500).json({ message: 'Server error while fetching offerings.' });
  }
});

// GET /api/courses/:courseCode/reviews
// Returns list of reviews for a given course, including vote_tally and current_vote
// (current_vote should be scoped to the requesting user if authenticated)
router.get('/courses/:courseCode/reviews', optionalAuth, async (req, res) => {
  const { courseCode } = req.params;
  // TODO: implement
  try{
    const currentUserId = req.user ? req.user.user_id : null;

    const reviews = await getCourseReviews(courseCode, currentUserId);
    return res.status(200).json(reviews);

  }
  catch(err){
    console.error('Error fetching reviews:', err);
    return res.status(500).json({ message: 'Server error while fetching reviews.' });
  }
});

// ==========================================================================
// REVIEWS
// ==========================================================================

// POST /api/reviews
// Auth required. Multipart form-data body:
//   course_code (required), offering_id (optional), difficulty (1-5),
//   prereq_use (1-5), comment (required), attachment (optional file)
// Creates a new review tied to the authenticated user
router.post(
  '/reviews',
  verifyToken,
  // Wrapping multer like this catches its errors (bad file type, over the
  // size limit, etc.) and turns them into clean JSON instead of Express's
  // default HTML error page — multer's own errors happen before your
  // route handler's try/catch would ever run.
  (req, res, next) => {
    upload.single('attachment')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { error, value } = reviewSchema.validate(req.body);
      if (error) {
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        return res.status(400).json({ message: error.details[0].message });
      }

      const { course_code, offering_id, difficulty, prereq_use, comment } = value;

      const filePath = req.file ? req.file.path.replace(/\\/g, '/') : null;

      const createdReview = await createReview({
        courseCode: course_code,
        offeringId: offering_id || null,
        userId: req.user.user_id,
        difficulty,
        prereqUse: prereq_use,
        comment,
        filePath
      });

      return res.status(201).json(createdReview);
    } catch (err) {
      // Clean up the uploaded file if the database insert failed, so we
      // don't leave orphaned files with no matching DB row.
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      console.error('Error creating review:', err);
      return res.status(500).json({ message: 'Server error while creating review' });
    }
  }
);


router.post('/reviews/:id/download', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const review = await getReviewById(id);

    if (!review || !review.file_path) {
      return res.status(404).json({ message: 'Review or attachment not found' });
    }

    // Optional: If you want to track download counts, you can create a log function. 
    // Otherwise, you can safely skip/remove this line if you aren't tracking review download counts.
    // await logReviewDownload(id, req.user.user_id);

    const absolutePath = path.resolve(review.file_path);
    
    // Gives the downloaded file a clean name using the course code and extension
    const downloadName = `${review.course_code}-review-attachment${path.extname(review.file_path)}`;
    
    return res.download(absolutePath, downloadName);
  } catch (err) {
    console.error('Error while downloading review attachment', err);
    res.status(500).json({ message: 'Server error while downloading file' });
  }
});

// PUT /api/reviews/:reviewId
// Auth required. Body: any subset of { difficulty, prereq_use, comment }
// Updates a review — should verify the requesting user owns the review
router.put('/reviews/:reviewId', verifyToken, async (req, res) => {
  const { reviewId } = req.params;
  // TODO: implement
  try{
    const review = await getReviewById(reviewId)
    if (!review){
        return res.status(404).json({
            message: `The particular review does not exist in the database.`
        });
    }

    if (req.user.user_id !== review.user_id){
        return res.status(403).json({
            message: `Not authorized to update the review.`
        });
    }


    const {error, value} = reviewUpdateSchema.validate(req.body)

    if (error){
        return res.status(400).json({ message: error.details[0].message });
    }

    const {difficulty, prereq_use, comment} = value

    const newReview = await updateReview(reviewId, {difficulty, prereq_use, comment});
    res.json(newReview)
  }
  catch(err){
    console.error(err);
    res.status(500).json({ message: 'Failed to update review.' });
  }
});

// DELETE /api/reviews/:reviewId
// Auth required. Deletes a review — should verify ownership or admin role
router.delete('/reviews/:reviewId', verifyToken, async (req, res) => {
  const { reviewId } = req.params;
  // TODO: implement
  try{
    const review = await getReviewById(reviewId)
    const currentUser = req.user || null;

    if (!currentUser){
        return res.status(401).json({
            message: `Need to be logged in to delete a review.`
        });
    }

    if (!review){
        return res.status(404).json({
            message: `The particular review does not exist in the database.`
        });
    }

    if (currentUser.role !== 'admin' && currentUser.user_id !== review.user_id){
        return res.status(403).json({
            message: `Not authorized to delete the review.`
        });
    }

    await deleteReview(reviewId)

    res.json({ message: 'Review deleted successfully' });
  }
  catch(err){
    console.error(err);
    res.status(500).json({ message: 'Failed to delete review.' });
  }
});

// POST /api/reviews/:reviewId/vote
// Auth required. Body: { value: 1 | -1 }
// Upserts the user's vote on a review (toggling if same value is sent again)
// Returns updated { votes, currentVote }
router.post('/reviews/:reviewId/vote', verifyToken, async (req, res) => {
  const { reviewId } = req.params;
  const { value } = req.body;
  // TODO: implement
  try{
    if (value !== 1 && value !== -1) {
      return res.status(400).json({ message: 'Vote value must be 1 or -1' });
    }

    const review = await getReviewById(reviewId)
    if (!review){
        return res.status(404).json({
            message: `The particular review does not exist in the database.`
        }); 
    }

    
    const vote = await upsertReviewVote(reviewId, req.user.user_id, value);
    const votes = await getReviewVoteTally(reviewId)

    return res.json({ votes, currentVote: vote ? vote.value : null });
  } 
  catch (err) {
    console.error('Error processing vote:', err);
    return res.status(500).json({ message: 'Server error while processing vote' });
  }
});

// ==========================================================================
// REPORTS
// ==========================================================================

// POST /api/reports
// Auth required. Body: { target_type: 'coursereview', target_id, reason }
// Creates a moderation report against a review
router.post('/reports', verifyToken, async (req, res) => {
  // TODO: implement
  try{
    const {error, value} = reportSchema.validate(req.body)

    if (error){
        return res.status(400).json({ message: error.details[0].message });
    }    

    const {target_type, target_id, reason} = value

    const report = await createReport({targetType: target_type, targetId: target_id, reporterId: req.user.user_id, reason})
    res.json(report);
  }
  catch(err){
    console.error('Error creating report:', err);
    return res.status(500).json({ message: 'Server error while creating report' });
  }
});

module.exports = router;