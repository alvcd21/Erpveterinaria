const { pool } = require('../config/db');

// Map<planName, Set<featureKey>>
let cache = new Map();
let lastLoad = 0;
const TTL_MS = 10 * 60 * 1000; // 10 minutos

async function load() {
    try {
        const { rows } = await pool.query('SELECT plan, feature_key FROM plan_features');
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

// Permite al SuperAdmin invalidar el cache tras cambios en plan_features
function invalidate() {
    lastLoad = 0;
}

module.exports = { load, planHasFeature, getFeaturesForPlan, invalidate };
