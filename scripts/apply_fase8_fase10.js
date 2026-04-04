/**
 * FASE 7 (SPs restantes) + FASE 8 (Triggers) + FASE 10 (Vistas/Roles/Seguridad)
 * Ejecutar: node scripts/apply_fase8_fase10.js "postgresql://..."
 */
const { Pool } = require('pg');
const DB = process.argv[2] || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function run(label, sql) {
    try { await pool.query(sql); console.log('  OK  ' + label); return true; }
    catch(e) { console.log('  ER  ' + label + '\n      ' + e.message); return false; }
}

async function main() {

    // ── FIX: Corregir constraint de notificaciones (valores incorrectos) ──────
    console.log('\n=== FIX: NOTIFICACIONES constraint ===\n');
    await run('DROP chk notificaciones.tipo (valores incorrectos)', `
        ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check`);
    await run('ADD chk notificaciones.tipo (valores correctos)', `
        ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check
        CHECK (tipo IN (
            'Garantia_Pendiente','Reparacion_Lista','Stock_Bajo','CAI_Por_Vencer',
            'Consignacion_Vencida','Pago_Pendiente','Sistema','Otro'
        ))`);

    // ── ÍNDICES faltantes de FASE 5 ──────────────────────────────────────────
    console.log('\n=== FASE 5: ÍNDICES ADICIONALES ===\n');
    await run('idx_ventas_cliente',        `CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(identidadCliente)`);
    await run('idx_ventas_vendedor',       `CREATE INDEX IF NOT EXISTS idx_ventas_vendedor ON ventas(codVendedor)`);
    await run('idx_ventas_caja_fecha',     `CREATE INDEX IF NOT EXISTS idx_ventas_caja_fecha ON ventas(idCaja, fecha DESC)`);
    await run('idx_ventas_krediya',        `CREATE INDEX IF NOT EXISTS idx_ventas_krediya ON ventas(es_krediya, estado_pago_financiera) WHERE es_krediya = TRUE`);
    await run('idx_detalle_venta',         `CREATE INDEX IF NOT EXISTS idx_detalle_venta ON detalleventa(idVenta)`);
    await run('idx_detalle_telefono',      `CREATE INDEX IF NOT EXISTS idx_detalle_telefono ON detalleventa(idTelefono) WHERE idTelefono IS NOT NULL`);
    await run('idx_detalle_accesorio',     `CREATE INDEX IF NOT EXISTS idx_detalle_accesorio ON detalleventa(idAccesorio) WHERE idAccesorio IS NOT NULL`);
    await run('idx_telefonos_imei1',       `CREATE UNIQUE INDEX IF NOT EXISTS idx_telefonos_imei1 ON telefonos(imei1)`);
    await run('idx_telefonos_imei2',       `CREATE INDEX IF NOT EXISTS idx_telefonos_imei2 ON telefonos(imei2) WHERE imei2 IS NOT NULL`);
    await run('idx_telefonos_marca_modelo',`CREATE INDEX IF NOT EXISTS idx_telefonos_marca_modelo ON telefonos(marca, modelo)`);
    await run('idx_inventario_accesorio',  `CREATE INDEX IF NOT EXISTS idx_inventario_accesorio ON inventario(codAccesorio)`);
    await run('idx_clientes_nombre',       `CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre, apellido)`);
    await run('idx_clientes_telefono',     `CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono)`);
    await run('idx_rep_cliente',           `CREATE INDEX IF NOT EXISTS idx_rep_cliente ON reparaciones(identidad_cliente)`);
    await run('idx_rep_imei',              `CREATE INDEX IF NOT EXISTS idx_rep_imei ON reparaciones(imei_equipo) WHERE imei_equipo IS NOT NULL`);
    await run('idx_rep_fecha',             `CREATE INDEX IF NOT EXISTS idx_rep_fecha ON reparaciones(fecha_ingreso DESC)`);
    await run('idx_ingresos_caja_fecha',   `CREATE INDEX IF NOT EXISTS idx_ingresos_caja_fecha ON ingresos(idCaja, fechaCreacion DESC)`);
    await run('idx_egresos_caja_fecha',    `CREATE INDEX IF NOT EXISTS idx_egresos_caja_fecha ON egresos(idCaja, fechaCreacion DESC)`);
    await run('idx_egresos_categoria',     `CREATE INDEX IF NOT EXISTS idx_egresos_categoria ON egresos(categoria)`);
    await run('idx_garantias_cliente',     `CREATE INDEX IF NOT EXISTS idx_garantias_cliente ON garantias(identidad_cliente)`);
    await run('idx_garantias_venta',       `CREATE INDEX IF NOT EXISTS idx_garantias_venta ON garantias(cod_venta)`);
    await run('idx_arqueo_caja_estado',    `CREATE INDEX IF NOT EXISTS idx_arqueo_caja_estado ON arqueo(idCaja, estado)`);
    await run('idx_kardex_tipo_cod',       `CREATE INDEX IF NOT EXISTS idx_kardex_tipo_cod ON kardex_inventario(tipo_producto, cod_inventario, fecha DESC)`);
    await run('idx_kardex_telefono',       `CREATE INDEX IF NOT EXISTS idx_kardex_telefono ON kardex_inventario(cod_telefono, fecha DESC) WHERE cod_telefono IS NOT NULL`);
    await run('idx_usuarios_estado',       `CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios(estado) WHERE estado = 'Activo'`);
    await run('alertas_stock (tabla)',     `
        CREATE TABLE IF NOT EXISTS alertas_stock (
            id             SERIAL PRIMARY KEY,
            cod_inventario VARCHAR(100) NOT NULL REFERENCES inventario(codInventario) ON DELETE CASCADE,
            stock_minimo   INTEGER NOT NULL DEFAULT 5,
            activa         BOOLEAN DEFAULT TRUE,
            ultima_alerta  TIMESTAMPTZ
        )`);
    await run('idx_alertas_stock_unique',  `CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_stock_unique ON alertas_stock(cod_inventario)`);

    // ── FASE 7: SPs restantes ─────────────────────────────────────────────────
    console.log('\n=== FASE 7: STORED PROCEDURES RESTANTES ===\n');

    await run('sp_generar_id', `
        CREATE OR REPLACE FUNCTION sp_generar_id(p_tabla TEXT, p_columna TEXT, p_prefijo TEXT)
        RETURNS TEXT LANGUAGE plpgsql AS $$
        DECLARE
            v_max_num INTEGER := 0;
            v_id TEXT;
        BEGIN
            EXECUTE format(
                'SELECT %I FROM %I WHERE %I LIKE $1 ORDER BY LENGTH(%I) DESC, %I DESC LIMIT 1',
                p_columna, p_tabla, p_columna, p_columna, p_columna
            ) USING (p_prefijo || '-%') INTO v_id;
            IF v_id IS NOT NULL THEN
                v_max_num := CAST(SPLIT_PART(v_id, '-', 2) AS INTEGER);
            END IF;
            RETURN p_prefijo || '-' || LPAD((v_max_num + 1)::TEXT, 4, '0');
        END; $$`);

    await run('sp_cerrar_arqueo', `
        CREATE OR REPLACE FUNCTION sp_cerrar_arqueo(
            p_id_caja     VARCHAR(100),
            p_usuario     VARCHAR(100),
            p_saldo_tigo  NUMERIC(10,2) DEFAULT 0,
            p_saldo_claro NUMERIC(10,2) DEFAULT 0
        ) RETURNS JSONB LANGUAGE plpgsql AS $$
        DECLARE
            v_arqueo       RECORD;
            v_total_ing    NUMERIC(10,2);
            v_total_costos NUMERIC(10,2);
            v_total_egr    NUMERIC(10,2);
            v_monto_final  NUMERIC(10,2);
            v_ganancia     NUMERIC(10,2);
            v_hoy          DATE := CURRENT_DATE;
        BEGIN
            SELECT * INTO v_arqueo FROM arqueo
            WHERE idCaja = p_id_caja AND estado = 'Activo' FOR UPDATE;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('ok', false, 'error', 'No existe arqueo activo para esta caja');
            END IF;
            SELECT COALESCE(SUM(monto), 0), COALESCE(SUM(costo), 0)
            INTO v_total_ing, v_total_costos
            FROM ingresos
            WHERE idCaja = p_id_caja
              AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = v_hoy
              AND (subtipo_movimiento IS NULL OR subtipo_movimiento <> 'KrediYa_Deposito');
            SELECT COALESCE(SUM(monto), 0) INTO v_total_egr
            FROM egresos
            WHERE idCaja = p_id_caja
              AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = v_hoy;
            v_monto_final := v_arqueo.montoinicial + v_total_ing - v_total_egr;
            v_ganancia    := v_total_ing - v_total_costos;
            UPDATE arqueo SET
                fechaCierre     = NOW() AT TIME ZONE 'America/Tegucigalpa',
                montoFinal      = v_monto_final,
                totalVentas     = v_total_ing,
                totalCostos     = v_total_costos,
                TotalGastos     = v_total_egr,
                ganancia        = v_ganancia,
                saldoTigoFinal  = p_saldo_tigo,
                saldoClaroFinal = p_saldo_claro,
                estado          = 'Cerrada',
                idUsuario       = p_usuario
            WHERE idArqueo = v_arqueo.idarqueo;
            UPDATE ingresos SET idArqueo = v_arqueo.idarqueo
            WHERE idCaja = p_id_caja
              AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = v_hoy
              AND idArqueo IS NULL;
            UPDATE egresos SET idArqueo = v_arqueo.idarqueo
            WHERE idCaja = p_id_caja
              AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = v_hoy
              AND idArqueo IS NULL;
            RETURN jsonb_build_object(
                'ok', true, 'idArqueo', v_arqueo.idarqueo,
                'montoFinal', v_monto_final, 'ganancia', v_ganancia,
                'totalIngresos', v_total_ing, 'totalEgresos', v_total_egr
            );
        END; $$`);

    await run('sp_resumen_financiero_dia', `
        CREATE OR REPLACE FUNCTION sp_resumen_financiero_dia(
            p_fecha   DATE DEFAULT CURRENT_DATE,
            p_id_caja VARCHAR(100) DEFAULT NULL
        ) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
        DECLARE v_result JSONB;
        BEGIN
            SELECT jsonb_build_object(
                'fecha',          p_fecha,
                'ventas_count',   COUNT(DISTINCT v.codVenta),
                'ventas_total',   COALESCE(SUM(v.total), 0),
                'ingresos_total', COALESCE((SELECT SUM(monto) FROM ingresos
                    WHERE (p_id_caja IS NULL OR idCaja = p_id_caja)
                      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha), 0),
                'egresos_total',  COALESCE((SELECT SUM(monto) FROM egresos
                    WHERE (p_id_caja IS NULL OR idCaja = p_id_caja)
                      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha), 0),
                'ventas_anuladas', COUNT(DISTINCT v.codVenta) FILTER (WHERE v.estado = 'Anulada')
            ) INTO v_result
            FROM ventas v
            WHERE DATE(v.fecha AT TIME ZONE 'America/Tegucigalpa') = p_fecha
              AND (p_id_caja IS NULL OR v.idCaja = p_id_caja);
            RETURN v_result;
        END; $$`);

    await run('sp_registrar_intento_login', `
        CREATE OR REPLACE FUNCTION sp_registrar_intento_login(
            p_usuario    VARCHAR(100),
            p_exitoso    BOOLEAN,
            p_ip         INET,
            p_user_agent TEXT DEFAULT NULL
        ) RETURNS JSONB LANGUAGE plpgsql AS $$
        DECLARE
            v_usr RECORD;
        BEGIN
            INSERT INTO login_intentos(usuario, ip_address, exitoso, user_agent)
            VALUES (p_usuario, p_ip, p_exitoso, p_user_agent);
            IF p_exitoso THEN
                UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = NOW()
                WHERE usuario = p_usuario;
                RETURN jsonb_build_object('ok', true, 'bloqueado', false);
            ELSE
                UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1
                WHERE usuario = p_usuario RETURNING * INTO v_usr;
                IF NOT FOUND THEN
                    RETURN jsonb_build_object('ok', false, 'bloqueado', false, 'motivo', 'usuario_invalido');
                END IF;
                IF v_usr.intentos_fallidos >= 5 THEN
                    UPDATE usuarios SET
                        bloqueado_hasta = NOW() + INTERVAL '15 minutes',
                        estado = CASE WHEN v_usr.intentos_fallidos >= 10 THEN 'Bloqueado' ELSE estado END
                    WHERE usuario = p_usuario;
                    INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
                    VALUES ('Sistema', 'Usuario bloqueado por intentos fallidos',
                        'El usuario ' || p_usuario || ' fue bloqueado tras múltiples intentos desde IP ' || p_ip::TEXT,
                        p_usuario, 'usuarios');
                    RETURN jsonb_build_object('ok', false, 'bloqueado', true, 'intentos', v_usr.intentos_fallidos);
                END IF;
                RETURN jsonb_build_object('ok', false, 'bloqueado', false, 'intentos', v_usr.intentos_fallidos);
            END IF;
        END; $$`);

    await run('sp_calcular_saldo_red', `
        CREATE OR REPLACE FUNCTION sp_calcular_saldo_red(
            p_red  VARCHAR(50),
            p_fecha DATE DEFAULT CURRENT_DATE
        ) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
        DECLARE
            v_saldo_inicio NUMERIC(10,2) := 0;
            v_comprado     NUMERIC(10,2) := 0;
            v_vendido      NUMERIC(10,2) := 0;
        BEGIN
            SELECT COALESCE(saldoFinal, 0) INTO v_saldo_inicio
            FROM saldos WHERE red = p_red AND fecha = p_fecha - 1;
            SELECT COALESCE(SUM(monto), 0) INTO v_comprado
            FROM egresos WHERE categoria = 'Compra Saldo'
              AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha;
            SELECT COALESCE(SUM(monto), 0) INTO v_vendido
            FROM ingresos WHERE subtipo_movimiento = 'Recarga'
              AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha;
            RETURN jsonb_build_object(
                'red', p_red, 'fecha', p_fecha,
                'saldo_inicio', v_saldo_inicio, 'comprado', v_comprado,
                'vendido', v_vendido, 'saldo_actual', v_saldo_inicio + v_comprado - v_vendido
            );
        END; $$`);

    // ── FASE 8: TRIGGERS ──────────────────────────────────────────────────────
    console.log('\n=== FASE 8: TRIGGERS ===\n');

    // TRG 1: updated_at automático
    await run('fn trg_set_updated_at', `
        CREATE OR REPLACE FUNCTION trg_set_updated_at()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            NEW.updated_at := NOW() AT TIME ZONE 'America/Tegucigalpa';
            RETURN NEW;
        END; $$`);

    for (const t of ['telefonos','inventario','ventas','reparaciones','garantias','egresos','ingresos']) {
        await run('DROP IF EXISTS trg_' + t + '_updated_at',
            `DROP TRIGGER IF EXISTS trg_${t}_updated_at ON ${t}`);
        await run('trg_' + t + '_updated_at',
            `CREATE TRIGGER trg_${t}_updated_at
             BEFORE UPDATE ON ${t}
             FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()`);
    }

    // TRG 2: Stock automático al insertar detalleventa (+ kardex)
    await run('fn trg_actualizar_stock_venta', `
        CREATE OR REPLACE FUNCTION trg_actualizar_stock_venta()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE v_vendedor VARCHAR(100);
        BEGIN
            SELECT codVendedor INTO v_vendedor FROM ventas WHERE codVenta = NEW.idVenta;
            IF NEW.tipoProducto = 'TELEFONO' AND NEW.idTelefono IS NOT NULL THEN
                UPDATE telefonos SET estado = 'Vendido', updated_at = NOW(), updated_by = v_vendedor
                WHERE codigo = NEW.idTelefono;
                INSERT INTO kardex_inventario(tipo_producto, cod_telefono, tipo_movimiento,
                    cantidad, precio_venta, referencia_doc, registrado_por)
                VALUES('TELEFONO', NEW.idTelefono, 'Venta', 1, NEW.precioVenta, NEW.idVenta, v_vendedor);
            ELSIF NEW.tipoProducto = 'ACCESORIO' AND NEW.idAccesorio IS NOT NULL THEN
                UPDATE inventario SET cantidad = cantidad - COALESCE(NEW.cantidad, 1),
                    updated_at = NOW(), updated_by = v_vendedor
                WHERE codInventario = NEW.idAccesorio;
                INSERT INTO kardex_inventario(tipo_producto, cod_inventario, tipo_movimiento,
                    cantidad, precio_venta, referencia_doc, registrado_por)
                VALUES('ACCESORIO', NEW.idAccesorio, 'Venta', COALESCE(NEW.cantidad,1),
                    NEW.precioVenta, NEW.idVenta, v_vendedor);
            END IF;
            RETURN NEW;
        END; $$`);
    await run('DROP IF EXISTS trg_detalleventa_actualizar_stock',
        `DROP TRIGGER IF EXISTS trg_detalleventa_actualizar_stock ON detalleventa`);
    await run('trg_detalleventa_actualizar_stock',
        `CREATE TRIGGER trg_detalleventa_actualizar_stock
         AFTER INSERT ON detalleventa
         FOR EACH ROW EXECUTE FUNCTION trg_actualizar_stock_venta()`);

    // TRG 3: Alerta stock bajo
    await run('fn trg_alerta_stock_bajo', `
        CREATE OR REPLACE FUNCTION trg_alerta_stock_bajo()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE v_minimo INTEGER; v_nombre VARCHAR(255);
        BEGIN
            IF NEW.cantidad < OLD.cantidad THEN
                SELECT a.stock_minimo INTO v_minimo FROM alertas_stock a
                WHERE a.cod_inventario = NEW.codInventario AND a.activa = TRUE;
                IF FOUND AND NEW.cantidad <= v_minimo THEN
                    SELECT ac.descripcion INTO v_nombre FROM accesorios ac
                    WHERE ac.codAccesorio = NEW.codAccesorio;
                    INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
                    VALUES('Stock_Bajo',
                        'Stock bajo: ' || COALESCE(v_nombre, NEW.codInventario),
                        'El accesorio ' || COALESCE(v_nombre, NEW.codInventario) ||
                        ' tiene solo ' || NEW.cantidad || ' unidades (mínimo: ' || v_minimo || ')',
                        NEW.codInventario, 'inventario');
                    UPDATE alertas_stock SET ultima_alerta = NOW()
                    WHERE cod_inventario = NEW.codInventario;
                END IF;
            END IF;
            RETURN NEW;
        END; $$`);
    await run('DROP IF EXISTS trg_inventario_stock_bajo',
        `DROP TRIGGER IF EXISTS trg_inventario_stock_bajo ON inventario`);
    await run('trg_inventario_stock_bajo',
        `CREATE TRIGGER trg_inventario_stock_bajo
         AFTER UPDATE OF cantidad ON inventario
         FOR EACH ROW EXECUTE FUNCTION trg_alerta_stock_bajo()`);

    // TRG 4: Auditoría en tablas críticas
    await run('fn trg_audit_log', `
        CREATE OR REPLACE FUNCTION trg_audit_log()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE
            v_operacion CHAR(1);
            v_pk        TEXT;
        BEGIN
            v_operacion := CASE TG_OP WHEN 'INSERT' THEN 'I' WHEN 'UPDATE' THEN 'U' ELSE 'D' END;
            v_pk := CASE TG_TABLE_NAME
                WHEN 'ventas'        THEN COALESCE(NEW.codventa,    OLD.codventa)
                WHEN 'configuracion' THEN COALESCE(NEW.id::TEXT,    OLD.id::TEXT)
                WHEN 'usuarios'      THEN COALESCE(NEW.codusuario,  OLD.codusuario)
                WHEN 'telefonos'     THEN COALESCE(NEW.codigo,      OLD.codigo)
                ELSE 'UNKNOWN'
            END;
            INSERT INTO audit_log(tabla, operacion, pk_valor, datos_antes, datos_despues, fecha)
            VALUES(TG_TABLE_NAME, v_operacion, v_pk,
                CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
                CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
                NOW());
            RETURN COALESCE(NEW, OLD);
        END; $$`);

    for (const [t, col] of [['ventas','codventa'],['configuracion','id'],['usuarios','codusuario'],['telefonos','codigo']]) {
        await run('DROP IF EXISTS trg_' + t + '_audit', `DROP TRIGGER IF EXISTS trg_${t}_audit ON ${t}`);
        await run('trg_' + t + '_audit',
            `CREATE TRIGGER trg_${t}_audit
             AFTER INSERT OR UPDATE OR DELETE ON ${t}
             FOR EACH ROW EXECUTE FUNCTION trg_audit_log()`);
    }

    // TRG 5: Validar IMEI duplicado
    await run('fn trg_validar_imei_duplicado', `
        CREATE OR REPLACE FUNCTION trg_validar_imei_duplicado()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF EXISTS(SELECT 1 FROM telefonos WHERE imei1 = NEW.imei1 AND codigo != NEW.codigo
                      AND estado NOT IN ('Vendido','Dado de Baja')) THEN
                RAISE EXCEPTION 'IMEI1 % ya está registrado en otro equipo activo', NEW.imei1;
            END IF;
            IF NEW.imei2 IS NOT NULL AND EXISTS(
                SELECT 1 FROM telefonos WHERE imei2 = NEW.imei2 AND codigo != NEW.codigo
                AND estado NOT IN ('Vendido','Dado de Baja')) THEN
                RAISE EXCEPTION 'IMEI2 % ya está registrado en otro equipo activo', NEW.imei2;
            END IF;
            RETURN NEW;
        END; $$`);
    await run('DROP IF EXISTS trg_telefonos_imei_unico',
        `DROP TRIGGER IF EXISTS trg_telefonos_imei_unico ON telefonos`);
    await run('trg_telefonos_imei_unico',
        `CREATE TRIGGER trg_telefonos_imei_unico
         BEFORE INSERT OR UPDATE OF imei1, imei2 ON telefonos
         FOR EACH ROW EXECUTE FUNCTION trg_validar_imei_duplicado()`);

    // TRG 6: Alerta CAI por vencer
    await run('fn trg_alerta_cai_vencimiento', `
        CREATE OR REPLACE FUNCTION trg_alerta_cai_vencimiento()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.fechalimite IS NOT NULL
               AND NEW.fechalimite <= CURRENT_DATE + INTERVAL '15 days'
               AND NEW.fechalimite >= CURRENT_DATE THEN
                INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
                VALUES('CAI_Por_Vencer', 'CAI próximo a vencer',
                    'El CAI ' || COALESCE(NEW.cai, 'actual') ||
                    ' vence el ' || TO_CHAR(NEW.fechalimite, 'DD/MM/YYYY') ||
                    '. Solicite renovación con la SAR.',
                    '1', 'configuracion')
                ON CONFLICT DO NOTHING;
            END IF;
            RETURN NEW;
        END; $$`);
    await run('DROP IF EXISTS trg_configuracion_cai_vence',
        `DROP TRIGGER IF EXISTS trg_configuracion_cai_vence ON configuracion`);
    await run('trg_configuracion_cai_vence',
        `CREATE TRIGGER trg_configuracion_cai_vence
         AFTER INSERT OR UPDATE OF fechalimite ON configuracion
         FOR EACH ROW EXECUTE FUNCTION trg_alerta_cai_vencimiento()`);

    // ── FASE 10: VISTAS Y SEGURIDAD ───────────────────────────────────────────
    console.log('\n=== FASE 10: VISTAS Y SEGURIDAD ===\n');

    await run('VIEW v_clientes_masked', `
        CREATE OR REPLACE VIEW v_clientes_masked AS
        SELECT identidad, nombre, apellido,
            OVERLAY(telefono PLACING '****' FROM 5 FOR 4) AS telefono_masked,
            CASE WHEN correo IS NOT NULL
                 THEN SPLIT_PART(correo,'@',1) || '@***'
                 ELSE NULL END AS correo_masked,
            fechaCreacion
        FROM clientes`);

    await run('VIEW v_inventario_disponible', `
        CREATE OR REPLACE VIEW v_inventario_disponible AS
        SELECT i.codInventario, a.descripcion, c.tipo AS categoria,
            i.cantidad, i.precioVenta, i.precioCompra,
            (i.precioVenta - i.precioCompra) AS margen,
            u.nombre AS ubicacion
        FROM inventario i
        JOIN accesorios a  ON a.codAccesorio = i.codAccesorio
        JOIN categoria c   ON c.codCategoria = a.codCategoria
        LEFT JOIN ubicacion u ON u.idUbicacion = i.idubicacion
        WHERE i.estado IN ('Disponible','Activo') AND i.cantidad > 0`);

    await run('VIEW v_telefonos_disponibles', `
        CREATE OR REPLACE VIEW v_telefonos_disponibles AS
        SELECT t.codigo, t.marca, t.modelo, t.imei1, t.imei2,
            t.precioVenta, t.precioCompra,
            (t.precioVenta - t.precioCompra) AS margen,
            u.nombre AS ubicacion, p.nombre AS proveedor, t.fecha AS fecha_ingreso
        FROM telefonos t
        LEFT JOIN ubicacion u  ON u.idUbicacion = t.idubicacion
        LEFT JOIN proveedores p ON p.codProveedor = t.codProveedor
        WHERE t.estado = 'Disponible'`);

    await run('VIEW v_arqueo_activo', `
        CREATE OR REPLACE VIEW v_arqueo_activo AS
        SELECT a.idArqueo, a.idCaja, cj.nombre AS nombre_caja,
            a.fechaApertura, a.montoInicial, a.totalVentas,
            a.totalCostos, a.TotalGastos, a.ganancia, a.montoFinal,
            a.saldoTigoFinal, a.saldoClaroFinal,
            u.usuario AS abierto_por
        FROM arqueo a
        JOIN caja cj ON cj.idCaja = a.idCaja
        LEFT JOIN usuarios u ON u.codUsuario = a.idUsuario
        WHERE a.estado = 'Activo'`);

    // Roles DB (pueden fallar si no hay permisos de superusuario en Render)
    await run('ROLE erp_readonly', `
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_readonly') THEN
                CREATE ROLE erp_readonly;
            END IF;
        END $$`);
    await run('ROLE erp_app', `
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_app') THEN
                CREATE ROLE erp_app;
            END IF;
        END $$`);
    await run('GRANT SELECT a erp_readonly', `
        GRANT USAGE ON SCHEMA public TO erp_readonly;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO erp_readonly`);
    await run('GRANT DML a erp_app', `
        GRANT USAGE ON SCHEMA public TO erp_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
        REVOKE DELETE ON audit_log FROM erp_app`);

    // ── VERIFICACIÓN FINAL ────────────────────────────────────────────────────
    console.log('\n=== VERIFICACIÓN FINAL ===\n');
    const trigs = await pool.query(`
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name`);
    console.log('  TRIGGERS activos:');
    trigs.rows.forEach(r => console.log('    [' + r.event_object_table + '] ' + r.trigger_name));

    const fns = await pool.query(`
        SELECT routine_name FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
          AND routine_name LIKE 'sp_%' OR routine_name LIKE 'trg_%'
        ORDER BY routine_name`);
    console.log('\n  FUNCIONES creadas:');
    fns.rows.forEach(r => console.log('    ' + r.routine_name));

    const views = await pool.query(`
        SELECT table_name FROM information_schema.views
        WHERE table_schema = 'public' ORDER BY table_name`);
    console.log('\n  VISTAS disponibles:');
    views.rows.forEach(r => console.log('    ' + r.table_name));

    console.log('\n=== FASES 8 Y 10 COMPLETADAS ===\n');
    await pool.end();
}

main().catch(e => { console.error('\nError fatal:', e.message); pool.end(); process.exit(1); });
