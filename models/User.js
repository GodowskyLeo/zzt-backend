const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String },
    googleId: { type: String, unique: true, sparse: true },

    // Profile
    displayName: { type: String },
    avatar: { type: String, default: '' },
    ageGroup: { type: String, enum: ['13-15', '16-18', '19-25', '26-35', '36-45', '46-60', '60+', '10-15', '16-19', '20-25', '25+'], default: '19-25' },
    region: { type: String, default: 'mazowieckie' },

    // Role & Permissions
    role: {
        type: String,
        enum: ['user', 'moderator', 'admin'],
        default: 'user'
    },
    isUpgraded: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String },
    verificationCodeExpires: { type: Date },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },

    // Suspension
    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date },
    suspendedReason: { type: String },
    suspendedBy: { type: String }, // Admin ID who suspended

    // Activity Tracking
    lastLoginAt: { type: Date },
    lastActiveAt: { type: Date },
    loginCount: { type: Number, default: 0 },

    // Notifications & Preferences
    seenAnnouncements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Announcement' }],
    emailNotifications: { type: Boolean, default: true },

    createdAt: { type: Date, default: Date.now }
});

// Index for admin search
userSchema.index({ email: 'text', displayName: 'text' });

module.exports = mongoose.model('User', userSchema);