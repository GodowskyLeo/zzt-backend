const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'Brak tokena, autoryzacja odrzucona' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.leader) throw new Error();
        req.leader = decoded.leader;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token jest nieprawidłowy' });
    }
};