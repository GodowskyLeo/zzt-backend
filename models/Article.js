const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Wsparcie kryzysowe', 'Artykuły', 'Ćwiczenia', 'Stres', 'Szkoła', 'Rozwój', 'Inne']
    },
    preview: {
        type: String,
        required: true
    },
    content: {
        type: String, // Full content or HTML
        required: false
    },
    type: {
        type: String, // e.g. 'article', 'video', 'link'
        default: 'article'
    },
    link: {
        type: String, // External link if applicable
        required: false
    },
    imageUrl: {
        type: String,
        required: false
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Article', ArticleSchema);
