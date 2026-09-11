const express = require('express');
const router = express.Router();
const { getTopContributors } = require('../models/topContributors');

// This becomes GET /api/top-contributors
router.get('/', async (req, res) => {
  const { limit } = req.query;

  try {
    const Toppers = await getTopContributors(limit);
    return res.status(200).json(Toppers);
  } 
  catch (err) {
    console.error('Error fetching top contributors:', err);
    return res.status(500).json({ message: 'Server error while fetching top contributors.' });
  }
});

module.exports = router;