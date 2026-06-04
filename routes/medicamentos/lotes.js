'use strict';

const { pool, handleDbError, withTenantContext } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');

function registerRoutes(router) {

    router.get('/medicamentos/:id/lotes', authenticateToken, async (req, res) => {
        try {
            const { id_sucursal } = req.query;
            const sucursalId = id_sucursal || req.user.id_sucursal || null;
            const params = [req.params.id, req.tenantId];
            let sucursalFilter = '';
            if (sucursalId) {
                params.push(sucursalId);
                sucursalFilter = ` AND l.id_sucursal = $${params.length}`;
            }

            const r = await pool.query(`
                SELECT l.*, p.nombre AS "nombreProveedor",
                       CASE WHEN l.fecha_vencimiento <= CURRENT_DATE THEN 'Vencido'
                            WHEN l.fecha_vencimiento <= CURRENT_DATE + 30 THEN 'Por vencer (30d)'
                            WHEN l.fecha_vencimiento <= CURRENT_DATE + 90 THEN 'Por vencer (90d)'
                            ELSE 'Vigente' END AS alerta_vencimiento
                FROM lotes_medicamento l
                LEFT JOIN proveedores p ON l.id_proveedor = p.codProveedor
                WHERE l.id_medicamento = $1 AND l.tenant_id = $2 ${sucursalFilter}
                ORDER BY l.fecha_vencimiento ASC, l.fecha_ingreso DESC
            `, params);
            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    router.post('/medicamentos/:id/lotes', authenticateToken, async (req, res) => {
        try {
            const {
                numero_lote, mes_vencimiento, anio_vencimiento,
                cantidad, id_presentacion, precio_compra_presentacion,
                id_proveedor, id_sucursal, fecha_fabricacion, notas
            } = req.body;

            if (!numero_lote || !mes_vencimiento || !anio_vencimiento || !cantidad || !precio_compra_presentacion) {
                return res.status(400).json({ error: 'Faltan campos: numero_lote, mes_vencimiento, anio_vencimiento, cantidad, precio_compra_presentacion' });
            }
            const mesNum  = parseInt(mes_vencimiento, 10);
            const anioNum = parseInt(anio_vencimiento, 10);
            const currentYear = new Date().getFullYear();
            if (isNaN(mesNum)  || mesNum  < 1   || mesNum  > 12) return res.status(400).json({ error: 'mes_vencimiento debe ser 1-12' });
            if (isNaN(anioNum) || anioNum < currentYear || anioNum > currentYear + 30) return res.status(400).json({ error: `anio_vencimiento debe estar entre ${currentYear} y ${currentYear + 30}` });
            if (isNaN(Number(cantidad)) || Number(cantidad) <= 0) return res.status(400).json({ error: 'cantidad debe ser un número positivo' });

            const mes = String(mesNum).padStart(2, '0');
            const fechaDisplay = `${mes}/${anioNum}`;
            const fechaVencimiento = `${anioNum}-${mes}-01`;

            let factor = 1;
            if (id_presentacion) {
                const presResult = await pool.query(
                    `SELECT factor_conversion FROM presentaciones_venta WHERE id_presentacion = $1 AND tenant_id = $2`,
                    [id_presentacion, req.tenantId]
                );
                if (presResult.rows.length > 0) factor = Number(presResult.rows[0].factor_conversion);
            }

            const cantidadBase = Number(cantidad) * factor;
            const precioUnitarioBase = factor > 0 ? Number(precio_compra_presentacion) / factor : Number(precio_compra_presentacion);

            const result = await withTenantContext(req.tenantId, async (client) => {
                const r = await client.query(`
                    INSERT INTO lotes_medicamento
                        (id_medicamento, numero_lote, fecha_vencimiento_display, fecha_vencimiento,
                         fecha_fabricacion, cantidad_inicial, cantidad_actual, precio_compra_unitario,
                         id_sucursal, id_proveedor, estado, notas, tenant_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'Activo',$10,$11)
                    ON CONFLICT (id_medicamento, numero_lote, id_sucursal)
                    DO UPDATE SET
                        cantidad_actual = lotes_medicamento.cantidad_actual + $6,
                        cantidad_inicial = lotes_medicamento.cantidad_inicial + $6
                    RETURNING id_lote
                `, [
                    req.params.id, numero_lote, fechaDisplay, fechaVencimiento,
                    fecha_fabricacion || null, cantidadBase, precioUnitarioBase,
                    id_sucursal || req.user.id_sucursal || null, id_proveedor || null, notas || null,
                    req.tenantId
                ]);

                await client.query(`
                    INSERT INTO kardex_inventario (tipo_producto, cod_medicamento, id_lote, tipo_movimiento, cantidad, precio_costo, registrado_por, observaciones, tenant_id)
                    VALUES ('MEDICAMENTO', $1, $2, 'Entrada', $3, $4, $5, $6, $7)
                `, [req.params.id, r.rows[0].id_lote, cantidadBase, precioUnitarioBase, req.user.codUsuario, `Lote ${numero_lote}`, req.tenantId]);

                return r.rows[0].id_lote;
            });

            res.status(201).json({ message: 'Lote ingresado', id_lote: result, cantidadBase });
        } catch (e) { handleDbError(res, e); }
    });

}

module.exports = { registerRoutes };
