
const express = require('express');
const router = express.Router();
const { pool, handleDbError, updateArqueoBalance } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- AUDITORÍA DE MOVIMIENTOS (Caja e Ingresos Manuales) ---
router.get('/accounting/audit/transactions', authenticateToken, async (req, res) => {
    try {
        const { start, end, idCaja } = req.query;
        let query = `
            (SELECT 
                'INGRESO' as tipo, idIngreso as id, idCaja as "idCaja", descripcion, monto, costo, 
                TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha, estado, NULL as categoria
             FROM ingresos WHERE 1=1)
            UNION ALL
            (SELECT 
                'EGRESO' as tipo, idegresos as id, idCaja as "idCaja", descripcion, monto, 0 as costo, 
                TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha, estado, categoria
             FROM egresos WHERE 1=1)
            ORDER BY fecha DESC
        `;
        // Nota: En un sistema real añadiríamos filtros dinámicos de fecha aquí
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// Editar un movimiento desde Auditoría (Afecta Arqueo)
router.put('/accounting/audit/transactions/:tipo/:id', authenticateToken, async (req, res) => {
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
        res.json({ message: 'Movimiento actualizado y caja sincronizada' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/accounting/audit/transactions/:tipo/:id', authenticateToken, async (req, res) => {
    try {
        const { tipo, id } = req.params;
        let idCaja = null;

        if (tipo === 'INGRESO') {
            const r = await pool.query('DELETE FROM ingresos WHERE idIngreso=$1 RETURNING idCaja', [id]);
            idCaja = r.rows[0]?.idcaja;
        } else {
            const r = await pool.query('DELETE FROM egresos WHERE idegresos=$1 RETURNING idCaja', [id]);
            idCaja = r.rows[0]?.idcaja;
        }

        if (idCaja) await updateArqueoBalance(idCaja);
        res.json({ message: 'Movimiento eliminado y caja sincronizada' });
    } catch(e) { handleDbError(res, e); }
});

// --- REPORTES FINANCIEROS Y SOCIOS ---
router.get('/accounting/socios', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_socio as "idSocio", nombre, porcentaje_participacion as "porcentajeParticipacion", estado, fecha_ingreso as "fechaIngreso"
            FROM socios ORDER BY id_socio
        `);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/accounting/socios', authenticateToken, async (req, res) => {
    try {
        const { nombre, porcentajeParticipacion } = req.body;
        await pool.query(
            `INSERT INTO socios (nombre, porcentaje_participacion) VALUES ($1, $2)`,
            [nombre, porcentajeParticipacion]
        );
        res.status(201).json({ message: 'Socio creado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/accounting/socios/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, porcentajeParticipacion, estado } = req.body;
        await pool.query(
            `UPDATE socios SET nombre=$1, porcentaje_participacion=$2, estado=$3 WHERE id_socio=$4`,
            [nombre, porcentajeParticipacion, estado, req.params.id]
        );
        res.json({ message: 'Socio actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/accounting/socios/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM socios WHERE id_socio=$1', [req.params.id]);
        res.json({ message: 'Socio eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// REPORTE DE GANANCIA NETA REAL (DAILY/MONTHLY)
router.get('/accounting/report/profitability', authenticateToken, async (req, res) => {
    try {
        const { date, month, year } = req.query;
        let whereIngresos = `1=1`, whereEgresos = `1=1`;
        let params = [];

        if (date) {
            whereIngresos += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $1`;
            whereEgresos += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $1`;
            params.push(date);
        } else if (month && year) {
            whereIngresos += ` AND EXTRACT(MONTH FROM fechaCreacion) = $1 AND EXTRACT(YEAR FROM fechaCreacion) = $2`;
            whereEgresos += ` AND EXTRACT(MONTH FROM fechaCreacion) = $1 AND EXTRACT(YEAR FROM fechaCreacion) = $2`;
            params.push(month, year);
        }

        const ingRes = await pool.query(`
            SELECT 
                COALESCE(SUM(monto), 0) as ingresos_totales,
                COALESCE(SUM(costo), 0) as costo_productos,
                COALESCE(SUM(monto - costo), 0) as utilidad_bruta
            FROM ingresos WHERE ${whereIngresos}
        `, params);

        const egrRes = await pool.query(`
            SELECT 
                COALESCE(SUM(monto), 0) as gastos_operativos
            FROM egresos 
            WHERE ${whereEgresos} AND categoria = 'Gasto Operativo'
        `, params);

        const invRes = await pool.query(`
            SELECT 
                COALESCE(SUM(monto), 0) as compras_inventario
            FROM egresos 
            WHERE ${whereEgresos} AND categoria = 'Compra de Producto'
        `, params);

        const data = {
            ingresos: Number(ingRes.rows[0].ingresos_totales),
            costoMercancia: Number(ingRes.rows[0].costo_productos),
            utilidadBruta: Number(ingRes.rows[0].utilidad_bruta),
            gastosOperativos: Number(egrRes.rows[0].gastos_operativos),
            comprasInventario: Number(invRes.rows[0].compras_inventario),
            utilidadNeta: Number(ingRes.rows[0].utilidad_bruta) - Number(egrRes.rows[0].gastos_operativos)
        };

        // Distribución a socios basada en utilidad neta
        const socios = await pool.query('SELECT nombre, porcentaje_participacion FROM socios WHERE estado = \'Activo\'');
        data.distribucion = socios.rows.map(s => ({
            socio: s.nombre,
            porcentaje: s.porcentaje_participacion,
            monto: (data.utilidadNeta * (s.porcentaje_participacion / 100))
        }));

        res.json(data);
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
