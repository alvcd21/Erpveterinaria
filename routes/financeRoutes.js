
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ARQUEO: OBTENER ACTIVO (POR CAJA) ---
router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        const query = `
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial", 
            montoFinal as "montoFinal", totalVentas as "totalVentas", ganancia, estado,
            TO_CHAR(fechaApertura AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura"
            FROM arqueo 
            WHERE idCaja = $1 AND estado = 'Activo' 
            LIMIT 1
        `;
        const result = await pool.query(query, [idCaja]);
        res.json(result.rows[0] || null);
    } catch(e) { handleDbError(res, e); }
});

// --- SALDOS: VALIDAR SI YA SE INGRESARON HOY (GLOBAL) ---
router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const hndDate = getLocalTimestamp().substring(0, 10);
        const query = `
            SELECT 
                EXISTS(SELECT 1 FROM saldos WHERE red = 'TIGO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1) as tigo,
                EXISTS(SELECT 1 FROM saldos WHERE red = 'CLARO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1) as claro
        `;
        const result = await pool.query(query, [hndDate]);
        res.json(result.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

// --- ARQUEO: APERTURA DE CAJA ---
router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial } = req.body;
        const { codUsuario, idCaja } = req.user;
        const hndTimestamp = getLocalTimestamp();
        const hndDate = hndTimestamp.substring(0, 10);

        await client.query('BEGIN');
        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        await client.query(
            `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, montoFinal, estado, totalVentas, totalCostos, TotalGastos, ganancia) 
             VALUES ($1, $2, $3, $4, $5, $5, 'Activo', 0, 0, 0, 0)`,
            [idArqueo, idCaja, codUsuario, hndTimestamp, montoInicial]
        );

        if (saldoTigoInicial > 0) {
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`, [idS, saldoTigoInicial, hndDate]);
        }
        if (saldoClaroInicial > 0) {
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`, [idS, saldoClaroInicial, hndDate]);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'OK', idArqueo });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// --- ARQUEO: CIERRE DE CAJA ---
router.post('/arqueo/close', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idArqueo } = req.body;
        const { idCaja } = req.user;
        await client.query('BEGIN');
        await updateArqueoBalance(idCaja, client);
        
        // Obtener resumen final antes de cerrar
        const resRes = await client.query('SELECT * FROM arqueo WHERE idArqueo = $1', [idArqueo]);
        await client.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1 WHERE idArqueo = $2`, [getLocalTimestamp(), idArqueo]);
        
        await client.query('COMMIT');
        res.json({ message: 'Turno cerrado', resumen: resRes.rows[0] });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// --- MOVIMIENTOS: INGRESOS ---
router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const query = `
            SELECT idIngreso as "idIngreso", descripcion, monto, costo, subtipo_movimiento as "subtipo_movimiento", 
            TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM ingresos 
            WHERE idCaja = $1 AND TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion DESC
        `;
        const result = await pool.query(query, [idCaja, fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo, subtipo_movimiento, fechaCreacion, idCaja: bodyIdCaja } = req.body;
        const idCaja = bodyIdCaja || req.user.idCaja;
        const id = await generateNextId('ingresos', 'idIngreso', 'INGR');
        await pool.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Registrado')`,
            [id, idCaja, descripcion, monto, costo || 0, subtipo_movimiento || 'Venta Inventario', fechaCreacion || getLocalTimestamp()]
        );
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        const r = await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja', [descripcion, monto, costo, req.params.id]);
        if(r.rows[0]) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM ingresos WHERE idIngreso=$1 RETURNING idCaja', [req.params.id]);
        if(r.rows[0]) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- MOVIMIENTOS: EGRESOS ---
router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const query = `
            SELECT idegresos as "idegresos", descripcion, monto, subtipo_egreso as "subtipo_egreso", id_socio_asignado as "id_socio_asignado",
            TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM egresos 
            WHERE idCaja = $1 AND TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion DESC
        `;
        const result = await pool.query(query, [idCaja, fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, subtipo_egreso, id_socio_asignado, fechaCreacion, idCaja: bodyIdCaja } = req.body;
        const idCaja = bodyIdCaja || req.user.idCaja;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        await pool.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, subtipo_egreso, id_socio_asignado, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Registrado')`,
            [id, idCaja, descripcion, monto, subtipo_egreso || 'Gasto Operativo', id_socio_asignado || null, fechaCreacion || getLocalTimestamp()]
        );
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto } = req.body;
        const r = await pool.query('UPDATE egresos SET descripcion=$1, monto=$2 WHERE idegresos=$3 RETURNING idCaja', [descripcion, monto, req.params.id]);
        if(r.rows[0]) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM egresos WHERE idegresos=$1 RETURNING idCaja', [req.params.id]);
        if(r.rows[0]) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- SALDOS Y RECARGAS ---
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
        res.json({ message: 'Compra registrada' });
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
        res.json({ message: 'Recarga OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

module.exports = router;
