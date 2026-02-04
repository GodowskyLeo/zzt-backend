const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const MoodEntry = require('./models/MoodEntry');

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        console.log('Today (UTC):', today);

        // 1. Find the user
        // Assuming we look for the most recent mood entry to identify user or just list recent ones with their user details
        const recentEntries = await MoodEntry.find({ date: today }).limit(5).populate('userId');
        // Note: population might fail if userId is String vs ObjectId mismatch isn't handled in schema

        console.log(`Found ${recentEntries.length} entries for today.`);

        for (const entry of recentEntries) {
            console.log('------------------------------------------------');
            console.log('Entry ID:', entry._id);
            console.log('Entry userId (raw):', entry.userId, 'Type:', typeof entry.userId);

            // Try to find user manually if populate failed
            let user = await User.findById(entry.userId);
            if (!user) {
                // Try searching by string if entry.userId is string
                if (mongoose.Types.ObjectId.isValid(entry.userId)) {
                    user = await User.findOne({ _id: new mongoose.Types.ObjectId(entry.userId) });
                }
            }

            if (user) {
                console.log('User Found:', user.email);
                console.log('User Region:', user.region);
                console.log('User _id:', user._id, 'Type:', typeof user._id);
            } else {
                console.log('User NOT found for this entry.');
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
};

checkData();
