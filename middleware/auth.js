
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET no está configurado. El servidor no puede arrancar de forma segura.');
    process.exit(1);
}

const requireAdmin = (req, res, next) => {
    if (!req.user || (req.user.rol !== 'Administrador' && req.user.rol !== 'Admin')) {
        return res.status(403).json({ error: 'Acceso denegado: se requiere rol de administrador' });
    }
    next();
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token de autenticación requerido' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Sesión expirada', code: 'TOKEN_EXPIRED' });
            }
            return res.status(403).json({ error: 'Token inválido', code: 'TOKEN_INVALID' });
        }
        req.user = user;
        req.clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        next();
    });
};

module.exports = { authenticateToken, requireAdmin, JWT_SECRET };
