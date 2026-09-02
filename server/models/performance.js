const db = require('../db');

// Terms are stored on courses as values such as "1-1" and "2-1".
// Sorting both numeric parts keeps 10-1 from appearing before 2-1.
async function getAvailableTerms() {
  const result = await db.query(
    `SELECT DISTINCT level_term
     FROM courses
     WHERE level_term ~ '^[0-9]+-[0-9]+$'
       AND archived_at IS NULL
     ORDER BY
       split_part(level_term, '-', 1)::integer,
       split_part(level_term, '-', 2)::integer`
  );

  return result.rows.map((row) => row.level_term);
}

// Returns every course in one term. A LEFT JOIN keeps courses visible even
// before the current student has entered a grade point for them.
async function getTermCourses(userId, levelTerm) {
  const result = await db.query(
    `SELECT
       c.course_code,
       c.title,
       c.credits,
       c.level_term,
       ucp.grade_point
     FROM courses c
     LEFT JOIN user_course_performance ucp
       ON ucp.course_code = c.course_code
      AND ucp.user_id = $1
     WHERE c.level_term = $2
       AND c.archived_at IS NULL
     ORDER BY c.course_code`,
    [userId, levelTerm]
  );

  return result.rows;
}

// A BUET term GPA is credit-weighted, not a simple average of grade points.
async function getTermSummary(userId, levelTerm) {
  const result = await db.query(
    `SELECT
       COUNT(*)::integer AS recorded_courses,
       COALESCE(SUM(c.credits), 0)::numeric AS recorded_credits,
       ROUND(
         SUM(ucp.grade_point * c.credits) /
         NULLIF(SUM(c.credits), 0),
         2
       ) AS term_gpa
     FROM user_course_performance ucp
     JOIN courses c ON c.course_code = ucp.course_code
     WHERE ucp.user_id = $1
       AND c.level_term = $2`,
    [userId, levelTerm]
  );

  return result.rows[0];
}

async function saveCoursePerformance(userId, courseCode, gradePoint) {
  const result = await db.query(
    `INSERT INTO user_course_performance (user_id, course_code, grade_point)
     SELECT $1, c.course_code, $3
     FROM courses c
     WHERE c.course_code = $2
       AND c.archived_at IS NULL
     ON CONFLICT (user_id, course_code)
     DO UPDATE SET grade_point = EXCLUDED.grade_point
     RETURNING user_id, course_code, grade_point`,
    [userId, courseCode, gradePoint]
  );

  return result.rows[0] || null;
}

async function deleteCoursePerformance(userId, courseCode) {
  const result = await db.query(
    `DELETE FROM user_course_performance
     WHERE user_id = $1 AND course_code = $2
     RETURNING user_id, course_code, grade_point`,
    [userId, courseCode]
  );

  return result.rows[0] || null;
}

async function getUserBatch(userId) {
  const result = await db.query(
    `SELECT batch
     FROM users
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  return result.rows[0]?.batch || null;
}

// Batch statistics are anonymous aggregates. Each student's term GPA is
// calculated first, then those GPAs are aggregated, so students with more
// recorded courses do not receive extra weight in the batch average.
async function getBatchSummary(batch, levelTerm) {
  const result = await db.query(
    `WITH student_term_results AS (
       SELECT
         u.user_id,
         COUNT(*)::integer AS recorded_courses,
         SUM(c.credits)::numeric AS recorded_credits,
         SUM(ucp.grade_point * c.credits) /
           NULLIF(SUM(c.credits), 0) AS term_gpa
       FROM users u
       JOIN user_course_performance ucp ON ucp.user_id = u.user_id
       JOIN courses c ON c.course_code = ucp.course_code
       WHERE u.batch = $1
         AND u.role = 'student'
         AND u.deleted_at IS NULL
         AND c.level_term = $2
       GROUP BY u.user_id
     ),
     batch_size AS (
       SELECT COUNT(*)::integer AS total_students
       FROM users
       WHERE batch = $1
         AND role = 'student'
         AND deleted_at IS NULL
     )
     SELECT
       bs.total_students,
       COUNT(str.user_id)::integer AS students_with_data,
       ROUND(AVG(str.term_gpa), 2) AS batch_average_gpa,
       ROUND(MAX(str.term_gpa), 2) AS highest_gpa,
       ROUND(MIN(str.term_gpa), 2) AS lowest_gpa
     FROM batch_size bs
     LEFT JOIN student_term_results str ON TRUE
     GROUP BY bs.total_students`,
    [batch, levelTerm]
  );

  return result.rows[0];
}

async function getBatchCourseStats(batch, levelTerm) {
  const result = await db.query(
    `SELECT
       c.course_code,
       c.title,
       c.credits,
       COUNT(ucp.user_id) FILTER (WHERE u.user_id IS NOT NULL)::integer AS submitted_students,
       ROUND(AVG(ucp.grade_point) FILTER (WHERE u.user_id IS NOT NULL), 2) AS average_grade_point,
       MAX(ucp.grade_point) FILTER (WHERE u.user_id IS NOT NULL) AS highest_grade_point,
       MIN(ucp.grade_point) FILTER (WHERE u.user_id IS NOT NULL) AS lowest_grade_point
     FROM courses c
     LEFT JOIN user_course_performance ucp
       ON ucp.course_code = c.course_code
     LEFT JOIN users u
       ON u.user_id = ucp.user_id
      AND u.batch = $1
      AND u.role = 'student'
      AND u.deleted_at IS NULL
     WHERE c.level_term = $2
       AND c.archived_at IS NULL
     GROUP BY c.course_code, c.title, c.credits
     ORDER BY c.course_code`,
    [batch, levelTerm]
  );

  return result.rows;
}

module.exports = {
  getAvailableTerms,
  getTermCourses,
  getTermSummary,
  saveCoursePerformance,
  deleteCoursePerformance,
  getUserBatch,
  getBatchSummary,
  getBatchCourseStats
};
