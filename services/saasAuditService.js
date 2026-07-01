'use strict';

function getActor(req) {
    return {
        id: req.user?.adminUserId || null,
        email: req.user?.email || req.user?.adminId || 'saas-admin',
        ip: req.ip || req.clientIp || req.socket?.remoteAddress || null,
        userAgent: req.headers?.['user-agent'] || null,
    };
}

async function logSaasAudit(db, req, entry) {
    const actor = getActor(req || {});
    await db.query(
        `INSERT INTO saas_audit_log
            (actor_admin_id, actor_email, action, entity_type, entity_id, tenant_id, before_data, after_data, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::inet,$10)`,
        [
            actor.id,
            actor.email,
            entry.action,
            entry.entityType,
            entry.entityId != null ? String(entry.entityId) : null,
            entry.tenantId || null,
            entry.beforeData == null ? null : JSON.stringify(entry.beforeData),
            entry.afterData == null ? null : JSON.stringify(entry.afterData),
            actor.ip && actor.ip !== '::1' && actor.ip !== '::ffff:127.0.0.1' ? actor.ip : null,
            actor.userAgent,
        ]
    );
}

module.exports = { logSaasAudit };
