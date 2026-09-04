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

async function listModerationQueue() {
  const [reports, resources] = await Promise.all([
    db.query(
      `SELECT
         r.report_id, r.target_type, r.target_id, r.reason, r.created_at,
         reporter.name AS reporter_name,
         COALESCE(cr.comment, resource.title, '[Removed content]') AS target_preview,
         COALESCE(cr.course_code, resource.course_code) AS course_code
       FROM reports r
       JOIN users reporter ON reporter.user_id = r.reporter_user_id
       LEFT JOIN coursereview cr ON r.target_type = 'coursereview' AND cr.review_id = r.target_id
       LEFT JOIN resources resource ON r.target_type = 'resource' AND resource.res_id = r.target_id
       WHERE r.status = 'pending'
       ORDER BY r.report_id DESC
       LIMIT 50`
    ),
    db.query(
      `SELECT
         resource.res_id, resource.title, resource.type, resource.course_code,
         resource.created_at, resource.approval_status, uploader.name AS uploader_name
       FROM resources resource
       JOIN users uploader ON uploader.user_id = resource.user_id
       WHERE resource.approval_status = 'pending'
       ORDER BY resource.res_id DESC
       LIMIT 50`
    )
  ]);

  return { reports: reports.rows, resources: resources.rows };
}

async function resolveReport({ reportId, status, resolutionNote, actorUserId }) {
  const result = await db.query(
    `UPDATE reports
     SET status = $2,
         resolution_note = $3,
         reviewed_by_user_id = $4,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE report_id = $1 AND status = 'pending'
     RETURNING report_id, status, resolution_note, reviewed_at`,
    [reportId, status, resolutionNote || null, actorUserId]
  );
  return result.rows[0] || null;
}

async function moderateResource({ resourceId, approvalStatus, moderationNote, actorUserId }) {
  const result = await db.query(
    `UPDATE resources
     SET approval_status = $2,
         moderation_note = $3,
         moderated_by_user_id = $4,
         moderated_at = CURRENT_TIMESTAMP
     WHERE res_id = $1 AND approval_status = 'pending'
     RETURNING res_id, approval_status, moderation_note, moderated_at`,
    [resourceId, approvalStatus, moderationNote || null, actorUserId]
  );
  return result.rows[0] || null;
}

module.exports = {
  listBatchProgress,
  getBatchProgressHistory,
  advanceBatchProgress,
  listModerationQueue,
  resolveReport,
  moderateResource
};
