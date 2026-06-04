'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/entregas/pendientes?estado=Pendiente|Entregado|Cancelado|TODAS
router.get('/entregas/pendientes', authenticateToken, async (req, res) => {
    try {
        const estado = req.query.estado || 'Pendiente';
        const idSucursal = req.user.id_sucursal;
        if (!idSucursal) return res.status(400).json({ error: 'Usuario sin sucursal asignada' });

        const ESTADOS_VALID = new Set(['Pendiente', 'Entregado', 'Cancelado', 'TODAS']);
        if (!ESTADOS_VALID.has(estado)) return res.status(400).json({ error: 'Estado inválido' });

        const params = [req.tenantId, idSucursal];
        let estadoFilter = '';
        if (estado !== 'TODAS') {
            params.push(estado);
            estadoFilter = `AND e.estado = $${params.length}`;
        }

        const { rows } = await pool.query(`
            SELECT
                e.id,
                e.cod_venta               AS "codVenta",
                e.id_medicamento          AS "idMedicamento",
                e.nombre_medicamento      AS "nombreMedicamento",
                e.cantidad,
                e.nombre_presentacion     AS "nombrePresentacion",
                e.identidad_cliente       AS "identidadCliente",
                e.nombre_cliente          AS "nombreCliente",
                e.estado,
                e.fecha_creacion          AS "fechaCreacion",
                e.fecha_entrega           AS "fechaEntrega",
                e.entregado_por           AS "entregadoPor",
                e.notas_entrega           AS "notasEntrega",
                sf.nombre                 AS "sucursalFacturacion",
                sf.ciudad                 AS "ciudadFacturacion"
            FROM entregas_sucursal e
            JOIN sucursales sf ON sf.id_sucursal = e.id_sucursal_facturacion
            WHERE e.tenant_id = $1
              AND e.id_sucursal_origen = $2
              ${estadoFilter}
            ORDER BY e.fecha_creacion DESC
            LIMIT 200
        `, params);

        res.json(rows);
    } catch (err) {
        console.error('[entregas] GET error:', err.message);
        res.status(500).json({ error: 'Error obteniendo entregas' });
    }
});

// PATCH /api/entregas/:id/marcar-entregado
router.patch('/entregas/:id/marcar-entregado', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const notas = typeof req.body?.notas === 'string' ? req.body.notas.substring(0, 500) : null;
        const entregadoPor = req.user?.nombre || req.user?.usuario || null;

        const { rowCount } = await pool.query(`
            UPDATE entregas_sucursal
            SET estado = 'Entregado',
                fecha_entrega = NOW(),
                entregado_por = $3,
                notas_entrega = $4
            WHERE id = $1 AND tenant_id = $2 AND estado = 'Pendiente'
        `, [id, req.tenantId, entregadoPor, notas]);

        if (rowCount === 0) return res.status(404).json({ error: 'Entrega no encontrada o ya procesada' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[entregas] PATCH marcar-entregado error:', err.message);
        res.status(500).json({ error: 'Error actualizando entrega' });
    }
});

// PATCH /api/entregas/:id/cancelar
router.patch('/entregas/:id/cancelar', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const notas = typeof req.body?.notas === 'string' ? req.body.notas.substring(0, 500) : null;

        const { rowCount } = await pool.query(`
            UPDATE entregas_sucursal
            SET estado = 'Cancelado',
                notas_entrega = $3
            WHERE id = $1 AND tenant_id = $2 AND estado = 'Pendiente'
        `, [id, req.tenantId, notas]);

        if (rowCount === 0) return res.status(404).json({ error: 'Entrega no encontrada o ya procesada' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[entregas] PATCH cancelar error:', err.message);
        res.status(500).json({ error: 'Error cancelando entrega' });
    }
});

module.exports = router;
