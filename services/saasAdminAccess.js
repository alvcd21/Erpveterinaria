'use strict';

function permissions(req) {
    const value = req.user?.saasPermissions;
    return Array.isArray(value) ? value : [];
}

function hasPermission(req, permission) {
    const list = permissions(req);
    return list.includes('*') || list.includes(permission);
}

function requireSaasPermission(permission) {
    return (req, res, next) => {
        if (!hasPermission(req, permission)) {
            return res.status(403).json({ error: 'Acceso denegado: permiso SaaS insuficiente' });
        }
        next();
    };
}

function intValue(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function numberValue(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function listValue(value) {
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

module.exports = {
    hasPermission,
    requireSaasPermission,
    intValue,
    numberValue,
    listValue,
};
