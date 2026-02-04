const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
console.log('[DEBUG] Loading .env from:', path.join(__dirname, '.env'));
console.log('[DEBUG] GOOGLE_CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const { startReportGenerator } = require('./services/reportGenerator');

const app = express();
app.set('trust proxy', 1); // Required for Hostinger/Heroku/Nginx proxies

// Security middleware
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // Increased: 2000 requests per 15 min
    message: { msg: 'Zbyt wiele żądań, spróbuj ponownie później.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Increased: 200 login attempts per 15 min
    message: { msg: 'Zbyt wiele prób logowania, poczekaj 15 minut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Crash prevention logging
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection) at:', promise, 'reason:', reason);
});

// CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5000',
            'https://barometrnastrojow.com',
            'https://www.barometrnastrojow.com',
            'https://api.barometrnastrojow.com',
            // Render.com deployment
            /\.onrender\.com$/
        ];

        // Check if origin matches any allowed origin (string or regex)
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) {
                return allowed.test(origin);
            }
            return allowed === origin;
        });

        if (isAllowed || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            console.warn('Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(helmet({
    contentSecurityPolicy: false, // Disable for now, configure properly in production
    crossOriginEmbedderPolicy: false
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(passport.initialize());
app.use(generalLimiter); // Apply general rate limiting

require('./services/passport');

console.log('Attempting to connect to MongoDB...', process.env.MONGO_URI ? 'URI Provided' : 'NO URI');
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('SERVER STARTUP CHECK: v1.0 - FLUSH LOGS');
        console.log('Connected to MongoDB. Starting server...');
        // Connected to MongoDB
        startReportGenerator();
    }).catch(err => console.error('Błąd połączenia z MongoDB:', err));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/moods', require('./routes/moods'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/victories', require('./routes/victories'));
app.use('/api/articles', require('./routes/articles'));
app.use('/api/resources', require('./routes/articles')); // Alias for Zasoby page
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/ratings', require('./routes/ratings')); // Day ratings
app.use('/api/ai-reports', require('./routes/ai-reports')); // AI Reports
app.use('/api/admin', require('./routes/admin')); // Admin Panel routes

// DEBUG ROUTE - REMOVE LATER
app.get('/api/debug-config', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const buildPath = path.join(__dirname, 'client-build');
    const routesPath = path.join(__dirname, 'routes');

    let buildFiles = [];
    let routeFiles = [];
    let usersRouteStatus = "Unknown";

    try {
        if (fs.existsSync(buildPath)) buildFiles = fs.readdirSync(buildPath);
        else buildFiles = ['Directory not found'];
    } catch (e) { buildFiles = [e.message]; }

    try {
        if (fs.existsSync(routesPath)) routeFiles = fs.readdirSync(routesPath);
        else routeFiles = ['Routes directory not found'];

        try {
            require.resolve('./routes/users');
            usersRouteStatus = "Resolvable";
        } catch (e) { usersRouteStatus = "Not Resolvable: " + e.message; }

    } catch (e) { routeFiles = [e.message]; }

    res.json({
        status: 'Online',
        node_env: process.env.NODE_ENV,
        usersRouteStatus,
        routeFiles,
        buildPathInfo: { path: buildPath, files: buildFiles }
    });
});

app.get('/api/test', (req, res) => res.json({ msg: 'API is working' }));

// Health check endpoint for Render.com
app.get('/health', (req, res) => res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() }));

// Serve static assets ONLY if client-build/index.html exists
// Serving static files (images)
const fs = require('fs');
const buildPath = path.join(__dirname, 'client-build');
const indexHtmlPath = path.join(buildPath, 'index.html');

if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(buildPath));

    app.get(/.*/, (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).json({ msg: 'Nie znaleziono' });
        res.sendFile(indexHtmlPath);
    });
} else {
    // If no build exists, return 404 for non-api routes
    app.get(/.*/, (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).json({ msg: 'Nie znaleziono' });
        res.status(404).send('API Server - Frontend not found in client-build');
    });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));