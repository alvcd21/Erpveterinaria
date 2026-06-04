
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, withTenantContext } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/recetas
router.get('/recetas', authenticateToken, async (req, res) => {
    try {
        const { estado, id_cliente, id_sucursal, fecha_desde, fecha_hasta } = req.query;
        let where = 'WHERE 1=1';
        const params = [];

        params.push(req.tenantId);
        where += ` AND r.tenant_id = $${params.length}`;

        if (estado)      { params.push(estado);      where += ` AND r.estado = $${params.length}`; }
        if (id_cliente)  { params.push(id_cliente);  where += ` AND r.id_cliente = $${params.length}`; }
        if (id_sucursal) { params.push(id_sucursal); where += ` AND r.id_sucursal = $${params.length}`; }
        if (fecha_desde) { params.push(fecha_desde); where += ` AND r.fecha_emision >= $${params.length}`; }
        if (fecha_hasta) { params.push(fecha_hasta); where += ` AND r.fecha_emision <= $${params.length}`; }

        const result = await pool.query(`
            SELECT
                r.*,
                c.nombre || ' ' || COALESCE(c.apellido, '') AS "nombreCliente",
                c.telefono AS "telefonoCliente",
                COUNT(dr.id) AS "totalItems",
                SUM(dr.cantidad_dispensada) AS "totalDispensado"
            FROM recetas r
            LEFT JOIN clientes c ON r.id_cliente = c.identidad AND c.tenant_id = $1
            LEFT JOIN detalle_receta dr ON r.codigo = dr.id_receta
            ${where}
            GROUP BY r.codigo, c.nombre, c.apellido, c.telefono
            ORDER BY r.fecha_registro DESC
            LIMIT 200
        `, params);

        res.json(result.rows);
    } catch (e) { handleDbError(res, e); }
});

// GET /api/recetas/:id — detalle completo
router.get('/recetas/:id', authenticateToken, async (req, res) => {
    try {
        const [recetaResult, detalleResult] = await Promise.all([
            pool.query(`
                SELECT r.*, c.nombre || ' ' || COALESCE(c.apellido,'') AS "nombreCliente",
                       c.telefono AS "telefonoCliente", c.fecha_nacimiento AS "fechaNacimientoCliente"
                FROM recetas r
                LEFT JOIN clientes c ON r.id_cliente = c.identidad AND c.tenant_id = $2
                WHERE r.codigo = $1 AND r.tenant_id = $2
            `, [req.params.id, req.tenantId]),
            pool.query(`
                SELECT dr.*, m.nombre_generico AS "nombreGenerico", m.nombre_comercial AS "nombreComercial",
                       m.concentracion, m.tipo_isv AS "tipoIsv"
                FROM detalle_receta dr
                LEFT JOIN medicamentos m ON dr.id_medicamento = m.codigo AND m.tenant_id = $2
                WHERE dr.id_receta = $1 AND dr.tenant_id = $2
                ORDER BY dr.id
            `, [req.params.id, req.tenantId])
        ]);

        if (recetaResult.rows.length === 0) return res.status(404).json({ error: 'Receta no encontrada' });

        res.json({ ...recetaResult.rows[0], detalle: detalleResult.rows });
    } catch (e) { handleDbError(res, e); }
});

// POST /api/recetas — crear receta (con foto de respaldo)
router.post('/recetas', authenticateToken, async (req, res) => {
    try {
        const {
            id_cliente, nombre_medico, numero_colegiado, especialidad,
            telefono_medico, clinica_hospital, fecha_emision,
            tipo_receta, diagnostico, imagen_url, imagen_base64,
            id_sucursal, notas, detalle
        } = req.body;

        if (!fecha_emision) return res.status(400).json({ error: 'fecha_emision es requerida' });

        // Fecha de vencimiento: +30 días para normal, +60 para crónica, +0 para controlada (retención inmediata)
        const diasVigencia = tipo_receta === 'Cronica' ? 60 : 30;
        const fechaVencimiento = new Date(fecha_emision);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + diasVigencia);

        const codigo = await withTenantContext(req.tenantId, async (client) => {
            const id = await generateNextId('recetas', 'codigo', 'REC', client);

            await client.query(`
                INSERT INTO recetas (
                    codigo, id_cliente, nombre_medico, numero_colegiado, especialidad,
                    telefono_medico, clinica_hospital, fecha_emision, fecha_vencimiento,
                    tipo_receta, diagnostico, imagen_url, imagen_base64,
                    estado, id_sucursal, registrado_por, notas, tenant_id
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Pendiente',$14,$15,$16,$17)
            `, [
                id, id_cliente || null, nombre_medico || null, numero_colegiado || null,
                especialidad || null, telefono_medico || null, clinica_hospital || null,
                fecha_emision, fechaVencimiento.toISOString().substring(0,10),
                tipo_receta || 'Normal', diagnostico || null, imagen_url || null, imagen_base64 || null,
                id_sucursal || req.user.id_sucursal || null, req.user.codUsuario, notas || null,
                req.tenantId
            ]);

            if (detalle && Array.isArray(detalle)) {
                for (const item of detalle) {
                    await client.query(`
                        INSERT INTO detalle_receta (id_receta, id_medicamento, nombre_prescrito, dosis_prescrita, cantidad_prescrita, unidad_prescrita, tenant_id)
                        VALUES ($1,$2,$3,$4,$5,$6,$7)
                    `, [id, item.id_medicamento || null, item.nombre_prescrito || null,
                        item.dosis_prescrita || null, item.cantidad_prescrita || 1, item.unidad_prescrita || null,
                        req.tenantId]);
                }
            }

            return id;
        });

        res.status(201).json({ message: 'Receta registrada', codigo });
    } catch (e) { handleDbError(res, e); }
});

// PUT /api/recetas/:id — actualizar cabecera
router.put('/recetas/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre_medico, numero_colegiado, especialidad, telefono_medico,
                clinica_hospital, diagnostico, imagen_url, imagen_base64, notas, estado } = req.body;

        await pool.query(`
            UPDATE recetas SET
                nombre_medico=$1, numero_colegiado=$2, especialidad=$3, telefono_medico=$4,
                clinica_hospital=$5, diagnostico=$6, imagen_url=$7, imagen_base64=$8,
                notas=$9, estado=COALESCE($10, estado)
            WHERE codigo=$11 AND tenant_id=$12
        `, [nombre_medico, numero_colegiado, especialidad, telefono_medico,
            clinica_hospital, diagnostico, imagen_url, imagen_base64, notas, estado || null, req.params.id, req.tenantId]);

        res.json({ message: 'Receta actualizada' });
    } catch (e) { handleDbError(res, e); }
});

// POST /api/recetas/:id/dispensar — dispensar medicamento de receta (FEFO)
router.post('/recetas/:id/dispensar', authenticateToken, async (req, res) => {
    const { id_detalle, cantidad_a_dispensar, id_sucursal } = req.body;
    if (!id_detalle || !cantidad_a_dispensar) {
        return res.status(400).json({ error: 'id_detalle y cantidad_a_dispensar son requeridos' });
    }

    try {
        const { id_lote_usado, estado_receta } = await withTenantContext(req.tenantId, async (client) => {
            // Obtener receta y verificar vigencia
            const recetaR = await client.query(
                `SELECT r.*, dr.id_medicamento, dr.cantidad_prescrita, dr.cantidad_dispensada, dr.unidad_prescrita
                 FROM recetas r
                 JOIN detalle_receta dr ON r.codigo = dr.id_receta
                 WHERE r.codigo = $1 AND dr.id = $2 AND r.tenant_id = $3`,
                [req.params.id, id_detalle, req.tenantId]
            );
            if (recetaR.rows.length === 0) throw Object.assign(new Error('Receta o ítem no encontrado'), { statusCode: 404 });

            const receta = recetaR.rows[0];
            if (receta.estado === 'Vencida' || new Date(receta.fecha_vencimiento) < new Date()) {
                throw Object.assign(new Error('Receta vencida'), { statusCode: 400 });
            }

            const pendiente = Number(receta.cantidad_prescrita) - Number(receta.cantidad_dispensada);
            if (cantidad_a_dispensar > pendiente) {
                throw Object.assign(new Error(`Solo hay ${pendiente} unidades pendientes de dispensar`), { statusCode: 400 });
            }

            // FEFO: seleccionar lote que vence primero
            const loteR = await client.query(`
                SELECT id_lote, cantidad_actual FROM lotes_medicamento
                WHERE id_medicamento = $1 AND estado = 'Activo' AND cantidad_actual >= $2
                  AND ($3::int IS NULL OR id_sucursal = $3)
                  AND tenant_id = $4
                ORDER BY fecha_vencimiento ASC
                LIMIT 1
            `, [receta.id_medicamento, cantidad_a_dispensar, id_sucursal || null, req.tenantId]);

            if (loteR.rows.length === 0) {
                throw Object.assign(new Error('Stock insuficiente para dispensar esta cantidad'), { statusCode: 400 });
            }

            const lote = loteR.rows[0];

            // Descontar del lote
            await client.query(
                `UPDATE lotes_medicamento SET cantidad_actual = cantidad_actual - $1 WHERE id_lote = $2 AND tenant_id = $3`,
                [cantidad_a_dispensar, lote.id_lote, req.tenantId]
            );

            // Actualizar detalle de receta
            await client.query(`
                UPDATE detalle_receta
                SET cantidad_dispensada = cantidad_dispensada + $1,
                    fecha_ultima_dispensacion = CURRENT_DATE,
                    estado = CASE WHEN (cantidad_dispensada + $1) >= cantidad_prescrita THEN 'Dispensado' ELSE 'Parcial' END
                WHERE id = $2 AND tenant_id = $3
            `, [cantidad_a_dispensar, id_detalle, req.tenantId]);

            // Verificar si toda la receta fue dispensada
            const pendienteTotal = await client.query(`
                SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE estado = 'Dispensado') AS dispensados
                FROM detalle_receta WHERE id_receta = $1 AND tenant_id = $2
            `, [req.params.id, req.tenantId]);

            const { total, dispensados } = pendienteTotal.rows[0];
            const nuevoEstado = Number(dispensados) === Number(total) ? 'Dispensada' : 'Parcial';
            await client.query(`UPDATE recetas SET estado = $1 WHERE codigo = $2 AND tenant_id = $3`, [nuevoEstado, req.params.id, req.tenantId]);

            // Kardex
            await client.query(`
                INSERT INTO kardex_inventario (tipo_producto, cod_medicamento, id_lote, tipo_movimiento, cantidad, referencia_doc, registrado_por, observaciones, tenant_id)
                VALUES ('MEDICAMENTO', $1, $2, 'Dispensacion Receta', $3, $4, $5, $6, $7)
            `, [receta.id_medicamento, lote.id_lote, cantidad_a_dispensar, req.params.id, req.user.codUsuario, `Dispensación receta ${req.params.id}`, req.tenantId]);

            return { id_lote_usado: lote.id_lote, estado_receta: nuevoEstado };
        });

        res.json({ message: 'Dispensado correctamente', id_lote_usado, estado_receta });
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

// GET /api/recetas-retenidas — listado de recetas retenidas (controlados)
router.get('/recetas-retenidas', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT rr.*, r.codigo AS "codigoReceta", r.nombre_medico AS "nombreMedico",
                   c.nombre || ' ' || COALESCE(c.apellido,'') AS "nombrePaciente"
            FROM recetas_retenidas rr
            JOIN recetas r ON rr.id_receta = r.codigo
            LEFT JOIN clientes c ON r.id_cliente = c.identidad AND c.tenant_id = $1
            WHERE rr.tenant_id = $1
            ORDER BY rr.fecha_retencion DESC
        `, [req.tenantId]);
        res.json(r.rows);
    } catch (e) { handleDbError(res, e); }
});

// GET /api/libro-psicofarmacos — registro legal JNCD
router.get('/libro-psicofarmacos', authenticateToken, async (req, res) => {
    try {
        const { id_medicamento, fecha_desde, fecha_hasta } = req.query;
        let where = 'WHERE 1=1';
        const params = [];

        params.push(req.tenantId);
        where += ` AND lp.tenant_id = $${params.length}`;

        if (id_medicamento) { params.push(id_medicamento); where += ` AND lp.id_medicamento = $${params.length}`; }
        if (fecha_desde)    { params.push(fecha_desde);    where += ` AND lp.fecha_movimiento >= $${params.length}`; }
        if (fecha_hasta)    { params.push(fecha_hasta);    where += ` AND lp.fecha_movimiento <= $${params.length}`; }

        const r = await pool.query(`
            SELECT lp.*, m.nombre_generico AS "nombreMedicamento", m.clase_controlado AS "claseControlado"
            FROM libro_psicofarmacos lp
            JOIN medicamentos m ON lp.id_medicamento = m.codigo AND m.tenant_id = $1
            ${where}
            ORDER BY lp.fecha_movimiento DESC
        `, params);

        res.json(r.rows);
    } catch (e) { handleDbError(res, e); }
});

module.exports = router;
