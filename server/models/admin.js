const db = require('../db');

const BATCH_PROGRESS_SELECT = `
  SELECT
    bp.batch_year,
    bp.dept_code,
    d.dept_name,
    bp.curriculum_id,
    cu.name AS curriculum_name,
    cu.curriculum_version,
    bp.current_term_code,
    current_term.display_name AS current_term_label,
    bp.latest_completed_term_code,
    completed_term.display_name AS latest_completed_term_label,
    bp.updated_at,
    updater.user_id AS updated_by_user_id,
    updater.name AS updated_by_name,
    COUNT(student.user_id)::integer AS active_student_count,
    latest_event.batch_progress_history_id AS latest_event_id,
    latest_event.advanced_at AS latest_event_at,
    latest_event.reason AS latest_event_reason,
    latest_event.notifications_created AS latest_event_notifications_created
  FROM batch_progress bp
  JOIN departments d ON d.dept_code = bp.dept_code
  JOIN curricula cu ON cu.curriculum_id = bp.curriculum_id
  LEFT JOIN academic_terms current_term ON current_term.term_code = bp.current_term_code
  LEFT JOIN academic_terms completed_term ON completed_term.term_code = bp.latest_completed_term_code
  LEFT JOIN users updater ON updater.user_id = bp.updated_by_user_id
  LEFT JOIN users student
    ON student.batch = bp.batch_year
   AND student.dept_code = bp.dept_code
   AND student.role = 'student'
   AND student.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT
      history.batch_progress_history_id,
      history.advanced_at,
      history.reason,
      history.notifications_created
    FROM batch_progress_history history
    WHERE history.batch_year = bp.batch_year
      AND history.dept_code = bp.dept_code
    ORDER BY history.advanced_at DESC, history.batch_progress_history_id DESC
    LIMIT 1
  ) latest_event ON TRUE
`;

const BATCH_PROGRESS_GROUP_BY = `
  GROUP BY
    bp.batch_year, bp.dept_code, d.dept_name, bp.curriculum_id,
    cu.name, cu.curriculum_version, bp.current_term_code,
    current_term.display_name, bp.latest_completed_term_code,
    completed_term.display_name, bp.updated_at, updater.user_id, updater.name,
    latest_event.batch_progress_history_id, latest_event.advanced_at,
    latest_event.reason, latest_event.notifications_created
`;

async function listBatchProgress(deptCode) {
  const result = await db.query(
    `${BATCH_PROGRESS_SELECT}
     WHERE ($1::character varying IS NULL OR bp.dept_code = $1)
     ${BATCH_PROGRESS_GROUP_BY}
     ORDER BY bp.batch_year DESC, bp.dept_code`,
    [deptCode || null]
  );

  return result.rows;
}

async function getBatchProgress(client, batchYear, deptCode) {
  const result = await client.query(
    `${BATCH_PROGRESS_SELECT}
     WHERE bp.batch_year = $1 AND bp.dept_code = $2
     ${BATCH_PROGRESS_GROUP_BY}`,
    [batchYear, deptCode]
  );

  return result.rows[0] || null;
}

async function getBatchProgressHistory(batchYear, deptCode) {
  const result = await db.query(
    `SELECT
       history.batch_progress_history_id,
       history.request_id,
       history.previous_current_term_code,
       history.previous_latest_completed_term_code,
       history.new_current_term_code,
       history.new_latest_completed_term_code,
       history.reason,
       history.notifications_created,
       history.advanced_at,
       actor.user_id AS advanced_by_user_id,
       actor.name AS advanced_by_name
     FROM batch_progress_history history
     JOIN users actor ON actor.user_id = history.advanced_by_user_id
     WHERE history.batch_year = $1
       AND history.dept_code = $2
     ORDER BY history.advanced_at DESC, history.batch_progress_history_id DESC
     LIMIT 20`,
    [batchYear, deptCode]
  );

  return result.rows;
}

async function advanceBatchProgress({
  actorUserId,
  batchYear,
  deptCode,
  expectedCurrentTermCode,
  reason,
  requestId
}) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const procedureResult = await client.query(
      `CALL public.advance_batch_progress(
        $1, $2, $3, $4, $5, $6,
        NULL, NULL, NULL, NULL, NULL
      )`,
      [actorUserId, batchYear, deptCode, expectedCurrentTermCode, reason, requestId]
    );

    const progress = await getBatchProgress(client, batchYear, deptCode);
    const event = await client.query(
      `SELECT
         batch_progress_history_id,
         previous_current_term_code,
         previous_latest_completed_term_code,
         new_current_term_code,
         new_latest_completed_term_code,
         reason,
         notifications_created,
         advanced_at
       FROM batch_progress_history
       WHERE batch_progress_history_id = $1`,
      [procedureResult.rows[0].o_history_id]
    );

    await client.query('COMMIT');

    return {
      procedure: procedureResult.rows[0],
      progress,
      event: event.rows[0]
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error rolling back batch-progress transaction:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listBatchProgress,
  getBatchProgressHistory,
  advanceBatchProgress
};
