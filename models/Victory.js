const mongoose = require('mongoose');

const victorySchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Using String ID from Auth0/Google/Passport
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    text: { type: String, required: true },
    type: { type: String, default: 'general' }, // general, meditation, walk, etc.
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Victory', victorySchema);