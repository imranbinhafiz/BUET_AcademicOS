const express = require('express');
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const {
  getActiveUser,
  getStudentProgress,
  getStudentAvailableTerms,
  getStudentTermCourses,
  summarizeStudentTerm,
  getEditablePlacement,
  saveCoursePerformance,
  deleteCoursePerformance,
  listConfiguredBatches,
  getBatchTerms,
  getBatchContext,
  getBatchSummary,
  getBatchCourseStats
} = require('../models/performance');

const router = express.Router();
const MINIMUM_ANONYMOUS_COHORT = 5;
const VALID_GRADE_POINTS = [0, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];

const termSchema = Joi.string()
  .pattern(/^[1-4]-[1-2]$/)
  .required()
  .messages({ 'string.pattern.base': 'term_code must look like 1-1 or 2-1' });
const batchSchema = Joi.string().pattern(/^[0-9]{4}$/).required();
const deptSchema = Joi.string().trim().max(10).required();
const placementIdSchema = Joi.number().integer().positive().required();
const gradePointSchema = Joi.number()
  .valid(...VALID_GRADE_POINTS)
  .required()
  .messages({ 'any.only': 'grade_point must be an official BUET grade point' });

router.use(verifyToken);

// A JWT stays valid for several days, so confirm the account still exists on
// every request. This blocks a soft-deleted user holding an old token.
router.use(async (req, res, next) => {
  try {
    const activeUser = await getActiveUser(req.user.user_id);
    if (!activeUser) {
      return res.status(403).json({ code: 'ACCOUNT_INACTIVE', message: 'This account is no longer active.' });
    }
    req.activeUser = activeUser;
    return next();
  } catch (err) {
    console.error('Error checking active performance user:', err);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Could not verify account status.' });
  }
});

function requireStudent(req, res, next) {
  if (req.activeUser.role !== 'student') {
    return res.status(403).json({ code: 'STUDENT_ONLY', message: 'Only student accounts can manage personal results.' });
  }
  return next();
}

function validationError(res, error) {
  return res.status(400).json({ code: 'VALIDATION_ERROR', message: error.details[0].message });
}

function databaseError(res, err, fallbackMessage) {
  // The trigger deliberately protects the data even if an app check races or a
  // caller reaches the database by another route. Do not expose raw SQL text.
  if (err.code === 'P0001') {
    return res.status(409).json({ code: 'PERFORMANCE_RULE_VIOLATION', message: 'This result is not allowed by the current batch progress.' });
  }
  console.error('Performance database error:', err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: fallbackMessage });
}

// GET /api/performance/me?term_code=1-1
// With no term_code, the most recently completed eligible term is selected.
router.get('/me', requireStudent, async (req, res) => {
  if (req.query.term_code !== undefined) {
    const { error } = termSchema.validate(req.query.term_code);
    if (error) return validationError(res, error);
  }

  try {
    const [progress, availableTerms] = await Promise.all([
      getStudentProgress(req.activeUser.user_id),
      getStudentAvailableTerms(req.activeUser.user_id)
    ]);

    if (!progress) {
      return res.status(409).json({
        code: 'BATCH_PROGRESS_NOT_CONFIGURED',
        message: 'Your batch does not have performance progress configured yet.'
      });
    }

    if (availableTerms.length === 0) {
      return res.status(409).json({
        code: 'TERM_NOT_COMPLETED',
        message: 'No completed curriculum term is open for result entry yet.'
      });
    }

    const selectedTerm = req.query.term_code || availableTerms[availableTerms.length - 1].term_code;
    if (!availableTerms.some((term) => term.term_code === selectedTerm)) {
      return res.status(409).json({
        code: 'TERM_NOT_COMPLETED',
        message: 'That term is not completed for your batch yet.'
      });
    }

    const courses = await getStudentTermCourses(req.activeUser.user_id, selectedTerm);
    return res.json({
      progress,
      available_terms: availableTerms,
      selected_term: selectedTerm,
      summary: summarizeStudentTerm(courses),
      courses
    });
  } catch (err) {
    return databaseError(res, err, 'Could not load your term performance.');
  }
});

// PUT /api/performance/me/courses/:curriculumCourseId  { grade_point: 3.75 }
router.put('/me/courses/:curriculumCourseId', requireStudent, async (req, res) => {
  const placementValidation = placementIdSchema.validate(req.params.curriculumCourseId);
  const gradeValidation = gradePointSchema.validate(req.body.grade_point);
  if (placementValidation.error || gradeValidation.error) {
    return validationError(res, placementValidation.error || gradeValidation.error);
  }

  try {
    const placement = await getEditablePlacement(req.activeUser.user_id, placementValidation.value);
    if (!placement) {
      return res.status(404).json({
        code: 'CURRICULUM_COURSE_NOT_FOUND',
        message: 'This completed curriculum course is not available for your account.'
      });
    }

    const performance = await saveCoursePerformance(
      req.activeUser.user_id,
      placementValidation.value,
      gradeValidation.value
    );
    return res.json({ message: 'Course result saved.', performance });
  } catch (err) {
    return databaseError(res, err, 'Could not save this course result.');
  }
});

// DELETE /api/performance/me/courses/:curriculumCourseId
router.delete('/me/courses/:curriculumCourseId', requireStudent, async (req, res) => {
  const placementValidation = placementIdSchema.validate(req.params.curriculumCourseId);
  if (placementValidation.error) return validationError(res, placementValidation.error);

  try {
    const deleted = await deleteCoursePerformance(req.activeUser.user_id, placementValidation.value);
    if (!deleted) {
      return res.status(404).json({ code: 'RESULT_NOT_FOUND', message: 'No saved result exists for this course.' });
    }
    return res.json({ message: 'Course result removed.', performance: deleted });
  } catch (err) {
    return databaseError(res, err, 'Could not remove this course result.');
  }
});

// GET /api/performance/batches?dept_code=5
// All authenticated users may browse anonymous aggregate batches.
router.get('/batches', async (req, res) => {
  const requestedDept = req.query.dept_code || req.activeUser.dept_code;
  const { error, value: deptCode } = deptSchema.validate(requestedDept);
  if (error) return validationError(res, error);

  try {
    const batches = await listConfiguredBatches(deptCode);
    return res.json({ dept_code: deptCode, batches });
  } catch (err) {
    return databaseError(res, err, 'Could not load configured batches.');
  }
});

// GET /api/performance/batch-terms?batch_year=2024&dept_code=5
router.get('/batch-terms', async (req, res) => {
  const batchValidation = batchSchema.validate(req.query.batch_year);
  const deptValidation = deptSchema.validate(req.query.dept_code);
  if (batchValidation.error || deptValidation.error) {
    return validationError(res, batchValidation.error || deptValidation.error);
  }

  try {
    const context = await getBatchContext(batchValidation.value, deptValidation.value);
    if (!context) {
      return res.status(404).json({ code: 'BATCH_NOT_CONFIGURED', message: 'That batch is not configured.' });
    }
    const terms = await getBatchTerms(batchValidation.value, deptValidation.value);
    return res.json({ batch: context, terms });
  } catch (err) {
    return databaseError(res, err, 'Could not load completed batch terms.');
  }
});

// GET /api/performance/batch-stats?batch_year=2024&dept_code=5&term_code=1-1
router.get('/batch-stats', async (req, res) => {
  const batchValidation = batchSchema.validate(req.query.batch_year);
  const deptValidation = deptSchema.validate(req.query.dept_code);
  const termValidation = termSchema.validate(req.query.term_code);
  if (batchValidation.error || deptValidation.error || termValidation.error) {
    return validationError(res, batchValidation.error || deptValidation.error || termValidation.error);
  }

  try {
    const context = await getBatchContext(batchValidation.value, deptValidation.value);
    if (!context) {
      return res.status(404).json({ code: 'BATCH_NOT_CONFIGURED', message: 'That batch is not configured.' });
    }

    const terms = await getBatchTerms(batchValidation.value, deptValidation.value);
    if (!terms.some((term) => term.term_code === termValidation.value)) {
      return res.status(409).json({ code: 'TERM_NOT_COMPLETED', message: 'That term is not completed for the selected batch.' });
    }

    const [summary, courses] = await Promise.all([
      getBatchSummary(batchValidation.value, deptValidation.value, termValidation.value, MINIMUM_ANONYMOUS_COHORT),
      getBatchCourseStats(batchValidation.value, deptValidation.value, termValidation.value, MINIMUM_ANONYMOUS_COHORT)
    ]);

    return res.json({
      selection: {
        batch_year: batchValidation.value,
        dept_code: deptValidation.value,
        term_code: termValidation.value
      },
      availability: {
        analytics_visible: summary.privacy_threshold_met,
        minimum_anonymous_cohort: MINIMUM_ANONYMOUS_COHORT
      },
      coverage: {
        registered_students: summary.registered_students,
        expected_courses: summary.expected_courses,
        students_with_any_data: summary.students_with_any_data,
        completed_students: summary.completed_students
      },
      summary: {
        average_gpa: summary.batch_average_gpa,
        median_gpa: summary.median_gpa,
        lowest_gpa: summary.lowest_gpa,
        highest_gpa: summary.highest_gpa,
        standard_deviation_gpa: summary.standard_deviation_gpa,
        first_quartile_gpa: summary.first_quartile_gpa,
        third_quartile_gpa: summary.third_quartile_gpa
      },
      courses
    });
  } catch (err) {
    return databaseError(res, err, 'Could not load batch analysis.');
  }
});

module.exports = router;
