
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ARQUEO Y CAJA ---

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

router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial } = req.body;
        const { codUsuario, idCaja } = req.user;
        const hndTime = getLocalTimestamp();
        const hndDate = hndTime.substring(0, 10);

        await client.query('BEGIN');
        
        const active = await client.query("SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'", [idCaja]);
        if (active.rows.length > 0) throw new Error('Ya existe una caja abierta para esta terminal');

        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        await client.query(
            `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado, totalVentas, totalCostos, TotalGastos, ganancia) 
             VALUES ($1, $2, $3, $4, $5, 'Activo', 0, 0, 0, 0)`,
            [idArqueo, idCaja, codUsuario, hndTime, montoInicial]
        );

        if (saldoTigoInicial !== undefined && saldoTigoInicial > 0) {
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1,'TIGO',$2,0,$2,$3)`, [idS, saldoTigoInicial, hndDate]);
        }
        if (saldoClaroInicial !== undefined && saldoClaroInicial > 0) {
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1,'CLARO',$2,0,$2,$3)`, [idS, saldoClaroInicial, hndDate]);
        }

        await client.query('COMMIT');
        res.status(201).json({ idArqueo });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/arqueo/close', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idArqueo } = req.body;
        const { idCaja, codUsuario } = req.user;
        const hndTime = getLocalTimestamp();
        const hndDate = hndTime.substring(0, 10);

        await client.query('BEGIN');

        // Obtener saldos actuales de TIGO/CLARO para pasar al SP
        const sTigo  = await client.query("SELECT saldoFinal FROM saldos WHERE red = 'TIGO'  AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1", [hndDate]);
        const sClaro = await client.query("SELECT saldoFinal FROM saldos WHERE red = 'CLARO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1", [hndDate]);
        const saldoTigo  = sTigo.rows[0]?.saldofinal  || 0;
        const saldoClaro = sClaro.rows[0]?.saldofinal || 0;

        // Usar SP sp_cerrar_arqueo (idCaja, codUsuario, saldo_tigo, saldo_claro)
        let spResult = null;
        try {
            const spRes = await client.query(
                `SELECT sp_cerrar_arqueo($1, $2, $3, $4) AS resultado`,
                [idCaja, codUsuario, saldoTigo, saldoClaro]
            );
            const resultado = spRes.rows[0]?.resultado;
            if (resultado && typeof resultado === 'object') {
                if (resultado.ok === false) throw new Error(resultado.error || 'Error en sp_cerrar_arqueo');
                spResult = resultado;
            }
        } catch (spErr) {
            if (!spErr.message?.includes('does not exist')) throw spErr;
            // SP no existe - usar lógica manual
        }

        if (!spResult) {
            // Fallback: lógica manual
            await updateArqueoBalance(idCaja, client);
            await client.query(
                `UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1,
                 saldoTigoFinal = $2, saldoClaroFinal = $3
                 WHERE idArqueo = $4 AND idCaja = $5`,
                [hndTime, saldoTigo, saldoClaro, idArqueo, idCaja]
            );
        }

        const resArq = await client.query('SELECT * FROM arqueo WHERE idArqueo = $1', [idArqueo]);
        await client.query('COMMIT');
        res.json({ resumen: resArq.rows[0] });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const idArqueo = req.params.id;
        const arqRes = await pool.query(`
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial", 
            montoFinal as "montoFinal", totalVentas as "totalVentas", TotalGastos as "TotalGastos", 
            ganancia, estado, TO_CHAR(fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura",
            TO_CHAR(fechaCierre, 'YYYY-MM-DD HH24:MI:SS') as "fechaCierre"
            FROM arqueo WHERE idArqueo = $1
        `, [idArqueo]);
        
        if (arqRes.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
        
        const arqueo = arqRes.rows[0];
        const date = arqueo.fechaApertura.substring(0, 10);
        
        const ingRes = await pool.query(`
            SELECT idIngreso as "idIngreso", descripcion, monto, costo, subtipo_movimiento as "subtipo_movimiento",
            TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM ingresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion ASC
        `, [arqueo.idCaja, date]);
        
        const egrRes = await pool.query(`
            SELECT idegresos as "idegresos", descripcion, monto, categoria as "subtipo_egreso", id_socio_asignado,
            TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM egresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion ASC
        `, [arqueo.idCaja, date]);

        res.json({ arqueo, ingresos: ingRes.rows, egresos: egrRes.rows });
    } catch(e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/initial', authenticateToken, async (req, res) => {
    try {
        const { montoInicial } = req.body;
        const resArq = await pool.query("UPDATE arqueo SET montoInicial = $1 WHERE idArqueo = $2 RETURNING idCaja", [montoInicial, req.params.id]);
        if (resArq.rows[0]) await updateArqueoBalance(resArq.rows[0].idCaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- INGRESOS Y EGRESOS ---

router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const targetCaja = idCaja || req.user.idCaja;
        
        const r = await pool.query(`
            SELECT idIngreso as "idIngreso", descripcion, monto, costo, subtipo_movimiento as "subtipo_movimiento",
            TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion", estado
            FROM ingresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion DESC
        `, [targetCaja, fecha]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const targetCaja = idCaja || req.user.idCaja;

        const r = await pool.query(`
            SELECT idegresos as "idegresos", descripcion, monto, categoria as "subtipo_egreso", id_socio_asignado,
            TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion", estado
            FROM egresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
            ORDER BY fechaCreacion DESC
        `, [targetCaja, fecha]);
        res.json(r.rows);
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
        const result = await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja', [descripcion, monto, costo, req.params.id]);
        if (result.rows[0]) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar si este ingreso está asociado a una venta (factura)
        const ventaRes = await client.query(
            'SELECT DISTINCT idVenta FROM detalleventa WHERE idIngreso = $1 LIMIT 1',
            [req.params.id]
        );

        if (ventaRes.rows.length > 0) {
            const idVenta = ventaRes.rows[0].idventa;

            // Anular la factura asociada y restaurar inventario
            await client.query("UPDATE ventas SET estado = 'Anulada' WHERE codVenta = $1", [idVenta]);

            const details = await client.query('SELECT * FROM detalleventa WHERE idVenta = $1', [idVenta]);
            for (const d of details.rows) {
                if (d.idtelefono) {
                    await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [d.idtelefono]);
                } else if (d.idaccesorio) {
                    await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [d.cantidad, d.idaccesorio]);
                }
            }
        }

        const result = await client.query('DELETE FROM ingresos WHERE idIngreso=$1 RETURNING idCaja', [req.params.id]);
        const idCaja = result.rows[0]?.idcaja;

        await client.query('COMMIT');
        if (idCaja) await updateArqueoBalance(idCaja);
        res.json({ message: 'OK', facturaAnulada: ventaRes.rows.length > 0 ? ventaRes.rows[0].idventa : null });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja: cajaManual, descripcion, monto, subtipo_egreso, id_socio_asignado, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        await pool.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, categoria, id_socio_asignado, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,'Registrado')`,
            [id, cajaManual || idCaja, descripcion, monto, subtipo_egreso, id_socio_asignado || null, fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(cajaManual || idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, subtipo_egreso, id_socio_asignado } = req.body;
        const result = await pool.query('UPDATE egresos SET descripcion=$1, monto=$2, categoria=$3, id_socio_asignado=$4 WHERE idegresos=$5 RETURNING idCaja', 
            [descripcion, monto, subtipo_egreso, id_socio_asignado || null, req.params.id]);
        if (result.rows[0]) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM egresos WHERE idegresos=$1 RETURNING idCaja', [req.params.id]);
        if (result.rows[0]) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- SALDOS Y RECARGAS ---

router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const rTigo = await pool.query("SELECT idsaldos FROM saldos WHERE red = 'TIGO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1", [fecha]);
        const rClaro = await pool.query("SELECT idsaldos FROM saldos WHERE red = 'CLARO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1", [fecha]);
        res.json({ tigo: rTigo.rows.length > 0, claro: rClaro.rows.length > 0 });
    } catch(e) { handleDbError(res, e); }
});

router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const query = `
            SELECT DISTINCT ON (red) 
                idsaldos, red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha
            FROM saldos
            WHERE TO_CHAR(fecha, 'YYYY-MM-DD') <= $1
            ORDER BY red, fecha DESC
        `;
        const r = await pool.query(query, [fecha]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido, fechaLocal } = req.body;
        const { idCaja } = req.user;
        const hndTime = getLocalTimestamp();

        await client.query('BEGIN');
        
        const idE = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, categoria, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, 'Compra Saldo', $5, 'Registrado')`,
            [idE, idCaja, `Compra de Saldo ${red}`, montoPagado, hndTime]
        );

        const sRes = await client.query("SELECT idsaldos, saldoFinal FROM saldos WHERE red = $1 AND TO_CHAR(fecha, 'YYYY-MM-DD') = $2", [red, fechaLocal]);
        if (sRes.rows.length > 0) {
            await client.query(
                "UPDATE saldos SET saldoComprado = saldoComprado + $1, saldoFinal = saldoFinal + $1 WHERE idsaldos = $2",
                [montoRecibido, sRes.rows[0].idsaldos]
            );
        } else {
            const lastSaldo = await client.query("SELECT saldoFinal FROM saldos WHERE red = $1 ORDER BY fecha DESC LIMIT 1", [red]);
            const baseFinal = Number(lastSaldo.rows[0]?.saldofinal || 0);
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query(
                "INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1,$2,$3,$4,$5,$6)",
                [idS, red, baseFinal, montoRecibido, baseFinal + montoRecibido, fechaLocal]
            );
        }

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
        const hndTime = getLocalTimestamp();

        await client.query('BEGIN');

        const sRes = await client.query("SELECT idsaldos FROM saldos WHERE red = $1 AND TO_CHAR(fecha, 'YYYY-MM-DD') = $2", [red, fechaLocal]);
        
        let targetId = null;
        if (sRes.rows.length === 0) {
            const lastS = await client.query("SELECT saldoFinal FROM saldos WHERE red = $1 ORDER BY fecha DESC LIMIT 1", [red]);
            const base = Number(lastS.rows[0]?.saldofinal || 0);
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query("INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1,$2,$3,0,$3,$4)", [idS, red, base, fechaLocal]);
            targetId = idS;
        } else {
            targetId = sRes.rows[0].idsaldos;
        }
        
        await client.query("UPDATE saldos SET saldoFinal = saldoFinal - $1 WHERE idsaldos = $2", [precioPagado, targetId]);

        const idI = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, $5, 'Recarga', $6, 'Completada')`,
            [idI, idCaja, `${red} - ${descripcion}`, precioCobrado, precioPagado, hndTime]
        );

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Recarga exitosa' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// --- NOTIFICACIONES ---

router.get('/notificaciones', authenticateToken, async (req, res) => {
    try {
        const { codUsuario } = req.user;
        const r = await pool.query(`
            SELECT id, tipo, titulo, cuerpo, leida, fecha_creacion as "fechaCreacion",
                   referencia_id as "referenciaId", referencia_tabla as "referenciaTabla"
            FROM notificaciones
            WHERE (para_usuario = $1 OR para_usuario IS NULL)
              AND leida = FALSE
            ORDER BY fecha_creacion DESC
            LIMIT 50
        `, [codUsuario]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/notificaciones/:id/leer', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notificaciones SET leida = TRUE, fecha_lectura = NOW() WHERE id = $1',
            [req.params.id]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/notificaciones/leer-todas', authenticateToken, async (req, res) => {
    try {
        const { codUsuario } = req.user;
        await pool.query(
            'UPDATE notificaciones SET leida = TRUE, fecha_lectura = NOW() WHERE (para_usuario = $1 OR para_usuario IS NULL) AND leida = FALSE',
            [codUsuario]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- KARDEX DE INVENTARIO ---

router.get('/kardex/:tipo/:cod', authenticateToken, async (req, res) => {
    try {
        const { tipo, cod } = req.params;
        const campo = tipo === 'TELEFONO' ? 'cod_telefono' : 'cod_inventario';
        const r = await pool.query(`
            SELECT id, tipo_producto as "tipoProducto", tipo_movimiento as "tipoMovimiento",
                   cantidad, precio_costo as "precioCosto", precio_venta as "precioVenta",
                   referencia_doc as "referenciaDoc", registrado_por as "registradoPor",
                   observaciones,
                   TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI:SS') as fecha
            FROM kardex_inventario
            WHERE ${campo} = $1
            ORDER BY fecha DESC
            LIMIT 100
        `, [cod]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- PAGOS DE VENTAS A CRÉDITO ---

router.get('/pagos-venta/:codVenta', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT id_pago as "idPago", monto, metodo_pago as "metodoPago", referencia,
                   notas, TO_CHAR(fecha_pago, 'YYYY-MM-DD HH24:MI:SS') as "fechaPago"
            FROM pagos_venta
            WHERE cod_venta = $1
            ORDER BY fecha_pago ASC
        `, [req.params.codVenta]);

        const totalPagado = r.rows.reduce((s, p) => s + Number(p.monto), 0);
        const ventaRes = await pool.query('SELECT total FROM ventas WHERE codVenta = $1', [req.params.codVenta]);
        const totalVenta = Number(ventaRes.rows[0]?.total || 0);

        res.json({
            pagos: r.rows,
            totalPagado,
            saldoPendiente: Math.max(0, totalVenta - totalPagado)
        });
    } catch(e) { handleDbError(res, e); }
});

router.post('/pagos-venta', authenticateToken, async (req, res) => {
    try {
        const { codVenta, monto, metodoPago, referencia, notas } = req.body;
        const { codUsuario, idCaja } = req.user;

        if (!codVenta || !monto || !metodoPago) {
            return res.status(400).json({ error: 'codVenta, monto y metodoPago son requeridos' });
        }

        await pool.query(`
            INSERT INTO pagos_venta (cod_venta, monto, metodo_pago, referencia, idCaja, registrado_por, notas)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [codVenta, monto, metodoPago, referencia || null, idCaja, codUsuario, notas || null]);

        res.status(201).json({ message: 'Pago registrado' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
