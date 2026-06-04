'use strict';

const { pool } = require('./db');

// Per-tenant config cache: Map<tenantId, { data, cachedAt }>
const _cache = new Map();
const CACHE_TTL = 60_000; // 60 seconds

// Run once at first use to ensure columns exist (idempotent)
let _migrated = false;
async function ensureColumns() {
    if (_migrated) return;
    try {
        await pool.query(`
            ALTER TABLE configuracion
                ADD COLUMN IF NOT EXISTS admin_email        VARCHAR(255),
                ADD COLUMN IF NOT EXISTS email_from         VARCHAR(255),
                ADD COLUMN IF NOT EXISTS saldo_tigo_umbral  NUMERIC(12,2) DEFAULT 500,
                ADD COLUMN IF NOT EXISTS saldo_claro_umbral NUMERIC(12,2) DEFAULT 500,
                ADD COLUMN IF NOT EXISTS drive_folder_id    VARCHAR(255)
        `);
    } catch (_) { /* already exists or no-op */ }
    _migrated = true;
}

const ENV_FALLBACK = () => ({
    adminEmail:       process.env.ADMIN_EMAIL                 || '',
    emailFrom:        process.env.EMAIL_FROM                  || 'ERP Farmacia <noreply@erpfarmacia.com>',
    saldoTigoUmbral:  Number(process.env.SALDO_TIGO_UMBRAL   ?? 500),
    saldoClaroUmbral: Number(process.env.SALDO_CLARO_UMBRAL  ?? 500),
    driveFolderId:    process.env.GOOGLE_DRIVE_FOLDER_ID      || 'root',
});

/**
 * Get system configuration for a specific tenant.
 * @param {string|null} tenantId - UUID of the tenant, or null for env-var fallback
 */
async function getSystemConfig(tenantId = null) {
    const cacheKey = tenantId || '__env__';
    const now = Date.now();
    const cached = _cache.get(cacheKey);
    if (cached && (now - cached.cachedAt) < CACHE_TTL) return cached.data;

    try {
        await ensureColumns();
        let r;
        if (tenantId) {
            r = await pool.query(
                `SELECT admin_email, email_from, saldo_tigo_umbral, saldo_claro_umbral, drive_folder_id
                 FROM configuracion WHERE tenant_id = $1`,
                [tenantId]
            );
        } else {
            // Legacy / super-admin context: use env vars
            const data = ENV_FALLBACK();
            _cache.set(cacheKey, { data, cachedAt: now });
            return data;
        }
        const row = r.rows[0] || {};
        const data = {
            adminEmail:       row.admin_email                              || process.env.ADMIN_EMAIL  || '',
            emailFrom:        row.email_from                               || process.env.EMAIL_FROM   || 'ERP Farmacia <noreply@erpfarmacia.com>',
            saldoTigoUmbral:  Number(row.saldo_tigo_umbral  ?? process.env.SALDO_TIGO_UMBRAL  ?? 500),
            saldoClaroUmbral: Number(row.saldo_claro_umbral ?? process.env.SALDO_CLARO_UMBRAL ?? 500),
            driveFolderId:    row.drive_folder_id                          || process.env.GOOGLE_DRIVE_FOLDER_ID || 'root',
        };
        _cache.set(cacheKey, { data, cachedAt: now });
        return data;
    } catch (err) {
        console.warn('[systemConfig] DB error, using env fallback:', err.message);
        const data = ENV_FALLBACK();
        _cache.set(cacheKey, { data, cachedAt: now });
        return data;
    }
}

function invalidateSystemConfigCache(tenantId = null) {
    if (tenantId) _cache.delete(tenantId);
    else _cache.clear();
}

module.exports = { getSystemConfig, invalidateSystemConfigCache };
