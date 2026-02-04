const mongoose = require('mongoose');

const moodEntrySchema = new mongoose.Schema({
    userId: { type: String, ref: 'User', index: true }, // Optional for guest entries
    emotion: { type: String, required: true },
    reason: { type: String },
    note: { type: String, default: '' }, // Skarbiec emocji
    date: { type: Date, required: true, index: true }, // Data bez godziny
    isAnonymous: { type: Boolean, default: false }, // Guest entry flag
    guestIp: { type: String }, // For rate limiting guests
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MoodEntry', moodEntrySchema);