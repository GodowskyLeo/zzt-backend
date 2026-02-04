const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const authUser = require('../middleware/auth-user');

router.post('/register', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ msg: 'Brak ID użytkownika' });
    try {
        if (await User.findById(userId)) return res.status(200).json({ msg: 'Użytkownik już istnieje.' });
        const user = new User({ _id: userId });
        await user.save();
        res.status(201).json({ msg: 'Użytkownik anonimowy zarejestrowany.', userId: user._id });
    } catch (err) { res.status(500).send('Błąd serwera'); }
});

router.post('/upgrade', [
    check('email', 'Proszę podać poprawny email').isEmail(),
    check('password', 'Hasło musi mieć co najmniej 6 znaków').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { anonymousId, email, password } = req.body;
    try {
        let user = await User.findById(anonymousId);
        if (!user) return res.status(404).json({ msg: 'Nie znaleziono anonimowego profilu.' });
        if (user.isUpgraded || user.email) {
            return res.status(400).json({ msg: 'To konto zostało już ulepszone. Zamiast tego zaloguj się.' });
        }
        if (await User.findOne({ email })) return res.status(400).json({ msg: 'Ten adres email jest już zajęty.' });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.email = email;
        user.isUpgraded = true;
        await user.save();
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: { id: user._id, isUpgraded: user.isUpgraded, email: user.email } });
        });
    } catch (err) { res.status(500).send('Błąd serwera'); }
});

router.post('/login', [
    check('email', 'Proszę podać email').isEmail(),
    check('password', 'Hasło jest wymagane').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Nieprawidłowe dane logowania' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Nieprawidłowe dane logowania' });
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: { id: user._id, isUpgraded: user.isUpgraded, email: user.email } });
        });
    } catch (err) { res.status(500).send('Błąd serwera'); }
});

router.get('/me', authUser, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
});

// Update user profile (region, ageGroup, etc.)
router.put('/profile', authUser, async (req, res) => {
    const { region, ageGroup } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'Użytkownik nie znaleziony' });

        if (region) user.region = region;
        if (ageGroup) user.ageGroup = ageGroup;
        if (req.body.displayName) user.displayName = req.body.displayName;
        if (req.body.avatar) user.avatar = req.body.avatar;

        await user.save();
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

router.post('/signup', [
    check('email', 'Proszę podać poprawny email').isEmail(),
    check('password', 'Hasło musi mieć co najmniej 6 znaków').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password, displayName, ageGroup, region } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'Użytkownik już istnieje' });

        const mongoose = require('mongoose');
        user = new User({
            _id: new mongoose.Types.ObjectId().toString(),
            email,
            password,
            displayName,
            ageGroup,
            region,
            isUpgraded: true
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' }, (err, token) => {
            if (err) throw err;
            res.status(201).json({ token, user: { id: user._id, email: user.email, isUpgraded: true } });
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// Zmiana hasła
router.put('/password', authUser, [
    check('newPassword', 'Nowe hasło musi mieć min. 6 znaków').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;

    try {
        const user = await User.findById(req.user.id);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Obecne hasło jest nieprawidłowe' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ msg: 'Hasło zostało zmienione' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// Usuwanie konta
router.delete('/me', authUser, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.user.id);
        // Opcjonalnie: usuń dane powiązane (moods, victories itp.)
        // const Mood = require('../models/Mood');
        // await Mood.deleteMany({ userId: req.user.id });
        res.json({ msg: 'Konto usunięte' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

module.exports = router;