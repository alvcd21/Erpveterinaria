'use strict';

const { pool, handleDbError } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');

function registerRoutes(router) {

    router.get('/medicamentos/alertas/vencimientos', authenticateToken, async (req, res) => {
        try {
            const { dias = 90, id_sucursal } = req.query;
            const sucursalId = id_sucursal || req.user.id_sucursal || null;
            const diasNum = parseInt(dias, 10);
            if (isNaN(diasNum) || diasNum < 0 || diasNum > 3650) {
                return res.status(400).json({ error: 'dias debe ser un número entre 0 y 3650' });
            }
            let sucursalFilter = '';
            const params = [diasNum, req.tenantId];
            if (sucursalId) { params.push(sucursalId); sucursalFilter = `AND l.id_sucursal = $${params.length}`; }

            const r = await pool.query(`
                SELECT
                    m.codigo, m.nombre_generico AS "nombreGenerico", m.nombre_comercial AS "nombreComercial",
                    l.id_lote AS "idLote", l.numero_lote AS "numeroLote",
                    l.fecha_vencimiento_display AS "fechaVencimientoDisplay",
                    l.fecha_vencimiento AS "fechaVencimiento",
                    l.cantidad_actual AS "cantidadActual",
                    (l.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer,
                    CASE WHEN l.fecha_vencimiento <= CURRENT_DATE THEN 'VENCIDO'
                         WHEN l.fecha_vencimiento <= CURRENT_DATE + 30  THEN 'CRITICO'
                         WHEN l.fecha_vencimiento <= CURRENT_DATE + 90  THEN 'ALERTA'
                         ELSE 'MONITOREO' END AS nivel_alerta
                FROM lotes_medicamento l
                JOIN medicamentos m ON l.id_medicamento = m.codigo AND m.tenant_id = l.tenant_id
                WHERE l.estado = 'Activo'
                  AND l.cantidad_actual > 0
                  AND l.fecha_vencimiento <= CURRENT_DATE + $1::integer
                  AND l.tenant_id = $2 ${sucursalFilter}
                ORDER BY l.fecha_vencimiento ASC
            `, params);

            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    router.get('/medicamentos/alertas/stock-critico', authenticateToken, async (req, res) => {
        try {
            const { id_sucursal } = req.query;
            const sucursalId = id_sucursal || req.user.id_sucursal || null;
            let sucursalFilter = '';
            const params = [req.tenantId];
            if (sucursalId) { params.push(sucursalId); sucursalFilter = `AND l.id_sucursal = $${params.length}`; }

            const r = await pool.query(`
                SELECT
                    m.codigo, m.nombre_generico AS "nombreGenerico",
                    m.stock_minimo AS "stockMinimo", m.punto_reorden AS "puntoReorden",
                    COALESCE(SUM(l.cantidad_actual), 0) AS "stockActual",
                    ct.nombre AS categoria
                FROM medicamentos m
                LEFT JOIN lotes_medicamento l ON m.codigo = l.id_medicamento AND l.estado = 'Activo' AND l.tenant_id = $1 ${sucursalFilter}
                LEFT JOIN categorias_terapeuticas ct ON m.id_categoria = ct.id_categoria AND ct.tenant_id = $1
                WHERE m.activo = TRUE AND m.tenant_id = $1
                GROUP BY m.codigo, m.nombre_generico, m.stock_minimo, m.punto_reorden, ct.nombre
                HAVING COALESCE(SUM(l.cantidad_actual), 0) <= m.stock_minimo
                ORDER BY COALESCE(SUM(l.cantidad_actual), 0) ASC
            `, params);

            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    router.get('/inventory/low-stock', authenticateToken, async (req, res) => {
        try {
            const { id_sucursal } = req.query;
            const sucursalId = id_sucursal || req.user.id_sucursal || null;
            let sucursalFilter = '';
            const params = [req.tenantId];
            if (sucursalId) { params.push(sucursalId); sucursalFilter = `AND l.id_sucursal = $${params.length}`; }

            const r = await pool.query(`
                SELECT
                    m.codigo, m.nombre_generico AS nombre, m.nombre_comercial AS "nombreComercial",
                    ct.nombre AS categoria,
                    m.stock_minimo AS "stockMinimo",
                    COALESCE(SUM(l.cantidad_actual), 0) AS "stockActual",
                    (m.punto_reorden - COALESCE(SUM(l.cantidad_actual), 0)) AS "cantidadSugerida",
                    p.nombre AS proveedor
                FROM medicamentos m
                LEFT JOIN lotes_medicamento l ON m.codigo = l.id_medicamento AND l.estado = 'Activo' AND l.tenant_id = $1 ${sucursalFilter}
                LEFT JOIN categorias_terapeuticas ct ON m.id_categoria = ct.id_categoria AND ct.tenant_id = $1
                LEFT JOIN proveedores p ON m.id_sucursal_principal IS NOT NULL AND p.codProveedor = (
                    SELECT id_proveedor FROM lotes_medicamento WHERE id_medicamento = m.codigo AND tenant_id = $1 ORDER BY fecha_ingreso DESC LIMIT 1
                )
                WHERE m.activo = TRUE AND m.stock_minimo > 0 AND m.tenant_id = $1
                GROUP BY m.codigo, m.nombre_generico, m.nombre_comercial, ct.nombre, m.stock_minimo, m.punto_reorden, p.nombre
                HAVING COALESCE(SUM(l.cantidad_actual), 0) <= m.stock_minimo
                ORDER BY COALESCE(SUM(l.cantidad_actual), 0) ASC
            `, params);
            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    router.get('/medicamentos/:codigo/disponibilidad-sucursales', authenticateToken, async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT
                    s.id_sucursal,
                    s.nombre AS sucursal_nombre,
                    s.ciudad,
                    s.direccion,
                    s.telefono,
                    COALESCE(SUM(l.cantidad_actual), 0) AS stock_disponible,
                    MIN(l.fecha_vencimiento) AS proximo_vencimiento
                FROM sucursales s
                LEFT JOIN lotes_medicamento l
                    ON l.id_sucursal = s.id_sucursal
                    AND l.id_medicamento = $1
                    AND l.estado = 'Activo'
                    AND l.cantidad_actual > 0
                    AND l.tenant_id = $2
                WHERE s.estado = 'Activa' AND s.tenant_id = $2
                GROUP BY s.id_sucursal, s.nombre, s.ciudad, s.direccion, s.telefono
                ORDER BY COALESCE(SUM(l.cantidad_actual), 0) DESC
            `, [req.params.codigo, req.tenantId]);
            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

}

module.exports = { registerRoutes };
