'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const TENANT_SLUG = 'farmasas';

async function run() {
    const client = await pool.connect();
    try {
        // 1. Get the farmasas tenant ID
        const tenantRes = await client.query('SELECT id FROM tenants WHERE slug = $1', [TENANT_SLUG]);
        if (!tenantRes.rows.length) {
            throw new Error(`Tenant '${TENANT_SLUG}' not found. Run create_first_tenant.js first.`);
        }
        const TENANT_ID = tenantRes.rows[0].id;
        console.log(`Tenant ID: ${TENANT_ID}`);

        await client.query('BEGIN');

        // 2. Add tenant_id column to all tables that are missing it
        const tablesToMigrate = [
            'lotes_medicamento',
            'empleado',
            'clientes',
            'caja',
            'arqueo',
            'proveedores',
            'categorias_terapeuticas',
            'formas_farmaceuticas',
            'presentaciones_venta',
            'medicamento_imagenes',
            'ordenes_compra',
            'detalle_orden_compra',
            'transferencias_sucursal',
            'recetas',
            'detalle_receta',
            'label_templates',
            'detalleventa',
        ];

        for (const table of tablesToMigrate) {
            await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID`);
            console.log(`  Added tenant_id to ${table}`);
        }

        // 3. Assign all existing data (tenant_id IS NULL) to farmasas tenant
        const updates = [
            // Tables with direct tenant_id column
            'lotes_medicamento', 'empleado', 'clientes', 'caja', 'arqueo',
            'proveedores', 'categorias_terapeuticas', 'formas_farmaceuticas',
            'presentaciones_venta', 'ordenes_compra', 'recetas', 'label_templates',
            // Already had tenant_id
            'medicamentos', 'sucursales', 'ventas', 'roles',
        ];

        for (const table of updates) {
            const r = await client.query(
                `UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`,
                [TENANT_ID]
            );
            if (r.rowCount > 0) console.log(`  Migrated ${r.rowCount} rows in ${table}`);
        }

        // Tables that inherit tenant from parent (keep NULL or use parent's tenant)
        // detalleventa → ventas
        const dv = await client.query(
            `UPDATE detalleventa dv SET tenant_id = v.tenant_id
             FROM ventas v WHERE dv.idVenta = v.codVenta AND dv.tenant_id IS NULL`
        );
        if (dv.rowCount > 0) console.log(`  Migrated ${dv.rowCount} rows in detalleventa via ventas`);

        // detalle_orden_compra → ordenes_compra
        const doc = await client.query(
            `UPDATE detalle_orden_compra doc SET tenant_id = oc.tenant_id
             FROM ordenes_compra oc WHERE doc.id_orden = oc.codigo AND doc.tenant_id IS NULL`
        );
        if (doc.rowCount > 0) console.log(`  Migrated ${doc.rowCount} rows in detalle_orden_compra via ordenes_compra`);

        // detalle_receta → recetas
        const dr = await client.query(
            `UPDATE detalle_receta dr SET tenant_id = r.tenant_id
             FROM recetas r WHERE dr.id_receta = r.codigo AND dr.tenant_id IS NULL`
        );
        if (dr.rowCount > 0) console.log(`  Migrated ${dr.rowCount} rows in detalle_receta via recetas`);

        // transferencias_sucursal → via id_sucursal_origen
        const ts = await client.query(
            `UPDATE transferencias_sucursal ts SET tenant_id = s.tenant_id
             FROM sucursales s WHERE ts.id_sucursal_origen = s.id_sucursal AND ts.tenant_id IS NULL`
        );
        if (ts.rowCount > 0) console.log(`  Migrated ${ts.rowCount} rows in transferencias_sucursal`);

        // medicamento_imagenes → medicamentos
        const mi = await client.query(
            `UPDATE medicamento_imagenes mi SET tenant_id = m.tenant_id
             FROM medicamentos m WHERE mi.id_medicamento = m.codigo AND mi.tenant_id IS NULL`
        );
        if (mi.rowCount > 0) console.log(`  Migrated ${mi.rowCount} rows in medicamento_imagenes`);

        // 4. Check roles for farmasas tenant
        const rolesCheck = await client.query(
            `SELECT idrol, nombre FROM roles WHERE tenant_id = $1 ORDER BY nombre`,
            [TENANT_ID]
        );
        console.log('\nRoles for farmasas:', rolesCheck.rows);

        // Ensure all 3 roles exist for farmasas
        const existingRoleNames = rolesCheck.rows.map(r => r.nombre);
        const neededRoles = ['Administrador', 'Cajero', 'Bodeguero'];
        for (const rolName of neededRoles) {
            if (!existingRoleNames.includes(rolName)) {
                const nr = await client.query(
                    `INSERT INTO roles (nombre, tenant_id) VALUES ($1, $2) RETURNING idrol, nombre`,
                    [rolName, TENANT_ID]
                );
                console.log(`  Created missing role: ${rolName} (idrol: ${nr.rows[0].idrol})`);
                rolesCheck.rows.push(nr.rows[0]);
            }
        }

        // Assign all permissions to Administrador role of farmasas
        const adminRole = rolesCheck.rows.find(r => r.nombre === 'Administrador');
        if (adminRole) {
            await client.query(
                `INSERT INTO rol_permisos (idRol, idPermiso)
                 SELECT $1, idPermiso FROM permisos ON CONFLICT DO NOTHING`,
                [adminRole.idrol]
            );
            console.log(`  Permissions assigned to Administrador (idrol: ${adminRole.idrol})`);
        }

        const cajeroRole = rolesCheck.rows.find(r => r.nombre === 'Cajero');

        // 5. Migrate existing users to farmasas tenant
        const usersToMigrate = await client.query(
            `SELECT codusuario, usuario, idrol FROM usuarios WHERE tenant_id IS NULL`
        );
        console.log('\nUsers to migrate:', usersToMigrate.rows.map(u => u.usuario));

        for (const user of usersToMigrate.rows) {
            // Assign role: admin-like users get Administrador, others get Cajero
            const isAdmin = ['admin', 'superadmin', 'administrador'].includes(user.usuario.toLowerCase())
                || user.idrol <= 4; // old global admin roles had low IDs
            const newRoleId = isAdmin ? adminRole?.idrol : (cajeroRole?.idrol || adminRole?.idrol);

            await client.query(
                `UPDATE usuarios SET tenant_id = $1, idrol = $2 WHERE codusuario = $3`,
                [TENANT_ID, newRoleId, user.codusuario]
            );
            console.log(`  Migrated user '${user.usuario}' → tenant farmasas, role ${isAdmin ? 'Administrador' : 'Cajero'} (idrol: ${newRoleId})`);
        }

        // 6. Update configuracion to link to farmasas
        await client.query(`UPDATE configuracion SET tenant_id = $1 WHERE id = 1`, [TENANT_ID]);
        console.log('\nConfiguracion linked to farmasas');

        await client.query('COMMIT');
        console.log('\n=== MIGRATION COMPLETE ===');
        console.log('All existing data migrated to tenant: farmasas');
        console.log('\nAvailable users:');
        const finalUsers = await client.query(
            `SELECT u.usuario, r.nombre as rol, u.estado
             FROM usuarios u LEFT JOIN roles r ON u.idrol = r.idrol
             WHERE u.tenant_id = $1 ORDER BY u.usuario`,
            [TENANT_ID]
        );
        finalUsers.rows.forEach(u => console.log(`  - ${u.usuario} (${u.rol}) [${u.estado}]`));
        console.log('\nLogin con cualquiera de estos usuarios usando el código: farmasas');

    } catch(e) {
        await client.query('ROLLBACK');
        console.error('ERROR:', e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
