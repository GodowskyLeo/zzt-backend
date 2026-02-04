const MoodEntry = require('../models/MoodEntry');
const DayRating = require('../models/DayRating');
const Victory = require('../models/Victory');

/**
 * Aggregates user mood data for a given time period
 * Used to build context for AI report generation
 */
const aggregateUserData = async (userId, dateFrom, dateTo) => {
    // Fetch all relevant data
    const [moodEntries, dayRatings, victories] = await Promise.all([
        MoodEntry.find({
            user: userId,
            createdAt: { $gte: dateFrom, $lte: dateTo }
        }).sort({ createdAt: -1 }),

        DayRating.find({
            user: userId,
            date: { $gte: dateFrom, $lte: dateTo }
        }).sort({ date: -1 }),

        Victory.find({
            user: userId,
            createdAt: { $gte: dateFrom, $lte: dateTo }
        }).sort({ createdAt: -1 })
    ]);

    // Calculate mood statistics
    const moodDistribution = {};
    const reasonDistribution = {};
    let intensitySum = 0;

    moodEntries.forEach(entry => {
        // Count moods
        moodDistribution[entry.mood] = (moodDistribution[entry.mood] || 0) + 1;

        // Count reasons
        if (entry.reason) {
            reasonDistribution[entry.reason] = (reasonDistribution[entry.reason] || 0) + 1;
        }

        // Sum intensities
        intensitySum += entry.intensity || 5;
    });

    // Calculate day rating statistics
    let ratingSum = 0;
    dayRatings.forEach(r => {
        ratingSum += r.rating;
    });

    // Find most common mood
    const mostCommonMood = Object.entries(moodDistribution)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    // Find most common reason
    const mostCommonReason = Object.entries(reasonDistribution)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    // Calculate weekday patterns
    const weekdayPatterns = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    moodEntries.forEach(entry => {
        const day = new Date(entry.createdAt).getDay();
        weekdayPatterns[day].push(entry.intensity || 5);
    });

    const weekdayAverages = {};
    const dayNames = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
    Object.entries(weekdayPatterns).forEach(([day, values]) => {
        if (values.length > 0) {
            weekdayAverages[dayNames[day]] = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
        }
    });

    // Calculate trend (comparing first half to second half)
    const midpoint = Math.floor(moodEntries.length / 2);
    let firstHalfAvg = 0, secondHalfAvg = 0;
    if (moodEntries.length >= 4) {
        const firstHalf = moodEntries.slice(midpoint);
        const secondHalf = moodEntries.slice(0, midpoint);
        firstHalfAvg = firstHalf.reduce((sum, e) => sum + (e.intensity || 5), 0) / firstHalf.length;
        secondHalfAvg = secondHalf.reduce((sum, e) => sum + (e.intensity || 5), 0) / secondHalf.length;
    }

    const trend = secondHalfAvg > firstHalfAvg + 0.5 ? 'poprawa'
        : secondHalfAvg < firstHalfAvg - 0.5 ? 'pogorszenie'
            : 'stabilny';

    // Find best and worst rated days
    const sortedRatings = [...dayRatings].sort((a, b) => b.rating - a.rating);
    const bestDay = sortedRatings[0] ? formatDatePL(sortedRatings[0].date) : null;
    const worstDay = sortedRatings[sortedRatings.length - 1]
        ? formatDatePL(sortedRatings[sortedRatings.length - 1].date) : null;

    // Group victories by category
    const victoriesByCategory = {};
    victories.forEach(v => {
        const cat = v.category || 'inne';
        victoriesByCategory[cat] = (victoriesByCategory[cat] || 0) + 1;
    });

    return {
        // Mood statistics
        totalMoodEntries: moodEntries.length,
        averageIntensity: moodEntries.length > 0
            ? (intensitySum / moodEntries.length).toFixed(1)
            : 0,
        moodDistribution,
        mostCommonMood,
        mostCommonReason,
        moodTrend: trend,

        // Day ratings
        totalRatings: dayRatings.length,
        averageRating: dayRatings.length > 0
            ? (ratingSum / dayRatings.length).toFixed(1)
            : 0,
        bestDay,
        worstDay,
        ratingTrend: trend,

        // Victories
        totalVictories: victories.length,
        victoriesByCategory,

        // Patterns
        weekdayAverages,

        // Context for AI (limited to avoid token overuse)
        recentNotes: moodEntries.slice(0, 5).map(m => m.note).filter(Boolean),
        recentVictories: victories.slice(0, 3).map(v => v.description).filter(Boolean)
    };
};

const formatDatePL = (date) => {
    return new Date(date).toLocaleDateString('pl-PL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
};

module.exports = { aggregateUserData };
