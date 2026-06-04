
const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Helper: convierte "YYYY-MM-DD" a timestamps para BETWEEN
const toRange = (start, end) => [`${start} 00:00:00`, `${end} 23:59:59`];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validateDates = (res, startDate, endDate) => {
    if (!startDate || !endDate) { res.status(400).json({ error: 'startDate y endDate requeridos' }); return false; }
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) { res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD' }); return false; }
    return true;
};
const validateYear = (res, year) => {
    const y = parseInt(year, 10);
    if (isNaN(y) || y < 2000 || y > 2100) { res.status(400).json({ error: 'Año inválido' }); return null; }
    return y;
};

// --- 1. TENDENCIA DE VENTAS (Gráfico Mensual) ---
router.get('/reports/sales-trend', authenticateToken, async (req, res) => {
    try {
        const { year } = req.query;
        const y = validateYear(res, year || new Date().getFullYear());
        if (y === null) return;
        const query = `
            SELECT
                TRIM(TO_CHAR(fecha, 'Month')) as mes,
                EXTRACT(MONTH FROM fecha) as num_mes,
                COALESCE(SUM(total), 0) as total,
                COUNT(codVenta) as num_ventas
            FROM ventas
            WHERE EXTRACT(YEAR FROM fecha) = $1 AND estado = 'Completada'
              AND tenant_id = $2
            GROUP BY 1, 2
            ORDER BY 2
        `;
        const result = await pool.query(query, [y, req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 2. TOP PRODUCTOS VENDIDOS ---
router.get('/reports/top-products', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!validateDates(res, startDate, endDate)) return;
        const [start, end] = toRange(startDate, endDate);
        const query = `
            SELECT
                COALESCE(m.nombre_comercial, m.nombre_generico, dv.producto, 'Medicamento General') as producto,
                SUM(dv.cantidad)::int as cantidad,
                COALESCE(SUM(dv.cantidad * COALESCE(dv.precioUnitario, dv.precioVenta, 0)), 0) as total_vendido,
                COALESCE(SUM(dv.cantidad * COALESCE(l.precio_compra_unitario, 0)), 0) as total_costo
            FROM detalleventa dv
            JOIN ventas v ON dv.idVenta = v.codVenta
            LEFT JOIN presentaciones_venta pv ON dv.id_presentacion = pv.id_presentacion AND pv.tenant_id = $3
            LEFT JOIN medicamentos m ON pv.id_medicamento = m.codigo AND m.tenant_id = $3
            LEFT JOIN lotes_medicamento l ON dv.id_lote = l.id_lote AND l.tenant_id = $3
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
              AND dv.tipoProducto = 'MEDICAMENTO'
              AND v.tenant_id = $3
            GROUP BY 1
            ORDER BY cantidad DESC
            LIMIT 10
        `;
        const result = await pool.query(query, [start, end, req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 4. VALORACIÓN DE INVENTARIO ---
router.get('/reports/inventory-valuation', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT
                'Medicamentos' as categoria,
                COUNT(DISTINCT l.id_medicamento)::int as cantidad,
                COALESCE(SUM(l.cantidad_actual * COALESCE(l.precio_compra_unitario, 0)), 0) as costo_total,
                COALESCE(SUM(l.cantidad_actual * COALESCE(pv.precio_venta, 0)), 0) as venta_proyectada
            FROM lotes_medicamento l
            LEFT JOIN (
                SELECT id_medicamento, MIN(precio_venta) as precio_venta
                FROM presentaciones_venta WHERE activo = TRUE AND tenant_id = $1 GROUP BY id_medicamento
            ) pv ON pv.id_medicamento = l.id_medicamento
            WHERE l.estado = 'Activo' AND l.cantidad_actual > 0
              AND l.tenant_id = $1
        `;
        const result = await pool.query(query, [req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 5. MEJORES CLIENTES ---
router.get('/reports/top-clients', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!validateDates(res, startDate, endDate)) return;
        const [start, end] = toRange(startDate, endDate);
        const query = `
            SELECT
                c.identidad,
                c.nombre || ' ' || c.apellido as nombre,
                COUNT(v.codVenta) as compras,
                COALESCE(SUM(v.total), 0) as total_gastado,
                MAX(v.fecha) as ultima_compra
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad AND c.tenant_id = $3
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
              AND v.tenant_id = $3
            GROUP BY 1, 2
            ORDER BY total_gastado DESC
            LIMIT 20
        `;
        const result = await pool.query(query, [start, end, req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 6. VENTAS DIARIAS DETALLADAS ---
router.get('/reports/daily-sales', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!validateDates(res, startDate, endDate)) return;
        const [start, end] = toRange(startDate, endDate);
        // FIX: timestamps correctos + nombre real del vendedor
        const query = `
            SELECT
                TO_CHAR(v.fecha, 'YYYY-MM-DD') as fecha,
                COUNT(v.codVenta) as num_ventas,
                COALESCE(SUM(v.total), 0) as total_dia,
                COALESCE(e.nombre || ' ' || COALESCE(e.apellido,''), u.usuario, v.codVendedor, 'Sistema') as vendedor
            FROM ventas v
            LEFT JOIN usuarios u ON v.codVendedor::text = u.codUsuario::text AND u.tenant_id = $3
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = $3
            WHERE v.fecha BETWEEN $1 AND $2 AND COALESCE(v.estado,'') != 'Anulada'
              AND v.tenant_id = $3
            GROUP BY 1, 4
            ORDER BY 1 DESC
        `;
        const result = await pool.query(query, [start, end, req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 7. KPI RESUMEN ---
router.get('/reports/kpi-summary', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!validateDates(res, startDate, endDate)) return;
        const [start, end] = toRange(startDate, endDate);

        const [ventasRow, costoRow] = await Promise.all([
            pool.query(`SELECT COUNT(*) as num_facturas,
                               COALESCE(SUM(total),0) as total_ventas,
                               COALESCE(SUM(isv_calculado),0) as isv_total
                        FROM ventas WHERE fecha BETWEEN $1 AND $2 AND estado = 'Completada'
                          AND tenant_id = $3`, [start, end, req.tenantId]),
            pool.query(`SELECT COALESCE(SUM(dv.cantidad_base_descontada * COALESCE(l.precio_compra_unitario, 0)), 0) AS costos
                        FROM detalleventa dv
                        JOIN ventas v ON dv.idVenta = v.codVenta
                        LEFT JOIN lotes_medicamento l ON dv.id_lote = l.id_lote AND l.tenant_id = $3
                        WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
                          AND dv.tipoProducto = 'MEDICAMENTO'
                          AND v.tenant_id = $3`, [start, end, req.tenantId]),
        ]);

        const totalVentas = Number(ventasRow.rows[0].total_ventas);
        const totalCostos = Number(costoRow.rows[0].costos);
        const utilBruta   = totalVentas - totalCostos;

        res.json({
            numFacturas:     Number(ventasRow.rows[0].num_facturas),
            totalVentas,
            totalCostos,
            utilidadBruta:   utilBruta,
            utilidadNeta:    utilBruta,
            numRecargas:     0,
            ingresoRecargas: 0,
            gananciaRecargas: 0,
        });
    } catch(e) { handleDbError(res, e); }
});

// --- 8. RENDIMIENTO POR VENDEDOR (NUEVO) ---
router.get('/reports/sales-by-seller', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!validateDates(res, startDate, endDate)) return;
        const [start, end] = toRange(startDate, endDate);
        const query = `
            SELECT
                COALESCE(e.nombre || ' ' || e.apellido, u.usuario) as vendedor,
                COUNT(v.codVenta) as num_ventas,
                COALESCE(SUM(v.total), 0) as total_vendido,
                COALESCE(AVG(v.total), 0) as ticket_promedio
            FROM ventas v
            JOIN usuarios u ON v.codVendedor::text = u.codUsuario::text AND u.tenant_id = $3
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = $3
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
              AND v.tenant_id = $3
            GROUP BY 1
            ORDER BY total_vendido DESC
        `;
        const result = await pool.query(query, [start, end, req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// GET /search?q=texto — búsqueda global en clientes y medicamentos
router.get('/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) return res.json({ clientes: [], medicamentos: [] });
    const term = `%${String(q).trim()}%`;
    try {
        const [clientesRes, medicamentosRes] = await Promise.all([
            pool.query(`
                SELECT identidad, nombre, apellido, telefono, correo
                FROM clientes
                WHERE (nombre ILIKE $1 OR apellido ILIKE $1 OR identidad ILIKE $1 OR telefono ILIKE $1)
                  AND tenant_id = $2
                LIMIT 6
            `, [term, req.tenantId]),
            pool.query(`
                SELECT codigo, nombre_generico, nombre_comercial, concentracion,
                       codigo_ean13,
                       CASE WHEN activo THEN 'Activo' ELSE 'Inactivo' END as estado
                FROM medicamentos
                WHERE (nombre_generico ILIKE $1 OR nombre_comercial ILIKE $1 OR codigo ILIKE $1)
                  AND tenant_id = $2
                ORDER BY nombre_generico LIMIT 6
            `, [term, req.tenantId]),
        ]);
        res.json({ clientes: clientesRes.rows, medicamentos: medicamentosRes.rows });
    } catch (e) { handleDbError(res, e); }
});

// POST /reports/send-monthly — envia resumen mensual por email al admin
router.post('/reports/send-monthly', authenticateToken, async (req, res) => {
    const { getSystemConfig } = require('../config/systemConfig');
    const emailService = require('../services/emailService');
    const { adminEmail } = await getSystemConfig();
    if (!adminEmail) return res.status(400).json({ error: 'ADMIN_EMAIL no configurado en Configuración de Empresa' });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const m = String(month).padStart(2, '0');
    const start = `${year}-${m}-01 00:00:00`;
    const end = `${year}-${m}-${String(lastDay).padStart(2, '0')} 23:59:59`;
    const mesLabel = now.toLocaleString('es-HN', { month: 'long', year: 'numeric', timeZone: 'America/Tegucigalpa' });

    try {
        const [ventasRes, topRes] = await Promise.all([
            pool.query(
                `SELECT COALESCE(SUM(total),0) as ventas, COALESCE(SUM(isv_calculado),0) as isv, COUNT(*) as num FROM ventas WHERE fecha BETWEEN $1 AND $2 AND estado='Completada' AND tenant_id=$3`,
                [start, end, req.tenantId]
            ),
            pool.query(
                `SELECT COALESCE(m.nombre_comercial, m.nombre_generico, dv.producto, 'Medicamento') as producto, SUM(dv.cantidad) as qty, SUM(dv.cantidad*COALESCE(dv.precioUnitario,dv.precioVenta,0)) as total FROM detalleventa dv LEFT JOIN presentaciones_venta pv ON dv.id_presentacion=pv.id_presentacion AND pv.tenant_id=$3 LEFT JOIN medicamentos m ON pv.id_medicamento=m.codigo AND m.tenant_id=$3 JOIN ventas v ON dv.idVenta=v.codVenta WHERE v.fecha BETWEEN $1 AND $2 AND v.estado='Completada' AND dv.tipoProducto='MEDICAMENTO' AND v.tenant_id=$3 GROUP BY 1 ORDER BY total DESC LIMIT 5`,
                [start, end, req.tenantId]
            ),
        ]);

        const fmt = (n) => `L. ${Number(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
        const ventas = Number(ventasRes.rows[0].ventas);
        const isv = Number(ventasRes.rows[0].isv);
        const numFacturas = Number(ventasRes.rows[0].num) || 0;
        const topRows = topRes.rows.map(r=>`<tr><td>${r.producto}</td><td style="text-align:right">${r.qty}</td><td style="text-align:right;font-weight:600">${fmt(r.total)}</td></tr>`).join('');

        const htmlBody = `<div class="header" style="background:#1b5e20;"><h1>Reporte Mensual</h1><p>${mesLabel}</p></div>
        <div class="body">
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
            <div class="card" style="flex:1;min-width:150px;"><div class="label">Ventas del Mes</div><div class="highlight" style="color:#1b5e20;">${fmt(ventas)}</div></div>
            <div class="card" style="flex:1;min-width:150px;"><div class="label">ISV Recaudado</div><div class="highlight">${fmt(isv)}</div></div>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
            <div class="card" style="flex:1;min-width:150px;"><div class="label">Facturas Emitidas</div><div class="highlight">${numFacturas}</div></div>
          </div>
          ${topRes.rows.length>0?`<h3 style="font-size:15px;margin-bottom:10px;">Top Productos del Mes</h3>
          <table class="data"><thead><tr><th>Producto</th><th style="text-align:right">Cant.</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${topRows}</tbody></table>`:''}
        </div>`;

        await emailService.sendMonthlyReportEmail(adminEmail, mesLabel, htmlBody);
        res.json({ message: `Reporte de ${mesLabel} enviado a ${adminEmail}` });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
