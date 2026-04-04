
const jwt = require('jsonwebtoken');

// Advertir en arranque si se usa el secreto por defecto (solo en desarrollo)
const JWT_SECRET = process.env.JWT_SECRET || 'smartcloud_secret_key_CHANGE_IN_PRODUCTION';
if (!process.env.JWT_SECRET) {
    console.warn('[SECURITY WARNING] JWT_SECRET no está configurado. Usando valor por defecto. Configure la variable de entorno en producción.');
}

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

module.exports = { authenticateToken, JWT_SECRET };
