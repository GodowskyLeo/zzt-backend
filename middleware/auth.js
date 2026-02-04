// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'Brak tokena, autoryzacja odrzucona' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get full user from database to check suspension and get email/role
        const user = await User.findById(decoded.user.id).select('-password');

        if (!user) {
            return res.status(401).json({ msg: 'Użytkownik nie istnieje' });
        }

        // Check if user is suspended
        if (user.isSuspended) {
            return res.status(403).json({
                msg: 'Twoje konto zostało zawieszone. Skontaktuj się z administratorem.',
                code: 'ACCOUNT_SUSPENDED',
                reason: user.suspendedReason
            });
        }

        // Update last active timestamp (don't await to avoid slowing down requests)
        User.findByIdAndUpdate(user._id, {
            lastActiveAt: new Date()
        }).catch(err => console.error('Failed to update lastActiveAt:', err));

        // Attach full user object to request
        req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            displayName: user.displayName
        };

        next();
    } catch (err) {
        console.error('Auth middleware error:', err.message);
        res.status(401).json({ msg: 'Token jest nieprawidłowy' });
    }
};