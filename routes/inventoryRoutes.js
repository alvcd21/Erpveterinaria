
// inventoryRoutes.js — Rutas de soporte: proveedores, ubicaciones
// El catálogo de medicamentos está en medicamentosRoutes.js
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, withTenantContext } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const ADMIN_ROLE_NAMES = new Set(['administrador', 'admin', 'superadmin', 'super admin']);
const DESIGNER_PERMISSION = 'DISEÑAR_ETIQUETAS';

function requireSchemaDesignerAccess(req, res, next) {
    const role = String(req.user?.rol || '').toLowerCase();
    const permisos = Array.isArray(req.user?.permisos) ? req.user.permisos : [];
    if (ADMIN_ROLE_NAMES.has(role) || permisos.includes(DESIGNER_PERMISSION)) return next();
    return res.status(403).json({
        error: 'Acceso denegado: se requiere permiso para diseñar etiquetas',
        requiredPermission: DESIGNER_PERMISSION,
    });
}

// --- PROVEEDORES ---
router.get('/proveedores', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT codProveedor AS "codProveedor", nombre, telefono, direccion, correo, rtn, contacto
             FROM proveedores WHERE tenant_id = $1 ORDER BY nombre`,
            [req.tenantId]
        );
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/proveedores', authenticateToken, async (req, res) => {
    try {
        const { nombre, telefono, direccion, correo, rtn, contacto } = req.body;
        if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
        const id = await withTenantContext(req.tenantId, async (client) => {
            const newId = await generateNextId('proveedores', 'codProveedor', 'PROV', client);
            await client.query(
                `INSERT INTO proveedores (codProveedor, nombre, telefono, direccion, correo, rtn, contacto, fechaCreacion, tenant_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8)`,
                [newId, nombre, telefono || null, direccion || null, correo || null, rtn || null, contacto || null, req.tenantId]
            );
            return newId;
        });
        res.status(201).json({ message: 'Proveedor creado', codProveedor: id });
    } catch(e) { handleDbError(res, e); }
});

router.put('/proveedores/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, telefono, direccion, correo, rtn, contacto } = req.body;
        await pool.query(
            `UPDATE proveedores SET nombre=$1, telefono=$2, direccion=$3, correo=$4, rtn=$5, contacto=$6
             WHERE codProveedor=$7 AND tenant_id=$8`,
            [nombre, telefono || null, direccion || null, correo || null, rtn || null, contacto || null, req.params.id, req.tenantId]
        );
        res.json({ message: 'Proveedor actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/proveedores/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM proveedores WHERE codProveedor=$1 AND tenant_id=$2',
            [req.params.id, req.tenantId]
        );
        res.json({ message: 'Proveedor eliminado' });
    } catch(e) { handleDbError(res, e); }
});


// GET /api/schema — esquema para diseñador de etiquetas
router.get('/schema', authenticateToken, requireSchemaDesignerAccess, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT column_name AS field, data_type AS type, table_name AS "tableName"
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name IN ('medicamentos','clientes','ventas','detalleventa','lotes_medicamento')
            ORDER BY table_name, ordinal_position
        `);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
