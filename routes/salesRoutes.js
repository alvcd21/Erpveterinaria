
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ... (endpoints de clientes se mantienen igual)

router.get('/ventas/historial', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query; 
        const { codUsuario } = req.user;
        
        let query = `
            SELECT v.codVenta as "codVenta", v.fecha, v.total, v.estado, v.identidadCliente as "identidadCliente",
            v.tipoCompra as "tipoCompra", v.estado_pago_financiera as "estado_pago_financiera",
            c.nombre || ' ' || c.apellido as "nombreCliente"
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE v.codVendedor = $1
        `;
        const params = [codUsuario];
        if (fecha) { query += ` AND TO_CHAR(v.fecha, 'YYYY-MM-DD') = $${params.length + 1}`; params.push(fecha); }
        query += ` ORDER BY v.codVenta DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// ... (GET venta individual se mantiene igual)

router.post('/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, tipoCompra, total, detalles, isv, descuento, montoPrima, montoFinanciado } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    await client.query('BEGIN');
    const hndTime = getLocalTimestamp();
    const codVenta = await generateNextId('ventas', 'codVenta', 'FACT', client);

    let totalCosto = 0;
    let descArray = [];

    for (const item of detalles) {
        if (item.idTelefono) {
            const tel = await client.query("SELECT marca, modelo, precioCompra FROM telefonos WHERE codigo = $1", [item.idTelefono]);
            const row = tel.rows[0];
            totalCosto += Number(row?.preciocompra || 0);
            if (row) descArray.push(`${row.marca} ${row.modelo}`.toUpperCase());
        } else if (item.idInventario) {
            const inv = await client.query(`
                SELECT i.precioCompra, a.descripcion, c.tipo as categoria 
                FROM inventario i 
                JOIN accesorios a ON i.codAccesorio = a.codAccesorio
                LEFT JOIN categoria c ON a.codCategoria = c.codCategoria
                WHERE i.codInventario = $1
            `, [item.idInventario]);
            const row = inv.rows[0];
            totalCosto += (Number(row?.preciocompra || 0) * Number(item.cantidad || 1));
            if (row) descArray.push(`${row.categoria || ''} ${row.descripcion}`.trim().toUpperCase());
        }
    }

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    const esKrediya = (tipoCompra === 'KrediYa');
    
    // LOGICA KREDIYA: El costo inicial del ingreso es igual al monto (Prima) para evitar ganancia negativa hoy.
    const montoIngresoCaja = esKrediya ? Number(montoPrima) : Number(total);
    const costoIngresoCaja = esKrediya ? Number(montoPrima) : totalCosto;
    const subtipoMovimiento = esKrediya ? 'KrediYa_Prima' : 'Venta';
    
    const descripcionVenta = descArray.length > 0 ? descArray.join(', ') : `VENTA FACTURA #${codVenta}`;

    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado, subtipo_movimiento) 
       VALUES ($1, $2, $3, $4, $5, $6, 'Completada', $7)`,
      [idIngreso, idCaja, descripcionVenta, montoIngresoCaja, costoIngresoCaja, hndTime, subtipoMovimiento]
    );

    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codVendedor, identidadCliente, total, estado, tipoCompra, isv, descuento, monto_prima, monto_financiamiento, monto_financiera, monto_prima_efectivo, es_krediya, estado_pago_financiera) 
       VALUES ($1, $2, $3, $4, $5, 'Completada', $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [codVenta, hndTime, codUsuario, identidadCliente, total, tipoCompra, isv || 0, descuento || 0, montoPrima || 0, montoFinanciado || 0, montoFinanciado || 0, montoPrima || 0, esKrediya, esKrediya ? 'Pendiente' : null]
    );

    for (const item of detalles) {
      const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
      if (item.idTelefono) {
        await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [item.idTelefono]);
        await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idTelefono, idIngreso, cantidad, precioVenta, estado) VALUES ($1,$2,$3,$4,1,$5,'Activo')`, [codDetalle, codVenta, item.idTelefono, idIngreso, item.precioVenta]);
      } else if (item.idInventario) {
        await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
        await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idIngreso, cantidad, precioVenta, estado) VALUES ($1,$2,$3,$4,$5,$6,'Activo')`, [codDetalle, codVenta, item.idInventario, idIngreso, item.cantidad, item.precioVenta]);
      }
    }

    await updateArqueoBalance(idCaja, client);
    await client.query('COMMIT');
    res.status(201).json({ codVenta });
  } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// NUEVO: Endpoint para procesar el depósito de KrediYa
router.put('/ventas/:id/deposito-krediya', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        const { idCaja } = req.user;
        await client.query('BEGIN');

        // 1. Obtener datos de la venta original
        const vRes = await client.query('SELECT total, monto_financiera, monto_prima_efectivo FROM ventas WHERE codVenta = $1 AND es_krediya = TRUE', [codVenta]);
        if (vRes.rows.length === 0) throw new Error('Venta no encontrada');
        const v = vRes.rows[0];

        // 2. Calcular costo real pendiente
        // Obtenemos el costo real total sumando los detalles
        const cRes = await client.query(`
            SELECT SUM(COALESCE(t.precioCompra, i.precioCompra * dv.cantidad)) as real_cost
            FROM detalleventa dv
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN inventario i ON dv.idAccesorio = i.codInventario
            WHERE dv.idVenta = $1
        `, [codVenta]);
        const totalCostoReal = Number(cRes.rows[0].real_cost);
        
        // El costo que declaramos hoy es el total real menos lo que ya se declaró en la prima
        // Esto hace que: Ganancia Hoy = Monto Financiera - Costo Remanente.
        const montoDeposito = Number(v.monto_financiera);
        const costoRemanente = totalCostoReal - Number(v.monto_prima_efectivo);

        // 3. Crear el Ingreso Contable del Depósito (No afecta caja física necesariamente, pero sí rentabilidad)
        const idI = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado, subtipo_movimiento) 
             VALUES ($1, $2, $3, $4, $5, $6, 'Completada', 'KrediYa_Deposito')`,
            [idI, idCaja, `DEPOSITO KREDIYA - FACTURA #${codVenta}`, montoDeposito, costoRemanente, getLocalTimestamp()]
        );

        // 4. Actualizar estado de la venta
        await client.query("UPDATE ventas SET estado_pago_financiera = 'Depositado' WHERE codVenta = $1", [codVenta]);

        await client.query('COMMIT');
        res.json({ message: 'Depósito conciliado' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// ... (resto de endpoints PUT y DELETE se mantienen igual)

module.exports = router;
