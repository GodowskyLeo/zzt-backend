const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['info', 'warning', 'success', 'maintenance', 'update'],
        default: 'info'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    targetAudience: {
        type: String,
        enum: ['all', 'users', 'leaders', 'premium', 'region'],
        default: 'all'
    },
    targetRegion: {
        type: String // Only used if targetAudience is 'region'
    },
    actionUrl: {
        type: String // Optional link for "Learn more" button
    },
    actionText: {
        type: String,
        default: 'Dowiedz się więcej'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    showOnce: {
        type: Boolean,
        default: false // If true, user sees it only once
    },
    dismissible: {
        type: Boolean,
        default: true
    },
    expiresAt: {
        type: Date
    },
    viewCount: {
        type: Number,
        default: 0
    },
    dismissCount: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
