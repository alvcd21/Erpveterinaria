/**
 * Script de correcciones de base de datos
 * Ejecuta: node scripts/run_db_fixes.js
 */
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.argv[2] || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run(label, sql) {
    try {
        await pool.query(sql);
        console.log(`  OK  ${label}`);
        return true;
    } catch (err) {
        console.log(`  ER  ${label}`);
        console.log(`      ${err.message}`);
        return false;
    }
}

async function query(sql) {
    const res = await pool.query(sql);
    return res.rows;
}

async function main() {
    console.log('\n=== DIAGNÓSTICO INICIAL ===\n');

    // Ver ENUMs existentes
    const enums = await query(`
        SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS valores
        FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
        GROUP BY t.typname ORDER BY t.typname
    `);
    if (enums.length === 0) {
        console.log('  No se encontraron tipos ENUM en la base de datos.');
    } else {
        enums.forEach(r => console.log(`  ENUM [${r.typname}]: ${Array.isArray(r.valores) ? r.valores.join(', ') : r.valores}`));
    }

    // Ver constraints existentes
    const constraints = await query(`
        SELECT conname, conrelid::regclass AS tabla
        FROM pg_constraint WHERE contype = 'c'
        ORDER BY conrelid::regclass::text, conname
    `);
    console.log('\n  Constraints CHECK existentes:');
    if (constraints.length === 0) {
        console.log('  Ninguno.');
    } else {
        constraints.forEach(r => console.log(`  [${r.tabla}] ${r.conname}`));
    }

    // Ver valores actuales en columnas críticas
    console.log('\n  Valores en reparaciones.estado_reparacion:');
    const repEstados = await query(`SELECT estado_reparacion, COUNT(*) FROM reparaciones GROUP BY estado_reparacion ORDER BY estado_reparacion`);
    repEstados.forEach(r => console.log(`    "${r.estado_reparacion}" -> ${r.count} filas`));

    console.log('\n  Valores en ingresos.subtipo_movimiento:');
    try {
        const ingSubtipos = await query(`SELECT subtipo_movimiento, COUNT(*) FROM ingresos GROUP BY subtipo_movimiento ORDER BY subtipo_movimiento`);
        ingSubtipos.forEach(r => console.log(`    "${r.subtipo_movimiento}" -> ${r.count} filas`));
    } catch(e) { console.log(`    Error: ${e.message}`); }

    console.log('\n=== APLICANDO CORRECCIONES ===\n');

    // ── 1. ENUMs: ampliar si existen ──
    // subtipo_movimiento_contable
    const enumNames = enums.map(e => e.typname);

    if (enumNames.includes('subtipo_movimiento_contable')) {
        const vals = ['Venta','KrediYa_Prima','KrediYa_Deposito','Recarga',
                      'Reparacion','Ajuste_Utilidad','Garantia_Cobro','Consignacion_Cobro','Otro'];
        for (const v of vals) {
            await run(`ENUM subtipo_movimiento_contable += '${v}'`,
                `ALTER TYPE subtipo_movimiento_contable ADD VALUE IF NOT EXISTS '${v}'`);
        }
    }

    if (enumNames.includes('tipo_movimiento_contable')) {
        const vals = ['Venta','KrediYa_Prima','KrediYa_Deposito','Recarga',
                      'Reparacion','Ajuste_Utilidad','Garantia_Cobro','Consignacion_Cobro','Otro'];
        for (const v of vals) {
            await run(`ENUM tipo_movimiento_contable += '${v}'`,
                `ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS '${v}'`);
        }
    }

    if (enumNames.includes('subtipo_egreso_contable')) {
        const vals = ['Gasto Operativo','Compra de Producto','Compra Saldo',
                      'Pago Servicio de Reparacion','Perdida Margen Garantia',
                      'Nomina','Retiro Socio','Otro'];
        for (const v of vals) {
            await run(`ENUM subtipo_egreso_contable += '${v}'`,
                `ALTER TYPE subtipo_egreso_contable ADD VALUE IF NOT EXISTS '${v}'`);
        }
    }

    // ── 2. CHECK CONSTRAINTS ──
    const existingConstraints = constraints.map(c => c.conname);

    // reparaciones.estado_reparacion
    if (existingConstraints.includes('chk_reparaciones_estado')) {
        await run('DROP chk_reparaciones_estado (re-crear)',
            `ALTER TABLE reparaciones DROP CONSTRAINT chk_reparaciones_estado`);
    }
    await run('ADD chk_reparaciones_estado',
        `ALTER TABLE reparaciones ADD CONSTRAINT chk_reparaciones_estado
         CHECK (estado_reparacion IN ('Pendiente','En Taller','Listo','Entregado'))`);

    // reparaciones.pago_tecnico_estado
    if (!existingConstraints.includes('chk_reparaciones_pago_tecnico')) {
        await run('ADD chk_reparaciones_pago_tecnico',
            `ALTER TABLE reparaciones ADD CONSTRAINT chk_reparaciones_pago_tecnico
             CHECK (pago_tecnico_estado IN ('Pendiente','Pagado') OR pago_tecnico_estado IS NULL)`);
    } else {
        console.log('  OK  chk_reparaciones_pago_tecnico (ya existe)');
    }

    // garantias.estado_garantia
    if (existingConstraints.includes('chk_garantias_estado')) {
        await run('DROP chk_garantias_estado (re-crear)',
            `ALTER TABLE garantias DROP CONSTRAINT chk_garantias_estado`);
    }
    await run('ADD chk_garantias_estado',
        `ALTER TABLE garantias ADD CONSTRAINT chk_garantias_estado
         CHECK (estado_garantia IN ('Pendiente','En Taller','Proveedor','Listo','Cambiado','Entregado'))`);

    // garantias.tipo_producto
    if (!existingConstraints.includes('chk_garantias_tipo')) {
        await run('ADD chk_garantias_tipo',
            `ALTER TABLE garantias ADD CONSTRAINT chk_garantias_tipo
             CHECK (tipo_producto IN ('TELEFONO','ACCESORIO'))`);
    } else {
        console.log('  OK  chk_garantias_tipo (ya existe)');
    }

    // detalleventa.tipoProducto
    if (!existingConstraints.includes('chk_detalleventa_tipo')) {
        await run('ADD chk_detalleventa_tipo',
            `ALTER TABLE detalleventa ADD CONSTRAINT chk_detalleventa_tipo
             CHECK (tipoProducto IN ('TELEFONO','ACCESORIO','INGRESO'))`);
    } else {
        console.log('  OK  chk_detalleventa_tipo (ya existe)');
    }

    // ingresos.subtipo_movimiento (solo si NO es columna ENUM)
    if (!existingConstraints.includes('chk_ingresos_subtipo')) {
        await run('ADD chk_ingresos_subtipo',
            `ALTER TABLE ingresos ADD CONSTRAINT chk_ingresos_subtipo
             CHECK (subtipo_movimiento IN (
                 'Venta','KrediYa_Prima','KrediYa_Deposito','Recarga',
                 'Reparacion','Ajuste_Utilidad','Garantia_Cobro','Consignacion_Cobro','Otro'
             ) OR subtipo_movimiento IS NULL)`);
    } else {
        console.log('  OK  chk_ingresos_subtipo (ya existe)');
    }

    // egresos.categoria
    if (!existingConstraints.includes('chk_egresos_categoria')) {
        await run('ADD chk_egresos_categoria',
            `ALTER TABLE egresos ADD CONSTRAINT chk_egresos_categoria
             CHECK (categoria IN (
                 'Gasto Operativo','Compra de Producto','Compra Saldo',
                 'Pago Servicio de Reparacion','Perdida Margen Garantia',
                 'Nomina','Retiro Socio','Otro'
             ) OR categoria IS NULL)`);
    } else {
        console.log('  OK  chk_egresos_categoria (ya existe)');
    }

    // arqueo.estado
    if (!existingConstraints.includes('chk_arqueo_estado')) {
        await run('ADD chk_arqueo_estado',
            `ALTER TABLE arqueo ADD CONSTRAINT chk_arqueo_estado
             CHECK (estado IN ('Activo','Cerrada'))`);
    } else {
        console.log('  OK  chk_arqueo_estado (ya existe)');
    }

    // usuarios.estado
    if (!existingConstraints.includes('chk_usuarios_estado')) {
        await run('ADD chk_usuarios_estado',
            `ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_estado
             CHECK (estado IN ('Activo','Inactivo','Bloqueado','Suspendido'))`);
    } else {
        console.log('  OK  chk_usuarios_estado (ya existe)');
    }

    // consignaciones
    if (!existingConstraints.includes('chk_consignaciones_estado')) {
        await run('ADD chk_consignaciones_estado',
            `ALTER TABLE consignaciones ADD CONSTRAINT chk_consignaciones_estado
             CHECK (estado_consignacion IN ('Prestado','Devuelto','Vendido_Pagado','Perdido'))`);
    } else {
        console.log('  OK  chk_consignaciones_estado (ya existe)');
    }

    if (!existingConstraints.includes('chk_consignaciones_tipo')) {
        await run('ADD chk_consignaciones_tipo',
            `ALTER TABLE consignaciones ADD CONSTRAINT chk_consignaciones_tipo
             CHECK (tipo_producto IN ('TELEFONO','ACCESORIO'))`);
    } else {
        console.log('  OK  chk_consignaciones_tipo (ya existe)');
    }

    console.log('\n=== LISTO ===\n');
    await pool.end();
}

main().catch(err => {
    console.error('\nError fatal:', err.message);
    pool.end();
    process.exit(1);
});
