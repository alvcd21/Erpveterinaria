
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp, withTenantContext } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ARQUEO Y CAJA ---

router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        const query = `
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial",
            montoFinal as "montoFinal", totalVentas as "totalVentas", TotalGastos as "TotalGastos", ganancia, estado,
            TO_CHAR(fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura"
            FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' AND tenant_id = $2 LIMIT 1
        `;
        const result = await pool.query(query, [idCaja, req.tenantId]);
        res.json(result.rows[0] || null);
    } catch(e) { handleDbError(res, e); }
});

router.post('/arqueo/open', authenticateToken, async (req, res) => {
    try {
        const isAdmin = ['administrador','admin','superadmin'].includes(String(req.user?.rol||'').toLowerCase());
        if (!isAdmin && !req.user?.permisos?.includes('GESTIONAR_CAJA')) {
            return res.status(403).json({ error: 'Permiso GESTIONAR_CAJA requerido', code: 'FORBIDDEN' });
        }
        const { montoInicial } = req.body;
        const { codUsuario, idCaja } = req.user;
        const hndTime = getLocalTimestamp();
        const cajaAsignada = idCaja && idCaja !== 'Sin Caja';

        if (!cajaAsignada) {
            return res.status(400).json({
                error: 'No puede iniciar turno porque su usuario no tiene una caja asignada. Solicite a un administrador que le asigne una caja activa.',
                code: 'USER_WITHOUT_CASH_REGISTER',
            });
        }

        const monto = Number(montoInicial || 0);
        if (!Number.isFinite(monto) || monto < 0) {
            return res.status(400).json({
                error: 'El monto inicial debe ser un numero valido mayor o igual a cero.',
                code: 'INVALID_INITIAL_AMOUNT',
            });
        }

        const idArqueo = await withTenantContext(req.tenantId, async (client) => {
            const cajaRes = await client.query(
                `SELECT c.idCaja, c.estado, c.id_sucursal
                 FROM caja c
                 WHERE c.idCaja = $1 AND c.tenant_id = $2`,
                [idCaja, req.tenantId]
            );
            if (cajaRes.rows.length === 0) {
                const err = new Error('La caja asignada a su usuario ya no existe. Solicite al administrador revisar su asignacion.');
                err.statusCode = 400;
                err.code = 'ASSIGNED_CASH_REGISTER_NOT_FOUND';
                throw err;
            }
            if (cajaRes.rows[0].estado !== 'Activo') {
                const err = new Error('La caja asignada a su usuario esta inactiva. Solicite al administrador activar o reasignar la caja.');
                err.statusCode = 400;
                err.code = 'ASSIGNED_CASH_REGISTER_INACTIVE';
                throw err;
            }
            if (!cajaRes.rows[0].id_sucursal) {
                const err = new Error('La caja asignada no pertenece a ninguna sucursal. Configure la sucursal de la caja antes de iniciar turno.');
                err.statusCode = 400;
                err.code = 'CASH_REGISTER_WITHOUT_BRANCH';
                throw err;
            }

            const active = await client.query(
                "SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' AND tenant_id = $2",
                [idCaja, req.tenantId]
            );
            if (active.rows.length > 0) {
                const err = new Error('Ya existe un turno abierto para esta caja.');
                err.statusCode = 409;
                err.code = 'CASH_REGISTER_ALREADY_OPEN';
                throw err;
            }

            const newId = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
            await client.query(
                `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado, totalVentas, totalCostos, TotalGastos, ganancia, tenant_id)
                 VALUES ($1, $2, $3, $4, $5, 'Activo', 0, 0, 0, 0, $6)`,
                [newId, idCaja, codUsuario, hndTime, monto, req.tenantId]
            );
            return newId;
        });

        res.status(201).json({ idArqueo });
    } catch(e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message, code: e.code });
        handleDbError(res, e);
    }
});

router.post('/arqueo/close', authenticateToken, async (req, res) => {
    try {
        const isAdmin = ['administrador','admin','superadmin'].includes(String(req.user?.rol||'').toLowerCase());
        if (!isAdmin && !req.user?.permisos?.includes('GESTIONAR_CAJA')) {
            return res.status(403).json({ error: 'Permiso GESTIONAR_CAJA requerido', code: 'FORBIDDEN' });
        }
        const { idArqueo } = req.body;
        const { idCaja, codUsuario } = req.user;
        const hndTime = getLocalTimestamp();

        const resArq = await withTenantContext(req.tenantId, async (client) => {
            await updateArqueoBalance(idCaja, client, req.tenantId);
            await client.query(
                `UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1, cerradoPor = $2
                 WHERE idArqueo = $3 AND idCaja = $4 AND tenant_id = $5`,
                [hndTime, codUsuario, idArqueo, idCaja, req.tenantId]
            );
            const r = await client.query(
                'SELECT * FROM arqueo WHERE idArqueo = $1 AND tenant_id = $2',
                [idArqueo, req.tenantId]
            );
            return r;
        });

        res.json({ resumen: resArq.rows[0] });
    } catch(e) { handleDbError(res, e); }
});

router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const idArqueo = req.params.id;
        const arqRes = await pool.query(`
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial",
            montoFinal as "montoFinal", totalVentas as "totalVentas", TotalGastos as "TotalGastos",
            ganancia, estado, TO_CHAR(fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura",
            TO_CHAR(fechaCierre, 'YYYY-MM-DD HH24:MI:SS') as "fechaCierre"
            FROM arqueo WHERE idArqueo = $1 AND tenant_id = $2
        `, [idArqueo, req.tenantId]);

        if (arqRes.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

        const arqueo = arqRes.rows[0];
        const date = arqueo.fechaApertura.substring(0, 10);

        const ventasRes = await pool.query(`
            SELECT v.codVenta as "codVenta", v.total, v.estado, v.tipoCompra as "tipoCompra",
                   COALESCE(c.nombre || ' ' || c.apellido, 'Consumidor Final') as "nombreCliente",
                   TO_CHAR(v.fecha, 'YYYY-MM-DD HH24:MI:SS') as "fecha"
            FROM ventas v
            LEFT JOIN clientes c ON v.identidadCliente = c.identidad AND c.tenant_id = $3
            WHERE v.idCaja = $1 AND TO_CHAR(v.fecha, 'YYYY-MM-DD') = $2 AND v.tenant_id = $3
            ORDER BY v.fecha ASC
        `, [arqueo.idCaja, date, req.tenantId]);

        res.json({ arqueo, ventas: ventasRes.rows });
    } catch(e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/initial', authenticateToken, async (req, res) => {
    try {
        const { montoInicial } = req.body;
        const resArq = await pool.query(
            "UPDATE arqueo SET montoInicial = $1 WHERE idArqueo = $2 AND tenant_id = $3 RETURNING idCaja",
            [montoInicial, req.params.id, req.tenantId]
        );
        if (resArq.rows[0]) await updateArqueoBalance(resArq.rows[0].idcaja, pool, req.tenantId);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- KARDEX DE INVENTARIO (MEDICAMENTOS) ---

router.get('/kardex', authenticateToken, async (req, res) => {
    try {
        const { cod_medicamento, id_lote } = req.query;
        const params = [];
        const conditions = [];
        if (cod_medicamento) { params.push(cod_medicamento); conditions.push(`cod_medicamento = $${params.length}`); }
        if (id_lote)         { params.push(id_lote);         conditions.push(`id_lote = $${params.length}`); }
        params.push(req.tenantId);
        conditions.push(`tenant_id = $${params.length}`);
        const where = `WHERE ${conditions.join(' AND ')}`;

        const r = await pool.query(`
            SELECT id, tipo_producto as "tipoProducto", cod_medicamento as "codMedicamento",
                   id_lote as "idLote", tipo_movimiento as "tipoMovimiento",
                   cantidad, precio_costo as "precioCosto", precio_venta as "precioVenta",
                   referencia_doc as "referenciaDoc", registrado_por as "registradoPor",
                   observaciones, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI:SS') as fecha
            FROM kardex_inventario
            ${where}
            ORDER BY fecha DESC
            LIMIT 200
        `, params);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- NOTIFICACIONES ---

router.get('/notificaciones', authenticateToken, async (req, res) => {
    try {
        const { codUsuario, usuario, id_sucursal } = req.user;
        const r = await pool.query(`
            SELECT id, tipo, titulo, cuerpo, leida, fecha_creacion as "fechaCreacion",
                   referencia_id as "referenciaId", referencia_tabla as "referenciaTabla",
                   id_sucursal as "idSucursal"
            FROM notificaciones
            WHERE (
                    para_usuario = $1
                    OR para_usuario = $2
                    OR (
                        para_usuario IS NULL
                        AND (
                            (tipo <> 'entrega_pendiente' AND id_sucursal IS NULL)
                            OR id_sucursal = $3
                        )
                    )
                  )
              AND leida = FALSE
              AND tenant_id = $4
            ORDER BY fecha_creacion DESC
            LIMIT 50
        `, [codUsuario, usuario || null, id_sucursal || null, req.tenantId]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/notificaciones/:id/leer', authenticateToken, async (req, res) => {
    try {
        const { codUsuario, usuario, id_sucursal } = req.user;
        await pool.query(
            `UPDATE notificaciones
             SET leida = TRUE, fecha_lectura = NOW()
             WHERE id = $1 AND tenant_id = $2
               AND (
                    para_usuario = $3
                    OR para_usuario = $4
                    OR (
                        para_usuario IS NULL
                        AND (
                            (tipo <> 'entrega_pendiente' AND id_sucursal IS NULL)
                            OR id_sucursal = $5
                        )
                    )
               )`,
            [req.params.id, req.tenantId, codUsuario, usuario || null, id_sucursal || null]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/notificaciones/leer-todas', authenticateToken, async (req, res) => {
    try {
        const { codUsuario, usuario, id_sucursal } = req.user;
        await pool.query(
            `UPDATE notificaciones
             SET leida = TRUE, fecha_lectura = NOW()
             WHERE (
                    para_usuario = $1
                    OR para_usuario = $2
                    OR (
                        para_usuario IS NULL
                        AND (
                            (tipo <> 'entrega_pendiente' AND id_sucursal IS NULL)
                            OR id_sucursal = $3
                        )
                    )
                   )
               AND leida = FALSE
               AND tenant_id = $4`,
            [codUsuario, usuario || null, id_sucursal || null, req.tenantId]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- PAGOS DE VENTAS A CRÉDITO ---

router.get('/pagos-venta/:codVenta', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT id_pago as "idPago", monto, metodo_pago as "metodoPago", referencia,
                   notas, TO_CHAR(fecha_pago, 'YYYY-MM-DD HH24:MI:SS') as "fechaPago"
            FROM pagos_venta
            WHERE cod_venta = $1 AND tenant_id = $2
            ORDER BY fecha_pago ASC
        `, [req.params.codVenta, req.tenantId]);

        const totalPagado = r.rows.reduce((s, p) => s + Number(p.monto), 0);
        const ventaRes = await pool.query(
            'SELECT total FROM ventas WHERE codVenta = $1 AND tenant_id = $2',
            [req.params.codVenta, req.tenantId]
        );
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

        if (!idCaja || idCaja === 'Sin Caja') {
            return res.status(400).json({
                error: 'No puede registrar pagos porque su usuario no tiene una caja asignada.',
                code: 'USER_WITHOUT_CASH_REGISTER',
            });
        }
        if (!codVenta || !monto || !metodoPago) {
            return res.status(400).json({ error: 'codVenta, monto y metodoPago son requeridos' });
        }

        const active = await pool.query(
            "SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' AND tenant_id = $2 LIMIT 1",
            [idCaja, req.tenantId]
        );
        if (active.rows.length === 0) {
            return res.status(409).json({
                error: 'No puede registrar pagos porque no hay un turno de caja abierto.',
                code: 'CASH_REGISTER_NOT_OPEN',
            });
        }

        await pool.query(`
            INSERT INTO pagos_venta (cod_venta, monto, metodo_pago, referencia, idCaja, registrado_por, notas, tenant_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [codVenta, monto, metodoPago, referencia || null, idCaja, codUsuario, notas || null, req.tenantId]);

        res.status(201).json({ message: 'Pago registrado' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
