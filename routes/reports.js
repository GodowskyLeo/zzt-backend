const express = require('express');
const router = express.Router();
const Report = require('../models/Report');



router.get('/:userId', async (req, res) => {
    try {
        const report = await Report.findOne({ userId: req.params.userId })
            .sort({ createdAt: -1 }); 

        if (!report) return res.status(404).json({ msg: 'Nie znaleziono raportu dla tego użytkownika.' });

        res.json(report);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

module.exports = router;