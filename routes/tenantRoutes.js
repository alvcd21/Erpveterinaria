
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool, handleDbError } = require('../config/db');
const { invalidateTenantCache } = require('../middleware/tenant');

// All routes in this file are mounted under /api/saas and pre-guarded
// by authenticateToken + requireSuperAdmin in server.js.

/**
 * GET /api/saas/tenants
 * List all tenants with basic usage stats.
 */
router.get('/tenants', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                t.id, t.slug, t.nombre_empresa, t.plan, t.estado,
                t.max_sucursales, t.max_usuarios, t.max_medicamentos,
                t.fecha_vencimiento, t.created_at,
                (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id) AS usuarios_count,
                (SELECT COUNT(*) FROM ventas   v WHERE v.tenant_id = t.id) AS ventas_count,
                (SELECT COUNT(*) FROM medicamentos m WHERE m.tenant_id = t.id) AS medicamentos_count
            FROM tenants t
            ORDER BY t.created_at DESC
        `);
        res.json({ data: rows, message: 'Tenants obtenidos correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * GET /api/saas/ai/process-settings
 * Global AI process configuration managed by SaaS super-admin.
 */
router.get('/ai/process-settings', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT process_key, provider, model, enabled, temperature, max_tokens, tenant_id, updated_by, updated_at
            FROM ai_process_settings
            WHERE tenant_id IS NULL
            ORDER BY process_key
        `);
        res.json({ data: rows, message: 'Configuracion IA obtenida correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * PUT /api/saas/ai/process-settings/:processKey
 * Upsert global AI process configuration.
 */
router.put('/ai/process-settings/:processKey', async (req, res) => {
    const { processKey } = req.params;
    const { provider, model, enabled = true, temperature = 0.2, max_tokens = 1800 } = req.body || {};
    if (!/^[a-z0-9_-]{3,80}$/.test(processKey)) {
        return res.status(400).json({ error: 'processKey invalido' });
    }
    if (!['openai', 'anthropic', 'gemini'].includes(provider)) {
        return res.status(400).json({ error: 'Proveedor IA invalido' });
    }
    if (!model || String(model).length > 120) {
        return res.status(400).json({ error: 'Modelo IA requerido' });
    }

    try {
        const params = [
            processKey,
            provider,
            String(model),
            enabled !== false,
            Number(temperature),
            Number(max_tokens),
            req.user?.usuario || 'saas-admin',
        ];
        let result = await pool.query(`
            UPDATE ai_process_settings SET
                provider = $2,
                model = $3,
                enabled = $4,
                temperature = $5,
                max_tokens = $6,
                updated_by = $7,
                updated_at = NOW()
            WHERE process_key = $1 AND tenant_id IS NULL
            RETURNING process_key, provider, model, enabled, temperature, max_tokens, tenant_id, updated_by, updated_at
        `, params);
        if (result.rows.length === 0) {
            result = await pool.query(`
                INSERT INTO ai_process_settings
                    (process_key, provider, model, enabled, temperature, max_tokens, tenant_id, updated_by, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,NOW())
                RETURNING process_key, provider, model, enabled, temperature, max_tokens, tenant_id, updated_by, updated_at
            `, params);
        }
        res.json({ data: result.rows[0], message: 'Configuracion IA actualizada correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * POST /api/saas/tenants
 * Create a new tenant and provision default config, roles, and an admin user.
 */
router.post('/tenants', async (req, res) => {
    const {
        slug, nombre_empresa, plan = 'basico', estado = 'prueba',
        max_sucursales = 1, max_usuarios = 5, max_medicamentos = 500,
        fecha_vencimiento = null,
        admin_email, admin_password
    } = req.body;

    if (!slug || !nombre_empresa) {
        return res.status(400).json({ error: 'slug y nombre_empresa son requeridos' });
    }
    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
        return res.status(400).json({ error: 'slug debe tener entre 3 y 50 caracteres (letras minúsculas, números y guiones)' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create tenant row
        const tenantResult = await client.query(
            `INSERT INTO tenants (slug, nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [slug, nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento]
        );
        const tenant = tenantResult.rows[0];

        // 2. Default configuracion row (one row per tenant via UNIQUE(tenant_id))
        await client.query(
            `INSERT INTO configuracion (tenant_id, nombreempresa, isv, descuento_tercera_edad, isv_tasa_general)
             VALUES ($1, $2, 15.00, 25.00, 15.00)
             ON CONFLICT (tenant_id) DO NOTHING`,
            [tenant.id, nombre_empresa]
        );

        // 3. Insert default roles for this tenant
        const rolesResult = await client.query(
            `INSERT INTO roles (nombre, tenant_id)
             VALUES ('Administrador', $1), ('Cajero', $1), ('Bodeguero', $1)
             RETURNING idrol, nombre`,
            [tenant.id]
        );
        const adminRole = rolesResult.rows.find(r => r.nombre === 'Administrador');

        // 4. Grant all permissions to Administrador role
        if (adminRole) {
            await client.query(
                `INSERT INTO rol_permisos (idRol, idPermiso)
                 SELECT $1, idPermiso FROM permisos
                 ON CONFLICT DO NOTHING`,
                [adminRole.idrol]
            );
        }

        // 5. Optionally provision admin user
        let adminInfo = null;
        if (admin_email && admin_password && adminRole) {
            const hashed = await bcrypt.hash(admin_password, 12);
            const userResult = await client.query(
                `INSERT INTO usuarios (usuario, password, idrol, estado, tenant_id, requires_password_change)
                 VALUES ($1, $2, $3, 'Activo', $4, FALSE)
                 RETURNING codUsuario, usuario`,
                [admin_email, hashed, adminRole.idrol, tenant.id]
            );
            adminInfo = userResult.rows[0];
        }

        await client.query('COMMIT');

        res.status(201).json({
            data: {
                tenant,
                roles: rolesResult.rows,
                admin: adminInfo
            },
            message: `Tenant '${nombre_empresa}' creado y aprovisionado correctamente`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(409).json({ error: `Ya existe un tenant con el slug '${slug}'` });
        }
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/saas/tenants/:id
 * Get a single tenant by UUID.
 */
router.get('/tenants/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM tenants WHERE id = $1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });
        res.json({ data: rows[0], message: 'Tenant obtenido correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * PUT /api/saas/tenants/:id
 * Update tenant fields (plan, estado, limits, etc.).
 */
router.put('/tenants/:id', async (req, res) => {
    const {
        nombre_empresa, plan, estado,
        max_sucursales, max_usuarios, max_medicamentos,
        fecha_vencimiento
    } = req.body;

    try {
        const { rows } = await pool.query(
            `UPDATE tenants
             SET nombre_empresa    = COALESCE($1, nombre_empresa),
                 plan              = COALESCE($2, plan),
                 estado            = COALESCE($3, estado),
                 max_sucursales    = COALESCE($4, max_sucursales),
                 max_usuarios      = COALESCE($5, max_usuarios),
                 max_medicamentos  = COALESCE($6, max_medicamentos),
                 fecha_vencimiento = COALESCE($7, fecha_vencimiento),
                 updated_at        = NOW()
             WHERE id = $8
             RETURNING *`,
            [nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });

        invalidateTenantCache(rows[0].slug);
        res.json({ data: rows[0], message: 'Tenant actualizado correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * DELETE /api/saas/tenants/:id
 * Soft delete: sets estado = 'cancelado'.
 */
router.delete('/tenants/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE tenants SET estado = 'cancelado', updated_at = NOW()
             WHERE id = $1 RETURNING id, slug, nombre_empresa, estado`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });
        invalidateTenantCache(rows[0].slug);
        res.json({ data: rows[0], message: 'Tenant cancelado correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * POST /api/saas/tenants/:id/suspend
 * Suspend a tenant account.
 */
router.post('/tenants/:id/suspend', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE tenants SET estado = 'suspendido', updated_at = NOW()
             WHERE id = $1 RETURNING id, slug, nombre_empresa, estado`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });
        invalidateTenantCache(rows[0].slug);
        res.json({ data: rows[0], message: 'Tenant suspendido correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * POST /api/saas/tenants/:id/activate
 * Reactivate a suspended or cancelled tenant.
 */
router.post('/tenants/:id/activate', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE tenants SET estado = 'activo', updated_at = NOW()
             WHERE id = $1 RETURNING id, slug, nombre_empresa, estado`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });
        invalidateTenantCache(rows[0].slug);
        res.json({ data: rows[0], message: 'Tenant activado correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * GET /api/saas/tenants/:id/stats
 * Usage statistics for a single tenant.
 */
router.get('/tenants/:id/stats', async (req, res) => {
    try {
        const tenantCheck = await pool.query('SELECT id, slug, nombre_empresa, plan FROM tenants WHERE id = $1', [req.params.id]);
        if (!tenantCheck.rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });

        const [usersRes, ventasRes, medsRes, sucursalesRes] = await Promise.all([
            pool.query('SELECT COUNT(*) AS total FROM usuarios WHERE tenant_id = $1', [req.params.id]),
            pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS monto FROM ventas WHERE tenant_id = $1', [req.params.id]),
            pool.query('SELECT COUNT(*) AS total FROM medicamentos WHERE tenant_id = $1', [req.params.id]),
            pool.query('SELECT COUNT(*) AS total FROM sucursales WHERE tenant_id = $1', [req.params.id]),
        ]);

        res.json({
            data: {
                tenant: tenantCheck.rows[0],
                stats: {
                    usuarios: parseInt(usersRes.rows[0].total, 10),
                    ventas_count: parseInt(ventasRes.rows[0].total, 10),
                    ventas_monto: parseFloat(ventasRes.rows[0].monto),
                    medicamentos: parseInt(medsRes.rows[0].total, 10),
                    sucursales: parseInt(sucursalesRes.rows[0].total, 10),
                }
            },
            message: 'Estadísticas obtenidas correctamente'
        });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * GET /api/saas/tenants/:id/ai-quota
 * Quota status for a tenant (uses v_ai_quota_status view).
 */
router.get('/tenants/:id/ai-quota', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM v_ai_quota_status WHERE tenant_id = $1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });
        res.json({ data: rows[0], message: 'Cuota IA obtenida correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * PATCH /api/saas/tenants/:id/ai-quota
 * Update quota overrides and enable/disable AI for a tenant.
 * Body: { ai_habilitado?, ai_tokens_override?, ai_requests_override?, ai_req_diario_override? }
 */
router.patch('/tenants/:id/ai-quota', async (req, res) => {
    const { ai_habilitado, ai_tokens_override, ai_requests_override, ai_req_diario_override } = req.body || {};

    // Validate numeric overrides when provided
    if (ai_tokens_override !== undefined && ai_tokens_override !== null && (isNaN(Number(ai_tokens_override)) || Number(ai_tokens_override) < 0)) {
        return res.status(400).json({ error: 'ai_tokens_override debe ser un número positivo o null' });
    }
    if (ai_requests_override !== undefined && ai_requests_override !== null && (isNaN(Number(ai_requests_override)) || Number(ai_requests_override) < 0)) {
        return res.status(400).json({ error: 'ai_requests_override debe ser un número positivo o null' });
    }
    if (ai_req_diario_override !== undefined && ai_req_diario_override !== null && (isNaN(Number(ai_req_diario_override)) || Number(ai_req_diario_override) < 0)) {
        return res.status(400).json({ error: 'ai_req_diario_override debe ser un número positivo o null' });
    }

    try {
        const setClauses = [];
        const params = [req.params.id];
        let idx = 2;

        if (ai_habilitado !== undefined) { setClauses.push(`ai_habilitado = $${idx++}`); params.push(Boolean(ai_habilitado)); }
        // Always update overrides (allows setting to NULL explicitly)
        setClauses.push(`ai_tokens_override = $${idx++}`);    params.push(ai_tokens_override != null ? Number(ai_tokens_override) : null);
        setClauses.push(`ai_requests_override = $${idx++}`);  params.push(ai_requests_override != null ? Number(ai_requests_override) : null);
        setClauses.push(`ai_req_diario_override = $${idx++}`); params.push(ai_req_diario_override != null ? Number(ai_req_diario_override) : null);
        setClauses.push(`updated_at = NOW()`);

        const { rows } = await pool.query(
            `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $1
             RETURNING id, ai_habilitado, ai_tokens_override, ai_requests_override, ai_req_diario_override`,
            params
        );
        if (!rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });
        res.json({ data: rows[0], message: 'Cuota IA actualizada correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * GET /api/saas/ai/quota-plans
 * List all ai_quota_plans.
 */
router.get('/ai/quota-plans', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT plan, tokens_mensual, requests_mensual, requests_diario, procesos_habilitados, updated_at
             FROM ai_quota_plans ORDER BY tokens_mensual`
        );
        res.json({ data: rows, message: 'Planes de cuota obtenidos correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

module.exports = router;
