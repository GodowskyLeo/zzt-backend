const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');

// GET /api/articles - Get all published resources (legacy name kept for compatibility)
router.get('/', async (req, res) => {
    try {
        // Fetch all published resources
        let articles = await Resource.find({ isPublished: true }).sort({ createdAt: -1 });

        // Transform if necessary to match old Article schema?
        // Old Article: title, category, preview, type, link
        // Resource: title, type, content, description, category, isPublished, thumbnail...
        // We should map them or ensure frontend handles Resource fields.
        // Frontend OtwartaGrupa uses: title, preview (or text), category, link, type
        // Resource has 'description' which can act as preview. Content or specific link field?
        // Resource doesn't have explicit 'link' unless it's a video/article type with content as URL?
        // Let's assume content is the link for video, or we need to add a link field?
        // Looking at Resource model (Step 1089): content is String (Rich text or URL).

        // Let's seed initial data if empty into Resource
        const count = await Resource.countDocuments();
        if (count === 0) {
            const initialResources = [
                {
                    title: 'Telefon Zaufania',
                    category: 'anxiety', // Resource enum: anxiety, stress, etc.
                    type: 'article',
                    content: 'https://116111.pl/',
                    description: '116 111 - Dzwonisz anonimowo. Bezpłatna pomoc dla dzieci i młodzieży.',
                    isPublished: true,
                    tags: ['pomoc', 'telefon']
                },
                {
                    title: 'Techniki Relaksacji',
                    category: 'stress',
                    type: 'exercise',
                    content: 'https://www.medonet.pl/zdrowie,techniki-relaksacyjne---rodzaje--zalety--wskazania,artykul,1734491.html',
                    description: 'Proste sposoby na stres i napięcie. Oddychanie pudełkowe i skanowanie ciała.',
                    isPublished: true,
                    tags: ['relaks', 'oddech']
                },
                // Add more matching the previous seed but with Resource structure
            ];
            await Resource.insertMany(initialResources);
            articles = await Resource.find({ isPublished: true }).sort({ createdAt: -1 });
        }

        res.json(articles);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});
module.exports = router;