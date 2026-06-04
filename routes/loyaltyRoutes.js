'use strict';

const express = require('express');
const router  = express.Router();
const engine  = require('../services/loyalty/loyaltyEngine');
const { pool } = require('../config/db');

function isAdmin(user) {
    const role = String(user?.rol || '').toLowerCase();
    return role === 'administrador' || role === 'admin' || role === 'superadmin';
}

// ── Config ────────────────────────────────────────────────────────────────────

// GET /loyalty/configs — all configs for tenant (admin view)
router.get('/loyalty/configs', async (req, res) => {
    try {
        const configs = await engine.getAllConfigs(req.tenantId);
        res.json(configs);
    } catch (err) {
        console.error('[loyalty] GET configs:', err.message);
        res.status(500).json({ error: 'Error obteniendo configuraciones' });
    }
});

// GET /loyalty/config — effective config for user's branch (optional ?id_sucursal=)
router.get('/loyalty/config', async (req, res) => {
    try {
        const idSucursal = req.query.id_sucursal
            ? parseInt(req.query.id_sucursal, 10)
            : (req.user?.id_sucursal || null);
        const config = await engine.getConfig(req.tenantId, idSucursal);
        res.json(config);
    } catch (err) {
        console.error('[loyalty] GET config:', err.message);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

// PUT /loyalty/config — upsert config (admin only)
router.put('/loyalty/config', async (req, res) => {
    try {
        if (!isAdmin(req.user)) return res.status(403).json({ error: 'Solo administradores pueden modificar la configuración de lealtad' });
        const idSucursal = req.body.idSucursal != null ? parseInt(req.body.idSucursal, 10) : null;
        const config = await engine.saveConfig(req.tenantId, idSucursal, req.body);
        res.json(config);
    } catch (err) {
        console.error('[loyalty] PUT config:', err.message);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
});

// ── Accounts ──────────────────────────────────────────────────────────────────

// GET /loyalty/account/:identidad — get/create account + preview
router.get('/loyalty/account/:identidad', async (req, res) => {
    try {
        const identidad = String(req.params.identidad).substring(0, 50).trim();
        if (!identidad) return res.status(400).json({ error: 'Identidad requerida' });

        const idSucursal = req.user?.id_sucursal || null;
        const config  = await engine.getConfig(req.tenantId, idSucursal);
        const account = await engine.getOrCreateAccount(req.tenantId, identidad, config);
        const preview = await engine.previewTransaction(req.tenantId, identidad, 0, idSucursal);

        res.json({
            id:                account.id,
            identidadCliente:  account.identidad_cliente,
            puntosDisponibles: account.puntos_disponibles,
            puntosVitalicios:  account.puntos_vitalicios,
            tierActual:        account.tier_actual,
            fechaInscripcion:  account.fecha_inscripcion,
            fechaUltimoMov:    account.fecha_ultimo_mov,
            preview,
        });
    } catch (err) {
        console.error('[loyalty] GET account:', err.message);
        res.status(500).json({ error: 'Error obteniendo cuenta' });
    }
});

// GET /loyalty/accounts — paginated list (admin only)
router.get('/loyalty/accounts', async (req, res) => {
    try {
        if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acceso restringido' });

        const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);
        const search = req.query.search ? String(req.query.search).substring(0, 50) : null;

        const params = [req.tenantId, limit, offset];
        let searchFilter = '';
        if (search) {
            params.push(`%${search}%`);
            searchFilter = `AND (la.identidad_cliente ILIKE $${params.length}
                             OR c.nombre ILIKE $${params.length}
                             OR c.apellido ILIKE $${params.length})`;
        }

        const { rows } = await pool.query(`
            SELECT
                la.id,
                la.identidad_cliente                              AS "identidadCliente",
                la.puntos_disponibles                            AS "puntosDisponibles",
                la.puntos_vitalicios                             AS "puntosVitalicios",
                la.tier_actual                                   AS "tierActual",
                la.fecha_inscripcion                             AS "fechaInscripcion",
                la.fecha_ultimo_mov                              AS "fechaUltimoMov",
                COALESCE(c.nombre || ' ' || COALESCE(c.apellido,''), '') AS "nombreCliente"
            FROM loyalty_accounts la
            LEFT JOIN clientes c ON c.identidad = la.identidad_cliente
                                AND c.tenant_id = la.tenant_id
            WHERE la.tenant_id = $1
              ${searchFilter}
            ORDER BY la.puntos_disponibles DESC
            LIMIT $2 OFFSET $3
        `, params);

        const { rows: [{ total }] } = await pool.query(
            `SELECT COUNT(*) AS total FROM loyalty_accounts WHERE tenant_id = $1`,
            [req.tenantId]
        );

        res.json({ rows, total: Number(total), limit, offset });
    } catch (err) {
        console.error('[loyalty] GET accounts:', err.message);
        res.status(500).json({ error: 'Error obteniendo cuentas' });
    }
});

// ── Transactions ──────────────────────────────────────────────────────────────

// GET /loyalty/transactions/:identidad — history (limit via ?limit=)
router.get('/loyalty/transactions/:identidad', async (req, res) => {
    try {
        const identidad = String(req.params.identidad).substring(0, 50).trim();
        if (!identidad) return res.status(400).json({ error: 'Identidad requerida' });
        const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

        const { rows } = await pool.query(`
            SELECT
                lt.id,
                lt.tipo,
                lt.puntos_delta   AS "puntosDelta",
                lt.puntos_antes   AS "puntosAntes",
                lt.puntos_despues AS "puntosDespues",
                lt.cod_venta      AS "codVenta",
                lt.descripcion,
                lt.expires_at     AS "expiresAt",
                lt.created_at     AS "createdAt"
            FROM loyalty_transactions lt
            JOIN loyalty_accounts la ON la.id = lt.account_id
            WHERE la.tenant_id = $1 AND la.identidad_cliente = $2
            ORDER BY lt.created_at DESC
            LIMIT $3
        `, [req.tenantId, identidad, limit]);

        res.json(rows);
    } catch (err) {
        console.error('[loyalty] GET transactions:', err.message);
        res.status(500).json({ error: 'Error obteniendo historial' });
    }
});

// ── Operations ────────────────────────────────────────────────────────────────

// POST /loyalty/preview — preview earn/redeem (no DB write)
router.post('/loyalty/preview', async (req, res) => {
    try {
        const { identidadCliente, totalAmount, idSucursal } = req.body;
        if (!identidadCliente || totalAmount == null) {
            return res.status(400).json({ error: 'identidadCliente y totalAmount son requeridos' });
        }
        const suc = idSucursal != null ? parseInt(idSucursal, 10) : (req.user?.id_sucursal || null);
        const result = await engine.previewTransaction(
            req.tenantId,
            String(identidadCliente).substring(0, 50),
            Number(totalAmount),
            suc
        );
        res.json(result);
    } catch (err) {
        console.error('[loyalty] POST preview:', err.message);
        res.status(500).json({ error: 'Error en preview de puntos' });
    }
});

// POST /loyalty/earn — accredit points after a completed sale
router.post('/loyalty/earn', async (req, res) => {
    try {
        const { identidadCliente, codVenta, amount, idSucursal } = req.body;
        if (!identidadCliente || !codVenta || amount == null) {
            return res.status(400).json({ error: 'identidadCliente, codVenta y amount son requeridos' });
        }
        const suc = idSucursal != null ? parseInt(idSucursal, 10) : (req.user?.id_sucursal || null);
        const result = await engine.earnPoints(
            req.tenantId,
            String(identidadCliente).substring(0, 50),
            String(codVenta).substring(0, 100),
            Number(amount),
            suc,
            req.user?.id || null
        );
        res.json(result);
    } catch (err) {
        console.error('[loyalty] POST earn:', err.message);
        res.status(500).json({ error: 'Error acreditando puntos' });
    }
});

// POST /loyalty/redeem — deduct points and return discount value
router.post('/loyalty/redeem', async (req, res) => {
    try {
        const { identidadCliente, codVenta, puntos, idSucursal } = req.body;
        if (!identidadCliente || !codVenta || !puntos) {
            return res.status(400).json({ error: 'identidadCliente, codVenta y puntos son requeridos' });
        }
        const suc = idSucursal != null ? parseInt(idSucursal, 10) : (req.user?.id_sucursal || null);
        const result = await engine.redeemPoints(
            req.tenantId,
            String(identidadCliente).substring(0, 50),
            String(codVenta).substring(0, 100),
            parseInt(puntos, 10),
            suc,
            req.user?.id || null
        );
        if (!result.ok) return res.status(400).json(result);
        res.json(result);
    } catch (err) {
        console.error('[loyalty] POST redeem:', err.message);
        res.status(500).json({ error: 'Error canjeando puntos' });
    }
});

// POST /loyalty/reverse — reverse all earn+redeem for a voided sale
router.post('/loyalty/reverse', async (req, res) => {
    try {
        const { codVenta } = req.body;
        if (!codVenta) return res.status(400).json({ error: 'codVenta es requerido' });
        const result = await engine.reverseByVenta(
            req.tenantId,
            String(codVenta).substring(0, 100),
            req.user?.id || null
        );
        res.json(result);
    } catch (err) {
        console.error('[loyalty] POST reverse:', err.message);
        res.status(500).json({ error: 'Error revirtiendo puntos' });
    }
});

// POST /loyalty/adjust — manual point adjustment (admin only)
router.post('/loyalty/adjust', async (req, res) => {
    try {
        if (!isAdmin(req.user)) return res.status(403).json({ error: 'Solo administradores pueden ajustar puntos manualmente' });
        const { accountId, delta, descripcion } = req.body;
        if (!accountId || delta == null) {
            return res.status(400).json({ error: 'accountId y delta son requeridos' });
        }
        const result = await engine.adjustPoints(
            req.tenantId,
            parseInt(accountId, 10),
            parseInt(delta, 10),
            String(descripcion || '').substring(0, 255),
            req.user?.id || null
        );
        if (!result.ok) return res.status(400).json(result);
        res.json(result);
    } catch (err) {
        console.error('[loyalty] POST adjust:', err.message);
        res.status(500).json({ error: 'Error ajustando puntos' });
    }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

// GET /loyalty/stats — aggregate dashboard stats (admin only)
router.get('/loyalty/stats', async (req, res) => {
    try {
        if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acceso restringido' });

        const [cuentasRes, txRes] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)                                                      AS total_cuentas,
                    COALESCE(SUM(puntos_disponibles), 0)                          AS puntos_en_circulacion,
                    COALESCE(SUM(puntos_vitalicios), 0)                           AS puntos_vitalicios_total,
                    COUNT(*) FILTER (WHERE tier_actual = 'silver')               AS cuentas_silver,
                    COUNT(*) FILTER (WHERE tier_actual = 'gold')                 AS cuentas_gold,
                    COUNT(*) FILTER (WHERE fecha_ultimo_mov >= NOW() - INTERVAL '30 days') AS activos_30d
                FROM loyalty_accounts WHERE tenant_id = $1
            `, [req.tenantId]),

            pool.query(`
                SELECT
                    tipo,
                    COUNT(*) AS cantidad,
                    COALESCE(SUM(ABS(puntos_delta)), 0) AS puntos_total
                FROM loyalty_transactions
                WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
                GROUP BY tipo
                ORDER BY tipo
            `, [req.tenantId]),
        ]);

        res.json({
            cuentas:          cuentasRes.rows[0],
            transacciones30d: txRes.rows,
        });
    } catch (err) {
        console.error('[loyalty] GET stats:', err.message);
        res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
});

module.exports = router;
