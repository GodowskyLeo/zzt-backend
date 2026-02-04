const mongoose = require('mongoose');

const FlaggedContentSchema = new mongoose.Schema({
    contentType: {
        type: String,
        enum: ['post', 'comment', 'group', 'user', 'resource'],
        required: true
    },
    contentId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    contentPreview: {
        type: String // Snippet of the flagged content for quick review
    },
    contentAuthor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        enum: ['spam', 'harassment', 'hate_speech', 'inappropriate', 'misinformation', 'self_harm', 'violence', 'other'],
        required: true
    },
    description: {
        type: String // User's explanation
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['pending', 'in_review', 'resolved', 'dismissed', 'escalated'],
        default: 'pending'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Moderator assigned to review
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolution: {
        type: String,
        enum: ['content_removed', 'user_warned', 'user_suspended', 'no_action', 'false_report']
    },
    resolutionNote: {
        type: String
    },
    actionsTaken: [{
        action: String,
        timestamp: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    resolvedAt: {
        type: Date
    },
    // Auto-detection flags
    autoDetected: {
        type: Boolean,
        default: false
    },
    autoDetectionReason: {
        type: String // e.g., "Matched ban word: xxx"
    }
}, { timestamps: true });

// Indexes
FlaggedContentSchema.index({ status: 1, priority: -1, createdAt: -1 });
FlaggedContentSchema.index({ contentType: 1, status: 1 });
FlaggedContentSchema.index({ reportedBy: 1 });
FlaggedContentSchema.index({ contentAuthor: 1 });

module.exports = mongoose.model('FlaggedContent', FlaggedContentSchema);
