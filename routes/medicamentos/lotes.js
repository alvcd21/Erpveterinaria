'use strict';

const { pool, handleDbError, withTenantContext } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');

function parseExpiryParts(body, existingDate) {
    const baseDate = existingDate ? new Date(existingDate) : new Date();
    const mesNum = parseInt(body.mes_vencimiento || (baseDate.getUTCMonth() + 1), 10);
    const anioNum = parseInt(body.anio_vencimiento || baseDate.getUTCFullYear(), 10);
    const currentYear = new Date().getFullYear();

    if (Number.isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        const error = new Error('mes_vencimiento debe ser 1-12');
        error.statusCode = 400;
        throw error;
    }
    if (Number.isNaN(anioNum) || anioNum < currentYear - 10 || anioNum > currentYear + 30) {
        const error = new Error(`anio_vencimiento debe estar entre ${currentYear - 10} y ${currentYear + 30}`);
        error.statusCode = 400;
        throw error;
    }

    const mes = String(mesNum).padStart(2, '0');
    return {
        fechaDisplay: `${mes}/${anioNum}`,
        fechaVencimiento: `${anioNum}-${mes}-01`,
    };
}

function handleLoteRouteError(res, err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return handleDbError(res, err);
}

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
                ORDER BY CASE WHEN l.estado = 'Activo' THEN 0 ELSE 1 END,
                         l.fecha_vencimiento ASC,
                         l.fecha_ingreso DESC
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

    router.put('/lotes/:id', authenticateToken, async (req, res) => {
        try {
            const result = await withTenantContext(req.tenantId, async (client) => {
                const current = await client.query(
                    `SELECT * FROM lotes_medicamento WHERE id_lote = $1 AND tenant_id = $2 FOR UPDATE`,
                    [req.params.id, req.tenantId]
                );
                if (current.rows.length === 0) return null;

                const lote = current.rows[0];
                const cantidadInput = req.body.cantidad_actual ?? req.body.cantidad ?? lote.cantidad_actual;
                const precioInput = req.body.precio_compra_unitario ?? req.body.precio_compra_presentacion ?? lote.precio_compra_unitario;
                const cantidadActual = Number(cantidadInput);
                const precioCompra = precioInput === null || precioInput === undefined || precioInput === ''
                    ? null
                    : Number(precioInput);

                if (!req.body.numero_lote && !lote.numero_lote) {
                    const error = new Error('numero_lote es requerido');
                    error.statusCode = 400;
                    throw error;
                }
                if (Number.isNaN(cantidadActual) || cantidadActual < 0) {
                    const error = new Error('cantidad_actual debe ser un numero mayor o igual a cero');
                    error.statusCode = 400;
                    throw error;
                }
                if (precioCompra !== null && (Number.isNaN(precioCompra) || precioCompra < 0)) {
                    const error = new Error('precio_compra_unitario debe ser un numero mayor o igual a cero');
                    error.statusCode = 400;
                    throw error;
                }

                const { fechaDisplay, fechaVencimiento } = parseExpiryParts(req.body, lote.fecha_vencimiento);
                const fechaFabricacion = Object.prototype.hasOwnProperty.call(req.body, 'fecha_fabricacion')
                    ? (req.body.fecha_fabricacion || null)
                    : lote.fecha_fabricacion;
                const idSucursal = Object.prototype.hasOwnProperty.call(req.body, 'id_sucursal')
                    ? (req.body.id_sucursal || null)
                    : lote.id_sucursal;
                const idProveedor = Object.prototype.hasOwnProperty.call(req.body, 'id_proveedor')
                    ? (req.body.id_proveedor || null)
                    : lote.id_proveedor;
                const estado = req.body.estado || lote.estado || 'Activo';
                const cantidadAnterior = Number(lote.cantidad_actual || 0);
                const delta = cantidadActual - cantidadAnterior;

                const updated = await client.query(`
                    UPDATE lotes_medicamento SET
                        numero_lote = $1,
                        fecha_vencimiento_display = $2,
                        fecha_vencimiento = $3,
                        fecha_fabricacion = $4,
                        cantidad_actual = $5,
                        precio_compra_unitario = $6,
                        id_sucursal = $7,
                        id_proveedor = $8,
                        estado = $9,
                        notas = $10
                    WHERE id_lote = $11 AND tenant_id = $12
                    RETURNING *
                `, [
                    req.body.numero_lote || lote.numero_lote,
                    fechaDisplay,
                    fechaVencimiento,
                    fechaFabricacion,
                    cantidadActual,
                    precioCompra,
                    idSucursal,
                    idProveedor,
                    estado,
                    req.body.notas ?? lote.notas,
                    req.params.id,
                    req.tenantId,
                ]);

                if (delta !== 0) {
                    await client.query(`
                        INSERT INTO kardex_inventario (
                            tipo_producto, cod_medicamento, id_lote, tipo_movimiento, cantidad,
                            precio_costo, registrado_por, observaciones, tenant_id
                        )
                        VALUES ('MEDICAMENTO', $1, $2, 'Ajuste lote', $3, $4, $5, $6, $7)
                    `, [
                        lote.id_medicamento,
                        lote.id_lote,
                        delta,
                        precioCompra,
                        req.user.codUsuario,
                        `Ajuste manual de lote ${req.body.numero_lote || lote.numero_lote}`,
                        req.tenantId,
                    ]);
                }

                return updated.rows[0];
            });

            if (!result) return res.status(404).json({ error: 'Lote no encontrado' });
            res.json({ message: 'Lote actualizado', lote: result });
        } catch (e) { handleLoteRouteError(res, e); }
    });

    router.delete('/lotes/:id', authenticateToken, async (req, res) => {
        try {
            const result = await withTenantContext(req.tenantId, async (client) => {
                const current = await client.query(
                    `SELECT * FROM lotes_medicamento WHERE id_lote = $1 AND tenant_id = $2 FOR UPDATE`,
                    [req.params.id, req.tenantId]
                );
                if (current.rows.length === 0) return null;

                const lote = current.rows[0];
                const cantidadAnterior = Number(lote.cantidad_actual || 0);

                await client.query(`
                    UPDATE lotes_medicamento
                    SET estado = 'Dado de baja',
                        cantidad_actual = 0,
                        notas = COALESCE(NULLIF($3, ''), notas)
                    WHERE id_lote = $1 AND tenant_id = $2
                `, [req.params.id, req.tenantId, req.body?.motivo || null]);

                if (cantidadAnterior !== 0) {
                    await client.query(`
                        INSERT INTO kardex_inventario (
                            tipo_producto, cod_medicamento, id_lote, tipo_movimiento, cantidad,
                            precio_costo, registrado_por, observaciones, tenant_id
                        )
                        VALUES ('MEDICAMENTO', $1, $2, 'Baja lote', $3, $4, $5, $6, $7)
                    `, [
                        lote.id_medicamento,
                        lote.id_lote,
                        -cantidadAnterior,
                        lote.precio_compra_unitario,
                        req.user.codUsuario,
                        `Baja manual de lote ${lote.numero_lote}`,
                        req.tenantId,
                    ]);
                }

                return lote;
            });

            if (!result) return res.status(404).json({ error: 'Lote no encontrado' });
            res.json({ message: 'Lote dado de baja' });
        } catch (e) { handleLoteRouteError(res, e); }
    });

}

module.exports = { registerRoutes };
