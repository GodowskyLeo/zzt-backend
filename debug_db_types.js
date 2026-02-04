require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

async function checkTypes() {
    try {
        console.log('Connecting to MongoDB...');
        console.log('URI:', process.env.MONGO_URI ? 'Provided' : 'Missing');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const usersCollection = mongoose.connection.collection('users');
        const moodEntriesCollection = mongoose.connection.collection('moodentries');

        const user = await usersCollection.findOne({});
        const moodEntry = await moodEntriesCollection.findOne({ userId: { $ne: null } });

        console.log('--- USER SAMPLE ---');
        if (user) {
            console.log('ID:', user._id);
            console.log('Type of ID:', typeof user._id);
            console.log('Is ObjectId?', user._id instanceof mongoose.Types.ObjectId);
            console.log('Region:', user.region);
        } else {
            console.log('No users found.');
        }

        console.log('\n--- MOOD ENTRY SAMPLE ---');
        if (moodEntry) {
            console.log('Entry ID:', moodEntry._id);
            console.log('UserID:', moodEntry.userId);
            console.log('Type of UserID:', typeof moodEntry.userId);
            console.log('Is ObjectId?', moodEntry.userId instanceof mongoose.Types.ObjectId);
            console.log('UserID String Value:', moodEntry.userId.toString());
        } else {
            console.log('No mood entries found.');
        }

        // Test Lookup
        if (user && moodEntry) {
            console.log('\n--- TESTING LOOKUP ---');

            // Test 1: Lookup with string matching
            console.log('Trying lookup with userId as String matching user._id...');
            const pipeline1 = [
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        userId: 1,
                        matched: { $size: "$user" }
                    }
                }
            ];
            const results1 = await moodEntriesCollection.aggregate(pipeline1).toArray();
            console.log('Results 1 (Direct match):', results1);

            // Test 2: Convert userId to ObjectId
            console.log('\nTrying lookup with converted ObjectId...');
            const pipeline2 = [
                { $limit: 1 },
                {
                    $addFields: {
                        userIdObj: { $toObjectId: "$userId" }
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userIdObj',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        userIdObj: 1,
                        matched: { $size: "$user" }
                    }
                }
            ];
            // Only run pipeline 2 if userId is string
            if (typeof moodEntry.userId === 'string') {
                try {
                    const results2 = await moodEntriesCollection.aggregate(pipeline2).toArray();
                    console.log('Results 2 (Converted to ObjectId):', results2);
                } catch (e) { console.log('Pipeline 2 failed:', e.message); }
            }
        }

        mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTypes();
