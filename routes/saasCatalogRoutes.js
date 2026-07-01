'use strict';

const express = require('express');
const { pool, handleDbError } = require('../config/db');
const planFeaturesCache = require('../services/planFeaturesCache');
const { logSaasAudit } = require('../services/saasAuditService');
const {
    requireSaasPermission,
    intValue,
    numberValue,
    listValue,
} = require('../services/saasAdminAccess');
const {
    getPlan,
    getPlanFeatures,
    upsertPlanFeatures,
    syncPlanCompatibility,
    snapshotPlanVersion,
} = require('../services/saasAdminService');

const router = express.Router();

router.get('/overview', requireSaasPermission('tenants:read'), async (req, res) => {
    try {
        const [tenants, subscriptions, expiring, catalog] = await Promise.all([
            pool.query('SELECT estado, COUNT(*)::int AS total FROM tenants GROUP BY estado'),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE s.status IN ('active','trialing'))::int AS activas,
                    COUNT(*) FILTER (WHERE s.status IN ('suspended','past_due','expired'))::int AS riesgo,
                    COALESCE(SUM(CASE WHEN s.status = 'active' THEN p.precio_mensual ELSE 0 END), 0)::numeric AS mrr_estimado
                FROM tenant_subscriptions s
                JOIN saas_plans p ON p.slug = s.plan_slug
                WHERE s.is_current = TRUE
            `),
            pool.query(`
                SELECT t.id, t.slug, t.nombre_empresa, s.current_period_end, s.status, s.plan_slug
                FROM tenant_subscriptions s
                JOIN tenants t ON t.id = s.tenant_id
                WHERE s.is_current = TRUE
                  AND s.current_period_end IS NOT NULL
                  AND s.current_period_end <= NOW() + INTERVAL '30 days'
                ORDER BY s.current_period_end ASC
                LIMIT 10
            `),
            pool.query(`
                SELECT
                    (SELECT COUNT(*) FROM saas_plans)::int AS planes,
                    (SELECT COUNT(*) FROM saas_features)::int AS features
            `),
        ]);
        res.json({
            data: {
                tenants: tenants.rows,
                subscriptions: subscriptions.rows[0] || {},
                proximos_vencimientos: expiring.rows,
                catalogo: catalog.rows[0] || {},
            },
        });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/plans', requireSaasPermission('plans:read'), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM saas_plans ORDER BY orden, precio_mensual, slug');
        for (const plan of rows) plan.features = await getPlanFeatures(pool, plan.slug);
        res.json({ data: rows, message: 'Planes obtenidos correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/plans', requireSaasPermission('plans:write'), async (req, res) => {
    const body = req.body || {};
    const slug = String(body.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,80}$/.test(slug)) return res.status(400).json({ error: 'slug de plan invalido' });

    const featureKeys = listValue(body.features);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`
            INSERT INTO saas_plans
                (slug, nombre, descripcion, estado, moneda, precio_mensual, precio_anual,
                 max_sucursales, max_usuarios, max_medicamentos,
                 ai_tokens_mensual, ai_requests_mensual, ai_requests_diario, trial_dias, orden, metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
            RETURNING *
        `, [
            slug,
            body.nombre || slug,
            body.descripcion || null,
            body.estado || 'borrador',
            body.moneda || 'USD',
            numberValue(body.precio_mensual, 0),
            numberValue(body.precio_anual, 0),
            intValue(body.max_sucursales, 1),
            intValue(body.max_usuarios, 5),
            intValue(body.max_medicamentos, 500),
            intValue(body.ai_tokens_mensual, 100000),
            intValue(body.ai_requests_mensual, 200),
            intValue(body.ai_requests_diario, 30),
            intValue(body.trial_dias, 14),
            intValue(body.orden, 100),
            JSON.stringify(body.metadata || {}),
        ]);
        await upsertPlanFeatures(client, slug, featureKeys);
        await syncPlanCompatibility(client, rows[0], featureKeys);
        await snapshotPlanVersion(client, slug, req);
        await logSaasAudit(client, req, {
            action: 'saas.plan.create',
            entityType: 'saas_plan',
            entityId: slug,
            afterData: { plan: rows[0], features: featureKeys },
        });
        await client.query('COMMIT');
        planFeaturesCache.invalidate();
        res.status(201).json({ data: rows[0], message: 'Plan creado correctamente' });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

router.put('/plans/:slug', requireSaasPermission('plans:write'), async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const before = await getPlan(client, req.params.slug);
        if (!before) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Plan no encontrado' });
        }
        const { rows } = await client.query(`
            UPDATE saas_plans SET
                nombre = COALESCE($2, nombre),
                descripcion = COALESCE($3, descripcion),
                estado = COALESCE($4, estado),
                moneda = COALESCE($5, moneda),
                precio_mensual = COALESCE($6, precio_mensual),
                precio_anual = COALESCE($7, precio_anual),
                max_sucursales = COALESCE($8, max_sucursales),
                max_usuarios = COALESCE($9, max_usuarios),
                max_medicamentos = COALESCE($10, max_medicamentos),
                ai_tokens_mensual = COALESCE($11, ai_tokens_mensual),
                ai_requests_mensual = COALESCE($12, ai_requests_mensual),
                ai_requests_diario = COALESCE($13, ai_requests_diario),
                trial_dias = COALESCE($14, trial_dias),
                orden = COALESCE($15, orden),
                metadata = COALESCE($16::jsonb, metadata),
                updated_at = NOW()
            WHERE slug = $1
            RETURNING *
        `, [
            req.params.slug,
            body.nombre ?? null,
            body.descripcion ?? null,
            body.estado ?? null,
            body.moneda ?? null,
            body.precio_mensual ?? null,
            body.precio_anual ?? null,
            body.max_sucursales ?? null,
            body.max_usuarios ?? null,
            body.max_medicamentos ?? null,
            body.ai_tokens_mensual ?? null,
            body.ai_requests_mensual ?? null,
            body.ai_requests_diario ?? null,
            body.trial_dias ?? null,
            body.orden ?? null,
            body.metadata ? JSON.stringify(body.metadata) : null,
        ]);
        const featureKeys = Array.isArray(body.features)
            ? listValue(body.features)
            : (await getPlanFeatures(client, req.params.slug)).filter(f => f.enabled).map(f => f.feature_key);
        if (Array.isArray(body.features)) await upsertPlanFeatures(client, req.params.slug, featureKeys);
        await syncPlanCompatibility(client, rows[0], featureKeys);
        await snapshotPlanVersion(client, req.params.slug, req);
        await logSaasAudit(client, req, {
            action: 'saas.plan.update',
            entityType: 'saas_plan',
            entityId: req.params.slug,
            beforeData: before,
            afterData: { plan: rows[0], features: featureKeys },
        });
        await client.query('COMMIT');
        planFeaturesCache.invalidate();
        res.json({ data: rows[0], message: 'Plan actualizado correctamente' });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

router.post('/plans/:slug/archive', requireSaasPermission('plans:write'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            "UPDATE saas_plans SET estado = 'archivado', updated_at = NOW() WHERE slug = $1 RETURNING *",
            [req.params.slug]
        );
        if (!rows.length) return res.status(404).json({ error: 'Plan no encontrado' });
        await logSaasAudit(pool, req, {
            action: 'saas.plan.archive',
            entityType: 'saas_plan',
            entityId: req.params.slug,
            afterData: rows[0],
        });
        planFeaturesCache.invalidate();
        res.json({ data: rows[0], message: 'Plan archivado correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/features', requireSaasPermission('features:read'), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM saas_features ORDER BY modulo, orden, nombre');
        res.json({ data: rows, message: 'Features obtenidas correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/features', requireSaasPermission('features:write'), async (req, res) => {
    const body = req.body || {};
    const key = String(body.feature_key || '').trim();
    if (!/^[a-zA-Z0-9_.:-]{3,100}$/.test(key)) return res.status(400).json({ error: 'feature_key invalido' });
    try {
        const { rows } = await pool.query(`
            INSERT INTO saas_features (feature_key, nombre, modulo, tipo, descripcion, estado, requiere_feature_key, orden, metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
            RETURNING *
        `, [
            key,
            body.nombre || key,
            body.modulo || 'General',
            body.tipo || 'modulo',
            body.descripcion || null,
            body.estado || 'activo',
            body.requiere_feature_key || null,
            intValue(body.orden, 100),
            JSON.stringify(body.metadata || {}),
        ]);
        await logSaasAudit(pool, req, {
            action: 'saas.feature.create',
            entityType: 'saas_feature',
            entityId: key,
            afterData: rows[0],
        });
        planFeaturesCache.invalidate();
        res.status(201).json({ data: rows[0], message: 'Feature creada correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.put('/features/:key', requireSaasPermission('features:write'), async (req, res) => {
    const body = req.body || {};
    try {
        const before = await pool.query('SELECT * FROM saas_features WHERE feature_key = $1', [req.params.key]);
        const { rows } = await pool.query(`
            UPDATE saas_features SET
                nombre = COALESCE($2, nombre),
                modulo = COALESCE($3, modulo),
                tipo = COALESCE($4, tipo),
                descripcion = COALESCE($5, descripcion),
                estado = COALESCE($6, estado),
                requiere_feature_key = COALESCE($7, requiere_feature_key),
                orden = COALESCE($8, orden),
                metadata = COALESCE($9::jsonb, metadata),
                updated_at = NOW()
            WHERE feature_key = $1
            RETURNING *
        `, [
            req.params.key,
            body.nombre ?? null,
            body.modulo ?? null,
            body.tipo ?? null,
            body.descripcion ?? null,
            body.estado ?? null,
            body.requiere_feature_key ?? null,
            body.orden ?? null,
            body.metadata ? JSON.stringify(body.metadata) : null,
        ]);
        if (!rows.length) return res.status(404).json({ error: 'Feature no encontrada' });
        await logSaasAudit(pool, req, {
            action: 'saas.feature.update',
            entityType: 'saas_feature',
            entityId: req.params.key,
            beforeData: before.rows[0] || null,
            afterData: rows[0],
        });
        planFeaturesCache.invalidate();
        res.json({ data: rows[0], message: 'Feature actualizada correctamente' });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/tenants/:id/entitlements', requireSaasPermission('tenants:read'), async (req, res) => {
    try {
        const tenantResult = await pool.query('SELECT id, slug, nombre_empresa, plan FROM tenants WHERE id = $1', [req.params.id]);
        if (!tenantResult.rows.length) return res.status(404).json({ error: 'Tenant no encontrado' });
        const tenant = tenantResult.rows[0];
        const overrides = await pool.query(`
            SELECT o.*, f.nombre, f.modulo, f.tipo
            FROM tenant_feature_overrides o
            JOIN saas_features f ON f.feature_key = o.feature_key
            WHERE o.tenant_id = $1
            ORDER BY f.modulo, f.nombre
        `, [tenant.id]);
        const effective = await planFeaturesCache.getEffectiveFeaturesForTenant(tenant.id, tenant.plan);
        res.json({
            data: {
                tenant,
                planFeatures: await getPlanFeatures(pool, tenant.plan),
                overrides: overrides.rows,
                effectiveFeatures: effective,
            },
        });
    } catch (err) {
        handleDbError(res, err);
    }
});

router.put('/tenants/:id/entitlements', requireSaasPermission('entitlements:write'), async (req, res) => {
    const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const before = await client.query('SELECT * FROM tenant_feature_overrides WHERE tenant_id = $1', [req.params.id]);
        for (const item of overrides) {
            if (!item.feature_key) continue;
            if (item.enabled === null) {
                await client.query('DELETE FROM tenant_feature_overrides WHERE tenant_id = $1 AND feature_key = $2', [req.params.id, item.feature_key]);
            } else {
                await client.query(`
                    INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled, reason, valid_until, updated_by)
                    VALUES ($1,$2,$3,$4,$5,$6)
                    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
                        enabled = EXCLUDED.enabled,
                        reason = EXCLUDED.reason,
                        valid_until = EXCLUDED.valid_until,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
                `, [req.params.id, item.feature_key, Boolean(item.enabled), item.reason || null, item.valid_until || null, req.user?.adminUserId || null]);
            }
        }
        const after = await client.query('SELECT * FROM tenant_feature_overrides WHERE tenant_id = $1', [req.params.id]);
        await logSaasAudit(client, req, {
            action: 'saas.tenant.entitlements.update',
            entityType: 'tenant',
            entityId: req.params.id,
            tenantId: req.params.id,
            beforeData: before.rows,
            afterData: after.rows,
        });
        await client.query('COMMIT');
        planFeaturesCache.invalidateTenant(req.params.id);
        res.json({
            data: {
                overrides: after.rows,
                effectiveFeatures: await planFeaturesCache.getEffectiveFeaturesForTenant(req.params.id),
            },
            message: 'Entitlements actualizados',
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

module.exports = router;
