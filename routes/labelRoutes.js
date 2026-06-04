
const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Obtener todas las plantillas
router.get('/labels', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, category, type, data_source as "dataSource", is_default as "isDefault", width, height, elements FROM label_templates WHERE tenant_id = $1 ORDER BY created_at DESC',
            [req.tenantId]
        );
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// Obtener plantilla por defecto (filtrada por categoría si se especifica)
router.get('/labels/default', authenticateToken, async (req, res) => {
    try {
        const { category } = req.query;
        const params = [req.tenantId];
        let query = 'SELECT id, name, category, type, data_source as "dataSource", is_default as "isDefault", width, height, elements FROM label_templates WHERE is_default = TRUE AND tenant_id = $1';

        if (category) {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }

        // Si hay varios defaults (uno por categoría), priorizamos por la query category
        query += ' LIMIT 1';

        const result = await pool.query(query, params);

        // Si no encuentra por categoría específica, intentar buscar un GENERAL por defecto como fallback
        if (result.rows.length === 0 && category) {
            const fallback = await pool.query(
                'SELECT id, name, category, type, data_source as "dataSource", is_default as "isDefault", width, height, elements FROM label_templates WHERE is_default = TRUE AND category = $1 AND tenant_id = $2 LIMIT 1',
                ['GENERAL', req.tenantId]
            );
            return res.json(fallback.rows[0] || null);
        }

        res.json(result.rows[0] || null);
    } catch(e) { handleDbError(res, e); }
});

// Crear plantilla
router.post('/labels', authenticateToken, async (req, res) => {
    try {
        const { name, width, height, elements, isDefault, category, type, dataSource } = req.body;
        const cat = category || 'GENERAL';
        const docType = type || 'LABEL';
        const src = dataSource || 'NONE';

        if (isDefault) {
            await pool.query(
                'UPDATE label_templates SET is_default = FALSE WHERE category = $1 AND type = $2 AND tenant_id = $3',
                [cat, docType, req.tenantId]
            );
        }

        const result = await pool.query(
            `INSERT INTO label_templates (name, width, height, elements, is_default, category, type, data_source, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [name, width, height, JSON.stringify(elements), isDefault || false, cat, docType, src, req.tenantId]
        );

        res.status(201).json({ message: 'Plantilla guardada', id: result.rows[0].id });
    } catch(e) { handleDbError(res, e); }
});

// Actualizar plantilla
router.put('/labels/:id', authenticateToken, async (req, res) => {
    try {
        const { name, width, height, elements, isDefault, category, type, dataSource } = req.body;
        const cat = category || 'GENERAL';
        const docType = type || 'LABEL';
        const src = dataSource || 'NONE';

        if (isDefault) {
            await pool.query(
                'UPDATE label_templates SET is_default = FALSE WHERE category = $1 AND type = $2 AND tenant_id = $3',
                [cat, docType, req.tenantId]
            );
        }

        await pool.query(
            `UPDATE label_templates
             SET name=$1, width=$2, height=$3, elements=$4, is_default=$5, category=$6, type=$7, data_source=$8, updated_at=NOW()
             WHERE id=$9 AND tenant_id=$10`,
            [name, width, height, JSON.stringify(elements), isDefault || false, cat, docType, src, req.params.id, req.tenantId]
        );

        res.json({ message: 'Plantilla actualizada' });
    } catch(e) { handleDbError(res, e); }
});

// Eliminar plantilla
router.delete('/labels/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM label_templates WHERE id=$1 AND tenant_id=$2',
            [req.params.id, req.tenantId]
        );
        res.json({ message: 'Plantilla eliminada' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
