'use strict';

const { pool, handleDbError } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');

function registerRoutes(router) {

    router.get('/categorias-terapeuticas', authenticateToken, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT * FROM categorias_terapeuticas WHERE activo = TRUE AND tenant_id = $1 ORDER BY nombre`,
                [req.tenantId]
            );
            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    router.post('/categorias-terapeuticas', authenticateToken, async (req, res) => {
        try {
            const { nombre, descripcion, codigo_atc_nivel1 } = req.body;
            if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
            const r = await pool.query(
                `INSERT INTO categorias_terapeuticas (nombre, descripcion, codigo_atc_nivel1, tenant_id) VALUES ($1,$2,$3,$4) RETURNING id_categoria`,
                [nombre, descripcion || null, codigo_atc_nivel1 || null, req.tenantId]
            );
            res.status(201).json({ message: 'Categoría creada', id_categoria: r.rows[0].id_categoria });
        } catch (e) { handleDbError(res, e); }
    });

    router.put('/categorias-terapeuticas/:id', authenticateToken, async (req, res) => {
        try {
            const { nombre, descripcion, activo } = req.body;
            await pool.query(
                `UPDATE categorias_terapeuticas SET nombre=$1, descripcion=$2, activo=$3 WHERE id_categoria=$4 AND tenant_id=$5`,
                [nombre, descripcion || null, activo !== false, req.params.id, req.tenantId]
            );
            res.json({ message: 'Categoría actualizada' });
        } catch (e) { handleDbError(res, e); }
    });

    router.get('/formas-farmaceuticas', authenticateToken, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT * FROM formas_farmaceuticas WHERE activo = TRUE AND tenant_id = $1 ORDER BY nombre`,
                [req.tenantId]
            );
            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    router.get('/principios-activos', authenticateToken, async (req, res) => {
        try {
            const { q } = req.query;
            let sql = `SELECT * FROM principios_activos`;
            const params = [];
            if (q) { params.push(`%${q}%`); sql += ` WHERE LOWER(nombre_dci) LIKE LOWER($1)`; }
            sql += ` ORDER BY nombre_dci LIMIT 50`;
            const r = await pool.query(sql, params);
            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

}

module.exports = { registerRoutes };
