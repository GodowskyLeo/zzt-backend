const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const DayRating = require('../models/DayRating');

// Get today's rating
router.get('/today', auth, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rating = await DayRating.findOne({
            user: req.user.id,
            date: { $gte: today }
        });

        res.json(rating || null);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Get ratings with optional date range
router.get('/', auth, async (req, res) => {
    try {
        const { from, to, limit = 30 } = req.query;

        const query = { user: req.user.id };

        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = new Date(from);
            if (to) query.date.$lte = new Date(to);
        }

        const ratings = await DayRating.find(query)
            .sort({ date: -1 })
            .limit(parseInt(limit));

        res.json(ratings);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Get rating statistics
router.get('/stats', auth, async (req, res) => {
    try {
        const now = new Date();
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const [weeklyRatings, monthlyRatings] = await Promise.all([
            DayRating.find({
                user: req.user.id,
                date: { $gte: weekAgo }
            }),
            DayRating.find({
                user: req.user.id,
                date: { $gte: monthAgo }
            })
        ]);

        const weeklyAvg = weeklyRatings.length > 0
            ? (weeklyRatings.reduce((sum, r) => sum + r.rating, 0) / weeklyRatings.length).toFixed(1)
            : 0;

        const monthlyAvg = monthlyRatings.length > 0
            ? (monthlyRatings.reduce((sum, r) => sum + r.rating, 0) / monthlyRatings.length).toFixed(1)
            : 0;

        // Calculate streak
        let streak = 0;
        const sortedRatings = await DayRating.find({ user: req.user.id })
            .sort({ date: -1 })
            .limit(30);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 30; i++) {
            const checkDate = new Date(today - i * 24 * 60 * 60 * 1000);
            const hasRating = sortedRatings.some(r => {
                const rDate = new Date(r.date);
                rDate.setHours(0, 0, 0, 0);
                return rDate.getTime() === checkDate.getTime();
            });

            if (hasRating) {
                streak++;
            } else if (i > 0) { // Allow missing today
                break;
            }
        }

        // Trend
        let trend = 'stabilny';
        if (weeklyRatings.length >= 3) {
            const firstHalf = weeklyRatings.slice(Math.floor(weeklyRatings.length / 2));
            const secondHalf = weeklyRatings.slice(0, Math.floor(weeklyRatings.length / 2));

            const firstAvg = firstHalf.reduce((s, r) => s + r.rating, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((s, r) => s + r.rating, 0) / secondHalf.length;

            if (secondAvg > firstAvg + 0.3) trend = 'wzrost';
            else if (secondAvg < firstAvg - 0.3) trend = 'spadek';
        }

        res.json({
            weeklyAvg: parseFloat(weeklyAvg),
            monthlyAvg: parseFloat(monthlyAvg),
            weeklyCount: weeklyRatings.length,
            monthlyCount: monthlyRatings.length,
            streak,
            trend
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Create or update today's rating
router.post('/', auth, async (req, res) => {
    try {
        const { rating, note } = req.body;

        if (!rating || rating < 1 || rating > 10) {
            return res.status(400).json({ msg: 'Ocena musi być od 1 do 10' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Upsert - update if exists, create if not
        const dayRating = await DayRating.findOneAndUpdate(
            { user: req.user.id, date: today },
            {
                rating,
                note: note || '',
                user: req.user.id,
                date: today
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json(dayRating);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Rate a specific past day (within last 7 days)
router.post('/date/:date', auth, async (req, res) => {
    try {
        const { rating, note } = req.body;
        const targetDate = new Date(req.params.date);
        targetDate.setHours(0, 0, 0, 0);

        // Validate date is within last 7 days
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);

        if (targetDate < weekAgo) {
            return res.status(400).json({ msg: 'Można oceniać tylko dni z ostatniego tygodnia' });
        }

        if (targetDate > new Date()) {
            return res.status(400).json({ msg: 'Nie można oceniać przyszłych dni' });
        }

        if (!rating || rating < 1 || rating > 10) {
            return res.status(400).json({ msg: 'Ocena musi być od 1 do 10' });
        }

        const dayRating = await DayRating.findOneAndUpdate(
            { user: req.user.id, date: targetDate },
            {
                rating,
                note: note || '',
                user: req.user.id,
                date: targetDate
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json(dayRating);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

module.exports = router;
