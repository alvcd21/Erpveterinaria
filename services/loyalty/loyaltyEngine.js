'use strict';

const { pool } = require('../../config/db');

const DEFAULT_CONFIG = {
    activo: false,
    nombrePrograma: 'Programa de Lealtad',
    earnRate: 1.0,
    earnMinPurchase: 0,
    redeemRate: 100.0,
    redeemMinPoints: 500,
    redeemMaxPct: 30.0,
    expiryMonths: 12,
    expiryType: 'rolling',
    tierEnabled: false,
    tierThresholds: { silver: 5000, gold: 15000 },
    tierMultipliers: { bronze: 1.0, silver: 1.5, gold: 2.0 },
    bonusBirthdayPts: 0,
    bonusEnrollmentPts: 0,
    excludedCategories: [],
    excludeIhss: true,
};

function normalizeConfig(raw) {
    return {
        id: raw.id,
        idSucursal: raw.id_sucursal,
        activo: raw.activo,
        nombrePrograma: raw.nombre_programa,
        earnRate: Number(raw.earn_rate),
        earnMinPurchase: Number(raw.earn_min_purchase),
        redeemRate: Number(raw.redeem_rate),
        redeemMinPoints: Number(raw.redeem_min_points),
        redeemMaxPct: Number(raw.redeem_max_pct),
        expiryMonths: Number(raw.expiry_months),
        expiryType: raw.expiry_type,
        tierEnabled: raw.tier_enabled,
        tierThresholds: raw.tier_thresholds || { silver: 5000, gold: 15000 },
        tierMultipliers: raw.tier_multipliers || { bronze: 1.0, silver: 1.5, gold: 2.0 },
        bonusBirthdayPts: Number(raw.bonus_birthday_pts),
        bonusEnrollmentPts: Number(raw.bonus_enrollment_pts),
        excludedCategories: raw.excluded_categories || [],
        excludeIhss: raw.exclude_ihss,
    };
}

// Branch config overrides chain config; chain config overrides DEFAULT_CONFIG
async function getConfig(tenantId, idSucursal) {
    const { rows } = await pool.query(`
        SELECT * FROM loyalty_configs
        WHERE tenant_id = $1
          AND (id_sucursal = $2 OR id_sucursal IS NULL)
        ORDER BY id_sucursal NULLS LAST
        LIMIT 2
    `, [tenantId, idSucursal || null]);

    const branch = rows.find(r => r.id_sucursal != null);
    const chain  = rows.find(r => r.id_sucursal == null);
    const raw = branch || chain;
    if (!raw) return { ...DEFAULT_CONFIG };
    return normalizeConfig(raw);
}

async function getAllConfigs(tenantId) {
    const { rows } = await pool.query(
        `SELECT lc.*, s.nombre AS nombre_sucursal
         FROM loyalty_configs lc
         LEFT JOIN sucursales s ON s.id_sucursal = lc.id_sucursal
         WHERE lc.tenant_id = $1
         ORDER BY lc.id_sucursal NULLS FIRST`,
        [tenantId]
    );
    return rows.map(normalizeConfig);
}

async function saveConfig(tenantId, idSucursal, data) {
    const suc = idSucursal || null;
    const {
        activo = true, nombrePrograma = 'Programa de Lealtad',
        earnRate = 1, earnMinPurchase = 0,
        redeemRate = 100, redeemMinPoints = 500, redeemMaxPct = 30,
        expiryMonths = 12, expiryType = 'rolling',
        tierEnabled = false, tierThresholds, tierMultipliers,
        bonusBirthdayPts = 0, bonusEnrollmentPts = 0,
        excludedCategories = [], excludeIhss = true,
    } = data;

    const { rows } = await pool.query(`
        INSERT INTO loyalty_configs
            (tenant_id, id_sucursal, activo, nombre_programa,
             earn_rate, earn_min_purchase, redeem_rate, redeem_min_points, redeem_max_pct,
             expiry_months, expiry_type, tier_enabled, tier_thresholds, tier_multipliers,
             bonus_birthday_pts, bonus_enrollment_pts, excluded_categories, exclude_ihss, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
        ON CONFLICT (tenant_id, COALESCE(id_sucursal,-1))
        DO UPDATE SET
            activo = EXCLUDED.activo,
            nombre_programa = EXCLUDED.nombre_programa,
            earn_rate = EXCLUDED.earn_rate,
            earn_min_purchase = EXCLUDED.earn_min_purchase,
            redeem_rate = EXCLUDED.redeem_rate,
            redeem_min_points = EXCLUDED.redeem_min_points,
            redeem_max_pct = EXCLUDED.redeem_max_pct,
            expiry_months = EXCLUDED.expiry_months,
            expiry_type = EXCLUDED.expiry_type,
            tier_enabled = EXCLUDED.tier_enabled,
            tier_thresholds = EXCLUDED.tier_thresholds,
            tier_multipliers = EXCLUDED.tier_multipliers,
            bonus_birthday_pts = EXCLUDED.bonus_birthday_pts,
            bonus_enrollment_pts = EXCLUDED.bonus_enrollment_pts,
            excluded_categories = EXCLUDED.excluded_categories,
            exclude_ihss = EXCLUDED.exclude_ihss,
            updated_at = NOW()
        RETURNING *
    `, [tenantId, suc, activo, nombrePrograma,
        earnRate, earnMinPurchase, redeemRate, redeemMinPoints, redeemMaxPct,
        expiryMonths, expiryType, tierEnabled,
        JSON.stringify(tierThresholds || { silver: 5000, gold: 15000 }),
        JSON.stringify(tierMultipliers || { bronze: 1.0, silver: 1.5, gold: 2.0 }),
        bonusBirthdayPts, bonusEnrollmentPts, excludedCategories, excludeIhss]);

    return normalizeConfig(rows[0]);
}

function getTier(config, puntosVitalicios) {
    if (!config.tierEnabled) return 'bronze';
    const t = config.tierThresholds;
    if (puntosVitalicios >= (t.gold || 15000)) return 'gold';
    if (puntosVitalicios >= (t.silver || 5000)) return 'silver';
    return 'bronze';
}

function getEarnMultiplier(config, tier) {
    if (!config.tierEnabled) return 1.0;
    return Number(config.tierMultipliers?.[tier] || 1.0);
}

function calcPointsToEarn(config, amount, tier) {
    if (!config.activo) return 0;
    if (Number(amount) < config.earnMinPurchase) return 0;
    return Math.floor(Number(amount) * config.earnRate * getEarnMultiplier(config, tier));
}

function calcMaxRedemption(config, availablePoints, totalAmount) {
    if (!config.activo) return { maxPoints: 0, maxLps: 0 };
    if (availablePoints < config.redeemMinPoints) return { maxPoints: 0, maxLps: 0 };
    const maxByPct = Number(totalAmount) * config.redeemMaxPct / 100;
    const maxByPts = availablePoints / config.redeemRate;
    const maxLps   = Math.min(maxByPct, maxByPts);
    const raw      = Math.floor(maxLps * config.redeemRate);
    const rounded  = Math.floor(raw / 100) * 100;   // round to 100-pt increments
    return { maxPoints: rounded, maxLps: Number((rounded / config.redeemRate).toFixed(2)) };
}

async function getOrCreateAccount(tenantId, identidadCliente, config) {
    const { rows } = await pool.query(
        `SELECT * FROM loyalty_accounts WHERE tenant_id=$1 AND identidad_cliente=$2`,
        [tenantId, identidadCliente]
    );
    if (rows[0]) return rows[0];

    const bonus = config?.bonusEnrollmentPts || 0;
    const { rows: newRows } = await pool.query(`
        INSERT INTO loyalty_accounts(tenant_id, identidad_cliente, puntos_disponibles, puntos_vitalicios)
        VALUES ($1,$2,$3,$3) RETURNING *
    `, [tenantId, identidadCliente, bonus]);

    if (bonus > 0) {
        await pool.query(`
            INSERT INTO loyalty_transactions
                (tenant_id, account_id, tipo, puntos_delta, puntos_antes, puntos_despues, descripcion)
            VALUES ($1,$2,'bonus',$3,0,$3,'Bonus de bienvenida')
        `, [tenantId, newRows[0].id, bonus]);
    }
    return newRows[0];
}

// ── Public API ────────────────────────────────────────────────────────────────

async function previewTransaction(tenantId, identidadCliente, totalAmount, idSucursal) {
    const config = await getConfig(tenantId, idSucursal);
    if (!config.activo) return { activo: false };

    const { rows } = await pool.query(
        `SELECT * FROM loyalty_accounts WHERE tenant_id=$1 AND identidad_cliente=$2`,
        [tenantId, identidadCliente]
    );
    const acc = rows[0] || { puntos_disponibles: 0, puntos_vitalicios: 0 };
    const tier = getTier(config, acc.puntos_vitalicios);
    const puntosGanaria = calcPointsToEarn(config, totalAmount, tier);
    const { maxPoints, maxLps } = calcMaxRedemption(config, acc.puntos_disponibles, totalAmount);

    return {
        activo: true,
        nombrePrograma: config.nombrePrograma,
        puntosDisponibles: acc.puntos_disponibles,
        puntosVitalicios: acc.puntos_vitalicios,
        tierActual: tier,
        tierEnabled: config.tierEnabled,
        puntosGanaria,
        maxPuntosRedimibles: maxPoints,
        maxLpsRedimibles: maxLps,
        redeemMinPoints: config.redeemMinPoints,
        redeemRate: config.redeemRate,
        earnRate: config.earnRate,
    };
}

async function earnPoints(tenantId, identidadCliente, codVenta, amount, idSucursal, userId) {
    const config = await getConfig(tenantId, idSucursal);
    if (!config.activo) return { ok: true, puntosGanados: 0, reason: 'programa_inactivo' };

    const account = await getOrCreateAccount(tenantId, identidadCliente, config);
    const tier = getTier(config, account.puntos_vitalicios);
    const puntos = calcPointsToEarn(config, amount, tier);
    if (puntos <= 0) return { ok: true, puntosGanados: 0 };

    const puntosAntes  = account.puntos_disponibles;
    const puntosDespues = puntosAntes + puntos;
    const newVitalicio  = account.puntos_vitalicios + puntos;
    const newTier = getTier(config, newVitalicio);

    let expiresAt = null;
    if (config.expiryType === 'rolling' && config.expiryMonths > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() + config.expiryMonths);
        expiresAt = d.toISOString();
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE loyalty_accounts
            SET puntos_disponibles = $1, puntos_vitalicios = $2,
                tier_actual = $3, fecha_ultimo_mov = NOW()
            WHERE id = $4
        `, [puntosDespues, newVitalicio, newTier, account.id]);

        await client.query(`
            INSERT INTO loyalty_transactions
                (tenant_id, account_id, tipo, puntos_delta, puntos_antes, puntos_despues,
                 cod_venta, id_sucursal, usuario_id, descripcion, expires_at)
            VALUES ($1,$2,'earn',$3,$4,$5,$6,$7,$8,$9,$10)
        `, [tenantId, account.id, puntos, puntosAntes, puntosDespues,
            codVenta, idSucursal || null, userId || null,
            `Compra ${codVenta} — L ${Number(amount).toFixed(2)}`, expiresAt]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    return { ok: true, puntosGanados: puntos, puntosDespues, tierActual: newTier };
}

async function redeemPoints(tenantId, identidadCliente, codVenta, puntosARedir, idSucursal, userId) {
    const config = await getConfig(tenantId, idSucursal);
    if (!config.activo) return { ok: false, reason: 'programa_inactivo' };
    if (puntosARedir <= 0) return { ok: false, reason: 'puntos_invalidos' };

    const { rows } = await pool.query(
        `SELECT * FROM loyalty_accounts WHERE tenant_id=$1 AND identidad_cliente=$2`,
        [tenantId, identidadCliente]
    );
    if (!rows[0]) return { ok: false, reason: 'cuenta_no_encontrada' };
    const account = rows[0];

    if (account.puntos_disponibles < puntosARedir) return { ok: false, reason: 'puntos_insuficientes' };
    if (puntosARedir < config.redeemMinPoints) return { ok: false, reason: 'minimo_no_alcanzado' };

    const valorDescuento = Number((puntosARedir / config.redeemRate).toFixed(2));
    const puntosAntes    = account.puntos_disponibles;
    const puntosDespues  = puntosAntes - puntosARedir;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE loyalty_accounts SET puntos_disponibles=$1, fecha_ultimo_mov=NOW() WHERE id=$2
        `, [puntosDespues, account.id]);

        const { rows: txRows } = await client.query(`
            INSERT INTO loyalty_transactions
                (tenant_id, account_id, tipo, puntos_delta, puntos_antes, puntos_despues,
                 cod_venta, id_sucursal, usuario_id, descripcion)
            VALUES ($1,$2,'redeem',$3,$4,$5,$6,$7,$8,$9) RETURNING id
        `, [tenantId, account.id, -puntosARedir, puntosAntes, puntosDespues,
            codVenta, idSucursal || null, userId || null,
            `Redención ${codVenta} — descuento L ${valorDescuento.toFixed(2)}`]);

        await client.query(`
            INSERT INTO loyalty_redemptions
                (tenant_id, account_id, transaction_id, cod_venta, puntos_usados, valor_descuento_lps)
            VALUES ($1,$2,$3,$4,$5,$6)
        `, [tenantId, account.id, txRows[0].id, codVenta, puntosARedir, valorDescuento]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    return { ok: true, puntosUsados: puntosARedir, valorDescuento, puntosDespues };
}

async function reverseByVenta(tenantId, codVenta, userId) {
    const client = await pool.connect();
    let redReversals = 0, earnReversals = 0;
    try {
        await client.query('BEGIN');

        // Reverse active redemptions
        const { rows: reds } = await client.query(`
            SELECT lr.*, la.puntos_disponibles
            FROM loyalty_redemptions lr
            JOIN loyalty_accounts la ON la.id = lr.account_id
            WHERE lr.tenant_id=$1 AND lr.cod_venta=$2 AND lr.reversed_at IS NULL
            FOR UPDATE OF la
        `, [tenantId, codVenta]);

        for (const r of reds) {
            const nuevos = r.puntos_disponibles + r.puntos_usados;
            await client.query(`UPDATE loyalty_accounts SET puntos_disponibles=$1, fecha_ultimo_mov=NOW() WHERE id=$2`,
                [nuevos, r.account_id]);
            await client.query(`
                INSERT INTO loyalty_transactions
                    (tenant_id, account_id, tipo, puntos_delta, puntos_antes, puntos_despues,
                     cod_venta, usuario_id, descripcion)
                VALUES ($1,$2,'reversal',$3,$4,$5,$6,$7,$8)
            `, [tenantId, r.account_id, r.puntos_usados, r.puntos_disponibles, nuevos,
                codVenta, userId || null, `Reversal redención — venta anulada ${codVenta}`]);
            await client.query(`UPDATE loyalty_redemptions SET reversed_at=NOW() WHERE id=$1`, [r.id]);
            redReversals++;
        }

        // Reverse earn transactions
        const { rows: earns } = await client.query(`
            SELECT lt.*, la.puntos_disponibles, la.puntos_vitalicios
            FROM loyalty_transactions lt
            JOIN loyalty_accounts la ON la.id = lt.account_id
            WHERE lt.tenant_id=$1 AND lt.cod_venta=$2 AND lt.tipo='earn'
            FOR UPDATE OF la
        `, [tenantId, codVenta]);

        for (const e of earns) {
            const quitar     = Number(e.puntos_delta);
            const dispAhora  = e.puntos_disponibles;
            const vitalAhora = e.puntos_vitalicios;
            const nuevoDisp  = Math.max(0, dispAhora - quitar);
            const nuevoVital = Math.max(0, vitalAhora - quitar);
            await client.query(`
                UPDATE loyalty_accounts
                SET puntos_disponibles=$1, puntos_vitalicios=$2, fecha_ultimo_mov=NOW()
                WHERE id=$3
            `, [nuevoDisp, nuevoVital, e.account_id]);
            await client.query(`
                INSERT INTO loyalty_transactions
                    (tenant_id, account_id, tipo, puntos_delta, puntos_antes, puntos_despues,
                     cod_venta, usuario_id, descripcion)
                VALUES ($1,$2,'reversal',$3,$4,$5,$6,$7,$8)
            `, [tenantId, e.account_id, -quitar, dispAhora, nuevoDisp,
                codVenta, userId || null, `Reversal earn — venta anulada ${codVenta}`]);
            earnReversals++;
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return { ok: true, redReversals, earnReversals };
}

async function adjustPoints(tenantId, accountId, delta, descripcion, userId) {
    if (!delta || delta === 0) return { ok: false, reason: 'delta_cero' };
    const { rows } = await pool.query(
        `SELECT * FROM loyalty_accounts WHERE id=$1 AND tenant_id=$2`,
        [accountId, tenantId]
    );
    if (!rows[0]) return { ok: false, reason: 'cuenta_no_encontrada' };
    const acc = rows[0];

    const puntosAntes   = acc.puntos_disponibles;
    const puntosDespues = Math.max(0, puntosAntes + delta);
    const vitalFinal    = delta > 0 ? acc.puntos_vitalicios + delta : acc.puntos_vitalicios;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE loyalty_accounts
            SET puntos_disponibles=$1, puntos_vitalicios=$2, fecha_ultimo_mov=NOW()
            WHERE id=$3
        `, [puntosDespues, vitalFinal, acc.id]);
        await client.query(`
            INSERT INTO loyalty_transactions
                (tenant_id, account_id, tipo, puntos_delta, puntos_antes, puntos_despues,
                 usuario_id, descripcion)
            VALUES ($1,$2,'adjust',$3,$4,$5,$6,$7)
        `, [tenantId, acc.id, delta, puntosAntes, puntosDespues,
            userId || null, descripcion || 'Ajuste manual']);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return { ok: true, puntosAntes, puntosDespues };
}

async function expirePoints(tenantId) {
    // Fetch earn transactions past their expiry that haven't been reversed/expired yet
    const { rows: toExpire } = await pool.query(`
        SELECT lt.account_id, lt.id AS earn_tx_id, lt.puntos_delta AS puntos
        FROM loyalty_transactions lt
        WHERE lt.tenant_id = $1
          AND lt.tipo = 'earn'
          AND lt.expires_at IS NOT NULL
          AND lt.expires_at < NOW()
          AND NOT EXISTS (
              SELECT 1 FROM loyalty_transactions lt2
              WHERE lt2.account_id = lt.account_id
                AND lt2.tipo IN ('expire','reversal')
                AND lt2.descripcion LIKE '%exp:' || lt.id::text || '%'
          )
        ORDER BY lt.account_id
    `, [tenantId]);

    if (toExpire.length === 0) return 0;

    // Group by account
    const byAccount = {};
    for (const r of toExpire) {
        const key = String(r.account_id);
        byAccount[key] = byAccount[key] || { total: 0, ids: [] };
        byAccount[key].total += Number(r.puntos);
        byAccount[key].ids.push(r.earn_tx_id);
    }

    let totalExpired = 0;
    for (const [accountId, data] of Object.entries(byAccount)) {
        try {
            const { rows: [acc] } = await pool.query(
                `SELECT puntos_disponibles FROM loyalty_accounts WHERE id=$1`, [accountId]
            );
            if (!acc) continue;
            const quitar  = Math.min(data.total, acc.puntos_disponibles);
            if (quitar <= 0) continue;
            const despues = acc.puntos_disponibles - quitar;
            const desc    = `Expiración automática exp:${data.ids.join(',')}`;

            await pool.query(`
                UPDATE loyalty_accounts SET puntos_disponibles=$1, fecha_ultimo_mov=NOW() WHERE id=$2
            `, [despues, accountId]);
            await pool.query(`
                INSERT INTO loyalty_transactions
                    (tenant_id, account_id, tipo, puntos_delta, puntos_antes, puntos_despues, descripcion)
                VALUES ($1,$2,'expire',$3,$4,$5,$6)
            `, [tenantId, accountId, -quitar, acc.puntos_disponibles, despues, desc]);

            totalExpired += quitar;
        } catch (err) {
            console.error(`[loyalty] expirePoints account ${accountId}:`, err.message);
        }
    }
    return totalExpired;
}

module.exports = {
    getConfig, getAllConfigs, saveConfig,
    previewTransaction,
    earnPoints, redeemPoints,
    reverseByVenta,
    adjustPoints,
    expirePoints,
};
