const db = require('../db');

async function getActiveUser(userId) {
  const result = await db.query(
    `SELECT user_id, batch, dept_code, role
     FROM users
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  return result.rows[0] || null;
}

// Returns the administrator-controlled curriculum and term boundary for one
// student. It deliberately does not infer progress from today's date.
async function getStudentProgress(userId) {
  const result = await db.query(
    `SELECT
       bp.batch_year,
       bp.dept_code,
       bp.curriculum_id,
       bp.current_term_code,
       bp.latest_completed_term_code
     FROM users u
     JOIN batch_progress bp
       ON bp.batch_year = u.batch
      AND bp.dept_code = u.dept_code
     WHERE u.user_id = $1
       AND u.deleted_at IS NULL`,
    [userId]
  );

  return result.rows[0] || null;
}

// Only terms actually in this student's curriculum and marked completed for
// the batch are selectable. courses.level_term is intentionally not used.
async function getStudentAvailableTerms(userId) {
  const result = await db.query(
    `SELECT DISTINCT
       at.term_code,
       at.display_name,
       at.term_order
     FROM users u
     JOIN batch_progress bp
       ON bp.batch_year = u.batch
      AND bp.dept_code = u.dept_code
     JOIN academic_terms latest
       ON latest.term_code = bp.latest_completed_term_code
     JOIN curriculum_courses cc
       ON cc.curriculum_id = bp.curriculum_id
      AND cc.is_required
     JOIN academic_terms at ON at.term_code = cc.term_code
     JOIN courses c ON c.course_code = cc.course_code
     WHERE u.user_id = $1
       AND u.deleted_at IS NULL
       AND c.archived_at IS NULL
       AND at.term_order <= latest.term_order
     ORDER BY at.term_order`,
    [userId]
  );

  return result.rows;
}

async function getStudentTermCourses(userId, termCode) {
  const result = await db.query(
    `SELECT
       cc.curriculum_course_id,
       cc.course_code,
       c.title,
       cc.credits_at_placement AS credits,
       cc.course_type,
       ucp.grade_point,
       ucp.updated_at
     FROM users u
     JOIN batch_progress bp
       ON bp.batch_year = u.batch
      AND bp.dept_code = u.dept_code
     JOIN academic_terms latest
       ON latest.term_code = bp.latest_completed_term_code
     JOIN academic_terms selected ON selected.term_code = $2
     JOIN curriculum_courses cc
       ON cc.curriculum_id = bp.curriculum_id
      AND cc.term_code = selected.term_code
      AND cc.is_required
     JOIN courses c
       ON c.course_code = cc.course_code
      AND c.archived_at IS NULL
     LEFT JOIN user_course_performance ucp
       ON ucp.user_id = u.user_id
      AND ucp.curriculum_course_id = cc.curriculum_course_id
     WHERE u.user_id = $1
       AND u.deleted_at IS NULL
       AND selected.term_order <= latest.term_order
     ORDER BY cc.course_code, cc.curriculum_course_id`,
    [userId, termCode]
  );

  return result.rows;
}

function summarizeStudentTerm(courses) {
  const recorded = courses.filter((course) => course.grade_point !== null && course.grade_point !== undefined);
  const recordedCredits = recorded.reduce((sum, course) => sum + Number(course.credits), 0);
  const weightedPoints = recorded.reduce(
    (sum, course) => sum + (Number(course.grade_point) * Number(course.credits)),
    0
  );

  return {
    expected_courses: courses.length,
    expected_credits: courses.reduce((sum, course) => sum + Number(course.credits), 0).toFixed(2),
    recorded_courses: recorded.length,
    recorded_credits: recordedCredits.toFixed(2),
    term_gpa: recordedCredits ? (weightedPoints / recordedCredits).toFixed(2) : null,
    is_complete: courses.length > 0 && recorded.length === courses.length
  };
}

async function getEditablePlacement(userId, curriculumCourseId) {
  const result = await db.query(
    `SELECT
       cc.curriculum_course_id,
       cc.course_code,
       cc.term_code
     FROM users u
     JOIN batch_progress bp
       ON bp.batch_year = u.batch
      AND bp.dept_code = u.dept_code
     JOIN academic_terms latest ON latest.term_code = bp.latest_completed_term_code
     JOIN curriculum_courses cc
       ON cc.curriculum_id = bp.curriculum_id
      AND cc.curriculum_course_id = $2
      AND cc.is_required
     JOIN academic_terms at ON at.term_code = cc.term_code
     JOIN courses c ON c.course_code = cc.course_code
     WHERE u.user_id = $1
       AND u.deleted_at IS NULL
       AND c.archived_at IS NULL
       AND at.term_order <= latest.term_order`,
    [userId, curriculumCourseId]
  );

  return result.rows[0] || null;
}

async function saveCoursePerformance(userId, curriculumCourseId, gradePoint) {
  // 1. We must fetch the course_code first because your PostgreSQL trigger 
  // explicitly requires NEW.course_code to validate the placement!
  const courseRes = await db.query(
    `SELECT course_code FROM curriculum_courses WHERE curriculum_course_id = $1`,
    [curriculumCourseId]
  );
  
  if (courseRes.rows.length === 0) {
    throw new Error("Invalid curriculum course placement.");
  }
  
  const courseCode = courseRes.rows[0].course_code;

  // 2. Insert the data, including the fetched course_code. 
  // We also explicitly set updated_at = CURRENT_TIMESTAMP on conflict so 
  // the timestamp correctly updates if a user overrides an existing grade.
  const result = await db.query(
    `INSERT INTO user_course_performance (user_id, curriculum_course_id, course_code, grade_point)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, curriculum_course_id)
     DO UPDATE SET 
        grade_point = EXCLUDED.grade_point, 
        course_code = EXCLUDED.course_code,
        updated_at = CURRENT_TIMESTAMP
     RETURNING user_id, curriculum_course_id, course_code, grade_point, updated_at`,
    [userId, curriculumCourseId, courseCode, gradePoint]
  );

  return result.rows[0];
}

async function deleteCoursePerformance(userId, curriculumCourseId) {
  const result = await db.query(
    `DELETE FROM user_course_performance
     WHERE user_id = $1
       AND curriculum_course_id = $2
     RETURNING user_id, curriculum_course_id, grade_point`,
    [userId, curriculumCourseId]
  );

  return result.rows[0] || null;
}

async function listConfiguredBatches(deptCode) {
  const result = await db.query(
    `SELECT
       bp.batch_year,
       bp.dept_code,
       d.dept_name,
       bp.current_term_code,
       bp.latest_completed_term_code
     FROM batch_progress bp
     JOIN departments d ON d.dept_code = bp.dept_code
     WHERE bp.dept_code = $1
     ORDER BY bp.batch_year DESC`,
    [deptCode]
  );

  return result.rows;
}

async function getBatchTerms(batchYear, deptCode) {
  const result = await db.query(
    `SELECT DISTINCT at.term_code, at.display_name, at.term_order
     FROM batch_progress bp
     JOIN academic_terms latest ON latest.term_code = bp.latest_completed_term_code
     JOIN curriculum_courses cc
       ON cc.curriculum_id = bp.curriculum_id
      AND cc.is_required
     JOIN academic_terms at ON at.term_code = cc.term_code
     JOIN courses c ON c.course_code = cc.course_code
     WHERE bp.batch_year = $1
       AND bp.dept_code = $2
       AND c.archived_at IS NULL
       AND at.term_order <= latest.term_order
     ORDER BY at.term_order`,
    [batchYear, deptCode]
  );

  return result.rows;
}

async function getBatchContext(batchYear, deptCode) {
  const result = await db.query(
    `SELECT batch_year, dept_code, curriculum_id, current_term_code, latest_completed_term_code
     FROM batch_progress
     WHERE batch_year = $1 AND dept_code = $2`,
    [batchYear, deptCode]
  );

  return result.rows[0] || null;
}

async function getBatchSummary(batchYear, deptCode, termCode, minimumCohort) {
  const result = await db.query(
    `SELECT * FROM get_batch_term_summary($1, $2, $3, $4)`,
    [batchYear, deptCode, termCode, minimumCohort]
  );

  return result.rows[0] || null;
}

async function getBatchCourseStats(batchYear, deptCode, termCode, minimumCohort) {
  const result = await db.query(
    `SELECT * FROM get_batch_term_course_stats($1, $2, $3, $4)`,
    [batchYear, deptCode, termCode, minimumCohort]
  );

  return result.rows;
}

module.exports = {
  getActiveUser,
  getStudentProgress,
  getStudentAvailableTerms,
  getStudentTermCourses,
  summarizeStudentTerm,
  getEditablePlacement,
  saveCoursePerformance,
  deleteCoursePerformance,
  listConfiguredBatches,
  getBatchTerms,
  getBatchContext,
  getBatchSummary,
  getBatchCourseStats
};
