'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Edit these values as needed
const SLUG = 'farmasas';
const NOMBRE_EMPRESA = 'Farmacia Farmasas';
const ADMIN_EMAIL = 'admin@farmasas.com';
const ADMIN_PASSWORD = 'Admin1234!';
const PLAN = 'profesional';

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create tenant
        const t = await client.query(
            `INSERT INTO tenants (slug, nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento)
             VALUES ($1, $2, $3, 'activo', 5, 20, 5000, NOW() + INTERVAL '365 days')
             ON CONFLICT (slug) DO UPDATE SET nombre_empresa = EXCLUDED.nombre_empresa
             RETURNING id, slug, nombre_empresa, plan, estado`,
            [SLUG, NOMBRE_EMPRESA, PLAN]
        );
        const tenant = t.rows[0];
        console.log('Tenant:', tenant);

        // 2. Create roles for this tenant
        const rolesResult = await client.query(
            `INSERT INTO roles (nombre, tenant_id)
             VALUES ('Administrador', $1), ('Cajero', $1), ('Bodeguero', $1)
             ON CONFLICT DO NOTHING
             RETURNING idrol, nombre`,
            [tenant.id]
        );

        // If conflict, fetch existing roles for this tenant
        let adminRole = rolesResult.rows.find(r => r.nombre === 'Administrador');
        if (!adminRole) {
            const existing = await client.query(
                `SELECT idrol, nombre FROM roles WHERE tenant_id = $1 AND nombre = 'Administrador'`,
                [tenant.id]
            );
            adminRole = existing.rows[0];
        }
        console.log('Admin role:', adminRole);

        // 3. All permissions for Administrador
        if (adminRole) {
            await client.query(
                `INSERT INTO rol_permisos (idRol, idPermiso)
                 SELECT $1, idPermiso FROM permisos ON CONFLICT DO NOTHING`,
                [adminRole.idrol]
            );
            console.log('Permissions assigned');
        }

        // 4. Create admin user (upsert by email)
        const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
        const userResult = await client.query(
            `INSERT INTO usuarios (usuario, password, idrol, estado, tenant_id, requires_password_change)
             VALUES ($1, $2, $3, 'Activo', $4, FALSE)
             ON CONFLICT (usuario) DO UPDATE
               SET password = EXCLUDED.password,
                   idrol = EXCLUDED.idrol,
                   tenant_id = EXCLUDED.tenant_id,
                   estado = 'Activo'
             RETURNING codusuario, usuario`,
            [ADMIN_EMAIL, hashed, adminRole?.idrol, tenant.id]
        );
        console.log('Admin user:', userResult.rows[0]);

        // 5. Create sucursal
        await client.query(
            `INSERT INTO sucursales (codigo, nombre, estado, tenant_id)
             VALUES ('SUC-001', 'Sucursal Principal', 'Activa', $1)
             ON CONFLICT DO NOTHING`,
            [tenant.id]
        );
        console.log('Sucursal created');

        // 6. Create configuracion for this tenant
        await client.query(
            `INSERT INTO configuracion (tenant_id, nombreempresa, isv, descuento_tercera_edad, isv_tasa_general)
             VALUES ($1, $2, 15.00, 25.00, 15.00)
             ON CONFLICT (tenant_id) DO NOTHING`,
            [tenant.id, NOMBRE_EMPRESA]
        );
        console.log('Configuracion created for tenant');

        await client.query('COMMIT');

        console.log('\n=== TENANT CREATED SUCCESSFULLY ===');
        console.log(`Codigo de farmacia (slug): ${tenant.slug}`);
        console.log(`Email de admin:            ${ADMIN_EMAIL}`);
        console.log(`Password:                  ${ADMIN_PASSWORD}`);
        console.log('===================================\n');

    } catch(e) {
        await client.query('ROLLBACK');
        console.error('ERROR:', e.code, e.constraint, e.detail, e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
