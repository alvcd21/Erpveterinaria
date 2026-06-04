'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { pool } = require('../config/db');
const emailService = require('../services/emailService');
const { runDailyReport } = require('../services/cronJobs');

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_VALID = new Set([
    'sistema', 'alerta_cuota_ia', 'stock_critico', 'backup_ok', 'backup_error',
    'vencimiento', 'usuario', 'info', 'advertencia', 'error', 'entrega_pendiente',
]);

function scopeFilter(columnPrefix = '') {
    return `
        AND (
            ${columnPrefix}para_usuario = $2
            OR (
                ${columnPrefix}para_usuario IS NULL
                AND (
                    (${columnPrefix}tipo <> 'entrega_pendiente' AND ${columnPrefix}id_sucursal IS NULL)
                    OR ${columnPrefix}id_sucursal = $3
                )
            )
        )
    `;
}

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns last 40 notifications for the current user in this tenant.
router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, tipo, titulo, cuerpo, leida, fecha_creacion, fecha_lectura, para_usuario, id_sucursal
            FROM notificaciones
            WHERE tenant_id = $1
              ${scopeFilter()}
            ORDER BY leida ASC, fecha_creacion DESC
            LIMIT 40
        `, [req.tenantId, req.user?.usuario || null, req.user?.id_sucursal || null]);
        res.json(rows);
    } catch (err) {
        console.error('[notifications] GET error:', err.message);
        res.status(500).json({ error: 'Error obteniendo notificaciones' });
    }
});

// ── GET /api/notifications/unread-count ──────────────────────────────────────
router.get('/notifications/unread-count', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT COUNT(*) AS count
            FROM notificaciones
            WHERE tenant_id = $1
              ${scopeFilter()}
              AND leida = FALSE
        `, [req.tenantId, req.user?.usuario || null, req.user?.id_sucursal || null]);
        res.json({ count: parseInt(rows[0].count, 10) });
    } catch (err) {
        console.error('[notifications] unread-count error:', err.message);
        res.json({ count: 0 });
    }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
router.patch('/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await pool.query(`
            UPDATE notificaciones
            SET leida = TRUE, fecha_lectura = NOW()
            WHERE tenant_id = $1
              ${scopeFilter()}
              AND leida = FALSE
        `, [req.tenantId, req.user?.usuario || null, req.user?.id_sucursal || null]);
        res.json({ ok: true });
    } catch (err) {
        console.error('[notifications] read-all error:', err.message);
        res.status(500).json({ error: 'Error marcando notificaciones' });
    }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch('/notifications/:id/read', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    try {
        await pool.query(`
            UPDATE notificaciones
            SET leida = TRUE, fecha_lectura = NOW()
            WHERE id = $1 AND tenant_id = $2
              AND (
                  para_usuario = $3
                  OR (
                      para_usuario IS NULL
                      AND (
                          (tipo <> 'entrega_pendiente' AND id_sucursal IS NULL)
                          OR id_sucursal = $4
                      )
                  )
              )
        `, [id, req.tenantId, req.user?.usuario || null, req.user?.id_sucursal || null]);
        res.json({ ok: true });
    } catch (err) {
        console.error('[notifications] mark-read error:', err.message);
        res.status(500).json({ error: 'Error marcando notificación' });
    }
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete('/notifications/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    try {
        await pool.query(
            `DELETE FROM notificaciones
             WHERE id = $1 AND tenant_id = $2
               AND (
                   para_usuario = $3
                   OR (
                       para_usuario IS NULL
                       AND (
                           (tipo <> 'entrega_pendiente' AND id_sucursal IS NULL)
                           OR id_sucursal = $4
                       )
                   )
               )`,
            [id, req.tenantId, req.user?.usuario || null, req.user?.id_sucursal || null]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[notifications] delete error:', err.message);
        res.status(500).json({ error: 'Error eliminando notificación' });
    }
});

// ── POST /api/notifications/broadcast ────────────────────────────────────────
// Admin sends a notification to all users of this tenant (para_usuario = NULL).
router.post('/notifications/broadcast', authenticateToken, requireAdmin, async (req, res) => {
    const { titulo, cuerpo, tipo = 'sistema' } = req.body || {};
    if (!titulo || String(titulo).trim().length === 0) {
        return res.status(400).json({ error: 'titulo es requerido' });
    }
    if (String(titulo).length > 255) {
        return res.status(400).json({ error: 'titulo muy largo (max 255 chars)' });
    }
    if (!TIPO_VALID.has(tipo)) {
        return res.status(400).json({ error: 'tipo inválido', valid: [...TIPO_VALID] });
    }
    try {
        const { rows } = await pool.query(`
            INSERT INTO notificaciones (tenant_id, tipo, titulo, cuerpo, leida, fecha_creacion)
            VALUES ($1, $2, $3, $4, FALSE, NOW())
            RETURNING id, titulo, tipo, fecha_creacion
        `, [req.tenantId, tipo, titulo.trim(), cuerpo?.trim() || null]);
        res.status(201).json({ ok: true, notification: rows[0] });
    } catch (err) {
        console.error('[notifications] broadcast error:', err.message);
        res.status(500).json({ error: 'Error creando notificación' });
    }
});

// ── Existing test / admin helpers ─────────────────────────────────────────────

router.post('/notifications/test-daily-report', authenticateToken, requireAdmin, async (req, res) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        return res.status(500).json({ error: 'ADMIN_EMAIL no configurado en el servidor.' });
    }
    try {
        await runDailyReport();
        res.json({ success: true, message: `Reporte diario enviado a ${adminEmail}` });
    } catch (err) {
        console.error('[notificationRoutes] test-daily-report error:', err.message);
        res.status(500).json({ error: 'Error al enviar el reporte diario', detail: err.message });
    }
});

router.post('/notifications/test-repair-ready', authenticateToken, requireAdmin, async (req, res) => {
    const { to, clientName, repairId, deviceDesc, techNotes } = req.body;
    if (!to || !clientName || !repairId || !deviceDesc) {
        return res.status(400).json({ error: 'Campos requeridos: to, clientName, repairId, deviceDesc' });
    }
    try {
        await emailService.sendRepairReadyEmail(to, clientName, repairId, deviceDesc, techNotes || '');
        res.json({ success: true, message: `Correo de reparacion lista enviado a ${to}` });
    } catch (err) {
        console.error('[notificationRoutes] test-repair-ready error:', err.message);
        res.status(500).json({ error: 'Error al enviar el correo', detail: err.message });
    }
});

router.post('/notifications/backup-now', authenticateToken, requireAdmin, async (req, res) => {
    res.status(403).json({ error: 'Backup restringido a super-administradores SaaS.' });
});

module.exports = router;
