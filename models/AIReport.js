const mongoose = require('mongoose');

const AIReportSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['weekly', 'monthly', 'on-demand'],
        required: true
    },
    periodStart: Date,
    periodEnd: Date,

    // AI-generated content
    content: {
        summary: String,
        patterns: [{
            title: String,
            description: String,
            type: { type: String, enum: ['positive', 'neutral', 'concern'] }
        }],
        strengths: [String],
        suggestions: [{
            title: String,
            description: String,
            category: String
        }],
        affirmation: String,
        weekdayInsight: String,
        comparisonWithPrevious: String
    },

    // Statistics snapshot
    stats: {
        moodEntries: Number,
        averageIntensity: Number,
        averageRating: Number,
        victories: Number,
        mostCommonMood: String
    },

    // AI metadata
    aiModel: String,
    aiEnabled: { type: Boolean, default: false },
    generationTime: Number,

    // User interaction
    viewed: { type: Boolean, default: false },
    viewedAt: Date,
    feedback: {
        helpful: { type: Boolean, default: null },
        comment: String,
        submittedAt: Date
    },

    // PDF
    pdfUrl: String,
    pdfGeneratedAt: Date

}, { timestamps: true });

AIReportSchema.index({ user: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('AIReport', AIReportSchema);
