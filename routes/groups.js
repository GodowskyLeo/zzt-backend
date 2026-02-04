
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Group = require('../models/Group');
const User = require('../models/User');
const Post = require('../models/Post');
const MoodEntry = require('../models/MoodEntry');
const crypto = require('crypto');
const emailService = require('../services/emailService');

// Admin emails - should match other files
const ADMIN_EMAILS = [
    'nowyadreskajtka@gmail.com',
    'admin@barometr.example.com',
    'lukdol709@gmail.com',
    'Andrzej.galechan@gmail.com',
    'krysspinn@gmail.com',
    'fjagnyziak@gmail.com'
];

const generateJoinCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

const isAdmin = (email) => ADMIN_EMAILS.includes(email);

// Pobierz grupy użytkownika (do których należy)
router.get('/', auth, async (req, res) => {
    try {
        const groups = await Group.find({ members: req.user.id })
            .populate('leaderId', 'name')
            .sort({ createdAt: -1 });
        res.json(groups);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Pobierz grupy publiczne (do "Odkryj") - hide private groups
router.get('/public', async (req, res) => {
    try {
        const groups = await Group.find({ visibility: { $ne: 'private' } })
            .populate('leaderId', 'name')
            .sort({ members: -1 })
            .limit(10);
        res.json(groups);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Create group with visibility option
router.post('/', auth, async (req, res) => {
    const { name, description, type, visibility } = req.body;
    try {
        const newGroup = new Group({
            name,
            description,
            type,
            visibility: visibility || 'public',
            leaderId: req.user.id,
            members: [req.user.id]
        });

        // For private groups, generate a join code immediately
        if (visibility === 'private') {
            newGroup.generateJoinCode(7);
        }

        const group = await newGroup.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Create Announcement
router.post('/:groupId/announcements', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });
        if (group.leaderId.toString() !== req.user.id) return res.status(401).json({ msg: 'Tylko lider może dodawać ogłoszenia' });

        group.announcements.unshift({ content: req.body.content });
        await group.save();

        // Send notification logic here

        res.json(group);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Create Poll
router.post('/:groupId/polls', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });
        if (group.leaderId.toString() !== req.user.id) return res.status(401).json({ msg: 'Tylko lider może tworzyć ankiety' });

        const { question, options } = req.body; // options: ["A", "B"]
        const pollOptions = options.map(text => ({ text, votes: 0 }));

        group.polls.unshift({ question, options: pollOptions });
        await group.save();
        res.json(group);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Vote in Poll
router.post('/:groupId/polls/:pollId/vote', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        const poll = group.polls.id(req.params.pollId);
        if (!poll) return res.status(404).json({ msg: 'Ankieta nie znaleziona' });

        if (poll.voters.includes(req.user.id)) {
            return res.status(400).json({ msg: 'Już głosowałeś' });
        }

        const optionIndex = req.body.optionIndex;
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
            return res.status(400).json({ msg: 'Nieprawidłowa opcja' });
        }

        poll.options[optionIndex].votes++;
        poll.voters.push(req.user.id);
        await group.save();
        res.json(group);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});



router.post('/join', async (req, res) => {
    const { joinCode, userId } = req.body;
    try {
        const group = await Group.findOne({ 'joinCode.code': joinCode, 'joinCode.expiresAt': { $gt: new Date() } });
        if (!group) return res.status(404).json({ msg: 'Nieprawidłowy lub nieważny kod grupy' });


        if (group.members.includes(userId)) {
            return res.status(400).json({ msg: 'Już jesteś w tej grupie' });
        }

        group.members.push(userId);
        await group.save();
        res.json({ msg: 'Pomyślnie dołączono do grupy', groupName: group.name });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Join public group by ID
router.post('/:groupId/join', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        if (group.visibility === 'private') {
            return res.status(403).json({ msg: 'To jest grupa prywatna. Użyj kodu zaproszenia.' });
        }

        if (group.members.includes(req.user.id)) {
            return res.status(400).json({ msg: 'Już jesteś w tej grupie' });
        }

        group.members.push(req.user.id);
        await group.save();

        res.json({ msg: 'Dołączono do grupy', groupName: group.name });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});



// Generate/regenerate join code (for leader)
router.post('/:groupId/invite-code', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Nie znaleziono grupy' });

        const user = await User.findById(req.user.id);
        if (group.leaderId.toString() !== req.user.id && !isAdmin(user?.email)) {
            return res.status(401).json({ msg: 'Brak autoryzacji' });
        }

        const expiresInDays = req.body.expiresInDays || 7;
        const code = group.generateJoinCode(expiresInDays);
        await group.save();

        res.json({
            code,
            expiresAt: group.joinCode.expiresAt,
            groupName: group.name
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Get join code (for leader) - keeping old route for compatibility
router.get('/code/:groupId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Nie znaleziono grupy' });

        const user = await User.findById(req.user.id);
        if (group.leaderId.toString() !== req.user.id && !isAdmin(user?.email)) {
            return res.status(401).json({ msg: 'Brak autoryzacji' });
        }

        // Generate new code if none exists or expired
        if (!group.joinCode?.code || new Date(group.joinCode.expiresAt) < new Date()) {
            group.generateJoinCode(7);
            await group.save();
        }

        res.json(group.joinCode);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Invite via email
router.post('/:groupId/invite-email', auth, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ msg: 'Email jest wymagany' });

        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Nie znaleziono grupy' });

        const user = await User.findById(req.user.id);
        if (group.leaderId.toString() !== req.user.id && !isAdmin(user?.email)) {
            return res.status(401).json({ msg: 'Brak autoryzacji' });
        }

        // Check if already invited
        const alreadyInvited = group.pendingInvites.some(
            inv => inv.email.toLowerCase() === email.toLowerCase() && inv.status === 'pending'
        );
        if (alreadyInvited) {
            return res.status(400).json({ msg: 'Ten email już został zaproszony' });
        }

        // Check if already a member
        const invitedUser = await User.findOne({ email: email.toLowerCase() });
        if (invitedUser && group.members.includes(invitedUser._id)) {
            return res.status(400).json({ msg: 'Ta osoba jest już członkiem grupy' });
        }

        // Create invite
        const token = crypto.randomBytes(32).toString('hex');
        group.pendingInvites.push({
            email: email.toLowerCase(),
            invitedBy: req.user.id,
            token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
        });

        // Add to access list for private groups
        if (group.visibility === 'private') {
            group.accessList.push({
                email: email.toLowerCase(),
                addedBy: req.user.id
            });
        }

        await group.save();

        // Send email logic here
        const emailSent = await emailService.sendGroupInviteEmail(email, token, group.name);

        if (!emailSent) {
            console.error('Failed to send invite email to', email);
            // We continue anyway since the invite is created in DB
        }
        res.json({
            msg: 'Zaproszenie wysłane',
            token, // In production, don't return token - send via email
            email
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Accept email invite
router.post('/join/invite/:token', auth, async (req, res) => {
    try {
        const group = await Group.findOne({
            'pendingInvites.token': req.params.token,
            'pendingInvites.status': 'pending'
        });

        if (!group) {
            return res.status(404).json({ msg: 'Zaproszenie nieważne lub wygasło' });
        }

        const invite = group.pendingInvites.find(inv => inv.token === req.params.token);

        // Check expiration
        if (new Date(invite.expiresAt) < new Date()) {
            invite.status = 'expired';
            await group.save();
            return res.status(400).json({ msg: 'Zaproszenie wygasło' });
        }

        // Check email matches
        const user = await User.findById(req.user.id);
        if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
            return res.status(403).json({ msg: 'To zaproszenie jest dla innego adresu email' });
        }

        // Add member
        if (!group.members.includes(req.user.id)) {
            group.members.push(req.user.id);
        }

        invite.status = 'accepted';
        await group.save();

        res.json({ msg: 'Dołączono do grupy', groupName: group.name, groupId: group._id });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Get pending invites for a group (leader only)
router.get('/:groupId/invites', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Nie znaleziono grupy' });

        const user = await User.findById(req.user.id);
        if (group.leaderId.toString() !== req.user.id && !isAdmin(user?.email)) {
            return res.status(401).json({ msg: 'Brak autoryzacji' });
        }

        const pendingInvites = group.pendingInvites
            .filter(inv => inv.status === 'pending')
            .map(inv => ({
                id: inv._id,
                email: inv.email,
                createdAt: inv.createdAt,
                expiresAt: inv.expiresAt
            }));

        res.json(pendingInvites);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Cancel pending invite
router.delete('/:groupId/invites/:inviteId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Nie znaleziono grupy' });

        const user = await User.findById(req.user.id);
        if (group.leaderId.toString() !== req.user.id && !isAdmin(user?.email)) {
            return res.status(401).json({ msg: 'Brak autoryzacji' });
        }

        const invite = group.pendingInvites.id(req.params.inviteId);
        if (!invite) return res.status(404).json({ msg: 'Zaproszenie nie znalezione' });

        invite.status = 'declined';
        await group.save();

        res.json({ msg: 'Zaproszenie anulowane' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Get group mood calendar - aggregated mood data for the month
router.get('/:groupId/mood-calendar', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        // Check if user is a member
        if (!group.members.includes(req.user.id)) {
            return res.status(403).json({ msg: 'Nie jesteś członkiem tej grupy' });
        }

        // Get all mood entries for group members this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const moodEntries = await MoodEntry.find({
            user: { $in: group.members },
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        });

        // Aggregate by day
        const dailyMoods = {};
        moodEntries.forEach(entry => {
            const day = new Date(entry.createdAt).getDate();
            if (!dailyMoods[day]) {
                dailyMoods[day] = { total: 0, count: 0 };
            }
            // Convert string mood to numeric or use intensity
            const moodValue = entry.intensity || 5;
            dailyMoods[day].total += moodValue;
            dailyMoods[day].count++;
        });

        // Convert to array with averages
        const calendarData = Object.entries(dailyMoods).map(([day, data]) => ({
            date: new Date(now.getFullYear(), now.getMonth(), parseInt(day)),
            averageMood: data.total / data.count
        }));

        res.json(calendarData);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Pobierz szczegóły grupy - check access for private groups
router.get('/:groupId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId)
            .populate('leaderId', 'name email');

        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        const user = await User.findById(req.user.id);
        const userIsAdmin = isAdmin(user?.email);
        const isMember = group.members.some(m => m.toString() === req.user.id);
        const isLeader = group.leaderId._id.toString() === req.user.id;

        // For private groups, check access
        if (group.visibility === 'private' && !isMember && !isLeader && !userIsAdmin) {
            // Check access list
            const hasAccess = group.accessList.some(
                a => a.email.toLowerCase() === user?.email?.toLowerCase()
            );
            if (!hasAccess) {
                return res.status(403).json({ msg: 'Nie masz dostępu do tej grupy prywatnej' });
            }
        }

        // Prepare response - include join code only for leader/admin
        const response = group.toObject();
        if (!isLeader && !userIsAdmin) {
            delete response.joinCode;
            delete response.pendingInvites;
            delete response.accessList;
        }

        res.json(response);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Grupa nie znaleziona' });
        res.status(500).send('Błąd serwera');
    }
});

// Pobierz posty z grupy
router.get('/:groupId/posts', auth, async (req, res) => {
    try {
        const posts = await Post.find({ group: req.params.groupId })
            .populate('user', ['name', 'email', 'avatar']) // Populate author info including avatar
            .sort({ createdAt: -1 });
        res.json(posts);
    } catch (err) {
        res.status(500).send('Błąd serwera: ' + err.message);
    }
});

// Pobierz ankiety z grupy
router.get('/:groupId/polls-data', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });
        // Return polls (sorted new to old)
        res.json(group.polls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Dodaj post
router.post('/:groupId/posts', auth, async (req, res) => {
    try {
        const newPost = new Post({
            group: req.params.groupId,
            user: req.user.id,
            content: req.body.content,
            isSupportRequest: req.body.isSupportRequest || false
        });
        const post = await newPost.save();
        await post.populate('user', ['name']);
        res.json(post);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Like/Unlike a post
router.post('/:groupId/posts/:postId/like', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) return res.status(404).json({ msg: 'Post nie znaleziony' });

        // Check if group matches
        if (post.group.toString() !== req.params.groupId) {
            return res.status(400).json({ msg: 'Post nie należy do tej grupy' });
        }

        const likeIndex = post.likes.indexOf(req.user.id);
        if (likeIndex > -1) {
            // Unlike
            post.likes.splice(likeIndex, 1);
        } else {
            // Like
            post.likes.push(req.user.id);
        }

        await post.save();
        await post.populate('user', ['name', 'avatar']);
        res.json(post);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Add comment
router.post('/:groupId/posts/:postId/comment', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) return res.status(404).json({ msg: 'Post nie znaleziony' });

        const newComment = {
            user: req.user.id,
            content: req.body.content
        };

        post.comments.unshift(newComment);
        await post.save();

        // Populate user details for the new comment specifically or re-fetch
        await post.populate('comments.user', ['name', 'avatar']);
        await post.populate('user', ['name', 'avatar']);

        res.json(post);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Delete comment
router.delete('/:groupId/posts/:postId/comment/:commentId', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) return res.status(404).json({ msg: 'Post nie znaleziony' });

        // Find comment
        const comment = post.comments.find(c => c.id === req.params.commentId);
        if (!comment) return res.status(404).json({ msg: 'Komentarz nie istnieje' });

        // Check user
        if (comment.user.toString() !== req.user.id && !isAdmin(req.user.email)) {
            return res.status(401).json({ msg: 'Brak autoryzacji' });
        }

        // Remove comment
        post.comments = post.comments.filter(c => c.id !== req.params.commentId);

        await post.save();
        await post.populate('comments.user', ['name', 'avatar']);
        await post.populate('user', ['name', 'avatar']);

        res.json(post);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Pobierz nastrój grupy (szczegółowa analiza z dzisiaj)
router.get('/:groupId/mood', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const moodEntries = await MoodEntry.find({
            userId: { $in: group.members },
            date: today
        });

        // Mood Scores
        const moodScores = {
            happy: 9, excited: 9, grateful: 9,
            calm: 8, content: 7,
            neutral: 5, tired: 4,
            stressed: 3, anxious: 3,
            sad: 2, angry: 2, overwhelmed: 1
        };

        // Aggregation
        const moodCounts = {};
        const reasonCounts = {};
        let scoreSum = 0;
        const activeUserIds = new Set();

        moodEntries.forEach(entry => {
            // Count moods
            moodCounts[entry.emotion] = (moodCounts[entry.emotion] || 0) + 1;

            // Sum scores
            scoreSum += (moodScores[entry.emotion] || 5);

            // Count reasons
            if (entry.reason) {
                reasonCounts[entry.reason] = (reasonCounts[entry.reason] || 0) + 1;
            }

            // Track active users
            activeUserIds.add(entry.userId);
        });

        const totalEntries = moodEntries.length;
        const averageMood = totalEntries > 0 ? (scoreSum / totalEntries).toFixed(1) : 0;

        // Activity
        const memberCount = group.members.length;
        const activeCount = activeUserIds.size;
        const activityPercent = memberCount > 0 ? Math.round((activeCount / memberCount) * 100) : 0;

        // Top Reasons
        const topReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([reason, count]) => ({
                reason,
                count,
                percent: Math.round((count / totalEntries) * 100)
            }));

        res.json({
            moodCounts,
            total: totalEntries,
            averageMood,
            activityPercent,
            topReasons,
            memberCount
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// Generuj raport leadera
router.get('/:groupId/report', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        // Weryfikacja lidera (tylko lider widzi raport)
        if (group.leaderId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Brak uprawnień. Tylko lider może pobrać raport.' });
        }

        // Pobierz nastroje członków z ostatnich 30 dni
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const moodEntries = await MoodEntry.find({
            userId: { $in: group.members },
            date: { $gte: thirtyDaysAgo }
        });

        // Agregacja danych
        const moodCounts = moodEntries.reduce((acc, entry) => {
            acc[entry.emotion] = (acc[entry.emotion] || 0) + 1;
            return acc;
        }, {});

        const totalEntries = moodEntries.length;
        const averageMood = totalEntries > 0
            ? moodEntries.reduce((acc, val) => acc + val.moodLevel, 0) / totalEntries
            : 0;

        const reportData = {
            groupName: group.name,
            generatedAt: new Date(),
            period: 'Ostatnie 30 dni',
            stats: {
                totalEntries,
                averageMood: averageMood.toFixed(2),
                moodDistribution: moodCounts
            }
        };

        res.json(reportData);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// Usuń grupę (tylko lider)
router.delete('/:groupId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        if (group.leaderId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Brak uprawnień do usunięcia grupy' });
        }

        await group.deleteOne();
        res.json({ msg: 'Grupa usunięta' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// Edytuj grupę (tylko lider)
router.put('/:groupId', auth, async (req, res) => {
    const { name, description, type } = req.body;
    try {
        let group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ msg: 'Grupa nie znaleziona' });

        if (group.leaderId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Brak uprawnień do edycji grupy' });
        }

        group.name = name || group.name;
        group.description = description || group.description;
        group.type = type || group.type;

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

module.exports = router;