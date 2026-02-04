const cron = require('node-cron');
const User = require('../models/User');
const MoodEntry = require('../models/MoodEntry');
const Report = require('../models/Report');


const reportTemplates = {
    stres: {
        intro: "W minionym tygodniu najczęściej czułeś/aś stres.",
        tip: "Pamiętaj, że to naturalne. Może warto spróbować krótkiej medytacji? Polecamy artykuł 'Jak radzić sobie z presją w szkole'."
    },
    radość: {
        intro: "To był tydzień pełen radości! Świetnie!",
        tip: "Pielęgnuj te dobre chwile. Zastanów się, co sprawiło Ci najwięcej radości i spróbuj to powtórzyć."
    },
    smutek: {
        intro: "Zauważyliśmy, że w tym tygodniu często towarzyszył Ci smutek.",
        tip: "Pamiętaj, że nie jesteś sam/a. Każdy ma gorsze dni. Polecamy nasze nagranie audio 'Pozwól sobie poczuć'."
    },
    default: {
        intro: "To był tydzień o zróżnicowanych emocjach.",
        tip: "Zauważanie tych zmian to już duży krok w stronę lepszego rozumienia siebie. Oby tak dalej!"
    }
};

const generateReportForUser = async (user) => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const moodEntries = await MoodEntry.find({
        userId: user._id,
        createdAt: { $gte: oneWeekAgo }
    });

    if (moodEntries.length < 3) {
        // Skip if not enough data
        return;
    }


    const emotionCounts = moodEntries.reduce((acc, entry) => {
        acc[entry.emotion] = (acc[entry.emotion] || 0) + 1;
        return acc;
    }, {});

    const dominantEmotion = Object.keys(emotionCounts).reduce((a, b) => emotionCounts[a] > emotionCounts[b] ? a : b);


    const template = reportTemplates[dominantEmotion] || reportTemplates.default;
    const content = `${template.intro} ${template.tip}`;


    const newReport = new Report({
        userId: user._id,
        content: content,
        dominantEmotion: dominantEmotion,
        startDate: oneWeekAgo,
        endDate: new Date()
    });

    await newReport.save();
    // Report generated
};

const startReportGenerator = () => {

    cron.schedule('0 20 * * 0', async () => {
        // Starting report generation
        try {
            const users = await User.find({});
            for (const user of users) {
                await generateReportForUser(user);
            }
            // Report generation finished
        } catch (err) {
            console.error('Błąd podczas generowania raportów:', err);
        }
    });
};

module.exports = { startReportGenerator };

