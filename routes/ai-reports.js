const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const AIReport = require('../models/AIReport');
const aiService = require('../services/aiService');
const { aggregateUserData } = require('../services/dataAggregator');

// Get all user's reports (paginated)
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, type } = req.query;

        const query = { user: req.user.id };
        if (type) query.type = type;

        const reports = await AIReport.find(query)
            .select('-inputData')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await AIReport.countDocuments(query);

        res.json({
            reports,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Get latest report
router.get('/latest', auth, async (req, res) => {
    try {
        const report = await AIReport.findOne({ user: req.user.id })
            .select('-inputData')
            .sort({ createdAt: -1 });

        res.json(report || null);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Check if AI is enabled
router.get('/status', auth, async (req, res) => {
    res.json({
        aiEnabled: aiService.isEnabled(),
        message: aiService.isEnabled()
            ? 'AI jest aktywne (OpenAI)'
            : 'AI działa w trybie szablonowym (brak klucza API)'
    });
});

// Get specific report
router.get('/:id', auth, async (req, res) => {
    try {
        const report = await AIReport.findOne({
            _id: req.params.id,
            user: req.user.id
        }).select('-inputData');

        if (!report) {
            return res.status(404).json({ msg: 'Raport nie znaleziony' });
        }

        // Mark as viewed
        if (!report.viewed) {
            report.viewed = true;
            report.viewedAt = new Date();
            await report.save();
        }

        res.json(report);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Generate new report
router.post('/generate', auth, async (req, res) => {
    try {
        const { type = 'weekly' } = req.body;

        // Rate limiting - max 1 on-demand report per day
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayReports = await AIReport.countDocuments({
            user: req.user.id,
            type: 'on-demand',
            createdAt: { $gte: today }
        });

        if (todayReports >= 3) {
            return res.status(429).json({
                msg: 'Możesz wygenerować maksymalnie 3 raporty dziennie'
            });
        }

        // Calculate date range
        const now = new Date();
        let periodStart;

        if (type === 'monthly') {
            periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        } else {
            periodStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
        }

        // Aggregate user data
        const startTime = Date.now();
        const aggregatedData = await aggregateUserData(req.user.id, periodStart, now);

        // Check minimum data requirements
        if (aggregatedData.totalMoodEntries < 1 && aggregatedData.totalRatings < 1) {
            return res.status(400).json({
                msg: 'Potrzebujesz co najmniej 1 wpis nastroju lub ocenę dnia, aby wygenerować raport.'
            });
        }

        // Generate report content (AI or template)
        const aiContent = await aiService.generateReport(aggregatedData, type);
        const generationTime = Date.now() - startTime;

        // Save report
        const report = new AIReport({
            user: req.user.id,
            type: type === 'weekly' || type === 'monthly' ? type : 'on-demand',
            periodStart,
            periodEnd: now,
            content: aiContent,
            stats: {
                moodEntries: aggregatedData.totalMoodEntries,
                averageIntensity: parseFloat(aggregatedData.averageIntensity) || 0,
                averageRating: parseFloat(aggregatedData.averageRating) || 0,
                victories: aggregatedData.totalVictories,
                mostCommonMood: aggregatedData.mostCommonMood
            },
            aiModel: aiService.isEnabled() ? (process.env.AI_MODEL || 'gpt-4') : 'template',
            aiEnabled: aiService.isEnabled(),
            generationTime
        });

        await report.save();

        res.json(report);
    } catch (err) {
        console.error('Report generation error:', err);
        res.status(500).json({ msg: 'Błąd generowania raportu' });
    }
});

// Submit feedback for a report
router.post('/:id/feedback', auth, async (req, res) => {
    try {
        const { helpful, comment } = req.body;

        const report = await AIReport.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            {
                'feedback.helpful': helpful,
                'feedback.comment': comment || '',
                'feedback.submittedAt': new Date()
            },
            { new: true }
        );

        if (!report) {
            return res.status(404).json({ msg: 'Raport nie znaleziony' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd zapisywania opinii' });
    }
});

// Delete a report
router.delete('/:id', auth, async (req, res) => {
    try {
        const report = await AIReport.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id
        });

        if (!report) {
            return res.status(404).json({ msg: 'Raport nie znaleziony' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Błąd usuwania raportu' });
    }
});

module.exports = router;
