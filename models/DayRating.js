const mongoose = require('mongoose');

const DayRatingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    note: {
        type: String,
        maxlength: 200
    },
    moodEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MoodEntry'
    }
}, { timestamps: true });

// Ensure one rating per user per day
DayRatingSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DayRating', DayRatingSchema);
