const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
        // Examples: 'maintenance_mode', 'feature_groups', 'feature_premium', 
        // 'max_group_size', 'rate_limit_requests', 'ban_words'
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    valueType: {
        type: String,
        enum: ['boolean', 'number', 'string', 'array', 'object'],
        required: true
    },
    category: {
        type: String,
        enum: ['feature_flags', 'limits', 'maintenance', 'security', 'notifications', 'other'],
        default: 'other'
    },
    description: {
        type: String
    },
    isPublic: {
        type: Boolean,
        default: false // If true, can be fetched by non-admin endpoints
    },
    requiresRestart: {
        type: Boolean,
        default: false
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    history: [{
        previousValue: mongoose.Schema.Types.Mixed,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        reason: String
    }]
}, { timestamps: true });

// Default configurations initialization
SystemConfigSchema.statics.initDefaults = async function () {
    const defaults = [
        { key: 'maintenance_mode', value: false, valueType: 'boolean', category: 'maintenance', description: 'Enable/disable maintenance mode', isPublic: true },
        { key: 'maintenance_message', value: 'Aplikacja jest w trakcie konserwacji. Przepraszamy za niedogodności.', valueType: 'string', category: 'maintenance', description: 'Message shown during maintenance' },
        { key: 'feature_groups', value: true, valueType: 'boolean', category: 'feature_flags', description: 'Enable groups feature' },
        { key: 'feature_premium', value: false, valueType: 'boolean', category: 'feature_flags', description: 'Enable premium features' },
        { key: 'feature_ai_recommendations', value: true, valueType: 'boolean', category: 'feature_flags', description: 'Enable AI-powered recommendations' },
        { key: 'max_group_size', value: 100, valueType: 'number', category: 'limits', description: 'Maximum members per group' },
        { key: 'max_groups_per_user', value: 5, valueType: 'number', category: 'limits', description: 'Maximum groups a user can join' },
        { key: 'rate_limit_requests', value: 100, valueType: 'number', category: 'security', description: 'Max API requests per minute' },
        { key: 'max_login_attempts', value: 5, valueType: 'number', category: 'security', description: 'Max failed login attempts before lockout' },
        { key: 'ban_words', value: [], valueType: 'array', category: 'security', description: 'List of banned words for auto-moderation' },
        { key: 'blocked_ips', value: [], valueType: 'array', category: 'security', description: 'List of blocked IP addresses' }
    ];

    for (const config of defaults) {
        await this.findOneAndUpdate(
            { key: config.key },
            { $setOnInsert: config },
            { upsert: true, new: true }
        );
    }
};

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
