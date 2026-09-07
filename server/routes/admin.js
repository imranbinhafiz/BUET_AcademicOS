const express = require('express');
const Joi = require('joi');
const { verifyToken, requireActiveRole } = require('../middleware/auth');
const {
  listBatchProgress,
  getBatchProgressHistory,
  advanceBatchProgress,
  listModerationQueue,
  resolveReport,
  moderateResource
} = require('../models/admin');

const router = express.Router();

const batchSchema = Joi.string().pattern(/^[0-9]{4}$/).required();
const deptSchema = Joi.string().trim().max(10).required();
const advanceBodySchema = Joi.object({
  expected_current_term_code: Joi.string().pattern(/^[1-4]-[1-2]$/).required(),
  reason: Joi.string().trim().min(3).max(500).required(),
  request_id: Joi.string().guid({ version: ['uuidv4'] }).required()
}).unknown(false);
const reportResolutionSchema = Joi.object({
  status: Joi.string().valid('reviewed', 'dismissed').required(),
  resolution_note: Joi.string().trim().max(500).allow('').optional()
}).unknown(false);
const resourceModerationSchema = Joi.object({
  approval_status: Joi.string().valid('approved', 'rejected').required(),
  moderation_note: Joi.string().trim().max(500).allow('').optional()
}).unknown(false);

const conflictResponses = {
  BATCH_NOT_CONFIGURED: {
    status: 404,
    message: 'That batch does not have progress configured yet.'
  },
  BATCH_ALREADY_GRADUATED: {
    status: 409,
    message: 'This batch is already marked as graduated.'
  },
  STALE_BATCH_PROGRESS: {
    status: 409,
    message: 'This batch changed before your request. The page has been refreshed.'
  },
  NEXT_TERM_NOT_CONFIGURED: {
    status: 409,
    message: 'The next term has no curriculum courses configured, so it cannot be opened yet.'
  },
  INVALID_FINAL_TERM_TRANSITION: {
    status: 409,
    message: 'This batch cannot make that final-term transition.'
  },
  INVALID_BATCH_STATE: {
    status: 409,
    message: 'The stored batch state is invalid and needs review.'
  },
  BATCH_PROGRESS_MUST_COMPLETE_CURRENT_TERM: {
    status: 409,
    message: 'A batch must complete its current term before changing progress.'
  },
  BATCH_PROGRESS_MUST_ADVANCE_ONE_TERM: {
    status: 409,
    message: 'A batch can advance only one term at a time.'
  },
  SAVED_RESULTS_REQUIRE_COMPLETED_TERM: {
    status: 409,
    message: 'Saved student results require the matching term to stay completed.'
  }
};

function validationError(res, error) {
  return res.status(400).json({ code: 'VALIDATION_ERROR', message: error.details[0].message });
}

function databaseError(res, err, fallbackMessage) {
  if (err.code === '42501') {
    return res.status(403).json({ code: 'ADMIN_REQUIRED', message: 'An active admin account is required.' });
  }

  if (err.code === '22023') {
    const inputMessages = {
      REQUEST_ID_REQUIRED: 'A request identifier is required for this action.',
      REQUEST_ID_ALREADY_USED: 'That request identifier was already used for another action.',
      INVALID_ADVANCE_REASON: 'Please provide a short reason for this term advance.'
    };
    return res.status(400).json({
      code: err.message || 'INVALID_ADVANCE_REQUEST',
      message: inputMessages[err.message] || 'The advance request is invalid.'
    });
  }

  if (err.code === 'P0001' && conflictResponses[err.message]) {
    const conflict = conflictResponses[err.message];
    return res.status(conflict.status).json({ code: err.message, message: conflict.message });
  }

  console.error('Admin database error:', err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: fallbackMessage });
}

router.use(verifyToken, requireActiveRole('admin'));

// GET /api/admin/batch-progress?dept_code=5
router.get('/batch-progress', async (req, res) => {
  if (req.query.dept_code !== undefined) {
    const { error } = deptSchema.validate(req.query.dept_code);
    if (error) return validationError(res, error);
  }

  try {
    const batches = await listBatchProgress(req.query.dept_code);
    return res.json({ batches });
  } catch (err) {
    return databaseError(res, err, 'Could not load batch progress.');
  }
});

// GET /api/admin/batch-progress/2024/5/history
router.get('/batch-progress/:batchYear/:deptCode/history', async (req, res) => {
  const batchValidation = batchSchema.validate(req.params.batchYear);
  const deptValidation = deptSchema.validate(req.params.deptCode);
  if (batchValidation.error || deptValidation.error) {
    return validationError(res, batchValidation.error || deptValidation.error);
  }

  try {
    const history = await getBatchProgressHistory(batchValidation.value, deptValidation.value);
    return res.json({ history });
  } catch (err) {
    return databaseError(res, err, 'Could not load batch progress history.');
  }
});

// POST /api/admin/batch-progress/2024/5/advance
// The client supplies its view of the current term, a reason, and a UUID. It
// never supplies the target term: PostgreSQL derives the only legal next step.
router.post('/batch-progress/:batchYear/:deptCode/advance', async (req, res) => {
  const batchValidation = batchSchema.validate(req.params.batchYear);
  const deptValidation = deptSchema.validate(req.params.deptCode);
  const bodyValidation = advanceBodySchema.validate(req.body);
  if (batchValidation.error || deptValidation.error || bodyValidation.error) {
    return validationError(res, batchValidation.error || deptValidation.error || bodyValidation.error);
  }

  try {
    const result = await advanceBatchProgress({
      actorUserId: req.activeUser.user_id,
      batchYear: batchValidation.value,
      deptCode: deptValidation.value,
      expectedCurrentTermCode: bodyValidation.value.expected_current_term_code,
      reason: bodyValidation.value.reason,
      requestId: bodyValidation.value.request_id
    });

    return res.json({
      message: 'Batch progress advanced and student notifications were created.',
      event: result.event,
      progress: result.progress,
      notifications_created: result.procedure.o_notifications_created
    });
  } catch (err) {
    return databaseError(res, err, 'Could not advance batch progress.');
  }
});

// GET /api/admin/moderation/queue
router.get('/moderation/queue', async (req, res) => {
  try {
    return res.json(await listModerationQueue());
  } catch (err) {
    return databaseError(res, err, 'Could not load the moderation queue.');
  }
});

// PATCH /api/admin/reports/123
router.patch('/reports/:reportId', async (req, res) => {
  const idValidation = Joi.number().integer().positive().validate(req.params.reportId);
  const bodyValidation = reportResolutionSchema.validate(req.body);
  if (idValidation.error || bodyValidation.error) {
    return validationError(res, idValidation.error || bodyValidation.error);
  }

  try {
    const report = await resolveReport({
      reportId: idValidation.value,
      status: bodyValidation.value.status,
      resolutionNote: bodyValidation.value.resolution_note,
      actorUserId: req.activeUser.user_id
    });
    if (!report) return res.status(409).json({ code: 'REPORT_NOT_PENDING', message: 'This report has already been resolved.' });
    return res.json({ report });
  } catch (err) {
    return databaseError(res, err, 'Could not resolve the report.');
  }
});

// PATCH /api/admin/resources/123/moderation
router.patch('/resources/:resourceId/moderation', async (req, res) => {
  const idValidation = Joi.number().integer().positive().validate(req.params.resourceId);
  const bodyValidation = resourceModerationSchema.validate(req.body);
  if (idValidation.error || bodyValidation.error) {
    return validationError(res, idValidation.error || bodyValidation.error);
  }

  try {
    const resource = await moderateResource({
      resourceId: idValidation.value,
      approvalStatus: bodyValidation.value.approval_status,
      moderationNote: bodyValidation.value.moderation_note,
      actorUserId: req.activeUser.user_id
    });
    if (!resource) return res.status(409).json({ code: 'RESOURCE_NOT_PENDING', message: 'This resource is no longer waiting for review.' });
    return res.json({ resource });
  } catch (err) {
    return databaseError(res, err, 'Could not moderate the resource.');
  }
});

module.exports = router;
