const express = require('express');
const Joi = require('joi');
const { verifyToken, requireActiveUser } = require('../middleware/auth');
const {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead
} = require('../models/notifications');

const router = express.Router();

const notificationIdSchema = Joi.number().integer().positive().required();
const limitSchema = Joi.number().integer().min(1).max(50).default(30);

function validationError(res, error) {
  return res.status(400).json({ code: 'VALIDATION_ERROR', message: error.details[0].message });
}

function databaseError(res, err, fallbackMessage) {
  console.error('Notification database error:', err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: fallbackMessage });
}

router.use(verifyToken, requireActiveUser);

// GET /api/notifications?limit=30&before_id=120
router.get('/', async (req, res) => {
  const limitValidation = limitSchema.validate(req.query.limit);
  const beforeValidation = req.query.before_id === undefined
    ? { value: null }
    : notificationIdSchema.validate(req.query.before_id);
  if (limitValidation.error || beforeValidation.error) {
    return validationError(res, limitValidation.error || beforeValidation.error);
  }

  try {
    const result = await listNotifications(
      req.activeUser.user_id,
      limitValidation.value,
      beforeValidation.value
    );
    return res.json(result);
  } catch (err) {
    return databaseError(res, err, 'Could not load notifications.');
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await getUnreadCount(req.activeUser.user_id);
    return res.json({ unread_count: unreadCount });
  } catch (err) {
    return databaseError(res, err, 'Could not load unread notification count.');
  }
});

// PATCH /api/notifications/read-all
router.delete('/read-all', async (req, res) => {
  try {
    const updatedCount = await markAllNotificationsRead(req.activeUser.user_id);
    return res.json({ updated_count: updatedCount, unread_count: 0 });
  } catch (err) {
    return databaseError(res, err, 'Could not mark notifications as read.');
  }
});

// PATCH /api/notifications/123/read
router.patch('/:notificationId/read', async (req, res) => {
  const { error, value: notificationId } = notificationIdSchema.validate(req.params.notificationId);
  if (error) return validationError(res, error);

  try {
    const notification = await markNotificationRead(req.activeUser.user_id, notificationId);
    if (!notification) {
      // The user intentionally receives the same response for a nonexistent
      // row and another user's row; notification ownership stays private.
      return res.status(404).json({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' });
    }
    const unreadCount = await getUnreadCount(req.activeUser.user_id);
    return res.json({ notification, unread_count: unreadCount });
  } catch (err) {
    return databaseError(res, err, 'Could not mark the notification as read.');
  }
});

module.exports = router;
