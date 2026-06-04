'use strict';
/**
 * Complete multi-tenant migration:
 * 1. configuracion  — drop CHECK(id=1), add sequence, UNIQUE(tenant_id)
 * 2. sucursales     — UNIQUE(codigo) → UNIQUE(codigo, tenant_id)
 * 3. clientes       — change PK from identidad to BIGSERIAL id, UNIQUE(identidad, tenant_id)
 * 4. empleado       — change PK from identidad to BIGSERIAL id, UNIQUE(identidad, tenant_id)
 *                     drop FK from usuarios and ventas/recetas that referenced old PKs
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ─── 1. configuracion ──────────────────────────────────────────────────
        console.log('\n[1/4] Fixing configuracion table...');

        // Drop the single-row CHECK constraint
        await client.query(`ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS single_row`);
        console.log('  ✓ Dropped CHECK(id=1)');

        // Create a sequence and attach it as the column default
        await client.query(`CREATE SEQUENCE IF NOT EXISTS configuracion_id_seq`);
        // Sync sequence to current max so next value doesn't conflict
        await client.query(`
            SELECT setval('configuracion_id_seq', COALESCE((SELECT MAX(id) FROM configuracion), 0) + 1, false)
        `);
        await client.query(`ALTER TABLE configuracion ALTER COLUMN id SET DEFAULT nextval('configuracion_id_seq')`);
        console.log('  ✓ Column id now uses sequence');

        // Add UNIQUE(tenant_id) so each tenant has exactly one config row
        await client.query(`
            ALTER TABLE configuracion
                ADD CONSTRAINT configuracion_tenant_unique UNIQUE(tenant_id)
        `).catch(e => {
            if (e.code === '42710') { console.log('  (configuracion_tenant_unique already exists)'); }
            else throw e;
        });
        console.log('  ✓ Added UNIQUE(tenant_id)');

        // ─── 2. sucursales ─────────────────────────────────────────────────────
        console.log('\n[2/4] Fixing sucursales.codigo unique constraint...');

        await client.query(`ALTER TABLE sucursales DROP CONSTRAINT IF EXISTS sucursales_codigo_key`);
        console.log('  ✓ Dropped global UNIQUE(codigo)');

        await client.query(`
            ALTER TABLE sucursales
                ADD CONSTRAINT sucursales_codigo_tenant_unique UNIQUE(codigo, tenant_id)
        `).catch(e => {
            if (e.code === '42710') { console.log('  (sucursales_codigo_tenant_unique already exists)'); }
            else throw e;
        });
        console.log('  ✓ Added UNIQUE(codigo, tenant_id)');

        // ─── 3. clientes ────────────────────────────────────────────────────────
        console.log('\n[3/4] Fixing clientes table...');

        // Drop FK constraints referencing clientes.identidad
        await client.query(`ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_identidadcliente_fkey`);
        await client.query(`ALTER TABLE recetas DROP CONSTRAINT IF EXISTS recetas_id_cliente_fkey`);
        console.log('  ✓ Dropped FKs referencing clientes.identidad');

        // Check if id column already exists
        const clientesIdCheck = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'clientes' AND column_name = 'id'
        `);
        if (clientesIdCheck.rows.length === 0) {
            // Add surrogate BIGSERIAL PK
            await client.query(`ALTER TABLE clientes ADD COLUMN id BIGSERIAL`);
            console.log('  ✓ Added BIGSERIAL id column');
        } else {
            console.log('  (clientes.id already exists)');
        }

        // Drop old PK, set new PK
        await client.query(`ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_pkey`);
        // Make id the new PK (if not already)
        await client.query(`
            ALTER TABLE clientes ADD CONSTRAINT clientes_pkey PRIMARY KEY (id)
        `).catch(e => {
            if (e.code === '42710' || e.message.includes('already exists')) {
                console.log('  (clientes_pkey already set)');
            } else throw e;
        });
        console.log('  ✓ New PK: id (BIGSERIAL)');

        // Add UNIQUE(identidad, tenant_id)
        await client.query(`
            ALTER TABLE clientes ADD CONSTRAINT clientes_identidad_tenant_unique UNIQUE(identidad, tenant_id)
        `).catch(e => {
            if (e.code === '42710') { console.log('  (clientes_identidad_tenant_unique already exists)'); }
            else throw e;
        });
        console.log('  ✓ Added UNIQUE(identidad, tenant_id)');

        // ─── 4. empleado ────────────────────────────────────────────────────────
        console.log('\n[4/4] Fixing empleado table...');

        // Drop FK from usuarios that references empleado.identidad
        await client.query(`ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_identidad_fkey`);
        console.log('  ✓ Dropped FK usuarios → empleado.identidad');

        // Check if id column already exists
        const empleadoIdCheck = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'empleado' AND column_name = 'id'
        `);
        if (empleadoIdCheck.rows.length === 0) {
            await client.query(`ALTER TABLE empleado ADD COLUMN id BIGSERIAL`);
            console.log('  ✓ Added BIGSERIAL id column');
        } else {
            console.log('  (empleado.id already exists)');
        }

        // Drop old PK, set new PK
        await client.query(`ALTER TABLE empleado DROP CONSTRAINT IF EXISTS empleado_pkey`);
        await client.query(`
            ALTER TABLE empleado ADD CONSTRAINT empleado_pkey PRIMARY KEY (id)
        `).catch(e => {
            if (e.code === '42710' || e.message.includes('already exists')) {
                console.log('  (empleado_pkey already set)');
            } else throw e;
        });
        console.log('  ✓ New PK: id (BIGSERIAL)');

        // Add UNIQUE(identidad, tenant_id)
        await client.query(`
            ALTER TABLE empleado ADD CONSTRAINT empleado_identidad_tenant_unique UNIQUE(identidad, tenant_id)
        `).catch(e => {
            if (e.code === '42710') { console.log('  (empleado_identidad_tenant_unique already exists)'); }
            else throw e;
        });
        console.log('  ✓ Added UNIQUE(identidad, tenant_id)');

        await client.query('COMMIT');
        console.log('\n✅ Migration complete. Summary:');
        console.log('  - configuracion: supports multiple tenants, each with their own config row');
        console.log('  - sucursales: UNIQUE(codigo, tenant_id) — two tenants can both have SUC-001');
        console.log('  - clientes: surrogate PK (id BIGSERIAL), UNIQUE(identidad, tenant_id)');
        console.log('  - empleado: surrogate PK (id BIGSERIAL), UNIQUE(identidad, tenant_id)');
        console.log('  - FK constraints that blocked multi-tenant have been dropped (data integrity');
        console.log('    is now enforced at the application layer via tenant_id filtering)');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('\n❌ Migration failed:', e.message, e.code);
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
