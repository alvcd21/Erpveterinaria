
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ==========================================
// 1. GESTIÓN DE ARQUEO (APERTURA/CIERRE)
// ==========================================

router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        const result = await pool.query(
            `SELECT idArqueo as "idArqueo", idCaja as "idCaja", idUsuario as "idUsuario", 
             fechaApertura as "fechaApertura", montoInicial as "montoInicial", estado, totalVentas as "totalVentas"
             FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]
        );
        res.json(result.rows[0] || null);
    } catch (e) { handleDbError(res, e); }
});

router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial, fechaLocal } = req.body;
        const { idCaja, codUsuario } = req.user;

        const active = await client.query(`SELECT 1 FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
        if (active.rows.length > 0) return res.status(400).json({ error: 'La caja ya tiene una sesión activa.' });

        await client.query('BEGIN');
        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        const fecha = fechaLocal ? `${fechaLocal} ${new Date().toLocaleTimeString('en-US', {hour12:false})}` : getLocalTimestamp();

        await client.query(
            `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado) 
             VALUES ($1, $2, $3, $4, $5, 'Activo')`,
            [idArqueo, idCaja, codUsuario, fecha, montoInicial]
        );

        // Inicializar saldos de recargas para el día
        const today = fechaLocal || new Date().toISOString().split('T')[0];
        const checkT = await client.query(`SELECT 1 FROM saldos WHERE red = 'TIGO' AND fecha = $1`, [today]);
        if (checkT.rows.length === 0) {
            if (saldoTigoInicial !== undefined) {
                const sldT = await generateNextId('saldos', 'idsaldos', 'SLD', client);
                await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`, [sldT, saldoTigoInicial, today]);
            }
            if (saldoClaroInicial !== undefined) {
                const sldC = await generateNextId('saldos', 'idsaldos', 'SLD', client);
                await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`, [sldC, saldoClaroInicial, today]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Caja aperturada con éxito', idArqueo });
    } catch (e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/arqueo/close', authenticateToken, async (req, res) => {
    try {
        const { idArqueo } = req.body;
        const { idCaja } = req.user;
        
        await updateArqueoBalance(idCaja, pool);
        
        const arqRes = await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
        const arqueo = arqRes.rows[0];
        const fechaStr = new Date(arqueo.fechaapertura).toISOString().split('T')[0];
        
        const saldosRes = await pool.query(`SELECT red, saldoFinal FROM saldos WHERE fecha = $1`, [fechaStr]);
        let sT = 0, sC = 0;
        saldosRes.rows.forEach(s => { if (s.red === 'TIGO') sT = Number(s.saldofinal); if (s.red === 'CLARO') sC = Number(s.saldofinal); });

        const fC = getLocalTimestamp();
        await pool.query(
            `UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1, saldoTigoFinal = $2, saldoClaroFinal = $3 WHERE idArqueo = $4`,
            [fC, sT, sC, idArqueo]
        );
        
        const r = (await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [idArqueo])).rows[0];
        res.json({ message: 'Caja cerrada', resumen: r });
    } catch (e) { handleDbError(res, e); }
});

// ==========================================
// 2. ENDPOINTS DE AUDITORÍA (PARA PANEL DE CAJAS)
// ==========================================

router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const arqRes = await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [id]);
        if (arqRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        
        const arq = arqRes.rows[0];
        const idCaja = arq.idcaja;
        const fechaIni = arq.fechaapertura;

        const ingRes = await pool.query(
            `SELECT idIngreso as "idIngreso", descripcion, monto, costo, fechaCreacion as "fechaCreacion" 
             FROM ingresos WHERE idCaja = $1 AND fechaCreacion >= $2 ORDER BY fechaCreacion ASC`,
            [idCaja, fechaIni]
        );

        const egrRes = await pool.query(
            `SELECT idegresos as "idegresos", descripcion, monto, fechaCreacion as "fechaCreacion" 
             FROM egresos WHERE idCaja = $1 AND fechaCreacion >= $2 ORDER BY fechaCreacion ASC`,
            [idCaja, fechaIni]
        );

        res.json({
            arqueo: {
                idArqueo: arq.idarqueo,
                idCaja: arq.idcaja,
                montoInicial: arq.montoinicial,
                estado: arq.estado,
                fechaApertura: arq.fechaapertura
            },
            ingresos: ingRes.rows,
            egresos: egrRes.rows
        });
    } catch (e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/reopen', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL WHERE idArqueo = $1`, [id]);
        res.json({ message: 'Caja reabierta con éxito' });
    } catch (e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/initial', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { montoInicial } = req.body;
        const arqRes = await pool.query(`UPDATE arqueo SET montoInicial = $1 WHERE idArqueo = $2 RETURNING idCaja`, [montoInicial, id]);
        if (arqRes.rows.length > 0) {
            await updateArqueoBalance(arqRes.rows[0].idcaja);
        }
        res.json({ message: 'Monto inicial actualizado' });
    } catch (e) { handleDbError(res, e); }
});

// ==========================================
// 3. MOVIMIENTOS (INGRESOS / EGRESOS)
// ==========================================

router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        let query = `SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado FROM ingresos WHERE idCaja = $1`;
        const params = [idCaja];
        if (fecha) { query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`; params.push(fecha); }
        query += ` ORDER BY fechaCreacion DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('ingresos', 'idIngreso', 'INGR');
        await pool.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, 'Registrado')`,
            [id, idCaja, descripcion, monto, costo || 0, fechaCreacion || getLocalTimestamp()]
        );
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'Ingreso registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        const result = await pool.query(
            `UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja`,
            [descripcion, monto, costo, req.params.id]
        );
        if (result.rows.length > 0) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'Ingreso actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM ingresos WHERE idIngreso=$1 RETURNING idCaja`, [req.params.id]);
        if (result.rows.length > 0) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'Ingreso eliminado' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        let query = `SELECT idegresos as "idegresos", idCaja as "idCaja", descripcion, monto, fechaCreacion as "fechaCreacion", estado FROM egresos WHERE idCaja = $1`;
        const params = [idCaja];
        if (fecha) { query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`; params.push(fecha); }
        query += ` ORDER BY fechaCreacion DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        await pool.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, $5, 'Registrado')`,
            [id, idCaja, descripcion, monto, fechaCreacion || getLocalTimestamp()]
        );
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'Egreso registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto } = req.body;
        const result = await pool.query(
            `UPDATE egresos SET descripcion=$1, monto=$2 WHERE idegresos=$3 RETURNING idCaja`,
            [descripcion, monto, req.params.id]
        );
        if (result.rows.length > 0) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'Egreso actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM egresos WHERE idegresos=$1 RETURNING idCaja`, [req.params.id]);
        if (result.rows.length > 0) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'Egreso eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// ==========================================
// 4. GESTIÓN DE SALDOS Y RECARGAS
// ==========================================

router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const result = await pool.query(
            `SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal" 
             FROM saldos WHERE fecha = $1`, 
            [fecha || new Date().toISOString().split('T')[0]]
        );
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, monto } = req.body;
        const { idCaja } = req.user;
        const today = new Date().toISOString().split('T')[0];

        await client.query('BEGIN');
        
        // 1. Registrar Egreso (Salida de dinero para comprar saldo)
        const idEgre = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, 'Compra Saldo')`,
            [idEgre, idCaja, `Compra Saldo ${red}`, monto, getLocalTimestamp()]);

        // 2. Actualizar Tabla de Saldos
        await client.query(`UPDATE saldos SET saldoComprado = saldoComprado + $1, saldoFinal = saldoFinal + $1 WHERE red = $2 AND fecha = $3`, [monto, red, today]);

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Saldo comprado con éxito' });
    } catch (e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/recargas', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, monto, costo, descripcion } = req.body;
        const { idCaja } = req.user;
        const today = new Date().toISOString().split('T')[0];

        await client.query('BEGIN');
        
        // 1. Registrar Ingreso (Venta de recarga)
        const idIngre = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Venta Recarga')`,
            [idIngre, idCaja, descripcion, monto, costo, getLocalTimestamp()]);

        // 2. Restar del Saldo Final
        await client.query(`UPDATE saldos SET saldoFinal = saldoFinal - $1 WHERE red = $2 AND fecha = $3`, [costo, red, today]);

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Recarga procesada' });
    } catch (e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// Admin management for saldos
router.get('/admin/saldos', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const result = await pool.query(`SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoFinal as "saldoFinal" FROM saldos WHERE fecha = $1`, [fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/admin/saldos/:id', authenticateToken, async (req, res) => {
    try {
        const { saldoInicio, saldoFinal } = req.body;
        await pool.query(`UPDATE saldos SET saldoInicio = $1, saldoFinal = $2 WHERE idsaldos = $3`, [saldoInicio, saldoFinal, req.params.id]);
        res.json({ message: 'Saldo actualizado' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
