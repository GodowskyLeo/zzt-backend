const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    userId: { type: String, ref: 'User', required: true },
    content: { type: String, required: true },
    dominantEmotion: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);