const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Models
const User = require('../models/User');
const Group = require('../models/Group');
const Post = require('../models/Post');
const MoodEntry = require('../models/MoodEntry');
const Resource = require('../models/Resource');
const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');
const FlaggedContent = require('../models/FlaggedContent');
const SystemConfig = require('../models/SystemConfig');
const { sendBanNotification } = require('../services/emailService');

// Helper: Log admin action
const logAction = async (req, action, category, targetType, targetId, targetLabel, details = {}, severity = 'low') => {
    try {
        await AuditLog.create({
            adminId: req.user.id,
            adminEmail: req.user.email,
            action,
            category,
            targetType,
            targetId,
            targetLabel,
            details,
            severity,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('User-Agent')
        });
    } catch (err) {
        console.error('Failed to log admin action:', err);
    }
};



// @route   GET /api/admin/stats
// @desc    Get dashboard statistics
router.get('/stats', [auth, admin], async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [
            totalUsers,
            newUsersToday,
            newUsersWeek,
            activeUsers,
            totalGroups,
            activeGroups,
            totalMoods,
            moodsToday,
            totalPosts,
            pendingFlags
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: todayStart } }),
            User.countDocuments({ createdAt: { $gte: weekAgo } }),
            User.countDocuments({ lastActiveAt: { $gte: weekAgo } }),
            Group.countDocuments(),
            Group.countDocuments({ 'members.0': { $exists: true } }),
            MoodEntry.countDocuments(),
            MoodEntry.countDocuments({ createdAt: { $gte: todayStart } }),
            Post.countDocuments(),
            FlaggedContent.countDocuments({ status: 'pending' })
        ]);

        res.json({
            users: {
                total: totalUsers,
                newToday: newUsersToday,
                newThisWeek: newUsersWeek,
                activeThisWeek: activeUsers
            },
            groups: {
                total: totalGroups,
                active: activeGroups
            },
            content: {
                totalMoods,
                moodsToday,
                totalPosts
            },
            moderation: {
                pendingFlags
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   GET /api/admin/stats/charts
// @desc    Get chart data for dashboard
router.get('/stats/charts', [auth, admin], async (req, res) => {
    try {
        const { range = '30' } = req.query;
        const daysBack = parseInt(range);
        const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

        // User registrations over time
        const userRegistrations = await User.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Mood distribution
        const moodDistribution = await MoodEntry.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $bucket: {
                    groupBy: '$mood',
                    boundaries: [1, 4, 7, 11],
                    default: 'other',
                    output: { count: { $sum: 1 } }
                }
            }
        ]);

        // Activity by region
        const regionActivity = await User.aggregate([
            { $group: { _id: '$region', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Moods over time
        const moodsTrend = await MoodEntry.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    avgMood: { $avg: '$mood' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            userRegistrations,
            moodDistribution,
            regionActivity,
            moodsTrend
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   GET /api/admin/activity-feed
// @desc    Get recent activity feed
router.get('/activity-feed', [auth, admin], async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        const [recentUsers, recentPosts, recentMoods, recentLogs] = await Promise.all([
            User.find().sort({ createdAt: -1 }).limit(5).select('email createdAt'),
            Post.find().sort({ createdAt: -1 }).limit(5).populate('user', 'email').populate('group', 'name'),
            MoodEntry.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'email'),
            AuditLog.find().sort({ createdAt: -1 }).limit(10)
        ]);

        // Combine and format
        const activities = [
            ...recentUsers.map(u => ({ type: 'user_registered', data: u, timestamp: u.createdAt })),
            ...recentPosts.map(p => ({ type: 'post_created', data: p, timestamp: p.createdAt })),
            ...recentMoods.map(m => ({ type: 'mood_logged', data: m, timestamp: m.createdAt })),
            ...recentLogs.map(l => ({ type: 'admin_action', data: l, timestamp: l.createdAt }))
        ].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);

        res.json(activities);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});



// @route   GET /api/admin/users
// @desc    Get all users with pagination and search
router.get('/users', [auth, admin], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const status = req.query.status; // 'active', 'suspended', 'all'
        const role = req.query.role;
        const region = req.query.region;

        let query = {};

        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { displayName: { $regex: search, $options: 'i' } }
            ];
        }

        if (status === 'suspended') query.isSuspended = true;
        if (status === 'active') query.isSuspended = { $ne: true };
        if (role) query.role = role;
        if (region) query.region = region;

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            User.countDocuments(query)
        ]);

        res.json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   GET /api/admin/users/:id
// @desc    Get detailed user profile
router.get('/users/:id', [auth, admin], async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'Użytkownik nie znaleziony' });

        // Get user's activity
        const [moodCount, postCount, groupMemberships] = await Promise.all([
            MoodEntry.countDocuments({ userId: req.params.id }),
            Post.countDocuments({ user: req.params.id }),
            Group.find({ members: req.params.id }).select('name')
        ]);

        // Recent moods
        const recentMoods = await MoodEntry.find({ userId: req.params.id })
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            user,
            stats: {
                moodCount,
                postCount,
                groupCount: groupMemberships.length
            },
            groups: groupMemberships,
            recentMoods
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   PUT /api/admin/users/:id/suspend
// @desc    Suspend or unsuspend a user
router.put('/users/:id/suspend', [auth, admin], async (req, res) => {
    try {
        const { reason } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: 'Użytkownik nie znaleziony' });

        const newStatus = !user.isSuspended;

        user.isSuspended = newStatus;
        if (newStatus) {
            user.suspendedAt = new Date();
            user.suspendedReason = reason || 'Naruszenie regulaminu';
            user.suspendedBy = req.user.id;
        } else {
            user.suspendedAt = undefined;
            user.suspendedReason = undefined;
            user.suspendedBy = undefined;
        }

        await user.save();

        if (newStatus && user.email) {
            // Send email notification
            await sendBanNotification(user.email, user.suspendedReason);
        }

        await logAction(
            req,
            newStatus ? 'user.suspend' : 'user.unsuspend',
            'user',
            'user',
            user._id,
            user.email,
            { reason },
            'high'
        );

        res.json({
            msg: newStatus ? 'Użytkownik zawieszony' : 'Zawieszenie usunięte',
            user
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   PUT /api/admin/users/:id/role
// @desc    Change user role
router.put('/users/:id/role', [auth, admin], async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'moderator', 'admin'].includes(role)) {
            return res.status(400).json({ msg: 'Nieprawidłowa rola' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true }
        ).select('-password');

        if (!user) return res.status(404).json({ msg: 'Użytkownik nie znaleziony' });

        await logAction(req, 'user.role_change', 'user', 'user', user._id, user.email, { newRole: role }, 'high');

        res.json({ msg: 'Rola zaktualizowana', user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user permanently
router.delete('/users/:id', [auth, admin], async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: 'Użytkownik nie znaleziony' });

        const userEmail = user.email;

        // Cascade delete user's content
        await Promise.all([
            MoodEntry.deleteMany({ userId: req.params.id }),
            Post.deleteMany({ user: req.params.id }),
            // Remove from groups
            Group.updateMany({}, { $pull: { members: req.params.id } })
        ]);

        await User.findByIdAndDelete(req.params.id);

        await logAction(req, 'user.delete', 'user', 'user', req.params.id, userEmail, {}, 'critical');

        res.json({ msg: 'Użytkownik usunięty' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});



// @route   GET /api/admin/groups
// @desc    Get all groups
router.get('/groups', [auth, admin], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';

        let query = {};
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const [groups, total] = await Promise.all([
            Group.find(query)
                .populate('leaderId', 'email displayName')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Group.countDocuments(query)
        ]);

        // Add member counts
        const groupsWithStats = groups.map(g => ({
            ...g.toObject(),
            memberCount: g.members?.length || 0
        }));

        res.json({
            groups: groupsWithStats,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   DELETE /api/admin/groups/:id
// @desc    Force delete a group
router.delete('/groups/:id', [auth, admin], async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        const groupName = group.name;

        // Delete associated content
        await Post.deleteMany({ group: req.params.id });
        await Group.findByIdAndDelete(req.params.id);

        await logAction(req, 'group.delete', 'group', 'group', req.params.id, groupName, {}, 'high');

        res.json({ msg: 'Grupa usunięta' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});



// @route   GET /api/admin/moderation/queue
// @desc    Get pending flagged content
router.get('/moderation/queue', [auth, admin], async (req, res) => {
    try {
        const { status = 'pending', priority } = req.query;

        let query = {};
        if (status !== 'all') query.status = status;
        if (priority) query.priority = priority;

        const flags = await FlaggedContent.find(query)
            .populate('reportedBy', 'email')
            .populate('contentAuthor', 'email')
            .populate('reviewedBy', 'email')
            .sort({ priority: -1, createdAt: -1 })
            .limit(50);

        const stats = await FlaggedContent.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        res.json({ flags, stats });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   PUT /api/admin/moderation/:id/resolve
// @desc    Resolve a flagged item
router.put('/moderation/:id/resolve', [auth, admin], async (req, res) => {
    try {
        const { resolution, note, action } = req.body;
        // action: 'delete_content', 'warn_user', 'suspend_user', 'dismiss'

        const flag = await FlaggedContent.findById(req.params.id);
        if (!flag) return res.status(404).json({ msg: 'Zgłoszenie nie znalezione' });

        flag.status = 'resolved';
        flag.resolution = resolution;
        flag.resolutionNote = note;
        flag.reviewedBy = req.user.id;
        flag.resolvedAt = new Date();
        flag.actionsTaken.push({
            action: action,
            by: req.user.id
        });

        await flag.save();

        // Execute action
        if (action === 'delete_content' && flag.contentType === 'post') {
            await Post.findByIdAndDelete(flag.contentId);
        } else if (action === 'suspend_user' && flag.contentAuthor) {
            await User.findByIdAndUpdate(flag.contentAuthor, {
                isSuspended: true,
                suspendedAt: new Date(),
                suspendedReason: 'Naruszenie zasad społeczności',
                suspendedBy: req.user.id
            });
        }

        await logAction(req, 'moderation.resolve', 'moderation', flag.contentType, flag.contentId, null, { resolution, action }, 'medium');

        res.json({ msg: 'Zgłoszenie rozwiązane', flag });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   GET /api/admin/moderation/ban-words
// @desc    Get ban words list
router.get('/moderation/ban-words', [auth, admin], async (req, res) => {
    try {
        const config = await SystemConfig.findOne({ key: 'ban_words' });
        res.json({ words: config?.value || [] });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   POST /api/admin/moderation/ban-words
// @desc    Add ban word
router.post('/moderation/ban-words', [auth, admin], async (req, res) => {
    try {
        const { word } = req.body;
        await SystemConfig.findOneAndUpdate(
            { key: 'ban_words' },
            { $addToSet: { value: word.toLowerCase() } },
            { upsert: true }
        );
        await logAction(req, 'moderation.add_ban_word', 'moderation', 'system', null, null, { word }, 'low');
        res.json({ msg: 'Słowo dodane' });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});



// @route   GET /api/admin/announcements
// @desc    Get all announcements
router.get('/announcements', [auth, admin], async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .populate('createdBy', 'email')
            .sort({ createdAt: -1 });
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   POST /api/admin/announcements
// @desc    Create announcement
router.post('/announcements', [auth, admin], async (req, res) => {
    try {
        const { title, message, type, priority, targetAudience, expiresAt, actionUrl, dismissible } = req.body;

        const announcement = new Announcement({
            title,
            message,
            type: type || 'info',
            priority: priority || 'medium',
            targetAudience: targetAudience || 'all',
            expiresAt,
            actionUrl,
            dismissible: dismissible !== false,
            createdBy: req.user.id
        });

        await announcement.save();
        await logAction(req, 'announcement.create', 'announcement', 'announcement', announcement._id, title, {}, 'medium');

        res.json(announcement);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   PUT /api/admin/announcements/:id
// @desc    Update/deactivate announcement
router.put('/announcements/:id', [auth, admin], async (req, res) => {
    try {
        const { isActive, ...updates } = req.body;

        const announcement = await Announcement.findByIdAndUpdate(
            req.params.id,
            { isActive, ...updates },
            { new: true }
        );

        if (!announcement) return res.status(404).json({ msg: 'Ogłoszenie nie znalezione' });

        await logAction(req, 'announcement.update', 'announcement', 'announcement', announcement._id, announcement.title, { isActive }, 'low');

        res.json(announcement);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   DELETE /api/admin/announcements/:id
// @desc    Delete announcement
router.delete('/announcements/:id', [auth, admin], async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) return res.status(404).json({ msg: 'Ogłoszenie nie znalezione' });

        await logAction(req, 'announcement.delete', 'announcement', 'announcement', announcement._id, announcement.title, {}, 'medium');

        await Announcement.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Ogłoszenie zostało usunięte' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Public endpoint for active announcements
router.get('/announcements/active', auth, async (req, res) => {
    try {
        const now = new Date();
        const announcements = await Announcement.find({
            isActive: true,
            $or: [
                { expiresAt: { $gt: now } },
                { expiresAt: null }
            ]
        }).sort({ priority: -1, createdAt: -1 });

        res.json(announcements);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});



// @route   GET /api/admin/resources
// @desc    Get all resources
router.get('/resources', [auth, admin], async (req, res) => {
    try {
        const { type, category, published } = req.query;
        let query = {};
        if (type) query.type = type;
        if (category) query.category = category;
        if (published !== undefined) query.isPublished = published === 'true';

        const resources = await Resource.find(query)
            .populate('createdBy', 'email')
            .sort({ createdAt: -1 });

        res.json(resources);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   POST /api/admin/resources
// @desc    Create resource
router.post('/resources', [auth, admin], async (req, res) => {
    try {
        const { title, type, content, description, category, thumbnail, duration, difficulty, tags } = req.body;

        const resource = new Resource({
            title,
            type,
            content,
            description,
            category,
            thumbnail,
            duration,
            difficulty,
            tags,
            createdBy: req.user.id
        });

        await resource.save();
        await logAction(req, 'resource.create', 'resource', 'resource', resource._id, title, { type }, 'low');

        res.json(resource);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   PUT /api/admin/resources/:id
// @desc    Update resource
router.put('/resources/:id', [auth, admin], async (req, res) => {
    try {
        const resource = await Resource.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedBy: req.user.id },
            { new: true }
        );

        if (!resource) return res.status(404).json({ msg: 'Zasób nie znaleziony' });

        await logAction(req, 'resource.update', 'resource', 'resource', resource._id, resource.title, {}, 'low');

        res.json(resource);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   PUT /api/admin/resources/:id/publish
// @desc    Toggle publish status
router.put('/resources/:id/publish', [auth, admin], async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ msg: 'Zasób nie znaleziony' });

        resource.isPublished = !resource.isPublished;
        await resource.save();

        await logAction(req, resource.isPublished ? 'resource.publish' : 'resource.unpublish', 'resource', 'resource', resource._id, resource.title, {}, 'low');

        res.json(resource);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   DELETE /api/admin/resources/:id
// @desc    Delete resource
router.delete('/resources/:id', [auth, admin], async (req, res) => {
    try {
        const resource = await Resource.findByIdAndDelete(req.params.id);
        if (!resource) return res.status(404).json({ msg: 'Zasób nie znaleziony' });

        await logAction(req, 'resource.delete', 'resource', 'resource', req.params.id, resource.title, {}, 'medium');

        res.json({ msg: 'Zasób usunięty' });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});



// @route   GET /api/admin/config
// @desc    Get all system configurations
router.get('/config', [auth, admin], async (req, res) => {
    try {
        const configs = await SystemConfig.find().sort({ category: 1, key: 1 });
        res.json(configs);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   PUT /api/admin/config/:key
// @desc    Update a configuration
router.put('/config/:key', [auth, admin], async (req, res) => {
    try {
        const { value, reason } = req.body;

        const config = await SystemConfig.findOne({ key: req.params.key });
        if (!config) return res.status(404).json({ msg: 'Konfiguracja nie znaleziona' });

        const previousValue = config.value;

        config.value = value;
        config.updatedBy = req.user.id;
        config.history.push({
            previousValue,
            changedBy: req.user.id,
            reason
        });

        await config.save();

        await logAction(req, 'config.update', 'system', 'config', config._id, req.params.key, { previousValue, newValue: value }, config.key.includes('security') ? 'high' : 'medium');

        res.json(config);
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   POST /api/admin/maintenance/toggle
// @desc    Toggle maintenance mode
router.post('/maintenance/toggle', [auth, admin], async (req, res) => {
    try {
        const { message } = req.body;

        const maintenanceConfig = await SystemConfig.findOne({ key: 'maintenance_mode' });
        const newValue = !maintenanceConfig?.value;

        await SystemConfig.findOneAndUpdate(
            { key: 'maintenance_mode' },
            { value: newValue, updatedBy: req.user.id },
            { upsert: true }
        );

        if (message) {
            await SystemConfig.findOneAndUpdate(
                { key: 'maintenance_message' },
                { value: message, updatedBy: req.user.id },
                { upsert: true }
            );
        }

        await logAction(req, 'maintenance.toggle', 'system', 'system', null, null, { enabled: newValue }, 'critical');

        res.json({ maintenanceMode: newValue, message });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// ============================================
// AUDIT & SECURITY
// ============================================

// @route   GET /api/admin/audit-logs
// @desc    Get audit logs
router.get('/audit-logs', [auth, admin], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const { category, action, adminId } = req.query;

        let query = {};
        if (category) query.category = category;
        if (action) query.action = { $regex: action, $options: 'i' };
        if (adminId) query.adminId = adminId;

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            AuditLog.countDocuments(query)
        ]);

        res.json({
            logs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   POST /api/admin/security/block-ip
// @desc    Block an IP address
router.post('/security/block-ip', [auth, admin], async (req, res) => {
    try {
        const { ip, reason } = req.body;

        await SystemConfig.findOneAndUpdate(
            { key: 'blocked_ips' },
            { $addToSet: { value: { ip, reason, blockedAt: new Date(), blockedBy: req.user.id } } },
            { upsert: true }
        );

        await logAction(req, 'security.block_ip', 'security', 'ip', null, ip, { reason }, 'high');

        res.json({ msg: 'IP zablokowane' });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   GET /api/admin/security/blocked-ips
// @desc    Get blocked IPs
router.get('/security/blocked-ips', [auth, admin], async (req, res) => {
    try {
        const config = await SystemConfig.findOne({ key: 'blocked_ips' });
        res.json({ blockedIps: config?.value || [] });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// @route   DELETE /api/admin/security/block-ip/:ip
// @desc    Unblock an IP
router.delete('/security/block-ip/:ip', [auth, admin], async (req, res) => {
    try {
        await SystemConfig.findOneAndUpdate(
            { key: 'blocked_ips' },
            { $pull: { value: { ip: req.params.ip } } }
        );

        await logAction(req, 'security.unblock_ip', 'security', 'ip', null, req.params.ip, {}, 'medium');

        res.json({ msg: 'IP odblokowane' });
    } catch (err) {
        res.status(500).json({ msg: 'Błąd serwera' });
    }
});

// Initialize default configs on first load
SystemConfig.initDefaults().catch(console.error);

module.exports = router;
