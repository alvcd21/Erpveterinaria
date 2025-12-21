
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        const query = `
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial", 
            montoFinal as "montoFinal", totalVentas as "totalVentas", TotalGastos as "TotalGastos", ganancia, estado,
            TO_CHAR(fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura"
            FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' LIMIT 1
        `;
        const result = await pool.query(query, [idCaja]);
        res.json(result.rows[0] || null);
    } catch(e) { handleDbError(res, e); }
});

router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const idArqueo = req.params.id;
        const arqRes = await pool.query(`
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial", 
            montoFinal as "montoFinal", totalVentas as "totalVentas", TotalGastos as "TotalGastos", 
            ganancia, estado, fechaApertura as "fechaApertura", fechaCierre as "fechaCierre"
            FROM arqueo WHERE idArqueo = $1
        `, [idArqueo]);
        
        if (arqRes.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
        
        const arqueo = arqRes.rows[0];
        const date = arqueo.fechaApertura.toISOString().substring(0, 10);
        
        const ingRes = await pool.query(`
            SELECT idIngreso as "idIngreso", descripcion, monto, costo, 
            TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM ingresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion ASC
        `, [arqueo.idCaja, date]);
        
        const egrRes = await pool.query(`
            SELECT idegresos as "idegresos", descripcion, monto, 
            TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM egresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion ASC
        `, [arqueo.idCaja, date]);

        res.json({ arqueo, ingresos: ingRes.rows, egresos: egrRes.rows });
    } catch(e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/reopen', authenticateToken, async (req, res) => {
    try {
        await pool.query("UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL WHERE idArqueo = $1", [req.params.id]);
        res.json({ message: 'Caja reabierta' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/initial', authenticateToken, async (req, res) => {
    try {
        const { montoInicial } = req.body;
        const resArq = await pool.query("UPDATE arqueo SET montoInicial = $1 WHERE idArqueo = $2 RETURNING idCaja", [montoInicial, req.params.id]);
        if (resArq.rows[0]) await updateArqueoBalance(resArq.rows[0].idCaja);
        res.json({ message: 'Monto inicial actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const result = await pool.query(`
            SELECT idIngreso as "idIngreso", descripcion, monto, costo, subtipo_movimiento as "subtipo_movimiento", TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM ingresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2 ORDER BY fechaCreacion DESC
        `, [idCaja, fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja: cajaManual, descripcion, monto, costo, subtipo_movimiento, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('ingresos', 'idIngreso', 'INGR');
        await pool.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,'Registrado')`,
            [id, cajaManual || idCaja, descripcion, monto, costo || 0, subtipo_movimiento || 'Reparacion', fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(cajaManual || idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        const resIn = await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja', [descripcion, monto, costo, req.params.id]);
        if (resIn.rows[0]) await updateArqueoBalance(resIn.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const resIn = await pool.query('DELETE FROM ingresos WHERE idIngreso=$1 RETURNING idCaja', [req.params.id]);
        if (resIn.rows[0]) await updateArqueoBalance(resIn.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const result = await pool.query(`
            SELECT idegresos as "idegresos", descripcion, monto, subtipo_egreso as "subtipo_egreso", id_socio_asignado as "id_socio_asignado", TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM egresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2 ORDER BY fechaCreacion DESC
        `, [idCaja, fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja: cajaManual, descripcion, monto, subtipo_egreso, id_socio_asignado, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        await pool.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, subtipo_egreso, id_socio_asignado, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,'Registrado')`,
            [id, cajaManual || idCaja, descripcion, monto, subtipo_egreso, id_socio_asignado || null, fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(cajaManual || idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, subtipo_egreso, id_socio_asignado } = req.body;
        const resEg = await pool.query('UPDATE egresos SET descripcion=$1, monto=$2, subtipo_egreso=$3, id_socio_asignado=$4 WHERE idegresos=$5 RETURNING idCaja', [descripcion, monto, subtipo_egreso, id_socio_asignado, req.params.id]);
        if (resEg.rows[0]) await updateArqueoBalance(resEg.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const resEg = await pool.query('DELETE FROM egresos WHERE idegresos=$1 RETURNING idCaja', [req.params.id]);
        if (resEg.rows[0]) await updateArqueoBalance(resEg.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const r = await pool.query(`SELECT idsaldos, red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE TO_CHAR(fecha, 'YYYY-MM-DD') = $1`, [fecha]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido, fechaLocal } = req.body;
        const { idCaja } = req.user;
        await client.query('BEGIN');
        await client.query('UPDATE saldos SET saldoComprado = saldoComprado + $1, saldoFinal = saldoFinal + $1 WHERE red = $2 AND TO_CHAR(fecha, \'YYYY-MM-DD\') = $3', [montoRecibido, red, fechaLocal]);
        const idEgre = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query('INSERT INTO egresos (idegresos, idCaja, descripcion, monto, subtipo_egreso, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [idEgre, idCaja, `Compra de Saldo ${red}`, montoPagado, 'Compra Saldo', getLocalTimestamp(), 'Registrado']);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/recargas', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, tipo, descripcion, precioCobrado, precioPagado, fechaLocal } = req.body;
        const { idCaja } = req.user;
        await client.query('BEGIN');
        await client.query('UPDATE saldos SET saldoFinal = saldoFinal - $1 WHERE red = $2 AND TO_CHAR(fecha, \'YYYY-MM-DD\') = $3', [precioPagado, red, fechaLocal]);
        const idIngre = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query('INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [idIngre, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado, 'Recarga', getLocalTimestamp(), 'Registrado']);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

module.exports = router;
