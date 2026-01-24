
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- REPARACIONES ---
// (Mantiene código existente sin cambios)

// --- GARANTÍAS Y DEVOLUCIONES ---

router.get('/garantias', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                g.id_garantia, 
                g.cod_venta, 
                g.id_producto_original, 
                g.tipo_producto, 
                g.falla_reportada, 
                g.estado_garantia, 
                g.fecha_ingreso, 
                g.fecha_resolucion, 
                g.costo_original, 
                g.precio_venta_original, 
                g.observaciones, 
                g.identidad_cliente,
                COALESCE(c.nombre || ' ' || c.apellido, 'CONSUMIDOR FINAL') as "nombre_cliente"
            FROM garantias g
            LEFT JOIN clientes c ON g.identidad_cliente = c.identidad
            ORDER BY g.fecha_ingreso DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/garantias', authenticateToken, async (req, res) => {
    try {
        const { cod_venta, id_producto_original, tipo_producto, falla_reportada, costo_original, precio_venta_original, observaciones, identidad_cliente } = req.body;
        
        await pool.query(
            `INSERT INTO garantias (cod_venta, id_producto_original, tipo_producto, falla_reportada, costo_original, precio_venta_original, observaciones, identidad_cliente, estado_garantia)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pendiente')`,
            [cod_venta, id_producto_original, tipo_producto, falla_reportada, costo_original, precio_venta_original, observaciones, identidad_cliente]
        );

        // Al entrar a garantía, el equipo sale de circulación
        if (tipo_producto === 'TELEFONO') {
            await pool.query("UPDATE telefonos SET estado = 'Garantia' WHERE codigo = $1", [id_producto_original]);
        }
        
        res.status(201).json({ message: 'Ingreso a garantía registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/garantias/:id', authenticateToken, async (req, res) => {
    try {
        const { estado_garantia, observaciones, fecha_resolucion } = req.body;
        await pool.query(
            `UPDATE garantias SET estado_garantia=$1, observaciones=$2, fecha_resolucion=$3 WHERE id_garantia=$4`,
            [estado_garantia, observaciones, fecha_resolucion || null, req.params.id]
        );
        res.json({ message: 'Garantía actualizada' });
    } catch(e) { handleDbError(res, e); }
});

router.post('/garantias/:id/exchange', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idNuevoProducto, tipoNuevo, diferenciaEfectivo, utilidadDiferencia, descripcionGastoIngreso, estadoRetorno } = req.body;
        const { idCaja } = req.user;
        const idGarantia = req.params.id;
        const hndTime = getLocalTimestamp();

        await client.query('BEGIN');

        const gRes = await client.query("SELECT * FROM garantias WHERE id_garantia = $1", [idGarantia]);
        const g = gRes.rows[0];

        // 1. Actualizar estado del equipo devuelto según decisión del usuario
        if (g.tipo_producto === 'TELEFONO') {
            // estadoRetorno puede ser 'Disponible' o 'Defectuoso'
            await client.query("UPDATE telefonos SET estado = $1 WHERE codigo = $2", [estadoRetorno, g.id_producto_original]);
        }

        // 2. Marcar equipo nuevo como vendido
        if (tipoNuevo === 'TELEFONO') {
            await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [idNuevoProducto]);
        } else {
            await client.query("UPDATE inventario SET cantidad = cantidad - 1 WHERE codInventario = $1", [idNuevoProducto]);
        }

        // 3. Registrar movimiento financiero
        if (utilidadDiferencia > 0) {
            const idI = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
            await client.query(
                `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado)
                 VALUES ($1, $2, $3, $4, 0, 'Ajuste Utilidad Cambio', $5, 'Completada')`,
                [idI, idCaja, `UTILIDAD CAMBIO GARANTIA: ${descripcionGastoIngreso}`, utilidadDiferencia, hndTime]
            );
        } else if (utilidadDiferencia < 0) {
            const idE = await generateNextId('egresos', 'idegresos', 'EGRE', client);
            await client.query(
                `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, categoria, fechaCreacion, estado)
                 VALUES ($1, $2, $3, $4, 'Perdida Margen Garantia', $5, 'Completada')`,
                [idE, idCaja, `PERDIDA GARANTIA: ${descripcionGastoIngreso}`, Math.abs(utilidadDiferencia), hndTime]
            );
        }

        // 4. Cerrar Garantía
        await client.query(
            "UPDATE garantias SET estado_garantia = 'Cambiado', fecha_resolucion = $1, observaciones = $2 WHERE id_garantia = $3",
            [hndTime, `CAMBIO POR: ${idNuevoProducto}. EL EQUIPO ANTERIOR QUEDÓ COMO: ${estadoRetorno}`, idGarantia]
        );

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Intercambio procesado con éxito' });

    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.delete('/garantias/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM garantias WHERE id_garantia = $1', [req.params.id]);
        res.json({ message: 'Eliminado con éxito' });
    } catch(e) { handleDbError(res, e); }
});

// --- CONSIGNACIONES ---
// (Mantiene código existente sin cambios)

module.exports = router;
