/*
 * Development-only demo data for AcademicOS.
 *
 * Safe to re-run: it refreshes only records owned by @demo.academicos.com
 * accounts. It never changes a real user's profile, grades, or reviews.
 *
 * PowerShell:
 *   $env:DEMO_PASSWORD = 'choose-a-temporary-password'
 *   node scripts/seedDemoData.js
 */

const bcrypt = require('bcryptjs');
const db = require('../db');

const DEMO_DOMAIN = '@demo.academicos.com';
const LEGACY_DEMO_DOMAIN = '@demo.academicos.local';
const CSE_DEPARTMENT = '5';

const batchSeeds = [
  { batch: '2024', currentTerm: '2-1', latestCompletedTerm: '1-2' },
  { batch: '2023', currentTerm: '2-2', latestCompletedTerm: '2-1' },
  { batch: '2022', currentTerm: '3-1', latestCompletedTerm: '2-2' },
];

const studentNames = [
  'Anika Rahman', 'Rafi Hasan', 'Nusrat Jahan', 'Siam Ahmed',
  'Mahi Sultana', 'Fahim Islam', 'Tanjim Karim', 'Sadia Noor',
];

// Version 1 of this seeder did not put a batch in the student email.
// These exact addresses are retired so re-running the script stays tidy.
const legacyUnbatchedStudentEmails = studentNames.map(
  (name) => `${name.toLowerCase().replaceAll(' ', '.')}${DEMO_DOMAIN}`
);

function makeStudentAccounts(batch) {
  return studentNames.map((name, index) => {
    const localPart = name.toLowerCase().replaceAll(' ', '.');
    return {
      name: `${name} (CSE ${batch})`,
      email: `${localPart}.${batch}${DEMO_DOMAIN}`,
      role: 'student',
      batch,
      studentIndex: index,
    };
  });
}

const demoAccounts = [
  ...batchSeeds.flatMap((batch) => makeStudentAccounts(batch.batch)),
  { name: 'Demo Admin', email: 'admin@demo.academicos.com', role: 'admin' },
  { name: 'Demo Moderator', email: 'moderator@demo.academicos.com', role: 'moderator' },
];

const teacherSeeds = [
  { key: 'farzana', name: '[Demo] Dr. Farzana Islam', designation: 'Associate Professor' },
  { key: 'mahfuz', name: '[Demo] Dr. Mahfuz Rahman', designation: 'Assistant Professor' },
  { key: 'sadia', name: '[Demo] Dr. Sadia Chowdhury', designation: 'Professor' },
  { key: 'tamim', name: '[Demo] Md. Tamim Hossain', designation: 'Lecturer' },
];

const offeringSeeds = [
  { courseCode: 'CSE205', teacherKey: 'farzana' },
  { courseCode: 'CSE207', teacherKey: 'mahfuz' },
  { courseCode: 'CSE215', teacherKey: 'sadia' },
  { courseCode: 'CSE216', teacherKey: 'tamim' },
];

const topicSeeds = [
  { courseCode: 'CSE205', name: 'Karnaugh maps' },
  { courseCode: 'CSE205', name: 'Finite state machines' },
  { courseCode: 'CSE207', name: 'Graph algorithms' },
  { courseCode: 'CSE207', name: 'Dynamic programming' },
  { courseCode: 'CSE215', name: 'Normalization and functional dependencies' },
  { courseCode: 'CSE215', name: 'Transactions and recovery' },
  { courseCode: 'CSE216', name: 'SQL joins and aggregate queries' },
  { courseCode: 'CSE216', name: 'PL/pgSQL procedures and triggers' },
];

const reviewSeeds = [
  ['CSE205', 0, 4.0, 3.5, 'The Boolean algebra part becomes much easier after solving a few small circuit-design problems every week.'],
  ['CSE205', 1, 3.5, 4.0, 'K-maps and flip-flops are connected. I understood them best by drawing the state table before the circuit.'],
  ['CSE205', 2, 4.5, 3.0, 'A good course for building hardware intuition. Do not leave sequential circuits for the night before the quiz.'],
  ['CSE207', 3, 4.5, 4.0, 'Practice tracing each algorithm by hand first. The graph problems need steady practice, not memorisation.'],
  ['CSE207', 4, 4.0, 4.5, 'Data structures from 1-2 matter a lot here. Implement a few standard graphs and heaps yourself.'],
  ['CSE207', 5, 3.5, 3.5, 'The workload feels manageable when the weekly problem set is split across several days.'],
  ['CSE215', 6, 4.0, 4.5, 'The schema design and normalisation topics are the foundation. Draw dependencies before writing SQL.'],
  ['CSE215', 7, 3.5, 4.0, 'Transaction schedules make more sense after doing small examples with two users and two tables.'],
  ['CSE215', 0, 4.5, 4.5, 'For the project, first decide what the database must guarantee. Then let the UI call the API around it.'],
  ['CSE216', 1, 3.5, 4.0, 'The lab becomes much less scary after you write and run one query at a time in pgAdmin.'],
  ['CSE216', 2, 4.0, 4.5, 'Triggers are easier to explain when you can say exactly what bad data they stop.'],
  ['CSE216', 4, 3.0, 3.5, 'Keep a few sample rows in every table while learning joins. Seeing the rows makes the query understandable.'],
];

const allowedGrades = [4.0, 3.75, 3.5, 3.25, 3.0, 2.75, 2.5, 2.25];

function gradeFor(studentIndex, courseIndex) {
  // Each student has a different but realistic pattern, so batch charts are useful.
  return allowedGrades[(studentIndex * 2 + courseIndex * 3) % allowedGrades.length];
}

async function ensureTeacher(client, teacher) {
  const existing = await client.query(
    `SELECT teacher_id FROM teachers
     WHERE name = $1 AND dept_code = $2 AND archived_at IS NULL
     ORDER BY teacher_id LIMIT 1`,
    [teacher.name, CSE_DEPARTMENT]
  );
  if (existing.rowCount) return existing.rows[0].teacher_id;

  const inserted = await client.query(
    `INSERT INTO teachers (name, designation, dept_code)
     VALUES ($1, $2, $3) RETURNING teacher_id`,
    [teacher.name, teacher.designation, CSE_DEPARTMENT]
  );
  return inserted.rows[0].teacher_id;
}

async function ensureOffering(client, courseCode, teacherId) {
  const semester = '2026 Demo Term';
  const existing = await client.query(
    `SELECT offering_id FROM offering
     WHERE semester = $1 AND course_code = $2 AND teacher_id = $3
     ORDER BY offering_id LIMIT 1`,
    [semester, courseCode, teacherId]
  );
  if (existing.rowCount) return existing.rows[0].offering_id;

  const inserted = await client.query(
    `INSERT INTO offering (semester, course_code, teacher_id)
     VALUES ($1, $2, $3) RETURNING offering_id`,
    [semester, courseCode, teacherId]
  );
  return inserted.rows[0].offering_id;
}

async function ensureTopic(client, topic) {
  const existing = await client.query(
    `SELECT topic_id FROM topics WHERE course_code = $1 AND name = $2 ORDER BY topic_id LIMIT 1`,
    [topic.courseCode, topic.name]
  );
  if (existing.rowCount) return existing.rows[0].topic_id;

  const inserted = await client.query(
    `INSERT INTO topics (course_code, name) VALUES ($1, $2) RETURNING topic_id`,
    [topic.courseCode, topic.name]
  );
  return inserted.rows[0].topic_id;
}

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    throw new Error('Set DEMO_PASSWORD before running this development seed.');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);

    // Remove only an earlier local-only demo domain created by this script.
    // It cannot be used through the app because Joi rejects .local emails.
    const legacyUsers = await client.query(
      `SELECT user_id FROM users
       WHERE email LIKE '%' || $1 OR email = ANY($2::varchar[])`,
      [LEGACY_DEMO_DOMAIN, legacyUnbatchedStudentEmails]
    );
    const legacyUserIds = legacyUsers.rows.map((user) => user.user_id);
    if (legacyUserIds.length) {
      await client.query('DELETE FROM reports WHERE reporter_user_id = ANY($1::int[])', [legacyUserIds]);
      await client.query('DELETE FROM notifications WHERE user_id = ANY($1::int[])', [legacyUserIds]);
      await client.query('DELETE FROM coursereviewvote WHERE user_id = ANY($1::int[])', [legacyUserIds]);
      await client.query('DELETE FROM coursereview WHERE user_id = ANY($1::int[])', [legacyUserIds]);
      await client.query('DELETE FROM user_course_performance WHERE user_id = ANY($1::int[])', [legacyUserIds]);
      await client.query('DELETE FROM users WHERE user_id = ANY($1::int[])', [legacyUserIds]);
    }

    const accountByEmail = new Map();
    for (const account of demoAccounts) {
      const isStudent = account.role === 'student';
      const result = await client.query(
        `INSERT INTO users (name, email, batch, role, password, dept_code, bio, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           batch = EXCLUDED.batch,
           role = EXCLUDED.role,
           password = EXCLUDED.password,
           dept_code = EXCLUDED.dept_code,
           bio = EXCLUDED.bio,
           deleted_at = NULL
         RETURNING user_id, name, email, role`,
        [
          account.name,
          account.email,
          isStudent ? account.batch : null,
          account.role,
          passwordHash,
          CSE_DEPARTMENT,
          isStudent ? 'Demo account used to explore AcademicOS safely.' : 'Demo staff account used to explore AcademicOS safely.',
        ]
      );
      accountByEmail.set(account.email, result.rows[0]);
    }

    const demoUserIds = [...accountByEmail.values()].map((account) => account.user_id);
    const studentsByBatch = new Map(batchSeeds.map((batch) => [
      batch.batch,
      demoAccounts
        .filter((account) => account.role === 'student' && account.batch === batch.batch)
        .map((account) => accountByEmail.get(account.email)),
    ]));

    // Refresh only old data that belongs to the demo identities.
    await client.query('DELETE FROM reports WHERE reporter_user_id = ANY($1::int[])', [demoUserIds]);
    await client.query('DELETE FROM notifications WHERE user_id = ANY($1::int[])', [demoUserIds]);
    await client.query('DELETE FROM coursereviewvote WHERE user_id = ANY($1::int[])', [demoUserIds]);
    await client.query('DELETE FROM coursereview WHERE user_id = ANY($1::int[])', [demoUserIds]);

    const curriculum = await client.query(
      `SELECT curriculum_id FROM curricula
       WHERE dept_code = $1 AND is_active = TRUE ORDER BY curriculum_id LIMIT 1`,
      [CSE_DEPARTMENT]
    );
    if (!curriculum.rowCount) throw new Error('No active CSE curriculum is configured.');
    const curriculumId = curriculum.rows[0].curriculum_id;

    let gradeRowCount = 0;
    for (const batch of batchSeeds) {
      await client.query(
        `INSERT INTO batch_progress
           (batch_year, dept_code, curriculum_id, current_term_code, latest_completed_term_code)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (batch_year, dept_code) DO UPDATE SET
           curriculum_id = EXCLUDED.curriculum_id,
           current_term_code = EXCLUDED.current_term_code,
           latest_completed_term_code = EXCLUDED.latest_completed_term_code`,
        [batch.batch, CSE_DEPARTMENT, curriculumId, batch.currentTerm, batch.latestCompletedTerm]
      );

      const placements = await client.query(
        `SELECT cc.curriculum_course_id, cc.course_code, cc.term_code
         FROM curriculum_courses cc
         JOIN academic_terms term ON term.term_code = cc.term_code
         JOIN academic_terms completed ON completed.term_code = $2
         WHERE cc.curriculum_id = $1 AND term.term_order <= completed.term_order
         ORDER BY term.term_order, cc.curriculum_course_id`,
        [curriculumId, batch.latestCompletedTerm]
      );
      if (!placements.rowCount) throw new Error(`No completed-term course placements found for CSE ${batch.batch}.`);

      const students = studentsByBatch.get(batch.batch);
      for (let studentIndex = 0; studentIndex < students.length; studentIndex += 1) {
        for (let courseIndex = 0; courseIndex < placements.rows.length; courseIndex += 1) {
          const placement = placements.rows[courseIndex];
          await client.query(
            `INSERT INTO user_course_performance (user_id, curriculum_course_id, grade_point)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, curriculum_course_id)
             DO UPDATE SET grade_point = EXCLUDED.grade_point, updated_at = CURRENT_TIMESTAMP`,
            [students[studentIndex].user_id, placement.curriculum_course_id, gradeFor(studentIndex, courseIndex)]
          );
          gradeRowCount += 1;
        }
      }
    }

    const students = studentsByBatch.get('2024');

    const teacherIds = new Map();
    for (const teacher of teacherSeeds) teacherIds.set(teacher.key, await ensureTeacher(client, teacher));

    const availableCourses = await client.query(
      `SELECT course_code FROM courses WHERE course_code = ANY($1::varchar[]) AND archived_at IS NULL`,
      [offeringSeeds.map((offering) => offering.courseCode)]
    );
    if (availableCourses.rowCount !== offeringSeeds.length) {
      throw new Error('One or more demo review courses are missing from the database.');
    }

    const offeringIds = new Map();
    for (const offering of offeringSeeds) {
      offeringIds.set(
        offering.courseCode,
        await ensureOffering(client, offering.courseCode, teacherIds.get(offering.teacherKey))
      );
    }

    const topicIds = new Map();
    for (const topic of topicSeeds) topicIds.set(`${topic.courseCode}:${topic.name}`, await ensureTopic(client, topic));

    const insertedReviews = [];
    for (const [courseCode, studentIndex, difficulty, prereqUse, comment] of reviewSeeds) {
      const result = await client.query(
        `INSERT INTO coursereview (difficulty, prereq_use, comment, user_id, course_code, offering_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING review_id, user_id, course_code`,
        [difficulty, prereqUse, `[Demo seed] ${comment}`, students[studentIndex].user_id, courseCode, offeringIds.get(courseCode)]
      );
      insertedReviews.push(result.rows[0]);
    }

    // A few topic flags make the review detail view look meaningful too.
    const flags = [
      [0, 'CSE205:Karnaugh maps', 'Needed another round of practice before it clicked.'],
      [3, 'CSE207:Graph algorithms', 'Shortest-path edge cases were the confusing part.'],
      [6, 'CSE215:Normalization and functional dependencies', 'Practice finding candidate keys carefully.'],
      [9, 'CSE216:SQL joins and aggregate queries', 'Group the rows only after checking the join result.'],
    ];
    for (const [reviewIndex, topicKey, note] of flags) {
      await client.query(
        `INSERT INTO coursereview_topic_flag (review_id, topic_id, note) VALUES ($1, $2, $3)`,
        [insertedReviews[reviewIndex].review_id, topicIds.get(topicKey), `[Demo seed] ${note}`]
      );
    }

    let voteCount = 0;
    for (let reviewIndex = 0; reviewIndex < insertedReviews.length; reviewIndex += 1) {
      for (let voterIndex = 0; voterIndex < 4; voterIndex += 1) {
        const voter = students[(reviewIndex + voterIndex + 1) % students.length];
        await client.query(
          `INSERT INTO coursereviewvote (user_id, review_id, value) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, review_id) DO UPDATE SET value = EXCLUDED.value`,
          [voter.user_id, insertedReviews[reviewIndex].review_id, (reviewIndex + voterIndex) % 6 === 0 ? -1 : 1]
        );
        voteCount += 1;
      }
    }

    await client.query(
      `INSERT INTO reports (reporter_user_id, target_type, target_id, reason, status)
       VALUES ($1, 'coursereview', $2, $3, 'reviewed')`,
      [students[7].user_id, insertedReviews[2].review_id, '[Demo seed] Example of a reviewed report for the moderation screen.']
    );

    for (const [index, student] of students.entries()) {
      await client.query(
        `INSERT INTO notifications (user_id, type, message, related_id, is_read)
         VALUES
           ($1, 'batch_progress_advanced', $2, NULL, $3),
           ($1, 'review_activity', $4, $5, FALSE)`,
        [
          student.user_id,
          'Demo data: Batch 2024 can record results through term 1-2.',
          index % 3 === 0,
          'Demo data: explore course reviews, votes, topic flags, and reports.',
          insertedReviews[index % insertedReviews.length].review_id,
        ]
      );
    }

    await client.query('COMMIT');
    console.log('Demo seed completed successfully.');
    console.log(`Created or refreshed ${demoAccounts.length} demo accounts, ${gradeRowCount} grade rows, ${insertedReviews.length} reviews, ${voteCount} votes, 1 report, and ${students.length * 2} notifications.`);
    console.log('Try logging in with anika.rahman.2024@demo.academicos.com or admin@demo.academicos.com using the DEMO_PASSWORD you chose.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`Demo seed failed: ${error.message}`);
    process.exitCode = 1;
  });
