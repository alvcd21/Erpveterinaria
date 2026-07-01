'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, handleDbError } = require('../config/db');
const { validatePasswordStrength } = require('../middleware/auth');
const { logSaasAudit } = require('../services/saasAuditService');
const { requireSaasPermission, intValue } = require('../services/saasAdminAccess');
const {
    getPlan,
    updateTenantFromPlan,
    addSubscriptionEvent,
} = require('../services/saasAdminService');

const router = express.Router();

router.get('/subscriptions', requireSaasPermission('subscriptions:read'), async (req, res) => {
    const page = Math.max(intValue(req.query.page, 1), 1);
    const limit = Math.min(Math.max(intValue(req.query.limit, 25), 1), 100);
    const offset = (page - 1) * limit;
    const params = [];
    const filters = ['1=1'];

    if (req.query.status) {
        params.push(String(req.query.status));
        filters.push(`s.status = $${params.length}`);
    }
    if (req.query.search) {
        params.push(`%${String(req.query.search).trim()}%`);
        filters.push(`(t.nombre_empresa ILIKE $${params.length} OR t.slug ILIKE $${params.length})`);
    }

    try {
        const where = filters.join(' AND ');
        const data = await pool.query(`
            SELECT s.*, t.slug AS tenant_slug, t.nombre_empresa, p.nombre AS plan_nombre, p.precio_mensual
            FROM tenant_subscriptions s
            JOIN tenants t ON t.id = s.tenant_id
            JOIN saas_plans p ON p.slug = s.plan_slug
            WHERE ${where}
            ORDER BY s.is_current DESC, s.updated_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, limit, offset]);
        const count = await pool.query(`
            SELECT COUNT(*)::int AS total
            FROM tenant_subscriptions s
            JOIN tenants t ON t.id = s.tenant_id
            WHERE ${where}
        `, params);
        res.json({ data: data.rows, pagination: { page, limit, total: count.rows[0].total } });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/subscriptions', requireSaasPermission('subscriptions:write'), async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const plan = await getPlan(client, body.plan_slug || 'basico');
        if (!plan) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Plan no encontrado' });
        }
        const tenant = await client.query('SELECT * FROM tenants WHERE id = $1', [body.tenant_id]);
        if (!tenant.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Tenant no encontrado' });
        }

        await client.query(
            'UPDATE tenant_subscriptions SET is_current = FALSE, updated_at = NOW() WHERE tenant_id = $1 AND is_current = TRUE',
            [body.tenant_id]
        );
        const status = body.status || 'active';
        const { rows } = await client.query(`
            INSERT INTO tenant_subscriptions
                (tenant_id, plan_slug, status, billing_cycle, current_period_start,
                 current_period_end, is_current, limits_snapshot, metadata)
            VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,NOW()),$6,TRUE,$7::jsonb,$8::jsonb)
            RETURNING *
        `, [
            body.tenant_id,
            plan.slug,
            status,
            body.billing_cycle || 'monthly',
            body.current_period_start || null,
            body.current_period_end || null,
            JSON.stringify({
                max_sucursales: plan.max_sucursales,
                max_usuarios: plan.max_usuarios,
                max_medicamentos: plan.max_medicamentos,
            }),
            JSON.stringify(body.metadata || {}),
        ]);
        await updateTenantFromPlan(client, body.tenant_id, plan, status, body.current_period_end || null);
        await addSubscriptionEvent(client, req, {
            subscriptionId: rows[0].id,
            tenantId: body.tenant_id,
            eventType: 'created',
            toStatus: status,
            toPlanSlug: plan.slug,
            payload: rows[0],
        });
        await logSaasAudit(client, req, {
            action: 'saas.subscription.create',
            entityType: 'tenant_subscription',
            entityId: rows[0].id,
            tenantId: body.tenant_id,
            afterData: rows[0],
        });
        await client.query('COMMIT');
        res.status(201).json({ data: rows[0], message: 'Suscripcion creada correctamente' });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

router.put('/subscriptions/:id', requireSaasPermission('subscriptions:write'), async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const beforeResult = await client.query('SELECT * FROM tenant_subscriptions WHERE id = $1', [req.params.id]);
        const before = beforeResult.rows[0];
        if (!before) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Suscripcion no encontrada' });
        }
        const plan = await getPlan(client, body.plan_slug || before.plan_slug);
        const { rows } = await client.query(`
            UPDATE tenant_subscriptions SET
                plan_slug = COALESCE($2, plan_slug),
                status = COALESCE($3, status),
                billing_cycle = COALESCE($4, billing_cycle),
                current_period_start = COALESCE($5::timestamptz, current_period_start),
                current_period_end = COALESCE($6::timestamptz, current_period_end),
                metadata = COALESCE($7::jsonb, metadata),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            req.params.id,
            body.plan_slug || null,
            body.status || null,
            body.billing_cycle || null,
            body.current_period_start || null,
            body.current_period_end || null,
            body.metadata ? JSON.stringify(body.metadata) : null,
        ]);
        if (rows[0].is_current) {
            await updateTenantFromPlan(client, rows[0].tenant_id, plan, rows[0].status, rows[0].current_period_end);
        }
        await addSubscriptionEvent(client, req, {
            subscriptionId: rows[0].id,
            tenantId: rows[0].tenant_id,
            eventType: 'updated',
            fromStatus: before.status,
            toStatus: rows[0].status,
            fromPlanSlug: before.plan_slug,
            toPlanSlug: rows[0].plan_slug,
            payload: rows[0],
        });
        await logSaasAudit(client, req, {
            action: 'saas.subscription.update',
            entityType: 'tenant_subscription',
            entityId: rows[0].id,
            tenantId: rows[0].tenant_id,
            beforeData: before,
            afterData: rows[0],
        });
        await client.query('COMMIT');
        res.json({ data: rows[0], message: 'Suscripcion actualizada correctamente' });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

router.post('/subscriptions/:id/renew', requireSaasPermission('subscriptions:write'), async (req, res) => {
    const months = Math.max(intValue(req.body?.months, 1), 1);
    try {
        const { rows } = await pool.query(`
            UPDATE tenant_subscriptions SET
                status = 'active',
                current_period_start = NOW(),
                current_period_end = COALESCE($2::timestamptz, COALESCE(current_period_end, NOW()) + make_interval(months => $3)),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [req.params.id, req.body?.current_period_end || null, months]);
        if (!rows.length) return res.status(404).json({ error: 'Suscripcion no encontrada' });
        const plan = await getPlan(pool, rows[0].plan_slug);
        await updateTenantFromPlan(pool, rows[0].tenant_id, plan, 'active', rows[0].current_period_end);
        await addSubscriptionEvent(pool, req, {
            subscriptionId: rows[0].id,
            tenantId: rows[0].tenant_id,
            eventType: 'renewed',
            toStatus: 'active',
            toPlanSlug: rows[0].plan_slug,
            payload: { months, current_period_end: rows[0].current_period_end },
        });
        await logSaasAudit(pool, req, {
            action: 'saas.subscription.renew',
            entityType: 'tenant_subscription',
            entityId: rows[0].id,
            tenantId: rows[0].tenant_id,
            afterData: rows[0],
        });
        res.json({ data: rows[0], message: 'Suscripcion renovada correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/subscriptions/:id/cancel', requireSaasPermission('subscriptions:write'), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            UPDATE tenant_subscriptions SET
                status = 'canceled',
                is_current = FALSE,
                canceled_at = NOW(),
                cancel_reason = COALESCE($2, cancel_reason),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [req.params.id, req.body?.reason || null]);
        if (!rows.length) return res.status(404).json({ error: 'Suscripcion no encontrada' });
        const plan = await getPlan(pool, rows[0].plan_slug);
        await updateTenantFromPlan(pool, rows[0].tenant_id, plan, 'canceled', rows[0].current_period_end);
        await addSubscriptionEvent(pool, req, {
            subscriptionId: rows[0].id,
            tenantId: rows[0].tenant_id,
            eventType: 'canceled',
            toStatus: 'canceled',
            toPlanSlug: rows[0].plan_slug,
            payload: { reason: req.body?.reason || null },
        });
        await logSaasAudit(pool, req, {
            action: 'saas.subscription.cancel',
            entityType: 'tenant_subscription',
            entityId: rows[0].id,
            tenantId: rows[0].tenant_id,
            afterData: rows[0],
        });
        res.json({ data: rows[0], message: 'Suscripcion cancelada correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/admin-roles', requireSaasPermission('users:read'), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, role_key, nombre, descripcion, permisos, system_role
            FROM saas_admin_roles
            ORDER BY system_role DESC, nombre
        `);
        res.json({ data: rows });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/admin-users', requireSaasPermission('users:read'), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT u.id, u.email, u.nombre, u.estado, u.last_login_at, u.created_at,
                   r.role_key, r.nombre AS role_name
            FROM saas_admin_users u
            LEFT JOIN saas_admin_roles r ON r.id = u.role_id
            ORDER BY u.created_at DESC
        `);
        res.json({ data: rows });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/admin-users', requireSaasPermission('users:write'), async (req, res) => {
    const body = req.body || {};
    const pwErr = validatePasswordStrength(body.password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    try {
        const role = await pool.query('SELECT id, role_key FROM saas_admin_roles WHERE role_key = $1', [body.role || 'soporte']);
        if (!role.rows.length) return res.status(400).json({ error: 'Rol SaaS invalido' });
        const hash = await bcrypt.hash(body.password, 12);
        const { rows } = await pool.query(`
            INSERT INTO saas_admin_users (email, nombre, password_hash, role_id, estado)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING id, email, nombre, estado, created_at
        `, [body.email, body.nombre || body.email, hash, role.rows[0].id, body.estado || 'activo']);
        await logSaasAudit(pool, req, {
            action: 'saas.admin_user.create',
            entityType: 'saas_admin_user',
            entityId: rows[0].id,
            afterData: { ...rows[0], role: role.rows[0].role_key },
        });
        res.status(201).json({ data: rows[0], message: 'Usuario SaaS creado correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.put('/admin-users/:id', requireSaasPermission('users:write'), async (req, res) => {
    const body = req.body || {};
    try {
        const before = await pool.query('SELECT id, email, nombre, estado, role_id FROM saas_admin_users WHERE id = $1', [req.params.id]);
        if (!before.rows.length) return res.status(404).json({ error: 'Usuario SaaS no encontrado' });
        let roleId = null;
        if (body.role) {
            const role = await pool.query('SELECT id FROM saas_admin_roles WHERE role_key = $1', [body.role]);
            if (!role.rows.length) return res.status(400).json({ error: 'Rol SaaS invalido' });
            roleId = role.rows[0].id;
        }
        let hash = null;
        if (body.password) {
            const pwErr = validatePasswordStrength(body.password);
            if (pwErr) return res.status(400).json({ error: pwErr });
            hash = await bcrypt.hash(body.password, 12);
        }
        const { rows } = await pool.query(`
            UPDATE saas_admin_users SET
                email = COALESCE($2, email),
                nombre = COALESCE($3, nombre),
                estado = COALESCE($4, estado),
                role_id = COALESCE($5, role_id),
                password_hash = COALESCE($6, password_hash),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, email, nombre, estado, role_id, updated_at
        `, [req.params.id, body.email || null, body.nombre || null, body.estado || null, roleId, hash]);
        await logSaasAudit(pool, req, {
            action: 'saas.admin_user.update',
            entityType: 'saas_admin_user',
            entityId: req.params.id,
            beforeData: before.rows[0],
            afterData: rows[0],
        });
        res.json({ data: rows[0], message: 'Usuario SaaS actualizado correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/audit-log', requireSaasPermission('audit:read'), async (req, res) => {
    const page = Math.max(intValue(req.query.page, 1), 1);
    const limit = Math.min(Math.max(intValue(req.query.limit, 50), 1), 200);
    const offset = (page - 1) * limit;
    const params = [];
    const filters = ['1=1'];
    if (req.query.tenantId) {
        params.push(req.query.tenantId);
        filters.push(`tenant_id = $${params.length}`);
    }
    if (req.query.action) {
        params.push(`%${String(req.query.action)}%`);
        filters.push(`action ILIKE $${params.length}`);
    }
    if (req.query.entity_type) {
        params.push(String(req.query.entity_type));
        filters.push(`entity_type = $${params.length}`);
    }
    try {
        const where = filters.join(' AND ');
        const data = await pool.query(`
            SELECT *
            FROM saas_audit_log
            WHERE ${where}
            ORDER BY created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, limit, offset]);
        const count = await pool.query(`SELECT COUNT(*)::int AS total FROM saas_audit_log WHERE ${where}`, params);
        res.json({ data: data.rows, pagination: { page, limit, total: count.rows[0].total } });
    } catch (err) {
        handleDbError(res, err);
    }
});

module.exports = router;
