const express = require('express');
const router = express.Router();
const {
  getTopContributors,
  getUserProfile
} = require('../models/topContributors');

// ==========================================================================
// LEADERBOARD
// ==========================================================================

// GET /api/top-contributors
// Query params: limit (optional, default e.g. 20)
// Returns contributors ranked by points, descending. Each row should
// include at least: user_id, name, avatar_url, points, uploads
// (uploads = count of resources/reviews contributed, however "points" ends
// up being calculated on your end — e.g. weighted sum of uploads, votes
// received, reviews written, etc.)
router.get('/top-contributors', async (req, res) => {
  const { limit } = req.query;
  // TODO: implement
});

// ==========================================================================
// PROFILE
// ==========================================================================

// GET /api/users/:userId/profile
// Public profile data for a single user — used by the profile page that
// clicking a leaderboard row navigates to. Should include at least:
// user_id, name, avatar_url, points, uploads, and whatever else the
// profile page needs to render (join date, bio, recent contributions, etc.)
router.get('/users/:userId/profile', async (req, res) => {
  const { userId } = req.params;
  // TODO: implement
});

module.exports = router;