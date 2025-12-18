
const express = require('express');
const router = express.Router();
const { pool, handleDbError, updateArqueoBalance } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- AUDITORÍA DE MOVIMIENTOS ---
// URL final: /api/accounting/audit/transactions
router.get('/audit/transactions', authenticateToken, async (req, res) => {
    try {
        const { date } = req.query;
        let where = "1=1";
        const params = [];

        if (date) {
            where = "TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $1";
            params.push(date);
        }

        const query = `
            (SELECT 
                'INGRESO' as tipo, idIngreso as id, idCaja as "idCaja", descripcion, monto, costo, 
                TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha, estado, 'Venta/Servicio' as categoria
             FROM ingresos WHERE ${where})
            UNION ALL
            (SELECT 
                'EGRESO' as tipo, idegresos as id, idCaja as "idCaja", descripcion, monto, 0 as costo, 
                TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha, estado, categoria
             FROM egresos WHERE ${where})
            ORDER BY fecha DESC
        `;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- REPORTE DE RENTABILIDAD ---
// URL final: /api/accounting/report/profitability
router.get('/report/profitability', authenticateToken, async (req, res) => {
    try {
        const { date } = req.query; 
        if (!date) return res.status(400).json({ error: 'Fecha requerida' });

        const calculateForRange = async (startDate, endDate) => {
            const ingRes = await pool.query(`
                SELECT 
                    COALESCE(SUM(monto), 0) as ingresos,
                    COALESCE(SUM(costo), 0) as costos
                FROM ingresos WHERE fechaCreacion BETWEEN $1 AND $2
            `, [startDate, endDate]);

            const egrRes = await pool.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN categoria = 'Gasto Operativo' THEN monto ELSE 0 END), 0) as opex,
                    COALESCE(SUM(CASE WHEN categoria = 'Compra de Producto' THEN monto ELSE 0 END), 0) as inversion
                FROM egresos WHERE fechaCreacion BETWEEN $1 AND $2
            `, [startDate, endDate]);

            const ingresos = Number(ingRes.rows[0].ingresos);
            const costos = Number(ingRes.rows[0].costos);
            const opex = Number(egrRes.rows[0].opex);
            const inversion = Number(egrRes.rows[0].inversion);
            const utilidadBruta = ingresos - costos;
            const utilidadNeta = utilidadBruta - opex;

            return { ingresos, costos, utilidadBruta, opex, inversion, utilidadNeta };
        };

        const dayStart = `${date} 00:00:00`;
        const dayEnd = `${date} 23:59:59`;
        const d = new Date(date);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0] + ' 00:00:00';
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0] + ' 23:59:59';
        const yearStart = `${d.getFullYear()}-01-01 00:00:00`;
        const yearEnd = `${d.getFullYear()}-12-31 23:59:59`;

        const [daily, monthly, yearly] = await Promise.all([
            calculateForRange(dayStart, dayEnd),
            calculateForRange(monthStart, monthEnd),
            calculateForRange(yearStart, yearEnd)
        ]);

        const socios = await pool.query("SELECT nombre, porcentaje_participacion FROM socios WHERE estado = 'Activo'");
        const distribucion = socios.rows.map(s => ({
            socio: s.nombre,
            porcentaje: s.porcentaje_participacion,
            gananciaDia: (daily.utilidadNeta * (s.porcentaje_participacion / 100)),
            gananciaMes: (monthly.utilidadNeta * (s.porcentaje_participacion / 100)),
            gananciaAnio: (yearly.utilidadNeta * (s.porcentaje_participacion / 100))
        }));

        res.json({ daily, monthly, yearly, distribucion });
    } catch(e) { handleDbError(res, e); }
});

// --- SOCIOS ---
router.get('/socios', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id_socio as "idSocio", nombre, porcentaje_participacion as "porcentajeParticipacion", estado, fecha_ingreso as "fechaIngreso" FROM socios ORDER BY id_socio');
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- ACCIONES DE AUDITORÍA ---
router.put('/audit/transactions/:tipo/:id', authenticateToken, async (req, res) => {
    try {
        const { tipo, id } = req.params;
        const { descripcion, monto, costo, categoria } = req.body;
        let idCaja = null;
        if (tipo === 'INGRESO') {
            const r = await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja', [descripcion, monto, costo, id]);
            idCaja = r.rows[0]?.idcaja;
        } else {
            const r = await pool.query('UPDATE egresos SET descripcion=$1, monto=$2, categoria=$3 WHERE idegresos=$4 RETURNING idCaja', [descripcion, monto, categoria, id]);
            idCaja = r.rows[0]?.idcaja;
        }
        if (idCaja) await updateArqueoBalance(idCaja);
        res.json({ message: 'Movimiento actualizado' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
