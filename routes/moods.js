const express = require('express');
const router = express.Router();
const MoodEntry = require('../models/MoodEntry');
const DayRating = require('../models/DayRating');
const authUser = require('../middleware/auth-user');

const getStartOfDay = (date) => {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    return start;
};

router.post('/', authUser, async (req, res) => {
    const { emotion, reason, date } = req.body;
    const userId = req.user.id;
    const today = date ? getStartOfDay(date) : getStartOfDay(new Date());

    try {
        let entry = await MoodEntry.findOne({ userId, date: today });
        if (entry) {
            entry.emotion = emotion;
            entry.reason = reason;
        } else {
            entry = new MoodEntry({ userId, emotion, reason, date: today });
        }
        await entry.save();
        res.status(201).json(entry);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

router.post('/note', authUser, async (req, res) => {
    const { date, note } = req.body;
    const userId = req.user.id;
    const targetDate = getStartOfDay(date);

    try {
        const entry = await MoodEntry.findOneAndUpdate(
            { userId, date: targetDate },
            { note: note },
            { new: true }
        );
        if (!entry) return res.status(404).json({ msg: 'Nie znaleziono wpisu dla tego dnia.' });
        res.json(entry);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

router.get('/calendar', authUser, async (req, res) => {
    const { year, month } = req.query;
    const userId = req.user.id;
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    try {
        const [entries, ratings] = await Promise.all([
            MoodEntry.find({
                userId,
                date: { $gte: startDate, $lte: endDate }
            }).select('date emotion note'),
            DayRating.find({
                user: userId,
                date: { $gte: startDate, $lte: endDate }
            })
        ]);

        const mergedEntries = entries.map(e => {
            const entryDate = new Date(e.date).toISOString().split('T')[0];
            const rating = ratings.find(r => new Date(r.date).toISOString().split('T')[0] === entryDate);
            return {
                ...e.toObject(),
                rating: rating ? rating.rating : undefined,
                mood: rating ? rating.rating : undefined // Fallback specifically for frontend MoodCalendar
            };
        });

        res.json(mergedEntries);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

router.get('/stats', authUser, async (req, res) => {
    const userId = req.user.id;
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    try {
        // Fetch all entries and filter by time periods
        const allEntries = await MoodEntry.find({ userId }).sort({ date: -1 });
        const weekEntries = allEntries.filter(e => new Date(e.date) >= weekAgo);
        const lastWeekEntries = allEntries.filter(e => new Date(e.date) >= twoWeeksAgo && new Date(e.date) < weekAgo);
        const monthEntries = allEntries.filter(e => new Date(e.date) >= monthAgo);

        // Mood scores for calculations
        const moodScores = {
            happy: 9, excited: 9, grateful: 9,
            calm: 8, content: 7,
            neutral: 5, tired: 4,
            stressed: 3, anxious: 3,
            sad: 2, angry: 2, overwhelmed: 1
        };

        // Helper: count moods
        const countMoods = (entries) => entries.reduce((acc, e) => {
            acc[e.emotion] = (acc[e.emotion] || 0) + 1;
            return acc;
        }, {});

        // Helper: calculate average mood score
        const avgScore = (entries) => {
            if (entries.length === 0) return 0;
            const sum = entries.reduce((s, e) => s + (moodScores[e.emotion] || 5), 0);
            return (sum / entries.length).toFixed(1);
        };

        // Helper: count reasons
        const countReasons = (entries) => entries.reduce((acc, e) => {
            if (e.reason) acc[e.reason] = (acc[e.reason] || 0) + 1;
            return acc;
        }, {});

        // Helper: day of week analysis
        const dayNames = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
        const analyzeByDay = (entries) => {
            const days = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
            entries.forEach(e => {
                const day = new Date(e.date).getDay();
                days[day].push(moodScores[e.emotion] || 5);
            });
            return Object.entries(days).map(([d, scores]) => ({
                day: dayNames[d],
                dayIndex: parseInt(d),
                avgScore: scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null,
                count: scores.length
            })).filter(d => d.count > 0);
        };

        // Helper: calculate streak
        const calculateStreak = (entries) => {
            if (entries.length === 0) return 0;
            let streak = 0;
            const today = getStartOfDay(new Date()).getTime();

            for (let i = 0; i < 365; i++) {
                const checkDate = today - i * 24 * 60 * 60 * 1000;
                const hasEntry = entries.some(e => getStartOfDay(e.date).getTime() === checkDate);
                if (hasEntry) streak++;
                else if (i > 0) break; // Allow missing today
            }
            return streak;
        };

        // Mood counts
        const moodCounts = countMoods(allEntries);
        const weeklyMoodCounts = countMoods(weekEntries);

        // Top reasons
        const reasonCounts = countReasons(allEntries);
        const topReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([reason, count]) => ({ reason, count }));

        // Day analysis
        const dayAnalysis = analyzeByDay(allEntries);
        const bestDay = dayAnalysis.reduce((best, d) => (!best || parseFloat(d.avgScore) > parseFloat(best.avgScore)) ? d : best, null);
        const worstDay = dayAnalysis.reduce((worst, d) => (!worst || parseFloat(d.avgScore) < parseFloat(worst.avgScore)) ? d : worst, null);

        // Trends
        const weeklyAvg = parseFloat(avgScore(weekEntries));
        const lastWeekAvg = parseFloat(avgScore(lastWeekEntries));
        const monthlyAvg = parseFloat(avgScore(monthEntries));

        let weeklyTrend = 'stable';
        if (lastWeekAvg > 0 && weeklyAvg > lastWeekAvg + 0.5) weeklyTrend = 'improving';
        else if (lastWeekAvg > 0 && weeklyAvg < lastWeekAvg - 0.5) weeklyTrend = 'declining';

        // Streak
        const currentStreak = calculateStreak(allEntries);

        // Happy days percentage
        const happyMoods = ['happy', 'excited', 'grateful', 'calm', 'content'];
        const happyDays = allEntries.filter(e => happyMoods.includes(e.emotion)).length;
        const happyPercentage = allEntries.length > 0 ? Math.round((happyDays / allEntries.length) * 100) : 0;

        // Most common mood
        const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];

        // Days since first entry
        const firstEntry = allEntries[allEntries.length - 1];
        const daysSinceStart = firstEntry
            ? Math.floor((now - new Date(firstEntry.date)) / (1000 * 60 * 60 * 24))
            : 0;

        // Week comparison
        const weekComparison = lastWeekAvg > 0
            ? ((weeklyAvg - lastWeekAvg) / lastWeekAvg * 100).toFixed(0)
            : 0;

        res.json({
            // Basic
            totalEntries: allEntries.length,
            weeklyEntries: weekEntries.length,
            monthlyEntries: monthEntries.length,

            // Mood distribution
            moodCounts,
            weeklyMoodCounts,
            dominantMood: dominantMood ? { mood: dominantMood[0], count: dominantMood[1] } : null,

            // Reasons
            topReasons,

            // Averages
            averageMood: avgScore(allEntries),
            weeklyAverage: weeklyAvg,
            monthlyAverage: monthlyAvg,

            // Trends
            weeklyTrend,
            weekComparison: parseInt(weekComparison),

            // Patterns
            dayAnalysis,
            bestDay: bestDay ? { day: bestDay.day, score: bestDay.avgScore } : null,
            worstDay: worstDay ? { day: worstDay.day, score: worstDay.avgScore } : null,

            // Streaks
            currentStreak,
            happyPercentage,

            // Meta
            daysSinceStart,
            firstEntryDate: firstEntry?.date || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

router.get('/today', authUser, async (req, res) => {
    const today = getStartOfDay(new Date());
    try {
        const entry = await MoodEntry.findOne({ userId: req.user.id, date: today });
        res.json(entry);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Anonymous/Guest Mood Entry (contributes to public stats only)
router.post('/public', async (req, res) => {
    const { emotion, reason } = req.body;
    const today = getStartOfDay(new Date());

    // Get IP for rate limiting (one entry per IP per day)
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    try {
        // Check if this IP already voted today
        const existingEntry = await MoodEntry.findOne({
            guestIp: clientIp,
            date: today,
            isAnonymous: true
        });

        if (existingEntry) {
            // Update existing entry instead of creating new
            existingEntry.emotion = emotion;
            existingEntry.reason = reason;
            await existingEntry.save();
            return res.json({ msg: 'Zaktualizowano', entry: existingEntry });
        }

        // Create anonymous entry
        const entry = new MoodEntry({
            userId: null,
            emotion,
            reason,
            date: today,
            isAnonymous: true,
            guestIp: clientIp
        });
        await entry.save();
        res.status(201).json({ msg: 'Zapisano', entry });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// Public Global Stats (Aggregation)
router.get('/public-stats', async (req, res) => {
    try {
        const today = getStartOfDay(new Date());
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        // Count total entries today
        const totalEntries = await MoodEntry.countDocuments({ date: today });

        // Count total users and groups for About page
        const User = require('../models/User');
        const Group = require('../models/Group');
        const totalUsers = await User.countDocuments();
        const totalGroups = await Group.countDocuments();

        // Aggregate moods globally (today)
        const moodStats = await MoodEntry.aggregate([
            { $match: { date: today } },
            { $group: { _id: "$emotion", count: { $sum: 1 } } }
        ]);

        // Top 3 reasons today
        const reasonStats = await MoodEntry.aggregate([
            { $match: { date: today, reason: { $exists: true, $ne: null, $ne: '' } } },
            { $group: { _id: "$reason", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 }
        ]);
        const topReasons = reasonStats.map(r => ({ reason: r._id, count: r.count }));

        // Monthly mood stats (last 30 days)
        const monthlyMoodStats = await MoodEntry.aggregate([
            { $match: { date: { $gte: monthAgo } } },
            { $group: { _id: "$emotion", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const monthlyTotal = monthlyMoodStats.reduce((sum, m) => sum + m.count, 0);

        // All moods with percentages (today)
        const allMoodsData = [
            { id: 'happy', label: 'Szczęśliwy', emoji: '😊' },
            { id: 'calm', label: 'Spokojny', emoji: '😌' },
            { id: 'grateful', label: 'Wdzięczny', emoji: '🙏' },
            { id: 'excited', label: 'Podekscytowany', emoji: '🤩' },
            { id: 'content', label: 'Zadowolony', emoji: '🙂' },
            { id: 'neutral', label: 'Neutralny', emoji: '😐' },
            { id: 'tired', label: 'Zmęczony', emoji: '😴' },
            { id: 'stressed', label: 'Zestresowany', emoji: '😰' },
            { id: 'anxious', label: 'Niespokojny', emoji: '😟' },
            { id: 'sad', label: 'Smutny', emoji: '😢' },
            { id: 'angry', label: 'Zły', emoji: '😠' },
            { id: 'overwhelmed', label: 'Przytłoczony', emoji: '🤯' },
        ];

        const moodStatsMap = moodStats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
        const allMoodsWithPercent = allMoodsData.map(m => ({
            ...m,
            count: moodStatsMap[m.id] || 0,
            percent: totalEntries > 0 ? Math.round((moodStatsMap[m.id] || 0) / totalEntries * 100) : 0
        })).sort((a, b) => b.count - a.count);

        // Calculate positive/negative/neutral distribution
        const positiveMoods = ['happy', 'calm', 'grateful', 'excited', 'content'];
        const negativeMoods = ['stressed', 'anxious', 'sad', 'angry', 'overwhelmed'];
        const neutralMoods = ['neutral', 'tired'];

        let positiveCount = 0, negativeCount = 0, neutralCount = 0;
        moodStats.forEach(m => {
            if (positiveMoods.includes(m._id)) positiveCount += m.count;
            else if (negativeMoods.includes(m._id)) negativeCount += m.count;
            else if (neutralMoods.includes(m._id)) neutralCount += m.count;
        });

        const emotionDistribution = {
            positive: totalEntries > 0 ? Math.round(positiveCount / totalEntries * 100) : 0,
            negative: totalEntries > 0 ? Math.round(negativeCount / totalEntries * 100) : 0,
            neutral: totalEntries > 0 ? Math.round(neutralCount / totalEntries * 100) : 0
        };

        // Top 3 moods this month
        const topMonthlyMoods = monthlyMoodStats.slice(0, 3).map(m => {
            const moodData = allMoodsData.find(md => md.id === m._id) || { label: m._id, emoji: '😐' };
            return {
                ...moodData,
                id: m._id,
                count: m.count,
                percent: monthlyTotal > 0 ? Math.round(m.count / monthlyTotal * 100) : 0
            };
        });

        // Regional Aggregation
        const regionalStatsRaw = await MoodEntry.aggregate([
            { $match: { date: today } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: "$user" },
            {
                $group: {
                    _id: { region: "$user.region", emotion: "$emotion" },
                    count: { $sum: 1 }
                }
            }
        ]);

        const emotionScores = {
            happy: 9, excited: 9, grateful: 9,
            calm: 8, content: 7,
            neutral: 5, tired: 4,
            stressed: 3, anxious: 3,
            sad: 2, angry: 2, overwhelmed: 1
        };

        const regions = {};
        regionalStatsRaw.forEach(item => {
            const region = item._id.region || 'unknown';
            const emotion = item._id.emotion;
            const count = item.count;

            if (!regions[region]) {
                regions[region] = { total: 0, scoreSum: 0, emotionCounts: {} };
            }

            regions[region].total += count;
            regions[region].scoreSum += (emotionScores[emotion] || 5) * count;
            regions[region].emotionCounts[emotion] = (regions[region].emotionCounts[emotion] || 0) + count;
        });

        const emojiMap = {
            happy: '🤩', excited: '🤩', grateful: '🙏',
            calm: '😌', content: '🙂',
            neutral: '😐', tired: '🥱',
            stressed: '😰', anxious: '😰',
            sad: '😢', angry: '😡', overwhelmed: '🤯'
        };

        const regionalData = Object.keys(regions).map(r => {
            const d = regions[r];
            const avg = (d.scoreSum / d.total).toFixed(1);
            const sortedEmotions = Object.entries(d.emotionCounts).sort((a, b) => b[1] - a[1]);
            const dom = sortedEmotions[0] ? sortedEmotions[0][0] : 'neutral';

            const topMoods = sortedEmotions.slice(0, 3).map(([emotion, count]) => {
                const moodDef = allMoodsData.find(m => m.id === emotion) || { label: emotion, emoji: '😐' };
                return {
                    label: moodDef.label,
                    emoji: moodDef.emoji,
                    count: count
                };
            });

            return {
                id: r,
                name: r.charAt(0).toUpperCase() + r.slice(1),
                mood: parseFloat(avg),
                emoji: emojiMap[dom] || '😐',
                total: d.total,
                topMoods: topMoods
            };
        });

        res.json({
            date: today,
            totalEntries,
            totalUsers,
            totalGroups,
            moodStats: moodStatsMap,
            allMoods: allMoodsWithPercent,
            topReasons,
            topMonthlyMoods,
            emotionDistribution,
            monthlyTotal,
            regionalData
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

module.exports = router;