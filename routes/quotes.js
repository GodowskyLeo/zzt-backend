const express = require('express');
const router = express.Router();

// Mock daily quote - ideally fetched from DB or external API
router.get('/daily', (req, res) => {
    res.json({
        text: "To, że dziś nie masz siły, nie znaczy, że nie masz znaczenia.",
        author: "Autor Nieznany"
    });
});

module.exports = router;
