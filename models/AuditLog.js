const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    adminEmail: {
        type: String // Denormalized for quick display
    },
    action: {
        type: String,
        required: true
        // Examples: 'user.suspend', 'user.delete', 'group.delete', 'resource.create', 
        // 'announcement.create', 'config.update', 'moderation.resolve'
    },
    category: {
        type: String,
        enum: ['user', 'group', 'resource', 'announcement', 'moderation', 'system', 'security'],
        required: true
    },
    targetType: {
        type: String,
        enum: ['user', 'group', 'resource', 'post', 'announcement', 'config', 'ip', 'system']
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId
    },
    targetLabel: {
        type: String // Human-readable identifier (e.g., email, group name)
    },
    details: {
        type: mongoose.Schema.Types.Mixed // Additional context (before/after values, reason, etc.)
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low'
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    success: {
        type: Boolean,
        default: true
    },
    errorMessage: {
        type: String
    }
}, { timestamps: true });

// Indexes for efficient querying
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
AuditLogSchema.index({ category: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
