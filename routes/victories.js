const express = require('express');
const router = express.Router();
const Victory = require('../models/Victory');
const auth = require('../middleware/auth'); // Assuming auth middleware exists

// Get victories for a specific month (or all for user)
router.get('/', auth, async (req, res) => {
    try {
        const { month, year } = req.query;
        let query = { userId: req.user.id };

        if (month && year) {
            // Filter by string date YYYY-MM
            // Since we store date as String YYYY-MM-DD, regex is easiest or simple string match
            // Creating a regex for "YYYY-MM-*"
            const dateRegex = new RegExp(`^${year}-${String(month).padStart(2, '0')}`);
            query.date = { $regex: dateRegex };
        }

        const victories = await Victory.find(query).sort({ date: -1, createdAt: -1 });
        res.json(victories);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Add a new victory
router.post('/', auth, async (req, res) => {
    try {
        const { text, date, type } = req.body;
        // Default date to today if not provided
        const entryDate = date || new Date().toISOString().slice(0, 10);

        const newVictory = new Victory({
            userId: req.user.id,
            text,
            date: entryDate,
            type: type || 'general'
        });

        const victory = await newVictory.save();
        res.json(victory);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Get recent victories (last 3 for example for dashboard)
router.get('/recent', auth, async (req, res) => {
    try {
        const victories = await Victory.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(3);
        res.json(victories);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;