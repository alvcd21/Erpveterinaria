const { pool } = require('../config/db');

// Map<planName, Set<featureKey>>
let cache = new Map();
let tenantCache = new Map();
let lastLoad = 0;
const TTL_MS = 10 * 60 * 1000; // 10 minutos
const TENANT_TTL_MS = 2 * 60 * 1000;

async function load() {
    try {
        const { rows } = await pool.query(`
            SELECT plan, feature_key
            FROM plan_features
            UNION
            SELECT plan_slug AS plan, feature_key
            FROM saas_plan_features
            WHERE enabled = TRUE
        `);
        const next = new Map();
        for (const r of rows) {
            if (!next.has(r.plan)) next.set(r.plan, new Set());
            next.get(r.plan).add(r.feature_key);
        }
        cache = next;
        lastLoad = Date.now();
        console.log(`[planFeaturesCache] Cargadas ${rows.length} features para ${next.size} planes`);
    } catch (err) {
        console.error('[planFeaturesCache] Error al cargar plan_features:', err.message);
    }
}

async function ensureLoaded() {
    if (Date.now() - lastLoad > TTL_MS) await load();
}

async function planHasFeature(plan, featureKey) {
    await ensureLoaded();
    // SuperAdmin / enterprise siempre tiene todo (fallback seguro)
    if (!plan) return false;
    return cache.get(plan)?.has(featureKey) ?? false;
}

async function getFeaturesForPlan(plan) {
    await ensureLoaded();
    if (!plan) return [];
    return Array.from(cache.get(plan) || []);
}

async function getPlanForTenant(tenantId) {
    if (!tenantId) return null;
    const { rows } = await pool.query('SELECT plan FROM tenants WHERE id = $1', [tenantId]);
    return rows[0]?.plan || null;
}

async function getEffectiveFeaturesForTenant(tenantId, fallbackPlan = null) {
    await ensureLoaded();
    if (!tenantId) return getFeaturesForPlan(fallbackPlan);

    const cached = tenantCache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < TENANT_TTL_MS) {
        return Array.from(cached.features);
    }

    const tenantPlan = fallbackPlan || await getPlanForTenant(tenantId) || 'basico';
    const features = new Set(cache.get(tenantPlan) || []);

    try {
        const { rows } = await pool.query(`
            SELECT feature_key, enabled
            FROM tenant_feature_overrides
            WHERE tenant_id = $1
              AND (valid_until IS NULL OR valid_until >= NOW())
        `, [tenantId]);
        for (const row of rows) {
            if (row.enabled) features.add(row.feature_key);
            else features.delete(row.feature_key);
        }
    } catch (err) {
        if (err.code !== '42P01') {
            console.error('[planFeaturesCache] Error cargando overrides de tenant:', err.message);
        }
    }

    tenantCache.set(tenantId, { features, cachedAt: Date.now(), plan: tenantPlan });
    return Array.from(features);
}

async function tenantHasFeature(tenantId, plan, featureKey) {
    const features = await getEffectiveFeaturesForTenant(tenantId, plan);
    return features.includes(featureKey);
}

// Permite al SuperAdmin invalidar el cache tras cambios en plan_features
function invalidate() {
    lastLoad = 0;
    tenantCache = new Map();
}

function invalidateTenant(tenantId) {
    if (tenantId) tenantCache.delete(tenantId);
}

module.exports = {
    load,
    planHasFeature,
    getFeaturesForPlan,
    getEffectiveFeaturesForTenant,
    tenantHasFeature,
    invalidate,
    invalidateTenant,
};
