const jwt = require('jsonwebtoken');

// Hardcoded admin emails - in production, move to environment variables or database
const ADMIN_EMAILS = [
    'nowyadreskajtka@gmail.com',
    'lukdol709@gmail.com',
    'Andrzej.galechan@gmail.com',
    'krysspinn@gmail.com',
    'fjagnyziak@gmail.com'
];

module.exports = function (req, res, next) {
    try {
        // Check if user exists from auth middleware
        if (!req.user) {
            return res.status(401).json({ msg: 'Brak autoryzacji' });
        }

        // Get user email from token or fetch it
        const userEmail = req.user.email;
        const userRole = req.user.role;

        // Check if user is admin by email or role
        const isAdminByEmail = ADMIN_EMAILS.includes(userEmail);
        const isAdminByRole = userRole === 'admin';

        if (!isAdminByEmail && !isAdminByRole) {
            return res.status(403).json({
                msg: 'Dostęp zabroniony. Wymagane uprawnienia administratora.',
                code: 'ADMIN_REQUIRED'
            });
        }

        // Add admin flag to request
        req.isAdmin = true;
        next();
    } catch (err) {
        console.error('Admin middleware error:', err.message);
        res.status(500).json({ msg: 'Błąd serwera podczas weryfikacji uprawnień' });
    }
};

// Export admin emails for use elsewhere (e.g., checking in frontend)
module.exports.ADMIN_EMAILS = ADMIN_EMAILS;
