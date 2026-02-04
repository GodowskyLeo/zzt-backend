const mongoose = require('mongoose');

const ResourceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    type: {
        type: String, // 'article', 'video', 'exercise', 'meditation', etc.
        required: true
    },
    content: {
        type: String, // Rich text content or URL
        required: true
    },
    description: {
        type: String
    },
    category: {
        type: String, // 'anxiety', 'stress', 'mindfulness', 'general', 'zasoby', etc.
        default: 'general'
    },
    thumbnail: {
        type: String // URL to thumbnail image
    },
    duration: {
        type: Number // Duration in minutes (for videos/exercises)
    },
    difficulty: {
        type: String,
        default: 'beginner'
    },
    tags: [{
        type: String
    }],
    isPublished: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    viewCount: {
        type: Number,
        default: 0
    },
    likeCount: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Index for search
ResourceSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Resource', ResourceSchema);
