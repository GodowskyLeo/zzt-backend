const mongoose = require('mongoose');
require('dotenv').config();
const MoodEntry = require('./models/MoodEntry');
const User = require('./models/User');

const runDebug = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const getStartOfDay = (date) => {
            const start = new Date(date);
            start.setUTCHours(0, 0, 0, 0);
            return start;
        };

        const today = getStartOfDay(new Date());
        console.log('Query Date:', today);

        // 1. Simple Count Check
        const count = await MoodEntry.countDocuments({ date: today });
        console.log(`Simple Count for today: ${count}`);

        // 2. Run Aggregation Pipeline Step-by-Step
        console.log('Running Aggregation...');

        const results = await MoodEntry.aggregate([
            { $match: { date: today } },
            // Stage 1: Add Fields (Debug: keep original userId to compare)
            // HYPOTHESIS: User._id is a STRING, so we should NOT convert to ObjectId
            {
                $addFields: {
                    // userIdObj: { $toObjectId: "$userId" }, 
                    // TRYING DIRECT STRING MATCH
                    originalUserIdType: { $type: "$userId" }
                }
            },
            // Stage 2: Lookup
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId', // Use the raw string field
                    foreignField: '_id', // Assuming User._id is ALSO a string
                    as: 'user'
                }
            },
            // Debug: Project valid results before unwind to see if lookup worked
            {
                $project: {
                    userId: 1,
                    userIdObj: 1,
                    originalUserIdType: 1,
                    userLength: { $size: "$user" },
                    userRegion: { $arrayElemAt: ["$user.region", 0] }
                }
            }
        ]);

        console.log('Aggregation Results (Raw Projection):');
        console.log(JSON.stringify(results, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
};

runDebug();
