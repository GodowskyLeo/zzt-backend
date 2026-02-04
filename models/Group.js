const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
        type: String,
        enum: ['support', 'growth', 'stress', 'general'],
        default: 'general'
    },

    // Visibility: public groups are searchable, private are invite-only
    visibility: {
        type: String,
        enum: ['public', 'private'],
        default: 'public'
    },

    leaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Join code for sharing
    joinCode: {
        code: { type: String, unique: true, sparse: true },
        expiresAt: { type: Date },
        maxUses: { type: Number, default: 0 }, // 0 = unlimited
        usedCount: { type: Number, default: 0 }
    },

    // Invite settings
    inviteSettings: {
        codeEnabled: { type: Boolean, default: true },
        emailEnabled: { type: Boolean, default: false },
        requireApproval: { type: Boolean, default: false }
    },

    // Email invitations
    pendingInvites: [{
        email: { type: String, required: true },
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        token: String, // Unique token for email link
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined', 'expired'],
            default: 'pending'
        }
    }],

    // Access list for private groups - pre-approved emails
    accessList: [{
        email: String,
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now }
    }],

    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    announcements: [{
        content: String,
        createdAt: { type: Date, default: Date.now }
    }],

    polls: [{
        question: String,
        options: [{ text: String, votes: { type: Number, default: 0 } }],
        voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        isActive: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now }
    }],

    createdAt: { type: Date, default: Date.now }
});

// Generate a unique join code
groupSchema.methods.generateJoinCode = function (expiresInDays = 7) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    this.joinCode = {
        code,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        maxUses: 0,
        usedCount: 0
    };

    return code;
};

// Check if user can access this group
groupSchema.methods.canAccess = function (userId, userEmail, isAdmin = false) {
    // Admins can access everything
    if (isAdmin) return true;

    // Leader always has access
    if (this.leaderId.toString() === userId.toString()) return true;

    // Members have access
    if (this.members.some(m => m.toString() === userId.toString())) return true;

    // For private groups, check access list
    if (this.visibility === 'private') {
        return this.accessList.some(a => a.email.toLowerCase() === userEmail.toLowerCase());
    }

    // Public groups are accessible
    return this.visibility === 'public';
};

module.exports = mongoose.model('Group', groupSchema);