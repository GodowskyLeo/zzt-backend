const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { check, validationResult } = require('express-validator');

const User = require('../models/User');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../services/emailService');

const ADMIN_EMAILS = [
    'nowyadreskajtka@gmail.com',
    'lukdol709@gmail.com',
    'Andrzej.galechan@gmail.com',
    'krysspinn@gmail.com',
    'fjagnyziak@gmail.com',
    'notification@barometrnastrojow.com'
];

// Debug route
router.get('/test', (req, res) => res.send('Auth route is WORKING!'));

router.post('/register', [
    check('email', 'Proszę podać poprawny adres email').isEmail(),
    check('password', 'Hasło musi mieć co najmniej 6 znaków').isLength({ min: 6 }),
    check('displayName', 'Nazwa wyświetlana jest wymagana').not().isEmpty(),
    check('ageGroup', 'Grupa wiekowa jest wymagana').not().isEmpty(),
    check('region', 'Województwo jest wymagane').not().isEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, displayName, ageGroup, region } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'Użytkownik o tym emailu już istnieje' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

        user = new User({
            _id: new mongoose.Types.ObjectId().toString(),
            email,
            password,
            displayName,
            ageGroup,
            region,
            verificationCode,
            verificationCodeExpires: Date.now() + 24 * 3600 * 1000 // 24h
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        // Send email
        console.log(`[DEBUG] Verification Code for ${email}: ${verificationCode}`);
        try {
            require('fs').appendFileSync('debug_codes.txt', `Code for ${email}: ${verificationCode}\n`);
        } catch (e) { }
        sendVerificationEmail(email, verificationCode);

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, msg: 'Rejestracja pomyślna. Sprawdź email, aby zweryfikować konto.' });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

router.post('/login', [
    check('email', 'Proszę podać poprawny adres email').isEmail(),
    check('password', 'Hasło jest wymagane').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Nieprawidłowe dane logowania' });
        }

        // Check if user has password (might be google only)
        if (!user.password) {
            return res.status(400).json({ msg: 'To konto używa logowania przez Google' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Nieprawidłowe dane logowania' });
        }

        if (user.isSuspended) {
            return res.status(403).json({ msg: 'Konto zawieszone: ' + (user.suspendedReason || 'Naruszenie regulaminu') });
        }

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, isVerified: user.isVerified });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Błąd serwera');
    }
});

// Verification Endpoint
router.post('/verify', [
    check('code', 'Kod jest wymagany').not().isEmpty()
], async (req, res) => {
    // Token + Code approach - register returns token, user enters code
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'Brak tokenu autoryzacji' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { code } = req.body;
        const user = await User.findById(decoded.user.id);

        if (!user) return res.status(404).json({ msg: 'Użytkownik nie znaleziony' });
        if (user.isVerified) return res.json({ msg: 'Już zweryfikowano', success: true });

        if (user.verificationCode !== code) {
            return res.status(400).json({ msg: 'Nieprawidłowy kod' });
        }

        user.isVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
        await user.save();

        res.json({ msg: 'Weryfikacja pomyślna', success: true });

    } catch (err) {
        console.error('Verify error:', err);
        res.status(401).json({ msg: 'Token nieprawidłowy' });
    }
});

// Google Auth - Redirect
router.get('/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(501).json({ msg: 'Google Auth not configured' });
    }
    const { anonymousId } = req.query;
    // Embed anonymousId in state if present, otherwise just empty object
    const state = Buffer.from(JSON.stringify({ anonymousId: anonymousId || null })).toString('base64');
    passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

// Google Auth - Callback
router.get('/google/callback', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(501).json({ msg: 'Google Auth not configured' });
    }
    passport.authenticate('google', { failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/failure`, session: false })(req, res, next);
}, async (req, res) => {
    const CLIENT_URL = (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
        ? (process.env.CLIENT_URL || 'http://localhost:3000')
        : 'https://barometrnastrojow.com';
    try {
        const { state } = req.query;
        const { anonymousId } = state ? JSON.parse(Buffer.from(state, 'base64').toString()) : { anonymousId: null };

        let user;

        // Scenario A: Upgrade existing anonymous user
        if (anonymousId) {
            user = await User.findById(anonymousId);
            // If anonymous user not found or already upgraded, fall back to creation/search by email
            if (user && !user.isUpgraded) {
                if (req.user.googleProfile.emails[0].value) {
                    const existingEmail = await User.findOne({ email: req.user.googleProfile.emails[0].value });
                    if (existingEmail) {
                        // Email taken by another account -> Cannot merge easily securely without password.
                        // Strategy: Just log in to the existing email account. Abandon anonymous data merge for now to be safe.
                        user = existingEmail;
                    } else {
                        user.googleId = req.user.googleProfile.id;
                        user.email = req.user.googleProfile.emails[0].value;
                        user.isUpgraded = true;
                        await user.save();
                    }
                }
            } else {
                // Fallback if ID invalid or missing (Standard Login)
                user = await findOrCreateGoogleUser(req.user.googleProfile);
            }
            userToSign = user;
        } else {
            // Scenario B: Standard Login/Register
            user = await findOrCreateGoogleUser(req.user.googleProfile);
        }

        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });

        // Check if profile is complete
        const isProfileComplete = user.ageGroup && user.region && user.displayName;
        const redirectUrl = `${CLIENT_URL}/auth/success?token=${token}&userId=${user.id}${!isProfileComplete ? '&setup=true' : ''}`;

        res.redirect(redirectUrl);

    } catch (err) {
        console.error(err);
        res.redirect(`${CLIENT_URL}/auth/failure?error=server_error`);
    }
}
);

// Helper function
async function findOrCreateGoogleUser(profile) {
    const email = profile.emails[0].value;
    const isWhitelisted = ADMIN_EMAILS.includes(email);

    let user = await User.findOne({ email });
    if (!user) {
        user = await User.findOne({ googleId: profile.id });
    }

    if (!user) {
        // Create new
        const mongoose = require('mongoose');
        user = new User({
            _id: new mongoose.Types.ObjectId().toString(),
            googleId: profile.id,
            email,
            displayName: profile.displayName || profile.name.givenName,
            isUpgraded: true,
            role: isWhitelisted ? 'admin' : 'user'
        });
        await user.save();
    } else {
        // Existing user: ensure Google ID is linked and role is updated if whitelisted
        let needsSave = false;
        if (!user.googleId) {
            user.googleId = profile.id;
            needsSave = true;
        }
        if (isWhitelisted && user.role !== 'admin') {
            user.role = 'admin';
            needsSave = true;
        }
        if (needsSave) await user.save();
    }
    return user;
}


module.exports = router;