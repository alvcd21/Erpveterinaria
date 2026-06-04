'use strict';

const REFRESH_SECRET = process.env.REFRESH_SECRET;
if (!REFRESH_SECRET) {
    console.error('[FATAL] REFRESH_SECRET no está configurado.');
    process.exit(1);
}

const REFRESH_COOKIE_NAME = 'sc_refresh';

function setRefreshCookie(res, refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
    });
}

function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/api/auth',
    });
}

function readCookie(req, name) {
    const raw = req.headers.cookie || '';
    for (const part of raw.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        if (decodeURIComponent(trimmed.slice(0, eq)) === name) {
            return decodeURIComponent(trimmed.slice(eq + 1));
        }
    }
    return null;
}

module.exports = { REFRESH_SECRET, REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie, readCookie };
