const db = require('../db');

// Terms are stored on courses as values such as "1-1" and "2-1".
// Sorting both numeric parts keeps 10-1 from appearing before 2-1.
async function getAvailableTerms() {
  const result = await db.query(
    `SELECT level_term
     FROM (
       SELECT DISTINCT level_term
       FROM courses
       WHERE level_term ~ '^[0-9]+-[0-9]+$'
         AND archived_at IS NULL
     ) AS available_terms
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
       AND c.level_term = $2
       AND c.archived_at IS NULL`,
    [userId, levelTerm]
  );

  return result.rows[0];
}

async function saveCoursePerformance(userId, courseCode, levelTerm, gradePoint) {
  const result = await db.query(
    `INSERT INTO user_course_performance (user_id, course_code, grade_point)
     SELECT $1, c.course_code, $4
     FROM courses c
     WHERE c.course_code = $2
       AND c.level_term = $3
       AND c.archived_at IS NULL
     ON CONFLICT (user_id, course_code)
     DO UPDATE SET grade_point = EXCLUDED.grade_point
     RETURNING user_id, course_code, grade_point`,
    [userId, courseCode, levelTerm, gradePoint]
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

async function getActiveUser(userId) {
  const result = await db.query(
    `SELECT user_id, batch, role
     FROM users
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  return result.rows[0] || null;
}

// Batch statistics are based only on complete term results. If a student has
// entered only one or two courses, that partial snapshot must not affect the
// batch's term GPA, highest GPA, or lowest GPA.
async function getBatchSummary(batch, levelTerm) {
  const result = await db.query(
    `WITH term_courses AS (
       SELECT course_code
       FROM courses
       WHERE level_term = $2
         AND archived_at IS NULL
     ),
     term_course_count AS (
       SELECT COUNT(*)::integer AS expected_courses FROM term_courses
     ),
     student_term_results AS (
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
         AND c.archived_at IS NULL
       GROUP BY u.user_id
     ),
     complete_term_results AS (
       SELECT str.*
       FROM student_term_results str
       CROSS JOIN term_course_count tcc
       WHERE tcc.expected_courses > 0
         AND str.recorded_courses = tcc.expected_courses
     ),
     batch_size AS (
       SELECT COUNT(*)::integer AS total_students
       FROM users
       WHERE batch = $1
         AND role = 'student'
         AND deleted_at IS NULL
     ),
     data_coverage AS (
       SELECT COUNT(*)::integer AS students_with_any_data
       FROM student_term_results
     ),
     complete_aggregate AS (
       SELECT
         COUNT(*)::integer AS completed_students,
         ROUND(AVG(term_gpa), 2) AS batch_average_gpa,
         ROUND(MAX(term_gpa), 2) AS highest_gpa,
         ROUND(MIN(term_gpa), 2) AS lowest_gpa
       FROM complete_term_results
     )
     SELECT
       bs.total_students,
       tcc.expected_courses,
       dc.students_with_any_data,
       ca.completed_students,
       ca.batch_average_gpa,
       ca.highest_gpa,
       ca.lowest_gpa
     FROM batch_size bs
     CROSS JOIN term_course_count tcc
     CROSS JOIN data_coverage dc
     CROSS JOIN complete_aggregate ca`,
    [batch, levelTerm]
  );

  return result.rows[0];
}

async function getBatchCourseStats(batch, levelTerm) {
  const result = await db.query(
    `WITH term_courses AS (
       SELECT course_code, title, credits
       FROM courses
       WHERE level_term = $2
         AND archived_at IS NULL
     ),
     complete_students AS (
       SELECT u.user_id
       FROM users u
       JOIN user_course_performance ucp ON ucp.user_id = u.user_id
       JOIN term_courses tc ON tc.course_code = ucp.course_code
       WHERE u.batch = $1
         AND u.role = 'student'
         AND u.deleted_at IS NULL
       GROUP BY u.user_id
       HAVING COUNT(*) = (SELECT COUNT(*) FROM term_courses)
     ),
     complete_results AS (
       SELECT ucp.user_id, ucp.course_code, ucp.grade_point
       FROM user_course_performance ucp
       JOIN complete_students cs ON cs.user_id = ucp.user_id
     )
     SELECT
       c.course_code,
       c.title,
       c.credits,
       COUNT(cr.user_id)::integer AS submitted_students,
       ROUND(AVG(cr.grade_point), 2) AS average_grade_point,
       MAX(cr.grade_point) AS highest_grade_point,
       MIN(cr.grade_point) AS lowest_grade_point
     FROM term_courses c
     LEFT JOIN complete_results cr ON cr.course_code = c.course_code
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
  getActiveUser,
  getBatchSummary,
  getBatchCourseStats
};
