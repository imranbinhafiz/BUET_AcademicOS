const db = require('../db');

// Fetch resources, optionally filtered by type and/or course_code.
// Even though the WHERE clause is built dynamically depending on which
// filters are present, the actual values are still passed separately
// as parameters ($1, $2, ...) — never concatenated into the SQL string.
// Only these exact column/alias names are allowed into ORDER BY — user
// input can never be interpolated directly into a SQL clause safely,
// even parameterized queries can't parameterize column names, so we
// map incoming values through this whitelist instead.
const SORT_COLUMNS = {
  default: 'r.res_id',
  votes: 'vote_tally',
  downloads: 'download_count'
};

async function getResources({ type, courseCode, currentUserId, sortBy = 'default', order = 'desc' } = {}) {
  const conditions = [];
  const values = [];

  if (type) {
    values.push(type);
    conditions.push(`type = $${values.length}`); // becomes $1
  }

  if (courseCode) {
    values.push(`%${courseCode}%`);
    conditions.push(`course_code ILIKE $${values.length}`); // partial, case-insensitive match
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Appended last regardless of which filters are active, so its
  // placeholder number is only known once the filter values are in.
  values.push(currentUserId || null);
  const currentUserParam = `$${values.length}`;

  const sortColumn = SORT_COLUMNS[sortBy] || SORT_COLUMNS.default;
  const sortDirection = order === 'asc' ? 'ASC' : 'DESC';

  const result = await db.query(
    `SELECT
       r.*,
       u.name AS uploader_name,
       COALESCE((SELECT COUNT(*)::int FROM resource_downloads d WHERE d.resource_id = r.res_id), 0) AS download_count,
       COALESCE((SELECT SUM(value)::int FROM resourcevote v WHERE v.res_id = r.res_id), 0) AS vote_tally,
       (SELECT value FROM resourcevote v2 WHERE v2.res_id = r.res_id AND v2.user_id = ${currentUserParam}) AS current_vote
     FROM resources r
     LEFT JOIN users u ON u.user_id = r.user_id
     ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection}`,
    values
  );

  return result.rows;
}

// Fetch a single resource by its ID, including its download count, vote
// tally, uploader's name, and (if a logged-in user is provided) that
// user's own current vote on this resource.
async function getResourceById(resId, currentUserId) {
  const result = await db.query(
    `SELECT
       r.*,
       u.name AS uploader_name,
       COALESCE((SELECT COUNT(*)::int FROM resource_downloads d WHERE d.resource_id = r.res_id), 0) AS download_count,
       COALESCE((SELECT SUM(value)::int FROM resourcevote v WHERE v.res_id = r.res_id), 0) AS vote_tally,
       (SELECT value FROM resourcevote v2 WHERE v2.res_id = r.res_id AND v2.user_id = $2) AS current_vote
     FROM resources r
     LEFT JOIN users u ON u.user_id = r.user_id
     WHERE r.res_id = $1`,
    [resId, currentUserId || null]
  );
  return result.rows[0] || null; // null if no row matched
}

// Insert a new resource row.
async function createResource({ title, type, courseCode, userId, filePath, parentResId = null }) {
  const result = await db.query(
    `INSERT INTO resources (title, type, course_code, user_id, file_path, parent_res_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [title, type, courseCode, userId, filePath, parentResId]
  );
  return result.rows[0];
}

// Delete a resource by ID. Returns the deleted row (or undefined if none matched),
// so the route can tell whether anything was actually deleted.
async function deleteResource(resId) {
  const result = await db.query(
    'DELETE FROM resources WHERE res_id = $1 RETURNING *',
    [resId]
  );
  return result.rows[0];
}

// Log a download event. Called every time someone downloads a resource,
// rather than incrementing a counter column — this way you also get a
// full history of who downloaded what and when.
// Log a download event. Called every time someone downloads a resource,
// rather than incrementing a counter column — this way you also get a
// full history of who downloaded what and when.
async function logDownload(resId, userId) {

  const result = await db.query(
    `INSERT INTO resource_downloads (resource_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (resource_id, user_id) DO NOTHING
     RETURNING *`,
    [resId, userId]
  );
  // Returns the newly inserted row, or null if the user already downloaded it
  return result.rows[0] || null;
}

// Count how many times a resource has been downloaded, by counting rows
// in resource_downloads rather than storing a running total anywhere.
async function getDownloadCount(resId) {
  const result = await db.query(
    'SELECT COUNT(*)::int AS download_count FROM resource_downloads WHERE resource_id = $1',
    [resId]
  );
  return result.rows[0].download_count;
}

// Insert a new vote, or update the existing one if this user already
// voted on this resource. A user can only have one vote per resource
// (see the resourcevote table's PRIMARY KEY (user_id, res_id)), so this
// uses an upsert instead of a plain INSERT, which would otherwise throw
// a duplicate-key error on a second vote.
// Insert a new vote, update an existing vote to a new value, or remove
// the vote entirely if the user submits the same value they already
// have (a "toggle off" — clicking upvote twice clears your vote).
async function upsertVote(resId, userId, value) {
  const existing = await db.query(
    'SELECT value FROM resourcevote WHERE user_id = $1 AND res_id = $2',
    [userId, resId]
  );

  // Same vote submitted again → remove it, effectively resetting to 0.
  if (existing.rows[0] && existing.rows[0].value === value) {
    await db.query(
      'DELETE FROM resourcevote WHERE user_id = $1 AND res_id = $2',
      [userId, resId]
    );
    return null; // signals to the route that the vote was cleared
  }

  // New vote, or switching from one value to the other → upsert.
  const result = await db.query(
    `INSERT INTO resourcevote (user_id, res_id, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, res_id)
     DO UPDATE SET value = EXCLUDED.value
     RETURNING *`,
    [userId, resId, value]
  );
  return result.rows[0];
}

// Sum all vote values for a resource (+1s and -1s) into a single tally.
// COALESCE handles the case where a resource has zero votes, where
// SUM() would otherwise return null instead of 0.
async function getVoteTally(resId) {
  const result = await db.query(
    'SELECT COALESCE(SUM(value), 0)::int AS vote_tally FROM resourcevote WHERE res_id = $1',
    [resId]
  );
  return result.rows[0].vote_tally;
}

// Remove a user's vote entirely (e.g. if they click the same vote button
// twice to "unvote" rather than switching from up to down).
async function deleteVote(resId, userId) {
  const result = await db.query(
    'DELETE FROM resourcevote WHERE user_id = $1 AND res_id = $2 RETURNING *',
    [userId, resId]
  );
  return result.rows[0];
}

// Walk UP the parent_res_id chain starting from the given resource,
// returning every ancestor version (the given resource itself is NOT
// included, since the caller already has it). A recursive CTE follows
// parent_res_id → parent_res_id → ... until it hits a resource whose
// parent_res_id is NULL (the original/root upload).
async function getVersionHistory(resId) {
  const result = await db.query(
    `WITH RECURSIVE version_chain AS (
       SELECT * FROM resources WHERE res_id = $1
       UNION ALL
       SELECT r.*
       FROM resources r
       JOIN version_chain vc ON r.res_id = vc.parent_res_id
     )
     SELECT * FROM version_chain
     WHERE res_id != $1
     ORDER BY version DESC`,
    [resId]
  );
  return result.rows;
}

module.exports = {
  getResources,
  getResourceById,
  createResource,
  deleteResource,
  logDownload,
  getDownloadCount,
  upsertVote,
  getVoteTally,
  deleteVote,
  getVersionHistory
};