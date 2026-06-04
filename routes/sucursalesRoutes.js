
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, withTenantContext } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// -------------------------------------------------------
// SUCURSALES
// -------------------------------------------------------
router.get('/sucursales', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT * FROM sucursales WHERE tenant_id = $1 ORDER BY nombre`,
            [req.tenantId]
        );
        res.json(r.rows);
    } catch (e) { handleDbError(res, e); }
});

router.get('/sucursales/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT * FROM sucursales WHERE id_sucursal = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Sucursal no encontrada' });
        res.json(r.rows[0]);
    } catch (e) { handleDbError(res, e); }
});

// Resumen de sucursal: ventas del día, stock crítico, caja activa
router.get('/sucursales/:id/summary', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const [ventasHoy, stockCritico, cajaActiva] = await Promise.all([
            pool.query(`
                SELECT COALESCE(SUM(total),0) AS total_ventas, COUNT(*) AS num_ventas
                FROM ventas
                WHERE id_sucursal = $1 AND estado = 'Completada' AND DATE(fecha) = CURRENT_DATE
                  AND tenant_id = $2
            `, [id, req.tenantId]),
            pool.query(`
                SELECT COUNT(*) AS productos_criticos
                FROM medicamentos m
                LEFT JOIN lotes_medicamento l ON m.codigo = l.id_medicamento AND l.estado = 'Activo' AND l.id_sucursal = $1 AND l.tenant_id = $2
                WHERE m.activo = TRUE AND m.tenant_id = $2
                GROUP BY m.codigo, m.stock_minimo
                HAVING COALESCE(SUM(l.cantidad_actual), 0) <= m.stock_minimo
            `, [id, req.tenantId]),
            pool.query(`
                SELECT a.idArqueo, a.montoInicial, a.fechaApertura, c.nombre AS "nombreCaja"
                FROM arqueo a
                JOIN caja c ON a.idCaja = c.idCaja AND c.tenant_id = $2
                WHERE c.id_sucursal = $1 AND a.estado = 'Activo'
                  AND a.tenant_id = $2
                LIMIT 1
            `, [id, req.tenantId])
        ]);

        res.json({
            ventasHoy: ventasHoy.rows[0],
            stockCritico: Number(stockCritico.rows.length),
            cajaActiva: cajaActiva.rows[0] || null
        });
    } catch (e) { handleDbError(res, e); }
});

router.post('/sucursales', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { nombre, direccion, telefono, ciudad, regente_farmacia, numero_licencia } = req.body;
        if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

        // Generar código SUC-001, SUC-002, etc. scoped to tenant
        const lastR = await pool.query(
            `SELECT codigo FROM sucursales WHERE tenant_id = $1 ORDER BY id_sucursal DESC LIMIT 1`,
            [req.tenantId]
        );
        let nextNum = 1;
        if (lastR.rows.length > 0) {
            const parts = lastR.rows[0].codigo.split('-');
            if (parts.length === 2) nextNum = parseInt(parts[1], 10) + 1;
        }
        const codigo = `SUC-${String(nextNum).padStart(3, '0')}`;

        const r = await pool.query(`
            INSERT INTO sucursales (codigo, nombre, direccion, telefono, ciudad, regente_farmacia, numero_licencia, estado, tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'Activa',$8)
            RETURNING id_sucursal
        `, [codigo, nombre, direccion || null, telefono || null, ciudad || null, regente_farmacia || null, numero_licencia || null, req.tenantId]);

        res.status(201).json({ message: 'Sucursal creada', id_sucursal: r.rows[0].id_sucursal, codigo });
    } catch (e) { handleDbError(res, e); }
});

router.put('/sucursales/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { nombre, direccion, telefono, ciudad, regente_farmacia, numero_licencia, estado } = req.body;
        await pool.query(`
            UPDATE sucursales SET nombre=$1, direccion=$2, telefono=$3, ciudad=$4,
                regente_farmacia=$5, numero_licencia=$6, estado=COALESCE($7, estado)
            WHERE id_sucursal=$8 AND tenant_id=$9
        `, [nombre, direccion, telefono, ciudad, regente_farmacia, numero_licencia, estado || null, req.params.id, req.tenantId]);
        res.json({ message: 'Sucursal actualizada' });
    } catch (e) { handleDbError(res, e); }
});

// -------------------------------------------------------
// TRANSFERENCIAS ENTRE SUCURSALES
// -------------------------------------------------------
router.get('/transferencias', authenticateToken, async (req, res) => {
    try {
        const { id_sucursal, estado } = req.query;
        let where = 'WHERE t.tenant_id = $1';
        const params = [req.tenantId];
        if (id_sucursal) {
            params.push(id_sucursal);
            where += ` AND (t.id_sucursal_origen = $${params.length} OR t.id_sucursal_destino = $${params.length})`;
        }
        if (estado) { params.push(estado); where += ` AND t.estado = $${params.length}`; }

        const r = await pool.query(`
            SELECT t.*, m.nombre_generico AS "nombreMedicamento",
                   so.nombre AS "sucursalOrigen", sd.nombre AS "sucursalDestino"
            FROM transferencias_sucursal t
            JOIN medicamentos m ON t.id_medicamento = m.codigo
            JOIN sucursales so ON t.id_sucursal_origen = so.id_sucursal AND so.tenant_id = $1
            JOIN sucursales sd ON t.id_sucursal_destino = sd.id_sucursal AND sd.tenant_id = $1
            ${where}
            ORDER BY t.fecha_solicitud DESC
        `, params);
        res.json(r.rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/transferencias', authenticateToken, async (req, res) => {
    try {
        const { id_sucursal_origen, id_sucursal_destino, id_medicamento, id_lote, cantidad_base, motivo } = req.body;
        if (!id_sucursal_origen || !id_sucursal_destino || !id_medicamento || !cantidad_base) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }
        if (id_sucursal_origen === id_sucursal_destino) {
            return res.status(400).json({ error: 'La sucursal origen y destino deben ser diferentes' });
        }

        // Verificar stock suficiente
        const stockR = await pool.query(`
            SELECT COALESCE(SUM(cantidad_actual), 0) AS stock
            FROM lotes_medicamento
            WHERE id_medicamento = $1 AND id_sucursal = $2 AND estado = 'Activo'
              AND tenant_id = $3
            ${id_lote ? 'AND id_lote = $4' : ''}
        `, id_lote ? [id_medicamento, id_sucursal_origen, req.tenantId, id_lote] : [id_medicamento, id_sucursal_origen, req.tenantId]);

        if (Number(stockR.rows[0].stock) < Number(cantidad_base)) {
            return res.status(400).json({ error: `Stock insuficiente. Disponible: ${stockR.rows[0].stock}` });
        }

        const lastR = await pool.query(
            `SELECT codigo FROM transferencias_sucursal WHERE tenant_id = $1 ORDER BY fecha_solicitud DESC LIMIT 1`,
            [req.tenantId]
        );
        let nextNum = 1;
        if (lastR.rows.length > 0) {
            const parts = lastR.rows[0].codigo.split('-');
            if (parts.length === 2) nextNum = parseInt(parts[1], 10) + 1;
        }
        const codigo = `TRF-${String(nextNum).padStart(4, '0')}`;

        await pool.query(`
            INSERT INTO transferencias_sucursal
                (codigo, id_sucursal_origen, id_sucursal_destino, id_medicamento, id_lote, cantidad_base, motivo, estado, id_usuario_solicita, tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'Pendiente',$8,$9)
        `, [codigo, id_sucursal_origen, id_sucursal_destino, id_medicamento, id_lote || null, cantidad_base, motivo || null, req.user.codUsuario, req.tenantId]);

        res.status(201).json({ message: 'Transferencia solicitada', codigo });
    } catch (e) { handleDbError(res, e); }
});

// Aprobar o rechazar transferencia
router.put('/transferencias/:codigo/estado', authenticateToken, async (req, res) => {
    try {
        const { estado } = req.body;
        if (!['Aceptada', 'Rechazada'].includes(estado)) {
            return res.status(400).json({ error: 'estado debe ser Aceptada o Rechazada' });
        }

        await withTenantContext(req.tenantId, async (client) => {
            const trf = await client.query(
                `SELECT * FROM transferencias_sucursal WHERE codigo = $1 AND estado = 'Pendiente' AND tenant_id = $2`,
                [req.params.codigo, req.tenantId]
            );
            if (trf.rows.length === 0) {
                const err = new Error('Transferencia no encontrada o ya procesada');
                err.statusCode = 404;
                throw err;
            }

            const t = trf.rows[0];

            if (estado === 'Aceptada') {
                const sourceLot = await client.query(`
                    SELECT *
                    FROM lotes_medicamento
                    WHERE id_medicamento = $1
                      AND id_sucursal = $2
                      AND estado = 'Activo'
                      AND cantidad_actual >= $3
                      AND tenant_id = $4
                      ${t.id_lote ? 'AND id_lote = $5' : ''}
                    ORDER BY fecha_vencimiento ASC, fecha_ingreso ASC
                    LIMIT 1
                    FOR UPDATE
                `, t.id_lote
                    ? [t.id_medicamento, t.id_sucursal_origen, t.cantidad_base, req.tenantId, t.id_lote]
                    : [t.id_medicamento, t.id_sucursal_origen, t.cantidad_base, req.tenantId]);

                if (sourceLot.rows.length === 0) {
                    const err = new Error('Stock insuficiente en la sucursal origen para aceptar la transferencia');
                    err.statusCode = 400;
                    throw err;
                }

                const lote = sourceLot.rows[0];
                await client.query(`
                    UPDATE lotes_medicamento
                    SET cantidad_actual = cantidad_actual - $1
                    WHERE id_lote = $2 AND tenant_id = $3
                `, [t.cantidad_base, lote.id_lote, req.tenantId]);

                await client.query(`
                    INSERT INTO lotes_medicamento
                        (id_medicamento, numero_lote, fecha_vencimiento_display, fecha_vencimiento,
                         fecha_fabricacion, cantidad_inicial, cantidad_actual, precio_compra_unitario,
                         id_sucursal, id_proveedor, estado, notas, tenant_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'Activo',$10,$11)
                    ON CONFLICT (id_medicamento, numero_lote, id_sucursal)
                    DO UPDATE SET
                        cantidad_actual = lotes_medicamento.cantidad_actual + EXCLUDED.cantidad_actual,
                        cantidad_inicial = lotes_medicamento.cantidad_inicial + EXCLUDED.cantidad_inicial,
                        precio_compra_unitario = COALESCE(EXCLUDED.precio_compra_unitario, lotes_medicamento.precio_compra_unitario),
                        id_proveedor = COALESCE(EXCLUDED.id_proveedor, lotes_medicamento.id_proveedor)
                `, [
                    lote.id_medicamento,
                    lote.numero_lote,
                    lote.fecha_vencimiento_display,
                    lote.fecha_vencimiento,
                    lote.fecha_fabricacion,
                    t.cantidad_base,
                    lote.precio_compra_unitario,
                    t.id_sucursal_destino,
                    lote.id_proveedor,
                    lote.notas ? `${lote.notas} | Transferencia ${t.codigo}` : `Transferencia ${t.codigo}`,
                    req.tenantId,
                ]);
            }

            await client.query(`
                UPDATE transferencias_sucursal
                SET estado = $1, id_usuario_aprueba = $2, fecha_resolucion = NOW()
                WHERE codigo = $3 AND tenant_id = $4
            `, [estado, req.user.codUsuario, req.params.codigo, req.tenantId]);
        });

        res.json({ message: `Transferencia ${estado.toLowerCase()}` });
    } catch (e) {
        if (e.statusCode === 400) return res.status(400).json({ error: e.message });
        if (e.statusCode === 404) return res.status(404).json({ error: e.message });
        handleDbError(res, e);
    }
});

// -------------------------------------------------------
// ÓRDENES DE COMPRA (básico)
// -------------------------------------------------------
router.get('/ordenes-compra', authenticateToken, async (req, res) => {
    try {
        const { estado, id_sucursal, id_proveedor } = req.query;
        let where = 'WHERE oc.tenant_id = $1';
        const params = [req.tenantId];
        if (estado)      { params.push(estado);      where += ` AND oc.estado = $${params.length}`; }
        if (id_sucursal) { params.push(id_sucursal); where += ` AND oc.id_sucursal = $${params.length}`; }
        if (id_proveedor){ params.push(id_proveedor);where += ` AND oc.id_proveedor = $${params.length}`; }

        const r = await pool.query(`
            SELECT oc.*, p.nombre AS "nombreProveedor", s.nombre AS "nombreSucursal",
                   COUNT(doc.id) AS "totalItems"
            FROM ordenes_compra oc
            LEFT JOIN proveedores p ON oc.id_proveedor = p.codProveedor AND p.tenant_id = $1
            LEFT JOIN sucursales s  ON oc.id_sucursal  = s.id_sucursal AND s.tenant_id = $1
            LEFT JOIN detalle_orden_compra doc ON oc.codigo = doc.id_orden AND doc.tenant_id = $1
            ${where}
            GROUP BY oc.codigo, p.nombre, s.nombre
            ORDER BY oc.fecha_creacion DESC
        `, params);
        res.json(r.rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/ordenes-compra', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id_proveedor, id_sucursal, fecha_entrega_esperada, notas, detalle } = req.body;

        const lastR = await pool.query(
            `SELECT codigo FROM ordenes_compra WHERE tenant_id = $1 ORDER BY fecha_creacion DESC LIMIT 1`,
            [req.tenantId]
        );
        let nextNum = 1;
        if (lastR.rows.length > 0) {
            const parts = lastR.rows[0].codigo.split('-');
            if (parts.length === 2) nextNum = parseInt(parts[1], 10) + 1;
        }
        const codigo = `OC-${String(nextNum).padStart(4, '0')}`;

        await pool.query(`
            INSERT INTO ordenes_compra (codigo, id_proveedor, id_sucursal, fecha_entrega_esperada, notas, generada_por, tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [codigo, id_proveedor || null, id_sucursal || null, fecha_entrega_esperada || null, notas || null, req.user.codUsuario, req.tenantId]);

        if (detalle && Array.isArray(detalle)) {
            for (const item of detalle) {
                await pool.query(`
                    INSERT INTO detalle_orden_compra (id_orden, id_medicamento, id_presentacion, cantidad_ordenada, precio_unitario, tenant_id)
                    VALUES ($1,$2,$3,$4,$5,$6)
                `, [codigo, item.id_medicamento, item.id_presentacion || null, item.cantidad_ordenada, item.precio_unitario || null, req.tenantId]);
            }
        }

        res.status(201).json({ message: 'Orden de compra creada', codigo });
    } catch (e) { handleDbError(res, e); }
});

router.put('/ordenes-compra/:codigo/estado', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { estado } = req.body;
        const ESTADOS = ['Pendiente', 'Enviada', 'Parcialmente recibida', 'Recibida', 'Cancelada'];
        if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
        await pool.query(
            `UPDATE ordenes_compra SET estado = $1 WHERE codigo = $2 AND tenant_id = $3`,
            [estado, req.params.codigo, req.tenantId]
        );
        res.json({ message: 'Estado actualizado' });
    } catch (e) { handleDbError(res, e); }
});

module.exports = router;
