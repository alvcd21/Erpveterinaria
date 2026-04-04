/**
 * Aplica todas las mejoras pendientes de la base de datos (FASES 2-6)
 * Ejecutar: node scripts/apply_all_fixes.js "postgresql://..."
 */
const { Pool } = require('pg');
const DB = process.argv[2] || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function run(label, sql) {
    try { await pool.query(sql); console.log('  OK  ' + label); return true; }
    catch(e) { console.log('  ER  ' + label + '\n      ' + e.message); return false; }
}

async function main() {

    // ── FASE 2: CHECKs faltantes ──────────────────────────────────────────────
    console.log('\n=== FASE 2: CHECK CONSTRAINTS FALTANTES ===\n');

    await run('chk_telefonos_estado',
        `ALTER TABLE telefonos ADD CONSTRAINT chk_telefonos_estado
         CHECK (estado IN ('Disponible','Vendido','Consignado','Garantia','Defectuoso','Dado de Baja'))`);

    await run('chk_inventario_estado',
        `ALTER TABLE inventario ADD CONSTRAINT chk_inventario_estado
         CHECK (estado IN ('Disponible','Activo','Registrado','Agotado','Dado de Baja'))`);

    await run('chk_ventas_estado',
        `ALTER TABLE ventas ADD CONSTRAINT chk_ventas_estado
         CHECK (estado IN ('Completada','Anulada','Pendiente'))`);

    await run('chk_ventas_tipo',
        `ALTER TABLE ventas ADD CONSTRAINT chk_ventas_tipo
         CHECK (tipoCompra IN ('Contado','Credito','KrediYa'))`);

    await run('chk_ventas_estado_pago',
        `ALTER TABLE ventas ADD CONSTRAINT chk_ventas_estado_pago
         CHECK (estado_pago_financiera IN ('Pendiente','Depositado','Rechazado') OR estado_pago_financiera IS NULL)`);

    await run('chk_empleado_estado',
        `ALTER TABLE empleado ADD CONSTRAINT chk_empleado_estado
         CHECK (estado IN ('Activo','Inactivo','Vacaciones','Retirado'))`);

    await run('chk_paquetes_estado',
        `ALTER TABLE paquetes ADD CONSTRAINT chk_paquetes_estado
         CHECK (estado IN ('Activo','Inactivo'))`);

    await run('chk_paquetes_red',
        `ALTER TABLE paquetes ADD CONSTRAINT chk_paquetes_red
         CHECK (red IN ('TIGO','CLARO','BALAM','HONDUTEL'))`);

    await run('chk_saldos_red',
        `ALTER TABLE saldos ADD CONSTRAINT chk_saldos_red
         CHECK (red IN ('TIGO','CLARO','BALAM','HONDUTEL'))`);

    // ── FASE 3-4: Tablas nuevas ───────────────────────────────────────────────
    console.log('\n=== FASE 3-4: TABLAS NUEVAS ===\n');

    await run('configuracion_cai_historial', `
        CREATE TABLE IF NOT EXISTS configuracion_cai_historial (
            id              SERIAL PRIMARY KEY,
            cai             VARCHAR(255) NOT NULL,
            rangoinicial    VARCHAR(100) NOT NULL,
            rangofinal      VARCHAR(100) NOT NULL,
            fechalimite     DATE NOT NULL,
            contador_actual INTEGER DEFAULT 1,
            fecha_registro  TIMESTAMPTZ DEFAULT NOW(),
            registrado_por  VARCHAR(100) REFERENCES usuarios(codUsuario)
        )`);

    await run('reparacion_complementos', `
        CREATE TABLE IF NOT EXISTS reparacion_complementos (
            id            SERIAL PRIMARY KEY,
            id_reparacion INTEGER NOT NULL REFERENCES reparaciones(id_reparacion) ON DELETE CASCADE,
            descripcion   VARCHAR(255) NOT NULL,
            cantidad      INTEGER DEFAULT 1,
            costo_unitario NUMERIC(10,2) DEFAULT 0
        )`);

    await run('pagos_venta', `
        CREATE TABLE IF NOT EXISTS pagos_venta (
            id_pago        SERIAL PRIMARY KEY,
            cod_venta      VARCHAR(100) NOT NULL REFERENCES ventas(codVenta) ON DELETE RESTRICT,
            monto          NUMERIC(10,2) NOT NULL CHECK (monto > 0),
            fecha_pago     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metodo_pago    VARCHAR(50) NOT NULL CHECK (metodo_pago IN ('Efectivo','Transferencia','Tarjeta','KrediYa','Otro')),
            referencia     VARCHAR(255),
            idCaja         VARCHAR(100) REFERENCES caja(idCaja),
            registrado_por VARCHAR(100) REFERENCES usuarios(codUsuario),
            notas          TEXT
        )`);

    await run('kardex_inventario', `
        CREATE TABLE IF NOT EXISTS kardex_inventario (
            id              BIGSERIAL PRIMARY KEY,
            tipo_producto   VARCHAR(20) NOT NULL CHECK (tipo_producto IN ('TELEFONO','ACCESORIO')),
            cod_telefono    VARCHAR(100) REFERENCES telefonos(codigo) ON DELETE SET NULL,
            cod_inventario  VARCHAR(100) REFERENCES inventario(codInventario) ON DELETE SET NULL,
            tipo_movimiento VARCHAR(50) NOT NULL CHECK (tipo_movimiento IN (
                'Compra','Venta','Devolucion','Garantia_Entrada','Garantia_Salida',
                'Consignacion_Salida','Consignacion_Retorno','Ajuste_Positivo','Ajuste_Negativo','Baja'
            )),
            cantidad        INTEGER NOT NULL,
            precio_costo    NUMERIC(10,2),
            precio_venta    NUMERIC(10,2),
            referencia_doc  VARCHAR(100),
            fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            registrado_por  VARCHAR(100) REFERENCES usuarios(codUsuario),
            observaciones   TEXT
        )`);

    await run('sesiones_usuarios', `
        CREATE TABLE IF NOT EXISTS sesiones_usuarios (
            id           BIGSERIAL PRIMARY KEY,
            codUsuario   VARCHAR(100) NOT NULL REFERENCES usuarios(codUsuario) ON DELETE CASCADE,
            token_hash   VARCHAR(255) NOT NULL UNIQUE,
            ip_address   INET,
            user_agent   TEXT,
            fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            fecha_expira TIMESTAMPTZ NOT NULL,
            fecha_cierre TIMESTAMPTZ,
            activa       BOOLEAN DEFAULT TRUE,
            motivo_cierre VARCHAR(50) CHECK (motivo_cierre IN ('Logout','Expiracion','Forzado','Inactividad') OR motivo_cierre IS NULL)
        )`);

    await run('audit_log (tabla particionada)', `
        CREATE TABLE IF NOT EXISTS audit_log (
            id            BIGSERIAL,
            tabla         VARCHAR(100) NOT NULL,
            operacion     CHAR(1) NOT NULL CHECK (operacion IN ('I','U','D')),
            pk_valor      TEXT NOT NULL,
            datos_antes   JSONB,
            datos_despues JSONB,
            usuario_db    VARCHAR(100) DEFAULT current_user,
            usuario_app   VARCHAR(100),
            ip_address    INET,
            fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        ) PARTITION BY RANGE (fecha)`);

    await run('audit_log_2025', `CREATE TABLE IF NOT EXISTS audit_log_2025 PARTITION OF audit_log FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')`);
    await run('audit_log_2026', `CREATE TABLE IF NOT EXISTS audit_log_2026 PARTITION OF audit_log FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')`);
    await run('audit_log_2027', `CREATE TABLE IF NOT EXISTS audit_log_2027 PARTITION OF audit_log FOR VALUES FROM ('2027-01-01') TO ('2028-01-01')`);

    await run('login_intentos', `
        CREATE TABLE IF NOT EXISTS login_intentos (
            id         BIGSERIAL PRIMARY KEY,
            usuario    VARCHAR(100) NOT NULL,
            ip_address INET,
            exitoso    BOOLEAN NOT NULL,
            fecha      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            user_agent TEXT
        )`);

    await run('notificaciones', `
        CREATE TABLE IF NOT EXISTS notificaciones (
            id               BIGSERIAL PRIMARY KEY,
            tipo             VARCHAR(50) NOT NULL CHECK (tipo IN (
                'stock_bajo','cai_vencimiento','reparacion_lista',
                'garantia_lista','pago_pendiente','sistema'
            )),
            titulo           VARCHAR(255) NOT NULL,
            cuerpo           TEXT,
            para_usuario     VARCHAR(100) REFERENCES usuarios(codUsuario),
            leida            BOOLEAN DEFAULT FALSE,
            fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
            fecha_lectura    TIMESTAMPTZ,
            referencia_id    TEXT,
            referencia_tabla VARCHAR(100)
        )`);

    // ── FASE 5: Índices ───────────────────────────────────────────────────────
    console.log('\n=== FASE 5: ÍNDICES ===\n');

    await run('idx_ventas_fecha',          `CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fechaCreacion DESC)`);
    await run('idx_ventas_estado',         `CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado)`);
    await run('idx_ingresos_fecha',        `CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(fechaCreacion DESC)`);
    await run('idx_ingresos_subtipo',      `CREATE INDEX IF NOT EXISTS idx_ingresos_subtipo ON ingresos(subtipo_movimiento)`);
    await run('idx_egresos_fecha',         `CREATE INDEX IF NOT EXISTS idx_egresos_fecha ON egresos(fechaCreacion DESC)`);
    await run('idx_reparaciones_estado',   `CREATE INDEX IF NOT EXISTS idx_reparaciones_estado ON reparaciones(estado_reparacion)`);
    await run('idx_garantias_estado',      `CREATE INDEX IF NOT EXISTS idx_garantias_estado ON garantias(estado_garantia)`);
    await run('idx_consignaciones_estado', `CREATE INDEX IF NOT EXISTS idx_consignaciones_estado ON consignaciones(estado_consignacion)`);
    await run('idx_telefonos_estado',      `CREATE INDEX IF NOT EXISTS idx_telefonos_estado ON telefonos(estado)`);
    await run('idx_inventario_estado',     `CREATE INDEX IF NOT EXISTS idx_inventario_estado ON inventario(estado)`);
    await run('idx_sesiones_usuario',      `CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones_usuarios(codUsuario, activa)`);
    await run('idx_sesiones_token',        `CREATE INDEX IF NOT EXISTS idx_sesiones_token ON sesiones_usuarios(token_hash)`);
    await run('idx_login_usuario_fecha',   `CREATE INDEX IF NOT EXISTS idx_login_usuario_fecha ON login_intentos(usuario, fecha DESC)`);
    await run('idx_login_ip_fecha',        `CREATE INDEX IF NOT EXISTS idx_login_ip_fecha ON login_intentos(ip_address, fecha DESC)`);
    await run('idx_audit_tabla_fecha',     `CREATE INDEX IF NOT EXISTS idx_audit_tabla_fecha ON audit_log(tabla, fecha DESC)`);
    await run('idx_notif_usuario',         `CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones(para_usuario, leida)`);
    await run('idx_kardex_fecha',          `CREATE INDEX IF NOT EXISTS idx_kardex_fecha ON kardex_inventario(fecha DESC)`);
    await run('idx_pagos_venta',           `CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos_venta(cod_venta, fecha_pago DESC)`);

    // ── FASE 6: Columnas de auditoría ─────────────────────────────────────────
    console.log('\n=== FASE 6: COLUMNAS AUDITORÍA ===\n');

    for (const t of ['ventas','telefonos','inventario','reparaciones','garantias','egresos','ingresos']) {
        await run(t + '.updated_at', `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
        await run(t + '.updated_by', `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100)`);
    }

    // ── FASE 7: Stored Procedure sp_anular_venta ──────────────────────────────
    console.log('\n=== FASE 7: STORED PROCEDURES ===\n');

    await run('sp_anular_venta', `
        CREATE OR REPLACE FUNCTION sp_anular_venta(
            p_cod_venta  VARCHAR,
            p_cod_usuario VARCHAR,
            p_motivo     TEXT DEFAULT 'Sin motivo'
        ) RETURNS TEXT AS $$
        DECLARE
            v_estado VARCHAR;
            v_det    RECORD;
        BEGIN
            SELECT estado INTO v_estado FROM ventas WHERE codVenta = p_cod_venta FOR UPDATE;
            IF NOT FOUND THEN
                RETURN 'ERROR: Venta no encontrada';
            END IF;
            IF v_estado = 'Anulada' THEN
                RETURN 'ERROR: Venta ya estaba anulada';
            END IF;

            -- Revertir inventario de cada detalle
            FOR v_det IN
                SELECT tipoProducto, idTelefono, idAccesorio, cantidad
                FROM detalleventa WHERE codVenta = p_cod_venta
            LOOP
                IF v_det.tipoproducto = 'TELEFONO' AND v_det.idtelefono IS NOT NULL THEN
                    UPDATE telefonos SET estado = 'Disponible',
                        updated_at = NOW(), updated_by = p_cod_usuario
                    WHERE codigo = v_det.idtelefono;
                ELSIF v_det.tipoproducto = 'ACCESORIO' AND v_det.idaccesorio IS NOT NULL THEN
                    UPDATE inventario SET cantidad = cantidad + v_det.cantidad,
                        updated_at = NOW(), updated_by = p_cod_usuario
                    WHERE codInventario = v_det.idaccesorio;
                END IF;
            END LOOP;

            -- Anular la venta
            UPDATE ventas SET estado = 'Anulada',
                updated_at = NOW(), updated_by = p_cod_usuario
            WHERE codVenta = p_cod_venta;

            RETURN 'OK: Venta ' || p_cod_venta || ' anulada. Motivo: ' || p_motivo;
        END;
        $$ LANGUAGE plpgsql`);

    console.log('\n=== TODAS LAS FASES COMPLETADAS ===\n');
    await pool.end();
}

main().catch(e => { console.error('\nError fatal:', e.message); pool.end(); process.exit(1); });
