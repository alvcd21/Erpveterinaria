'use strict';

const { invalidateTenantCache } = require('../middleware/tenant');
const planFeaturesCache = require('./planFeaturesCache');

function subscriptionStatusToTenantStatus(status) {
    if (status === 'trialing') return 'prueba';
    if (status === 'suspended') return 'suspendido';
    if (status === 'canceled') return 'cancelado';
    return 'activo';
}

async function getPlan(client, slug) {
    const { rows } = await client.query('SELECT * FROM saas_plans WHERE slug = $1', [slug]);
    return rows[0] || null;
}

async function getPlanFeatures(client, slug) {
    const { rows } = await client.query(`
        SELECT f.feature_key, f.nombre, f.modulo, f.tipo, f.descripcion,
               COALESCE(pf.enabled, FALSE) AS enabled, COALESCE(pf.limits, '{}'::jsonb) AS limits
        FROM saas_features f
        LEFT JOIN saas_plan_features pf
          ON pf.feature_key = f.feature_key AND pf.plan_slug = $1
        WHERE f.estado = 'activo'
        ORDER BY f.modulo, f.orden, f.nombre
    `, [slug]);
    return rows;
}

async function upsertPlanFeatures(client, planSlug, featureKeys) {
    await client.query('DELETE FROM saas_plan_features WHERE plan_slug = $1', [planSlug]);
    for (const featureKey of featureKeys) {
        await client.query(
            'INSERT INTO saas_plan_features (plan_slug, feature_key, enabled) VALUES ($1, $2, TRUE)',
            [planSlug, featureKey]
        );
    }
}

async function syncPlanCompatibility(client, plan, featureKeys) {
    await client.query('DELETE FROM plan_features WHERE plan = $1', [plan.slug]);
    for (const featureKey of featureKeys) {
        await client.query(`
            INSERT INTO plan_features (plan, feature_key, descripcion)
            SELECT $1, feature_key, descripcion
            FROM saas_features
            WHERE feature_key = $2
            ON CONFLICT DO NOTHING
        `, [plan.slug, featureKey]);
    }
    const aiProcesses = featureKeys.some(featureKey => featureKey === 'ia_basica' || featureKey === 'ia_avanzada')
        ? ['symptom_recommendation', 'drug_interactions', 'client_analysis', 'restock_prediction']
        : [];
    await client.query(`
        INSERT INTO ai_quota_plans (plan, tokens_mensual, requests_mensual, requests_diario, procesos_habilitados)
        VALUES ($1, $2, $3, $4, $5::text[])
        ON CONFLICT (plan) DO UPDATE SET
            tokens_mensual = EXCLUDED.tokens_mensual,
            requests_mensual = EXCLUDED.requests_mensual,
            requests_diario = EXCLUDED.requests_diario,
            procesos_habilitados = EXCLUDED.procesos_habilitados,
            updated_at = NOW()
    `, [plan.slug, plan.ai_tokens_mensual, plan.ai_requests_mensual, plan.ai_requests_diario, aiProcesses]);
}

async function snapshotPlanVersion(client, planSlug, req) {
    const plan = await getPlan(client, planSlug);
    const features = await getPlanFeatures(client, planSlug);
    const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM saas_plan_versions WHERE plan_slug = $1',
        [planSlug]
    );
    await client.query(`
        INSERT INTO saas_plan_versions (plan_slug, version, snapshot, actor_admin_id)
        VALUES ($1, $2, $3::jsonb, $4)
    `, [
        planSlug,
        versionResult.rows[0].next_version,
        JSON.stringify({ plan, features }),
        req.user?.adminUserId || null,
    ]);
}

async function updateTenantFromPlan(client, tenantId, plan, status, periodEnd) {
    const tenantStatus = subscriptionStatusToTenantStatus(status);
    const aiEnabled = Number(plan.ai_tokens_mensual) > 0
        || Number(plan.ai_requests_mensual) > 0
        || Number(plan.ai_requests_diario) > 0;
    const { rows } = await client.query(`
        UPDATE tenants SET
            plan = $2,
            estado = $3,
            max_sucursales = $4,
            max_usuarios = $5,
            max_medicamentos = $6,
            fecha_vencimiento = $7,
            ai_habilitado = $8,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, slug, nombre_empresa, plan, estado
    `, [
        tenantId,
        plan.slug,
        tenantStatus,
        plan.max_sucursales,
        plan.max_usuarios,
        plan.max_medicamentos,
        periodEnd || null,
        aiEnabled,
    ]);
    if (rows[0]) invalidateTenantCache(rows[0].slug);
    planFeaturesCache.invalidateTenant(tenantId);
    return rows[0];
}

async function addSubscriptionEvent(client, req, payload) {
    await client.query(`
        INSERT INTO tenant_subscription_events
            (subscription_id, tenant_id, event_type, from_status, to_status,
             from_plan_slug, to_plan_slug, payload, actor_admin_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
    `, [
        payload.subscriptionId || null,
        payload.tenantId,
        payload.eventType,
        payload.fromStatus || null,
        payload.toStatus || null,
        payload.fromPlanSlug || null,
        payload.toPlanSlug || null,
        JSON.stringify(payload.payload || {}),
        req.user?.adminUserId || null,
    ]);
}

module.exports = {
    getPlan,
    getPlanFeatures,
    upsertPlanFeatures,
    syncPlanCompatibility,
    snapshotPlanVersion,
    updateTenantFromPlan,
    addSubscriptionEvent,
};
