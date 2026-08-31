const db = require('../db');

// Only these exact column expressions are allowed into ORDER BY — user
// input can never be interpolated directly into a SQL clause safely,
// even parameterized queries can't parameterize column names, so we
// map incoming values through this whitelist instead.
const COURSE_SORT_COLUMNS = {
  rating: 'avg_prereq_use',
  difficulty: 'avg_difficulty',
  name: 'c.title'
};

// ---------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------

// Fetch all departments, used to populate the "All Departments" filter.
async function getDepartments() {
  const result = await db.query(
    'SELECT dept_code, dept_name FROM departments ORDER BY dept_name ASC'
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------

// Fetch courses, optionally filtered by a free-text search (matched
// against course_code and title) and/or a department code, with
// aggregated avg_difficulty and avg_prereq_use pulled from coursereviews.
// Even though the WHERE clause is built dynamically depending on which
// filters are present, the actual values are still passed separately
// as parameters ($1, $2, ...) — never concatenated into the SQL string.
async function getCourses({ search, deptCode, sortBy = 'rating', order = 'desc' } = {}) {
  const conditions = [];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    conditions.push(`(c.course_code ILIKE ${p} OR c.title ILIKE ${p})`);
  }

  if (deptCode) {
    values.push(deptCode);
    conditions.push(`c.dept_code = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortColumn = COURSE_SORT_COLUMNS[sortBy] || COURSE_SORT_COLUMNS.rating;
  const sortDirection = order === 'asc' ? 'ASC' : 'DESC';

  const result = await db.query(
    `SELECT
       c.course_code,
       c.title,
       c.dept_code,
       ROUND(AVG(cr.difficulty)::numeric, 2) AS avg_difficulty,
       ROUND(AVG(cr.prereq_use)::numeric, 2) AS avg_prereq_use
     FROM courses c
     LEFT JOIN coursereviews cr ON cr.course_code = c.course_code
     ${whereClause}
     GROUP BY c.course_code, c.title, c.dept_code
     ORDER BY ${sortColumn} ${sortDirection} NULLS LAST`,
    values
  );

  return result.rows;
}

// Fetch the offerings (teacher/semester pairs) available for a course,
// used to populate the "Select Teacher" dropdown in the review form.
async function getCourseOfferings(courseCode) {
  const result = await db.query(
    `SELECT offering_id, teacher_name, semester
     FROM course_offerings
     WHERE course_code = $1
     ORDER BY semester DESC, teacher_name ASC`,
    [courseCode]
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------

// Fetch all reviews for a course, including uploader name, offering
// details, vote tally, and (if a logged-in user is provided) that
// user's own current vote on each review.
async function getCourseReviews(courseCode, currentUserId) {
  const result = await db.query(
    `SELECT
       cr.*,
       u.name AS user_name,
       co.teacher_name,
       co.semester,
       COALESCE((SELECT SUM(value)::int FROM coursereviewvote v WHERE v.review_id = cr.review_id), 0) AS vote_tally,
       (SELECT value FROM coursereviewvote v2 WHERE v2.review_id = cr.review_id AND v2.user_id = $2) AS current_vote
     FROM coursereviews cr
     LEFT JOIN users u ON u.user_id = cr.user_id
     LEFT JOIN course_offerings co ON co.offering_id = cr.offering_id
     WHERE cr.course_code = $1
     ORDER BY cr.review_id DESC`,
    [courseCode, currentUserId || null]
  );
  return result.rows;
}

// Fetch a single review by ID (used for ownership checks before
// update/delete/report).
async function getReviewById(reviewId) {
  const result = await db.query(
    'SELECT * FROM coursereviews WHERE review_id = $1',
    [reviewId]
  );
  return result.rows[0] || null;
}

// Insert a new review row.
async function createReview({ courseCode, offeringId = null, userId, difficulty, prereqUse, comment, filePath = null }) {
  const result = await db.query(
    `INSERT INTO coursereviews (course_code, offering_id, user_id, difficulty, prereq_use, comment, file_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [courseCode, offeringId, userId, difficulty, prereqUse, comment, filePath]
  );
  return result.rows[0];
}

// Update an existing review. `fields` is a partial object — only the
// keys present are updated, everything else keeps its current value.
// Column names come only from the fixed map below (never from the
// caller directly), so this stays safe from SQL injection the same
// way the sort-column whitelist does above.
async function updateReview(reviewId, fields = {}) {
  const COLUMN_MAP = {
    difficulty: 'difficulty',
    prereqUse: 'prereq_use',
    comment: 'comment',
    filePath: 'file_path'
  };

  const setClauses = [];
  const values = [];

  for (const [key, column] of Object.entries(COLUMN_MAP)) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) {
    // Nothing to update — just return the row as-is.
    return getReviewById(reviewId);
  }

  values.push(reviewId);
  const result = await db.query(
    `UPDATE coursereviews
     SET ${setClauses.join(', ')}
     WHERE review_id = $${values.length}
     RETURNING *`,
    values
  );
  return result.rows[0];
}

// Delete a review by ID. Returns the deleted row (or undefined if none
// matched), so the route can tell whether anything was actually deleted.
async function deleteReview(reviewId) {
  const result = await db.query(
    'DELETE FROM coursereviews WHERE review_id = $1 RETURNING *',
    [reviewId]
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------
// Review votes
// ---------------------------------------------------------------------

// Insert a new vote, update an existing vote to a new value, or remove
// the vote entirely if the user submits the same value they already
// have (a "toggle off" — clicking upvote twice clears your vote). Mirrors
// upsertVote in models/resources.js, scoped to coursereviewvote instead.
async function upsertReviewVote(reviewId, userId, value) {
  const existing = await db.query(
    'SELECT value FROM coursereviewvote WHERE user_id = $1 AND review_id = $2',
    [userId, reviewId]
  );

  // Same vote submitted again → remove it, effectively resetting to 0.
  if (existing.rows[0] && existing.rows[0].value === value) {
    await db.query(
      'DELETE FROM coursereviewvote WHERE user_id = $1 AND review_id = $2',
      [userId, reviewId]
    );
    return null; // signals to the route that the vote was cleared
  }

  // New vote, or switching from one value to the other → upsert.
  const result = await db.query(
    `INSERT INTO coursereviewvote (user_id, review_id, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, review_id)
     DO UPDATE SET value = EXCLUDED.value
     RETURNING *`,
    [userId, reviewId, value]
  );
  return result.rows[0];
}

// Sum all vote values for a review (+1s and -1s) into a single tally.
// COALESCE handles the case where a review has zero votes, where SUM()
// would otherwise return null instead of 0.
async function getReviewVoteTally(reviewId) {
  const result = await db.query(
    'SELECT COALESCE(SUM(value), 0)::int AS vote_tally FROM coursereviewvote WHERE review_id = $1',
    [reviewId]
  );
  return result.rows[0].vote_tally;
}

// Remove a user's vote entirely (separate from the toggle-off behavior
// already built into upsertReviewVote).
async function deleteReviewVote(reviewId, userId) {
  const result = await db.query(
    'DELETE FROM coursereviewvote WHERE user_id = $1 AND review_id = $2 RETURNING *',
    [userId, reviewId]
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

// Insert a moderation report against a review (or any other target_type
// the reports table is set up to accept).
async function createReport({ targetType, targetId, reporterId, reason }) {
  const result = await db.query(
    `INSERT INTO reports (target_type, target_id, reporter_id, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [targetType, targetId, reporterId, reason]
  );
  return result.rows[0];
}

module.exports = {
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
  deleteReviewVote,
  createReport
};