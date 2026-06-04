'use strict';

const { pool, handleDbError } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');

function registerRoutes(router) {

    router.get('/medicamentos/:id/presentaciones', authenticateToken, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT * FROM presentaciones_venta WHERE id_medicamento = $1 AND activo = TRUE AND tenant_id = $2 ORDER BY factor_conversion ASC`,
                [req.params.id, req.tenantId]
            );
            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    router.post('/medicamentos/:id/presentaciones', authenticateToken, async (req, res) => {
        try {
            const { nombre, factor_conversion, descripcion_presentacion, precio_venta,
                    precio_tercera_edad, codigo_barras_presentacion, es_unidad_compra,
                    es_unidad_venta, permite_fraccion } = req.body;

            if (!nombre || !factor_conversion || precio_venta === undefined || precio_venta === null) {
                return res.status(400).json({ error: 'nombre, factor_conversion y precio_venta son requeridos' });
            }
            if (Number(factor_conversion) <= 0 || isNaN(Number(factor_conversion))) {
                return res.status(400).json({ error: 'factor_conversion debe ser un número mayor que cero' });
            }
            if (Number(precio_venta) < 0 || isNaN(Number(precio_venta))) {
                return res.status(400).json({ error: 'precio_venta no puede ser negativo' });
            }

            const r = await pool.query(`
                INSERT INTO presentaciones_venta
                    (id_medicamento, nombre, factor_conversion, descripcion_presentacion, precio_venta,
                     precio_tercera_edad, codigo_barras_presentacion, es_unidad_compra, es_unidad_venta, permite_fraccion, tenant_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                RETURNING id_presentacion
            `, [
                req.params.id, nombre, factor_conversion, descripcion_presentacion || null,
                precio_venta, precio_tercera_edad || null, codigo_barras_presentacion || null,
                es_unidad_compra || false, es_unidad_venta !== false, permite_fraccion || false,
                req.tenantId
            ]);
            res.status(201).json({ message: 'Presentación creada', id_presentacion: r.rows[0].id_presentacion });
        } catch (e) { handleDbError(res, e); }
    });

    router.put('/presentaciones/:id', authenticateToken, async (req, res) => {
        try {
            const { nombre, factor_conversion, descripcion_presentacion, precio_venta,
                    precio_tercera_edad, codigo_barras_presentacion, es_unidad_compra,
                    es_unidad_venta, permite_fraccion, activo } = req.body;

            if (factor_conversion !== undefined && (Number(factor_conversion) <= 0 || isNaN(Number(factor_conversion)))) {
                return res.status(400).json({ error: 'factor_conversion debe ser un número mayor que cero' });
            }
            if (precio_venta !== undefined && (Number(precio_venta) < 0 || isNaN(Number(precio_venta)))) {
                return res.status(400).json({ error: 'precio_venta no puede ser negativo' });
            }

            await pool.query(`
                UPDATE presentaciones_venta SET
                    nombre=$1, factor_conversion=$2, descripcion_presentacion=$3, precio_venta=$4,
                    precio_tercera_edad=$5, codigo_barras_presentacion=$6, es_unidad_compra=$7,
                    es_unidad_venta=$8, permite_fraccion=$9, activo=$10
                WHERE id_presentacion=$11 AND tenant_id=$12
            `, [
                nombre, factor_conversion, descripcion_presentacion || null, precio_venta,
                precio_tercera_edad || null, codigo_barras_presentacion || null,
                es_unidad_compra || false, es_unidad_venta !== false, permite_fraccion || false,
                activo !== false, req.params.id, req.tenantId
            ]);
            res.json({ message: 'Presentación actualizada' });
        } catch (e) { handleDbError(res, e); }
    });

    router.delete('/presentaciones/:id', authenticateToken, async (req, res) => {
        try {
            await pool.query(
                `UPDATE presentaciones_venta SET activo = FALSE WHERE id_presentacion = $1 AND tenant_id = $2`,
                [req.params.id, req.tenantId]
            );
            res.json({ message: 'Presentación desactivada' });
        } catch (e) { handleDbError(res, e); }
    });

}

module.exports = { registerRoutes };
