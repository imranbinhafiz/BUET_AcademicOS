const express = require('express');
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const {
  getAvailableTerms,
  getTermCourses,
  getTermSummary,
  saveCoursePerformance,
  deleteCoursePerformance,
  getActiveUser,
  getBatchSummary,
  getBatchCourseStats
} = require('../models/performance');

const router = express.Router();

const levelTermSchema = Joi.string()
  .pattern(/^[0-9]+-[0-9]+$/)
  .max(10)
  .required()
  .messages({ 'string.pattern.base': 'level_term must look like 1-1 or 2-1' });

const courseCodeSchema = Joi.string().trim().max(20).required();
const VALID_GRADE_POINTS = [0, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];
const gradePointSchema = Joi.number()
  .valid(...VALID_GRADE_POINTS)
  .required()
  .messages({ 'any.only': 'grade_point must be a valid BUET grade point from 0.00 to 4.00' });
const batchSchema = Joi.string().pattern(/^[0-9]{4}$/).required();
const MINIMUM_ANONYMOUS_COHORT = 5;

router.use(verifyToken);

// JWTs are valid for several days. Check the account again so a soft-deleted
// user cannot keep writing results with an old token.
router.use(async (req, res, next) => {
  try {
    const activeUser = await getActiveUser(req.user.user_id);
    if (!activeUser) {
      return res.status(403).json({ message: 'This account is no longer active' });
    }
    req.activeUser = activeUser;
    return next();
  } catch (err) {
    console.error('Error checking active user:', err);
    return res.status(500).json({ message: 'Could not verify account status' });
  }
});

function requireStudent(req, res, next) {
  if (req.activeUser.role !== 'student') {
    return res.status(403).json({ message: 'Only student accounts can manage personal results' });
  }
  return next();
}

// GET /api/performance/terms
router.get('/terms', async (req, res) => {
  try {
    const terms = await getAvailableTerms();
    return res.json({ terms });
  } catch (err) {
    console.error('Error fetching performance terms:', err);
    return res.status(500).json({ message: 'Failed to fetch available terms' });
  }
});

// GET /api/performance/me?level_term=1-1
router.get('/me', requireStudent, async (req, res) => {
  const { error, value: levelTerm } = levelTermSchema.validate(req.query.level_term);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const [courses, summary] = await Promise.all([
      getTermCourses(req.user.user_id, levelTerm),
      getTermSummary(req.user.user_id, levelTerm)
    ]);

    return res.json({ level_term: levelTerm, summary, courses });
  } catch (err) {
    console.error('Error fetching student performance:', err);
    return res.status(500).json({ message: 'Failed to fetch term performance' });
  }
});

// PUT /api/performance/me/:courseCode  body: { grade_point: 3.75 }
router.put('/me/:courseCode', requireStudent, async (req, res) => {
  const courseValidation = courseCodeSchema.validate(req.params.courseCode);
  const termValidation = levelTermSchema.validate(req.body.level_term);
  const gradeValidation = gradePointSchema.validate(req.body.grade_point);

  if (courseValidation.error || termValidation.error || gradeValidation.error) {
    const validationError = courseValidation.error || termValidation.error || gradeValidation.error;
    return res.status(400).json({ message: validationError.details[0].message });
  }

  try {
    const performance = await saveCoursePerformance(
      req.user.user_id,
      courseValidation.value,
      termValidation.value,
      gradeValidation.value
    );

    if (!performance) {
      return res.status(404).json({ message: 'Course not found or archived' });
    }

    return res.json({ message: 'Course performance saved', performance });
  } catch (err) {
    console.error('Error saving course performance:', err);
    return res.status(500).json({ message: 'Failed to save course performance' });
  }
});

// DELETE /api/performance/me/:courseCode
router.delete('/me/:courseCode', requireStudent, async (req, res) => {
  const { error, value: courseCode } = courseCodeSchema.validate(req.params.courseCode);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const deleted = await deleteCoursePerformance(req.user.user_id, courseCode);
    if (!deleted) {
      return res.status(404).json({ message: 'No saved result found for this course' });
    }

    return res.json({ message: 'Course performance deleted', performance: deleted });
  } catch (err) {
    console.error('Error deleting course performance:', err);
    return res.status(500).json({ message: 'Failed to delete course performance' });
  }
});

// GET /api/performance/batch-stats?level_term=1-1&batch=2024
// If batch is omitted, the current student's batch is used.
router.get('/batch-stats', async (req, res) => {
  const termValidation = levelTermSchema.validate(req.query.level_term);
  if (termValidation.error) {
    return res.status(400).json({ message: termValidation.error.details[0].message });
  }

  try {
    const requestedBatch = req.query.batch || req.activeUser.batch;
    const batchValidation = batchSchema.validate(requestedBatch);
    if (batchValidation.error) {
      return res.status(400).json({ message: 'A valid four-digit batch is required' });
    }

    if (req.activeUser.role !== 'admin' && batchValidation.value !== req.activeUser.batch) {
      return res.status(403).json({ message: 'You can view statistics for your own batch only' });
    }

    const [summary, courses] = await Promise.all([
      getBatchSummary(batchValidation.value, termValidation.value),
      getBatchCourseStats(batchValidation.value, termValidation.value)
    ]);

    const privacyThresholdMet = Number(summary.completed_students) >= MINIMUM_ANONYMOUS_COHORT;
    const protectedSummary = privacyThresholdMet
      ? summary
      : {
          ...summary,
          batch_average_gpa: null,
          highest_gpa: null,
          lowest_gpa: null
        };
    const protectedCourses = courses.map((course) => (
      Number(course.submitted_students) >= MINIMUM_ANONYMOUS_COHORT
        ? course
        : {
            ...course,
            average_grade_point: null,
            highest_grade_point: null,
            lowest_grade_point: null
          }
    ));

    return res.json({
      batch: batchValidation.value,
      level_term: termValidation.value,
      privacy_threshold_met: privacyThresholdMet,
      minimum_anonymous_cohort: MINIMUM_ANONYMOUS_COHORT,
      summary: protectedSummary,
      courses: protectedCourses
    });
  } catch (err) {
    console.error('Error fetching batch statistics:', err);
    return res.status(500).json({ message: 'Failed to fetch batch statistics' });
  }
});

module.exports = router;
