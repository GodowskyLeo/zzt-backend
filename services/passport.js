const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // FORCE ADAPT: Always use the production API domain for Google callbacks
        // This allows localhost to work if we just want to test auth, but primarily fixes the Production 404 loop
        // irrespective of NODE_ENV settings.
        callbackURL: 'http://72.62.119.169/api/auth/google/callback',
        scope: ['profile', 'email'],
        proxy: true
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Pass the raw profile to the route handler to decide if we create a user or login
                // We wrap it to avoid confusion with a Mongoose document
                return done(null, { isNew: true, googleProfile: profile });
            } catch (err) {
                return done(err, null);
            }
        }
    ));
} else {
    console.warn('Google Client ID not found. Google Auth disabled.');
}