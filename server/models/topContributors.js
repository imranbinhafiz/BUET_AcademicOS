const db = require('../db');

// ---------------------------------------------------------------------
// Points formula
// ---------------------------------------------------------------------
// Points are computed on the fly rather than stored as a running total —
// same reasoning as vote tallies and download counts elsewhere in this
// app: it's always correct, never drifts out of sync, and costs nothing
// extra since these are all indexed lookups.
//
//   +5  per resource uploaded
//   +3  per course review written
//   +1  per net upvote received on an uploaded resource   (upvotes - downvotes)
//   +1  per net upvote received on a written course review (upvotes - downvotes)
const POINTS_PER_UPLOAD = 5;
const POINTS_PER_REVIEW = 3;
const POINTS_PER_NET_VOTE = 1;

// Shared SELECT fragment computing points + contribution counts for a
// user. Used by getTopContributors so the leaderboard math lives in one
// place. Banned/deleted accounts (deleted_at IS NOT NULL) never appear
// on the leaderboard.
const CONTRIBUTOR_STATS_SELECT = `
  SELECT
    u.user_id,
    u.name,
    u.avatar_path,
    COALESCE(uploads.upload_count, 0) AS uploads,
    COALESCE(reviews.review_count, 0) AS reviews,
    COALESCE(uploads.upload_votes, 0) AS upload_votes,
    COALESCE(reviews.review_votes, 0) AS review_votes,
    (
      COALESCE(uploads.upload_count, 0) * ${POINTS_PER_UPLOAD}
      + COALESCE(reviews.review_count, 0) * ${POINTS_PER_REVIEW}
      + COALESCE(uploads.upload_votes, 0) * ${POINTS_PER_NET_VOTE}
      + COALESCE(reviews.review_votes, 0) * ${POINTS_PER_NET_VOTE}
    )::int AS points
  FROM users u
  LEFT JOIN (
    SELECT
      r.user_id,
      COUNT(*)::int AS upload_count,
      COALESCE(SUM(rv.value), 0)::int AS upload_votes
    FROM resources r
    LEFT JOIN resourcevote rv ON rv.res_id = r.res_id
    WHERE r.approval_status = 'approved'
    GROUP BY r.user_id
  ) uploads ON uploads.user_id = u.user_id
  LEFT JOIN (
    SELECT
      cr.user_id,
      COUNT(*)::int AS review_count,
      COALESCE(SUM(crv.value), 0)::int AS review_votes
    FROM coursereviews cr
    LEFT JOIN coursereviewvote crv ON crv.review_id = cr.review_id
    GROUP BY cr.user_id
  ) reviews ON reviews.user_id = u.user_id
  WHERE u.deleted_at IS NULL
`;

// ---------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------

// Fetch the top contributors ranked by points, descending. `limit` is
// coerced to a safe integer with a sane default/ceiling here rather than
// trusting the caller, since it flows into a SQL LIMIT.
async function getTopContributors(limit = 20) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const result = await db.query(
    `${CONTRIBUTOR_STATS_SELECT}
     ORDER BY points DESC, uploads DESC, u.user_id ASC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------

// Fetch a single user's public profile: avatar, name, bio, and their
// full list of resource uploads and course reviews. Returns null if the
// user doesn't exist OR has been banned/deleted (deleted_at IS NOT
// NULL) — the route treats both cases identically (404), so a banned
// account's profile doesn't leak the fact that it was ever banned
// versus never having existed.
async function getUserProfile(userId) {
  const userResult = await db.query(
    `SELECT user_id, name, avatar_path, bio, deleted_at
     FROM users
     WHERE user_id = $1`,
    [userId]
  );

  const user = userResult.rows[0];
  if (!user) return null;
  if (user.deleted_at) return null;

  const uploadsResult = await db.query(
    `SELECT res_id, title, type, course_code
     FROM resources
     WHERE user_id = $1 AND approval_status = 'approved'
     ORDER BY res_id DESC`,
    [userId]
  );

  const reviewsResult = await db.query(
    `SELECT review_id, course_code, title, difficulty, prereq_use
     FROM coursereviews
     WHERE user_id = $1
     ORDER BY review_id DESC`,
    [userId]
  );

  return {
    user_id: user.user_id,
    name: user.name,
    avatar_path: user.avatar_path,
    bio: user.bio,
    uploads: uploadsResult.rows,
    reviews: reviewsResult.rows
  };
}

module.exports = {
  getTopContributors,
  getUserProfile
};