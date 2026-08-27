const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Joi = require('joi');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const {
  getResources,
  getResourceById,
  createResource,
  deleteResource,
  logDownload,
  upsertVote,
  getVoteTally,
  deleteVote,
  getVersionHistory
} = require('../models/resources');

// ---------------------------------------------------------------------
// Multer setup
// ---------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'resources'));
  },
  filename: (req, file, cb) => {
    // Prefix with a unique value so two uploads named "notes.pdf" never collide.
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed' // some browsers send this instead of application/zip
];

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and ZIP files are allowed'));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB — adjust to whatever makes sense for your use case
  }
});

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

// Must match the chk_resource_type CHECK constraint in the DB exactly.
const RESOURCE_TYPES = ['Slides', 'Previous Year Questions', 'Notes', 'Lab reports'];
const SORT_OPTIONS = ['default', 'votes', 'downloads'];
const ORDER_OPTIONS = ['asc', 'desc'];

const resourceSchema = Joi.object({
  title: Joi.string().min(3).max(255).trim().required(),
  type: Joi.string().valid(...RESOURCE_TYPES).required(),
  course_code: Joi.string().max(20).trim().required(),
  parent_res_id: Joi.number().integer().positive().optional().allow(null)
});

// ---------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------

// GET /api/resources
// List resources, optionally filtered by ?type= and/or ?course_code=
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { type, course_code, sortBy, order } = req.query;

    // QoL: reject an invalid ?type= early with a clear message, instead
    // of silently returning an empty array that looks like "no results."
    if (type && !RESOURCE_TYPES.includes(type)) {
      return res.status(400).json({
        message: `Invalid type filter. Must be one of: ${RESOURCE_TYPES.join(', ')}`
      });
    }

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

    const resources = await getResources({
      type,
      courseCode: course_code,
      currentUserId: req.user ? req.user.user_id : undefined,
      sortBy,
      order
    });
    res.json(resources);
  } catch (err) {
    console.error('Error fetching resources:', err);
    res.status(500).json({ message: 'Server error while fetching resources' });
  }
});

// GET /api/resources/:id
// Fetch a single resource's details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await getResourceById(id, req.user ? req.user.user_id : undefined);

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    res.json(resource);
  } catch (err) {
    console.error('Error while getting resource by ID', err);
    res.status(500).json({ message: 'Server error while getting resource' });
  }
});

// GET /api/resources/:id/versions
// Return the full version history (ancestors) of a resource, following
// parent_res_id back to the original upload.
router.get('/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const versions = await getVersionHistory(id);
    res.json(versions);
  } catch (err) {
    console.error('Error fetching version history:', err);
    res.status(500).json({ message: 'Server error while fetching version history' });
  }
});

// POST /api/resources
// Upload a new resource (protected — requires a logged-in user)
router.post(
  '/',
  verifyToken,
  // Wrapping multer like this catches its errors (bad file type, over the
  // size limit, etc.) and turns them into clean JSON instead of Express's
  // default HTML error page — multer's own errors happen before your
  // route handler's try/catch would ever run.
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'A file must be uploaded' });
      }

      const { error, value } = resourceSchema.validate(req.body);
      if (error) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ message: error.details[0].message });
      }

      const { title, type, course_code, parent_res_id } = value;
      const filePath = req.file.path.replace(/\\/g, '/');

      const createdResource = await createResource({
        title,
        type,
        courseCode: course_code,
        userId: req.user.user_id,
        filePath,
        parentResId: parent_res_id || null
      });

      return res.status(201).json(createdResource);
    } catch (err) {
      // Clean up the uploaded file if the database insert failed, so we
      // don't leave orphaned files with no matching DB row.
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      console.error('Error creating resource:', err);
      return res.status(500).json({ message: 'Server error while creating resource' });
    }
  }
);

// POST /api/resources/:id/download
// Log a download and serve the file
router.post('/:id/download', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await getResourceById(id);

    if (!resource || !resource.file_path) {
      return res.status(404).json({ message: 'Resource or file not found' });
    }

    await logDownload(id, req.user.user_id);

    const absolutePath = path.resolve(resource.file_path);
    // FIX: was resource.filename (doesn't exist) — use resource.title,
    // which is an actual column, so the downloaded file gets a readable name.
    return res.download(absolutePath, resource.title + path.extname(resource.file_path));
  } catch (err) {
    console.error('Error while downloading resource', err);
    res.status(500).json({ message: 'Server error while downloading resource' });
  }
});

// POST /api/resources/:id/vote
// Upvote, downvote, or clear a vote on a resource (protected)
router.post('/:id/vote', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;

    if (value !== 1 && value !== -1) {
      return res.status(400).json({ message: 'Vote value must be 1 or -1' });
    }

    const resource = await getResourceById(id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    const vote = await upsertVote(id, req.user.user_id, value);
    const votes = await getVoteTally(id);

    // vote is null when the same value was submitted twice (toggle off),
    // so the frontend can tell whether this user currently has an active vote.
    return res.json({ votes, currentVote: vote ? vote.value : null });
  } catch (err) {
    console.error('Error processing vote:', err);
    return res.status(500).json({ message: 'Server error while processing vote' });
  }
});

// DELETE /api/resources/:id/vote
// Explicitly remove the current user's vote (optional — separate from
// the toggle-off behavior already built into POST /:id/vote).
router.delete('/:id/vote', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await deleteVote(id, req.user.user_id);
    const votes = await getVoteTally(id);
    return res.json({ votes, currentVote: null });
  } catch (err) {
    console.error('Error removing vote:', err);
    return res.status(500).json({ message: 'Server error while removing vote' });
  }
});

// DELETE /api/resources/:id
// Delete a resource (protected — only the uploader or an admin)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const resource = await getResourceById(id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (resource.user_id !== req.user.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this resource' });
    }

    if (resource.file_path) {
      await fs.unlink(resource.file_path).catch((fileErr) => {
        console.warn('Physical file could not be unlinked:', fileErr.message);
      });
    }

    await deleteResource(id);

    res.json({ message: 'Resource deleted successfully' });
  } catch (err) {
    console.error('Error while deleting resource:', err);
    res.status(500).json({ message: 'Server error while deleting resource' });
  }
});

module.exports = router;