'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false } });

async function run() {
    const client = await pool.connect();
    try {
        // 1. Show tenants table + indexes
        const tenants = await client.query('SELECT * FROM tenants LIMIT 10');
        console.log('TENANTS:', tenants.rows);

        const tenantIdx = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tenants'`);
        console.log('TENANT INDEXES:', tenantIdx.rows);

        // 2. Show roles table + indexes
        const roles = await client.query('SELECT * FROM roles LIMIT 20');
        console.log('ROLES:', roles.rows);

        const rolesIdx = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'roles'`);
        console.log('ROLES INDEXES:', rolesIdx.rows);

        const rolesConstraints = await client.query(`
            SELECT conname, contype, pg_get_constraintdef(oid) AS def
            FROM pg_constraint WHERE conrelid = 'roles'::regclass
        `);
        console.log('ROLES CONSTRAINTS:', rolesConstraints.rows);

        // 3. Show usuarios constraints
        const usuariosConstraints = await client.query(`
            SELECT conname, contype, pg_get_constraintdef(oid) AS def
            FROM pg_constraint WHERE conrelid = 'usuarios'::regclass
        `);
        console.log('USUARIOS CONSTRAINTS:', usuariosConstraints.rows);

        // 4. Show configuracion constraints
        const configConstraints = await client.query(`
            SELECT conname, contype, pg_get_constraintdef(oid) AS def
            FROM pg_constraint WHERE conrelid = 'configuracion'::regclass
        `);
        console.log('CONFIGURACION CONSTRAINTS:', configConstraints.rows);

        // 5. Simulate registration step by step
        console.log('\n--- Simulating registration ---');
        await client.query('BEGIN');

        // Step 1: tenant INSERT
        let tenantId;
        try {
            const t = await client.query(
                `INSERT INTO tenants (slug, nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento)
                 VALUES ($1, $2, 'basico', 'prueba', 1, 5, 500, NOW() + INTERVAL '14 days')
                 RETURNING id`,
                ['test-diag-slug', 'Test Diagnóstico']
            );
            tenantId = t.rows[0].id;
            console.log('Step 1 TENANTS INSERT OK - id:', tenantId);
        } catch(e) {
            console.error('Step 1 TENANTS INSERT FAILED:', e.code, e.constraint, e.detail, e.message);
            await client.query('ROLLBACK');
            return;
        }

        // Step 2: configuracion INSERT
        try {
            await client.query(
                `INSERT INTO configuracion (id, tenant_id, nombreempresa, isv, descuento_tercera_edad, isv_tasa_general)
                 VALUES (DEFAULT, $1, $2, 15.00, 25.00, 15.00) ON CONFLICT DO NOTHING`,
                [tenantId, 'Test Diagnóstico']
            );
            console.log('Step 2 CONFIGURACION INSERT OK');
        } catch(e) {
            console.error('Step 2 CONFIGURACION INSERT FAILED:', e.code, e.constraint, e.detail, e.message);
            await client.query('ROLLBACK');
            return;
        }

        // Step 3: roles INSERT
        let adminRoleId;
        try {
            const r = await client.query(
                `INSERT INTO roles (nombre, tenant_id) VALUES ('Administrador', $1), ('Cajero', $1), ('Bodeguero', $1) RETURNING idrol, nombre`,
                [tenantId]
            );
            adminRoleId = r.rows.find(x => x.nombre === 'Administrador')?.idrol;
            console.log('Step 3 ROLES INSERT OK - adminRoleId:', adminRoleId);
        } catch(e) {
            console.error('Step 3 ROLES INSERT FAILED:', e.code, e.constraint, e.detail, e.message);
            await client.query('ROLLBACK');
            return;
        }

        // Step 4: rol_permisos INSERT
        try {
            await client.query(
                `INSERT INTO rol_permisos (idRol, idPermiso) SELECT $1, idPermiso FROM permisos ON CONFLICT DO NOTHING`,
                [adminRoleId]
            );
            console.log('Step 4 ROL_PERMISOS INSERT OK');
        } catch(e) {
            console.error('Step 4 ROL_PERMISOS INSERT FAILED:', e.code, e.constraint, e.detail, e.message);
            await client.query('ROLLBACK');
            return;
        }

        // Step 5: usuario INSERT
        try {
            const bcrypt = require('bcryptjs');
            const hashed = await bcrypt.hash('TestPass123!', 12);
            await client.query(
                `INSERT INTO usuarios (usuario, password, idrol, estado, tenant_id, requires_password_change) VALUES ($1, $2, $3, 'Activo', $4, FALSE)`,
                ['admin@test-diag.com', hashed, adminRoleId, tenantId]
            );
            console.log('Step 5 USUARIOS INSERT OK');
        } catch(e) {
            console.error('Step 5 USUARIOS INSERT FAILED:', e.code, e.constraint, e.detail, e.message);
            await client.query('ROLLBACK');
            return;
        }

        // Step 6: sucursales INSERT
        try {
            await client.query(
                `INSERT INTO sucursales (codigo, nombre, estado, tenant_id) VALUES ('SUC-001', 'Sucursal Principal', 'Activa', $1) ON CONFLICT DO NOTHING`,
                [tenantId]
            );
            console.log('Step 6 SUCURSALES INSERT OK');
        } catch(e) {
            console.error('Step 6 SUCURSALES INSERT FAILED:', e.code, e.constraint, e.detail, e.message);
            await client.query('ROLLBACK');
            return;
        }

        await client.query('ROLLBACK'); // Roll back so we don't actually insert test data
        console.log('\n All steps passed. Rolled back test data.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
