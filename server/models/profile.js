const db = require('../db');

async function getProfile(userId) {
  const result = await db.query(
    `SELECT u.user_id, u.name, u.email, u.batch, u.role, u.dept_code, d.dept_name, u.bio, u.avatar_path,
       (SELECT COUNT(*)::int FROM resources r WHERE r.user_id = u.user_id) AS resources_uploaded,
       (SELECT COUNT(*)::int FROM coursereview cr WHERE cr.user_id = u.user_id) AS reviews_written,
       (SELECT COUNT(*)::int FROM coursereviewvote cv WHERE cv.user_id = u.user_id) AS review_votes_given,
       (SELECT COUNT(*)::int FROM coursereviewvote cv JOIN coursereview cr ON cr.review_id = cv.review_id WHERE cr.user_id = u.user_id AND cv.value = 1) AS helpful_votes_received,
       (SELECT COALESCE(SUM(cv.value), 0)::int FROM coursereviewvote cv JOIN coursereview cr ON cr.review_id = cv.review_id WHERE cr.user_id = u.user_id) AS review_vote_score
     FROM users u
     JOIN departments d ON d.dept_code = u.dept_code
     WHERE u.user_id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getCompletedTermCount(userId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS completed_terms
     FROM (
       SELECT cc.term_code
       FROM users u
       JOIN batch_progress bp ON bp.batch_year = u.batch AND bp.dept_code = u.dept_code
       JOIN curriculum_courses cc ON cc.curriculum_id = bp.curriculum_id
       JOIN academic_terms course_term ON course_term.term_code = cc.term_code
       JOIN academic_terms completed_term ON completed_term.term_code = bp.latest_completed_term_code
       LEFT JOIN user_course_performance ucp
         ON ucp.user_id = u.user_id AND ucp.curriculum_course_id = cc.curriculum_course_id
       WHERE u.user_id = $1 AND course_term.term_order <= completed_term.term_order
       GROUP BY cc.term_code
       HAVING COUNT(cc.curriculum_course_id) = COUNT(ucp.curriculum_course_id)
     ) completed`,
    [userId]
  );
  return result.rows[0].completed_terms;
}

async function updateProfile(userId, { name, bio }) {
  const result = await db.query(
    `UPDATE users SET name = $2, bio = $3 WHERE user_id = $1 AND deleted_at IS NULL
     RETURNING user_id, name, email, batch, role, dept_code, bio, avatar_path`,
    [userId, name, bio || null]
  );
  return result.rows[0] || null;
}

async function updateAvatar(userId, avatarPath) {
  const result = await db.query(
    `UPDATE users SET avatar_path = $2 WHERE user_id = $1 AND deleted_at IS NULL
     RETURNING user_id, name, email, batch, role, dept_code, bio, avatar_path`,
    [userId, avatarPath]
  );
  return result.rows[0] || null;
}

async function getPasswordHash(userId) {
  const result = await db.query('SELECT password FROM users WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
  return result.rows[0]?.password || null;
}

async function updatePassword(userId, passwordHash) {
  await db.query('UPDATE users SET password = $2 WHERE user_id = $1 AND deleted_at IS NULL', [userId, passwordHash]);
}

module.exports = { getProfile, getCompletedTermCount, updateProfile, updateAvatar, getPasswordHash, updatePassword };
