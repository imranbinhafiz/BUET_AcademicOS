const db = require('../db');

// Only these exact column expressions are allowed into ORDER BY — user
// input can never be interpolated directly into a SQL clause safely,
// even parameterized queries can't parameterize column names, so we
// map incoming values through these whitelists instead.
const RESOURCE_SORT_COLUMNS = {
  default: 'r.res_id',
  votes: 'vote_tally',
  downloads: 'download_count'
};

const REVIEW_SORT_COLUMNS = {
  date: 'cr.created_at',
  votes: 'vote_tally',
  usefulness: 'cr.prereq_use',
  difficulty: 'cr.difficulty'
};

/**
 * Fetches the base user identity (name, avatar, bio, email). Returns
 * null if the user doesn't exist OR is banned/deleted (deleted_at IS
 * NOT NULL) — callers get the same result either way, so a banned
 * account's profile doesn't leak the fact that it was ever banned
 * versus never having existed.
 * @param {number} userId
 * @returns {object|null}
 */
async function getUserBasicProfile(userId) {
  const result = await db.query(
    `SELECT user_id, name, avatar_path, bio, email, deleted_at
     FROM users
     WHERE user_id = $1`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) return null;
  if (user.deleted_at) return null;

  // deleted_at was only needed for the ban check above — strip it before
  // returning so it's never accidentally serialized to a client.
  delete user.deleted_at;
  return user;
}

async function updateUserBio(userId, bio) {
  const result = await db.query(
    `UPDATE users
     SET bio = $1
     WHERE user_id = $2 AND deleted_at IS NULL
     RETURNING user_id, name, avatar_path, bio, email`,
    [bio, userId]
  );

  return result.rows[0] || null;
}

async function updateUserAvatar(userId, avatarPath) {
  const result = await db.query(
    `UPDATE users
     SET avatar_path = $1
     WHERE user_id = $2 AND deleted_at IS NULL
     RETURNING user_id, name, avatar_path, bio, email`,
    [avatarPath, userId]
  );

  return result.rows[0] || null;
}

/**
 * Fetches, filters, and sorts a specific user's approved resources.
 * Supports searching by course_code or title.
 * Supports sorting by 'default' (upload order), 'votes', or 'downloads'.
 * @param {object} params - { userId, search, sortBy, order }
 * @returns {array}
 */
async function getUserResources({ userId, search, sortBy = 'default', order = 'desc' }) {
  const conditions = ['r.user_id = $1'];
  const values = [userId];

  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    conditions.push(`(r.course_code ILIKE ${p} OR r.title ILIKE ${p})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sortColumn = RESOURCE_SORT_COLUMNS[sortBy] || RESOURCE_SORT_COLUMNS.default;
  const sortDirection = order === 'asc' ? 'ASC' : 'DESC';

  const result = await db.query(
    `SELECT
       r.*,
       COALESCE((SELECT COUNT(*)::int FROM resource_downloads d WHERE d.resource_id = r.res_id), 0) AS download_count,
       COALESCE((SELECT SUM(value)::int FROM resourcevote v WHERE v.res_id = r.res_id), 0) AS vote_tally
     FROM resources r
     ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection}`,
    values
  );
  return result.rows;
}

/**
 * Fetches, filters, and sorts a specific user's published course reviews.
 * Supports searching by course_code or teacher.
 * Supports sorting by 'date', 'votes', 'usefulness', or 'difficulty'.
 * @param {object} params - { userId, search, sortBy, order }
 * @returns {array}
 */
async function getUserReviews({ userId, search, sortBy = 'date', order = 'desc' }) {
  const conditions = ['cr.user_id = $1'];
  const values = [userId];

  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    conditions.push(`(cr.course_code ILIKE ${p} OR t.name ILIKE ${p})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sortColumn = REVIEW_SORT_COLUMNS[sortBy] || REVIEW_SORT_COLUMNS.date;
  const sortDirection = order === 'asc' ? 'ASC' : 'DESC';

  const result = await db.query(
    `SELECT
       cr.*,
       t.name AS teacher_name,
       co.semester,
       COALESCE((SELECT SUM(value)::int FROM coursereviewvote v WHERE v.review_id = cr.review_id), 0) AS vote_tally
     FROM coursereviews cr
     LEFT JOIN course_offerings co ON co.offering_id = cr.offering_id
     LEFT JOIN teachers t ON t.teacher_id = co.teacher_id
     ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection}`,
    values
  );
  return result.rows;
}

module.exports = {
  getUserBasicProfile,
  updateUserBio,
  updateUserAvatar,
  getUserResources,
  getUserReviews
};