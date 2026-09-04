const db = require('../db');

async function listNotifications(userId, limit, beforeId) {
  const values = [userId, limit + 1];
  let cursorClause = '';

  if (beforeId) {
    values.push(beforeId);
    cursorClause = 'AND notification_id < $3';
  }

  const result = await db.query(
    `SELECT notification_id, type, message, related_id, is_read, created_at
     FROM notifications
     WHERE user_id = $1
       ${cursorClause}
     ORDER BY notification_id DESC
     LIMIT $2`,
    values
  );

  const hasMore = result.rows.length > limit;
  const notifications = hasMore ? result.rows.slice(0, limit) : result.rows;

  return {
    notifications,
    next_cursor: hasMore ? notifications[notifications.length - 1].notification_id : null
  };
}

async function getUnreadCount(userId) {
  const result = await db.query(
    `SELECT COUNT(*)::integer AS unread_count
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );

  return result.rows[0].unread_count;
}

async function markNotificationRead(userId, notificationId) {
  const result = await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE notification_id = $1
       AND user_id = $2
     RETURNING notification_id, type, message, related_id, is_read, created_at`,
    [notificationId, userId]
  );

  return result.rows[0] || null;
}

async function markAllNotificationsRead(userId) {
  const result = await db.query(
    `WITH updated AS (
       UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1
         AND is_read = FALSE
       RETURNING notification_id
     )
     SELECT COUNT(*)::integer AS updated_count FROM updated`,
    [userId]
  );

  return result.rows[0].updated_count;
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead
};
