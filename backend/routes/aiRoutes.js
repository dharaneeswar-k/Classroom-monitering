const express = require('express');
const router = express.Router();
const { receiveAIEvent, syncData, markAbsent } = require('../controllers/aiController');

// The AI route does not use standard JWT auth because it will be hit by the Python backend via internal networking.
// In a real scenario, this might use an API key. For now, it's open.
router.post('/events', receiveAIEvent);
router.get('/sync', syncData);
router.post('/absent', markAbsent);

module.exports = router;
