const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const authUser = require('../middleware/auth-user');

// Get user notifications
router.get('/', authUser, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(notifications);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Mark as read
router.put('/:id/read', authUser, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Create notification (Internal/Admin use or automatic triggers)
router.post('/', authUser, async (req, res) => {
    const { userId, type, title, message, relatedId } = req.body;
    try {
        const notification = new Notification({ userId, type, title, message, relatedId });
        await notification.save();
        res.status(201).json(notification);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

module.exports = router;
