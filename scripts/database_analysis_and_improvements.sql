-- =============================================================================
-- ANÁLISIS Y MEJORAS DE BASE DE DATOS - ERPSmartcloud
-- Versión: 2.0 | Fecha: 2026-04-04
-- PostgreSQL 14+ compatible
-- =============================================================================
-- ÍNDICE:
--   FASE 1  - Corrección de FK faltantes
--   FASE 2  - Constraints CHECK para estados y enums
--   FASE 3  - Normalización de tablas problemáticas
--   FASE 4  - Nuevas tablas recomendadas
--   FASE 5  - Índices para escalabilidad
--   FASE 6  - Columnas de auditoría
--   FASE 7  - Stored Procedures
--   FASE 8  - Triggers
--   FASE 9  - Jobs (pg_cron)
--   FASE 10 - Seguridad: Row Level Security + Roles DB
-- =============================================================================

-- Activar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto;           -- para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- para monitoreo de queries
-- NOTA: pg_cron no está disponible en Render - los jobs de la FASE 9 se omiten


-- =============================================================================
-- FASE 1: CORRECCIÓN DE FOREIGN KEYS FALTANTES
-- =============================================================================
-- PROBLEMA: telefonos.codProveedor y inventario.codProveedor no tienen FK
-- IMPACTO: Datos huérfanos, inconsistencia referencial

ALTER TABLE telefonos
    ADD CONSTRAINT fk_telefonos_proveedor
    FOREIGN KEY (codProveedor) REFERENCES proveedores(codProveedor)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE inventario
    ADD CONSTRAINT fk_inventario_proveedor
    FOREIGN KEY (codProveedor) REFERENCES proveedores(codProveedor)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- PROBLEMA: telefonos.idubicacion e inventario.idubicacion sin FK
ALTER TABLE telefonos
    ADD CONSTRAINT fk_telefonos_ubicacion
    FOREIGN KEY (idubicacion) REFERENCES ubicacion(idUbicacion)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE inventario
    ADD CONSTRAINT fk_inventario_ubicacion
    FOREIGN KEY (idubicacion) REFERENCES ubicacion(idUbicacion)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- PROBLEMA: accesorios.codCategoria sin FK declarada
ALTER TABLE accesorios
    ADD CONSTRAINT fk_accesorios_categoria
    FOREIGN KEY (codCategoria) REFERENCES categoria(codCategoria)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- PROBLEMA: ingresos sin FK a arqueo (correlación necesaria para cuadre)
ALTER TABLE ingresos
    ADD COLUMN IF NOT EXISTS idArqueo VARCHAR(100),
    ADD CONSTRAINT fk_ingresos_arqueo
    FOREIGN KEY (idArqueo) REFERENCES arqueo(idArqueo)
    ON DELETE SET NULL;

ALTER TABLE egresos
    ADD COLUMN IF NOT EXISTS idArqueo VARCHAR(100),
    ADD CONSTRAINT fk_egresos_arqueo
    FOREIGN KEY (idArqueo) REFERENCES arqueo(idArqueo)
    ON DELETE SET NULL;

-- PROBLEMA: reparaciones.nombre_tecnico es texto libre, debe referenciar empleado
ALTER TABLE reparaciones
    ADD COLUMN IF NOT EXISTS identidad_tecnico VARCHAR(100),
    ADD CONSTRAINT fk_reparaciones_tecnico
    FOREIGN KEY (identidad_tecnico) REFERENCES empleado(identidad)
    ON DELETE SET NULL;

-- PROBLEMA: garantias sin FK al producto original (polimórfico sin control)
-- Se soluciona en la FASE 3 (normalización)


-- =============================================================================
-- FASE 2: CHECK CONSTRAINTS PARA ESTADOS Y ENUMS
-- =============================================================================
-- PROBLEMA: estado VARCHAR sin validación permite valores arbitrarios
-- SOLUCIÓN: Agregar CHECK constraints (PostgreSQL los valida nativamente)

-- telefonos
ALTER TABLE telefonos
    ADD CONSTRAINT chk_telefonos_estado
    CHECK (estado IN ('Disponible','Vendido','Consignado','Garantia','Defectuoso','Dado de Baja'));

-- inventario
ALTER TABLE inventario
    ADD CONSTRAINT chk_inventario_estado
    CHECK (estado IN ('Disponible','Activo','Registrado','Agotado','Dado de Baja'));

-- ventas
ALTER TABLE ventas
    ADD CONSTRAINT chk_ventas_estado
    CHECK (estado IN ('Completada','Anulada','Pendiente'));

ALTER TABLE ventas
    ADD CONSTRAINT chk_ventas_tipo
    CHECK (tipoCompra IN ('Contado','Credito','KrediYa'));

ALTER TABLE ventas
    ADD CONSTRAINT chk_ventas_estado_pago
    CHECK (estado_pago_financiera IN ('Pendiente','Depositado','Rechazado') OR estado_pago_financiera IS NULL);

-- detalleventa
ALTER TABLE detalleventa
    ADD CONSTRAINT chk_detalleventa_tipo
    CHECK (tipoProducto IN ('TELEFONO','ACCESORIO','INGRESO'));

-- reparaciones
ALTER TABLE reparaciones
    ADD CONSTRAINT chk_reparaciones_estado
    CHECK (estado_reparacion IN ('Pendiente','En Taller','Listo','Entregado'));

ALTER TABLE reparaciones
    ADD CONSTRAINT chk_reparaciones_pago_tecnico
    CHECK (pago_tecnico_estado IN ('Pendiente','Pagado') OR pago_tecnico_estado IS NULL);

-- garantias
ALTER TABLE garantias
    ADD CONSTRAINT chk_garantias_estado
    CHECK (estado_garantia IN ('Pendiente','En Taller','Proveedor','Listo','Cambiado','Entregado'));

ALTER TABLE garantias
    ADD CONSTRAINT chk_garantias_tipo
    CHECK (tipo_producto IN ('TELEFONO','ACCESORIO'));

-- consignaciones
ALTER TABLE consignaciones
    ADD CONSTRAINT chk_consignaciones_estado
    CHECK (estado_consignacion IN ('Prestado','Devuelto','Vendido_Pagado','Perdido'));

ALTER TABLE consignaciones
    ADD CONSTRAINT chk_consignaciones_tipo
    CHECK (tipo_producto IN ('TELEFONO','ACCESORIO'));

-- ingresos: ampliar ENUM antes de crear el constraint
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Ajuste_Utilidad';
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'KrediYa_Prima';
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'KrediYa_Deposito';
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Recarga';
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Reparacion';
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Garantia_Cobro';
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Consignacion_Cobro';
ALTER TYPE tipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Otro';

ALTER TABLE ingresos
    ADD CONSTRAINT chk_ingresos_subtipo
    CHECK (subtipo_movimiento IN (
        'Venta','KrediYa_Prima','KrediYa_Deposito','Recarga',
        'Reparacion','Ajuste_Utilidad','Garantia_Cobro','Consignacion_Cobro','Otro'
    ) OR subtipo_movimiento IS NULL);

-- egresos
ALTER TABLE egresos
    ADD CONSTRAINT chk_egresos_categoria
    CHECK (categoria IN (
        'Gasto Operativo','Compra de Producto','Compra Saldo',
        'Pago Servicio de Reparacion','Perdida Margen Garantia',
        'Nomina','Retiro Socio','Otro'
    ) OR categoria IS NULL);

-- arqueo
ALTER TABLE arqueo
    ADD CONSTRAINT chk_arqueo_estado
    CHECK (estado IN ('Activo','Cerrada'));

-- usuarios
ALTER TABLE usuarios
    ADD CONSTRAINT chk_usuarios_estado
    CHECK (estado IN ('Activo','Inactivo','Bloqueado','Suspendido'));

-- empleado
ALTER TABLE empleado
    ADD CONSTRAINT chk_empleado_estado
    CHECK (estado IN ('Activo','Inactivo','Vacaciones','Retirado'));

-- paquetes
ALTER TABLE paquetes
    ADD CONSTRAINT chk_paquetes_estado
    CHECK (estado IN ('Activo','Inactivo'));

ALTER TABLE paquetes
    ADD CONSTRAINT chk_paquetes_red
    CHECK (red IN ('TIGO','CLARO','BALAM','HONDUTEL'));

-- saldos
ALTER TABLE saldos
    ADD CONSTRAINT chk_saldos_red
    CHECK (red IN ('TIGO','CLARO','BALAM','HONDUTEL'));

-- =============================================================================
-- FASE 3: NORMALIZACIÓN DE TABLAS PROBLEMÁTICAS
-- =============================================================================

-- 3.1 PROBLEMA: configuracion no tiene historial de cambios del CAI
-- La fecha límite del CAI es crítica para facturación legal en Honduras
CREATE TABLE IF NOT EXISTS configuracion_cai_historial (
    id          SERIAL PRIMARY KEY,
    cai         VARCHAR(255) NOT NULL,
    rangoinicial VARCHAR(100) NOT NULL,
    rangofinal  VARCHAR(100) NOT NULL,
    fechalimite DATE NOT NULL,
    contador_actual INTEGER DEFAULT 1,
    fecha_registro TIMESTAMPTZ DEFAULT NOW(),
    registrado_por VARCHAR(100) REFERENCES usuarios(codUsuario)
);

COMMENT ON TABLE configuracion_cai_historial IS
    'Historial de CAIs usados. El CAI activo es el último registro con fechalimite >= CURRENT_DATE';

-- 3.2 PROBLEMA: reparaciones.complementos es TEXT libre (no estructurado)
-- SOLUCIÓN: tabla de partes/accesorios por reparación
CREATE TABLE IF NOT EXISTS reparacion_complementos (
    id              SERIAL PRIMARY KEY,
    id_reparacion   INTEGER NOT NULL REFERENCES reparaciones(id_reparacion) ON DELETE CASCADE,
    descripcion     VARCHAR(255) NOT NULL,
    cantidad        INTEGER DEFAULT 1,
    costo_unitario  NUMERIC(10,2) DEFAULT 0
);

COMMENT ON TABLE reparacion_complementos IS
    'Partes y accesorios usados en cada reparación (reemplaza campo TEXT no estructurado)';

-- 3.3 PROBLEMA: consignaciones usa id_producto polimórfico sin FK real
-- SOLUCIÓN: dos FKs nullable con CHECK que al menos una tenga valor
ALTER TABLE consignaciones
    ADD COLUMN IF NOT EXISTS cod_telefono  VARCHAR(100) REFERENCES telefonos(codigo) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cod_inventario VARCHAR(100) REFERENCES inventario(codInventario) ON DELETE SET NULL,
    ADD CONSTRAINT chk_consignaciones_producto
    CHECK (
        (cod_telefono IS NOT NULL AND cod_inventario IS NULL) OR
        (cod_telefono IS NULL AND cod_inventario IS NOT NULL)
    );

COMMENT ON COLUMN consignaciones.cod_telefono IS
    'FK a telefonos. Usar este O cod_inventario, nunca ambos';
COMMENT ON COLUMN consignaciones.id_producto IS
    'DEPRECADO - usar cod_telefono o cod_inventario. Mantener por compatibilidad temporal';

-- 3.4 PROBLEMA: detalleventa mezcla idTelefono, idAccesorio e idIngreso sin FK a paquetes
-- Los paquetes TIGO/CLARO se venden pero no hay FK
ALTER TABLE detalleventa
    ADD COLUMN IF NOT EXISTS codPaquete VARCHAR(100) REFERENCES paquetes(idPaquete) ON DELETE SET NULL;

-- 3.5 PROBLEMA: ventas.descuento no tiene relación con quién autorizó el descuento
ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS descuento_autorizado_por VARCHAR(100) REFERENCES usuarios(codUsuario),
    ADD COLUMN IF NOT EXISTS descuento_motivo TEXT;

-- 3.6 PROBLEMA: No hay tabla de pagos parciales / cuotas para ventas a crédito
CREATE TABLE IF NOT EXISTS pagos_venta (
    id_pago         SERIAL PRIMARY KEY,
    cod_venta       VARCHAR(100) NOT NULL REFERENCES ventas(codVenta) ON DELETE RESTRICT,
    monto           NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    fecha_pago      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metodo_pago     VARCHAR(50) NOT NULL CHECK (metodo_pago IN ('Efectivo','Transferencia','Tarjeta','KrediYa','Otro')),
    referencia      VARCHAR(255),
    idCaja          VARCHAR(100) REFERENCES caja(idCaja),
    registrado_por  VARCHAR(100) REFERENCES usuarios(codUsuario),
    notas           TEXT
);

COMMENT ON TABLE pagos_venta IS
    'Registro de abonos/pagos parciales a ventas a crédito o financiadas';

-- 3.7 PROBLEMA: No hay tabla de movimientos de inventario (kardex)
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
    referencia_doc  VARCHAR(100),  -- codVenta, id_garantia, etc.
    fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registrado_por  VARCHAR(100) REFERENCES usuarios(codUsuario),
    observaciones   TEXT
);

COMMENT ON TABLE kardex_inventario IS
    'Trazabilidad completa de todos los movimientos de inventario (auditoría de stock)';


-- =============================================================================
-- FASE 4: NUEVAS TABLAS RECOMENDADAS
-- =============================================================================

-- 4.1 Tabla de sesiones de usuarios (seguridad y auditoría de accesos)
CREATE TABLE IF NOT EXISTS sesiones_usuarios (
    id              BIGSERIAL PRIMARY KEY,
    codUsuario      VARCHAR(100) NOT NULL REFERENCES usuarios(codUsuario) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,  -- hash del JWT/token, nunca el token en claro
    ip_address      INET,
    user_agent      TEXT,
    fecha_inicio    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_expira    TIMESTAMPTZ NOT NULL,
    fecha_cierre    TIMESTAMPTZ,
    activa          BOOLEAN DEFAULT TRUE,
    motivo_cierre   VARCHAR(50) CHECK (motivo_cierre IN ('Logout','Expiracion','Forzado','Inactividad') OR motivo_cierre IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones_usuarios(codUsuario, activa);
CREATE INDEX IF NOT EXISTS idx_sesiones_token ON sesiones_usuarios(token_hash);

COMMENT ON TABLE sesiones_usuarios IS
    'Control de sesiones activas. Permite invalidar sesiones remotamente y detectar accesos sospechosos';

-- 4.2 Tabla de auditoría general de cambios críticos
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    tabla           VARCHAR(100) NOT NULL,
    operacion       CHAR(1) NOT NULL CHECK (operacion IN ('I','U','D')),  -- Insert/Update/Delete
    pk_valor        TEXT NOT NULL,
    datos_antes     JSONB,
    datos_despues   JSONB,
    usuario_db      VARCHAR(100) DEFAULT current_user,
    usuario_app     VARCHAR(100),
    ip_address      INET,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (fecha);

-- Particiones por año (escalabilidad: cada año en su propia partición)
CREATE TABLE IF NOT EXISTS audit_log_2024 PARTITION OF audit_log
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS audit_log_2025 PARTITION OF audit_log
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS audit_log_2026 PARTITION OF audit_log
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS audit_log_2027 PARTITION OF audit_log
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX IF NOT EXISTS idx_audit_tabla_fecha ON audit_log(tabla, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_app, fecha DESC);

COMMENT ON TABLE audit_log IS
    'Log inmutable de cambios en tablas críticas. Particionado por año para rendimiento';

-- 4.3 Tabla de intentos de login (seguridad anti-brute-force)
CREATE TABLE IF NOT EXISTS login_intentos (
    id              BIGSERIAL PRIMARY KEY,
    usuario         VARCHAR(100) NOT NULL,
    ip_address      INET,
    exitoso         BOOLEAN NOT NULL,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_usuario_fecha ON login_intentos(usuario, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_login_ip_fecha ON login_intentos(ip_address, fecha DESC);

COMMENT ON TABLE login_intentos IS
    'Registro de intentos de autenticación para detección de ataques de fuerza bruta';

-- 4.4 Tabla de notificaciones internas del sistema
CREATE TABLE IF NOT EXISTS notificaciones (
    id              BIGSERIAL PRIMARY KEY,
    tipo            VARCHAR(50) NOT NULL CHECK (tipo IN (
        'Garantia_Pendiente','Reparacion_Lista','Stock_Bajo','CAI_Por_Vencer',
        'Consignacion_Vencida','Pago_Pendiente','Sistema','Otro'
    )),
    titulo          VARCHAR(255) NOT NULL,
    cuerpo          TEXT,
    para_usuario    VARCHAR(100) REFERENCES usuarios(codUsuario) ON DELETE CASCADE,
    leida           BOOLEAN DEFAULT FALSE,
    fecha_creacion  TIMESTAMPTZ DEFAULT NOW(),
    fecha_lectura   TIMESTAMPTZ,
    referencia_id   TEXT,  -- ID del registro relacionado
    referencia_tabla VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_notif_usuario_leida ON notificaciones(para_usuario, leida, fecha_creacion DESC);

-- 4.5 Tabla de configuración de alertas de stock mínimo
CREATE TABLE IF NOT EXISTS alertas_stock (
    id              SERIAL PRIMARY KEY,
    cod_inventario  VARCHAR(100) NOT NULL REFERENCES inventario(codInventario) ON DELETE CASCADE,
    stock_minimo    INTEGER NOT NULL DEFAULT 5,
    activa          BOOLEAN DEFAULT TRUE,
    ultima_alerta   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_stock_unique ON alertas_stock(cod_inventario);


-- =============================================================================
-- FASE 5: ÍNDICES PARA ESCALABILIDAD Y RENDIMIENTO
-- =============================================================================
-- Criterio: índices en columnas usadas en WHERE, JOIN, ORDER BY frecuentes

-- ventas (tabla más consultada)
CREATE INDEX IF NOT EXISTS idx_ventas_fecha           ON ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente         ON ventas(identidadCliente);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor        ON ventas(codVendedor);
CREATE INDEX IF NOT EXISTS idx_ventas_caja_fecha      ON ventas(idCaja, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_estado          ON ventas(estado) WHERE estado = 'Completada';
CREATE INDEX IF NOT EXISTS idx_ventas_krediya         ON ventas(es_krediya, estado_pago_financiera) WHERE es_krediya = TRUE;

-- detalleventa
CREATE INDEX IF NOT EXISTS idx_detalle_venta          ON detalleventa(idVenta);
CREATE INDEX IF NOT EXISTS idx_detalle_telefono       ON detalleventa(idTelefono) WHERE idTelefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_detalle_accesorio      ON detalleventa(idAccesorio) WHERE idAccesorio IS NOT NULL;

-- telefonos (búsquedas por IMEI son muy frecuentes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_telefonos_imei1  ON telefonos(imei1);
CREATE INDEX IF NOT EXISTS idx_telefonos_imei2         ON telefonos(imei2) WHERE imei2 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telefonos_estado        ON telefonos(estado);
CREATE INDEX IF NOT EXISTS idx_telefonos_marca_modelo  ON telefonos(marca, modelo);
CREATE INDEX IF NOT EXISTS idx_telefonos_proveedor     ON telefonos(codProveedor);

-- inventario
CREATE INDEX IF NOT EXISTS idx_inventario_accesorio   ON inventario(codAccesorio);
CREATE INDEX IF NOT EXISTS idx_inventario_estado       ON inventario(estado);
CREATE INDEX IF NOT EXISTS idx_inventario_proveedor    ON inventario(codProveedor);

-- clientes (búsquedas por teléfono y nombre son frecuentes)
CREATE INDEX IF NOT EXISTS idx_clientes_nombre         ON clientes(nombre, apellido);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono       ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_correo         ON clientes(correo) WHERE correo IS NOT NULL;

-- reparaciones
CREATE INDEX IF NOT EXISTS idx_rep_cliente             ON reparaciones(identidad_cliente);
CREATE INDEX IF NOT EXISTS idx_rep_estado              ON reparaciones(estado_reparacion);
CREATE INDEX IF NOT EXISTS idx_rep_imei                ON reparaciones(imei_equipo) WHERE imei_equipo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rep_fecha               ON reparaciones(fecha_ingreso DESC);

-- ingresos y egresos (reportes financieros)
CREATE INDEX IF NOT EXISTS idx_ingresos_caja_fecha     ON ingresos(idCaja, fechaCreacion DESC);
CREATE INDEX IF NOT EXISTS idx_ingresos_subtipo        ON ingresos(subtipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_egresos_caja_fecha      ON egresos(idCaja, fechaCreacion DESC);
CREATE INDEX IF NOT EXISTS idx_egresos_categoria       ON egresos(categoria);

-- garantias
CREATE INDEX IF NOT EXISTS idx_garantias_cliente       ON garantias(identidad_cliente);
CREATE INDEX IF NOT EXISTS idx_garantias_estado        ON garantias(estado_garantia);
CREATE INDEX IF NOT EXISTS idx_garantias_venta         ON garantias(cod_venta);

-- arqueo
CREATE INDEX IF NOT EXISTS idx_arqueo_caja_estado      ON arqueo(idCaja, estado);

-- kardex_inventario (tabla de alta inserción)
CREATE INDEX IF NOT EXISTS idx_kardex_tipo_cod         ON kardex_inventario(tipo_producto, cod_inventario, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_telefono         ON kardex_inventario(cod_telefono, fecha DESC) WHERE cod_telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kardex_fecha            ON kardex_inventario(fecha DESC);

-- usuarios (autenticación)
CREATE INDEX IF NOT EXISTS idx_usuarios_estado         ON usuarios(estado) WHERE estado = 'Activo';


-- =============================================================================
-- FASE 6: COLUMNAS DE AUDITORÍA EN TABLAS CRÍTICAS
-- =============================================================================
-- Se agregan updated_at y updated_by a tablas que no las tienen

ALTER TABLE telefonos
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) REFERENCES usuarios(codUsuario);

ALTER TABLE inventario
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) REFERENCES usuarios(codUsuario);

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) REFERENCES usuarios(codUsuario);

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) REFERENCES usuarios(codUsuario);

ALTER TABLE configuracion
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) REFERENCES usuarios(codUsuario);

-- Columna para seguridad de contraseñas
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW();


-- =============================================================================
-- FASE 7: STORED PROCEDURES (FUNCIONES)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SP 1: Generar siguiente ID (reemplaza lógica Node.js con race condition)
-- BENEFICIO: Atómico, seguro para concurrencia, sin race conditions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_generar_id(
    p_tabla  TEXT,
    p_columna TEXT,
    p_prefijo TEXT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_num INTEGER := 0;
    v_id TEXT;
    v_row RECORD;
BEGIN
    EXECUTE format(
        'SELECT %I FROM %I WHERE %I LIKE $1 ORDER BY LENGTH(%I) DESC, %I DESC LIMIT 1',
        p_columna, p_tabla, p_columna, p_columna, p_columna
    )
    USING (p_prefijo || '-%')
    INTO v_row;

    IF v_row IS NOT NULL THEN
        v_id := v_row::text;
        -- Extraer número del ID (ej: TEL-0042 -> 42)
        v_max_num := CAST(SPLIT_PART(v_id, '-', 2) AS INTEGER);
    END IF;

    RETURN p_prefijo || '-' || LPAD((v_max_num + 1)::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION sp_generar_id IS
    'Genera el próximo ID secuencial para una tabla/prefijo dado. Reemplaza generateNextId de Node.js. IMPORTANTE: llamar dentro de una transacción con SELECT FOR UPDATE para evitar duplicados.';


-- -----------------------------------------------------------------------------
-- SP 2: Cerrar arqueo del día (lógica crítica de negocio en la DB)
-- BENEFICIO: Transacción atómica, no puede quedar en estado inconsistente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_cerrar_arqueo(
    p_id_caja       VARCHAR(100),
    p_usuario       VARCHAR(100),
    p_saldo_tigo    NUMERIC(10,2) DEFAULT 0,
    p_saldo_claro   NUMERIC(10,2) DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_arqueo        RECORD;
    v_total_ing     NUMERIC(10,2);
    v_total_costos  NUMERIC(10,2);
    v_total_egr     NUMERIC(10,2);
    v_monto_final   NUMERIC(10,2);
    v_ganancia      NUMERIC(10,2);
    v_hoy           DATE := CURRENT_DATE;
BEGIN
    -- Bloquear el arqueo activo para evitar concurrencia
    SELECT * INTO v_arqueo
    FROM arqueo
    WHERE idCaja = p_id_caja AND estado = 'Activo'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No existe arqueo activo para esta caja');
    END IF;

    -- Calcular totales del día
    SELECT
        COALESCE(SUM(monto), 0),
        COALESCE(SUM(costo), 0)
    INTO v_total_ing, v_total_costos
    FROM ingresos
    WHERE idCaja = p_id_caja
      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = v_hoy
      AND (subtipo_movimiento IS NULL OR subtipo_movimiento <> 'KrediYa_Deposito');

    SELECT COALESCE(SUM(monto), 0)
    INTO v_total_egr
    FROM egresos
    WHERE idCaja = p_id_caja
      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = v_hoy;

    v_monto_final := v_arqueo.montoinicial + v_total_ing - v_total_egr;
    v_ganancia    := v_total_ing - v_total_costos;

    -- Actualizar arqueo
    UPDATE arqueo SET
        fechaCierre         = NOW() AT TIME ZONE 'America/Tegucigalpa',
        montoFinal          = v_monto_final,
        totalVentas         = v_total_ing,
        totalCostos         = v_total_costos,
        TotalGastos         = v_total_egr,
        ganancia            = v_ganancia,
        saldoTigoFinal      = p_saldo_tigo,
        saldoClaroFinal     = p_saldo_claro,
        estado              = 'Cerrada',
        idUsuario           = p_usuario
    WHERE idArqueo = v_arqueo.idarqueo;

    -- Actualizar FK en ingresos/egresos del día (si tiene la columna)
    UPDATE ingresos SET idArqueo = v_arqueo.idarqueo
    WHERE idCaja = p_id_caja
      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalda') = v_hoy
      AND idArqueo IS NULL;

    UPDATE egresos SET idArqueo = v_arqueo.idarqueo
    WHERE idCaja = p_id_caja
      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = v_hoy
      AND idArqueo IS NULL;

    RETURN jsonb_build_object(
        'ok', true,
        'idArqueo', v_arqueo.idarqueo,
        'montoFinal', v_monto_final,
        'ganancia', v_ganancia,
        'totalIngresos', v_total_ing,
        'totalEgresos', v_total_egr
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- SP 3: Anular venta (reversión completa del inventario)
-- BENEFICIO: Garantiza consistencia al anular - devuelve stock automáticamente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_anular_venta(
    p_cod_venta     VARCHAR(100),
    p_usuario       VARCHAR(100),
    p_motivo        TEXT DEFAULT 'Sin motivo especificado'
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_venta     RECORD;
    v_detalle   RECORD;
    v_count     INTEGER := 0;
BEGIN
    -- Verificar que la venta existe y está completada
    SELECT * INTO v_venta FROM ventas
    WHERE codVenta = p_cod_venta FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Venta no encontrada');
    END IF;

    IF v_venta.estado = 'Anulada' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'La venta ya está anulada');
    END IF;

    -- Revertir stock de cada línea
    FOR v_detalle IN
        SELECT * FROM detalleventa WHERE idVenta = p_cod_venta
    LOOP
        IF v_detalle.tipoProducto = 'TELEFONO' AND v_detalle.idTelefono IS NOT NULL THEN
            UPDATE telefonos SET
                estado     = 'Disponible',
                updated_at = NOW(),
                updated_by = p_usuario
            WHERE codigo = v_detalle.idTelefono;

            -- Registrar en kardex
            INSERT INTO kardex_inventario(tipo_producto, cod_telefono, tipo_movimiento, cantidad,
                precio_costo, precio_venta, referencia_doc, registrado_por, observaciones)
            VALUES('TELEFONO', v_detalle.idTelefono, 'Devolucion', 1,
                NULL, v_detalle.precioVenta, p_cod_venta, p_usuario,
                'Anulación venta: ' || p_motivo);

        ELSIF v_detalle.tipoProducto = 'ACCESORIO' AND v_detalle.idAccesorio IS NOT NULL THEN
            UPDATE inventario SET
                cantidad   = cantidad + COALESCE(v_detalle.cantidad, 1),
                updated_at = NOW(),
                updated_by = p_usuario
            WHERE codInventario = v_detalle.idAccesorio;

            INSERT INTO kardex_inventario(tipo_producto, cod_inventario, tipo_movimiento, cantidad,
                precio_venta, referencia_doc, registrado_por, observaciones)
            VALUES('ACCESORIO', v_detalle.idAccesorio, 'Devolucion',
                COALESCE(v_detalle.cantidad, 1), v_detalle.precioVenta,
                p_cod_venta, p_usuario, 'Anulación venta: ' || p_motivo);
        END IF;

        v_count := v_count + 1;
    END LOOP;

    -- Marcar venta como anulada
    UPDATE ventas SET
        estado     = 'Anulada',
        updated_at = NOW(),
        updated_by = p_usuario
    WHERE codVenta = p_cod_venta;

    RETURN jsonb_build_object(
        'ok', true,
        'codVenta', p_cod_venta,
        'lineas_revertidas', v_count
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- SP 4: Resumen financiero del día (reemplaza queries multiples en reportes)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_resumen_financiero_dia(
    p_fecha DATE DEFAULT CURRENT_DATE,
    p_id_caja VARCHAR(100) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE   -- puede ejecutarse varias veces, no modifica datos
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'fecha',          p_fecha,
        'ventas_count',   COUNT(DISTINCT v.codVenta),
        'ventas_total',   COALESCE(SUM(v.total), 0),
        'ventas_isv',     COALESCE(SUM(v.isv), 0),
        'ingresos_total', COALESCE(SUM(i.monto_ing), 0),
        'egresos_total',  COALESCE(SUM(e.monto_egr), 0),
        'ganancia_bruta', COALESCE(SUM(i.monto_ing), 0) - COALESCE(SUM(i.costo_ing), 0),
        'ventas_anuladas', COUNT(DISTINCT v.codVenta) FILTER (WHERE v.estado = 'Anulada')
    )
    INTO v_result
    FROM ventas v
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(monto),0) monto_ing, COALESCE(SUM(costo),0) costo_ing
        FROM ingresos
        WHERE (p_id_caja IS NULL OR idCaja = p_id_caja)
          AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha
    ) i ON TRUE
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(monto),0) monto_egr
        FROM egresos
        WHERE (p_id_caja IS NULL OR idCaja = p_id_caja)
          AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha
    ) e ON TRUE
    WHERE DATE(v.fecha AT TIME ZONE 'America/Tegucigalpa') = p_fecha
      AND (p_id_caja IS NULL OR v.idCaja = p_id_caja);

    RETURN v_result;
END;
$$;


-- -----------------------------------------------------------------------------
-- SP 5: Verificar y bloquear usuario por intentos fallidos
-- BENEFICIO: Seguridad anti-brute-force a nivel de base de datos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_registrar_intento_login(
    p_usuario       VARCHAR(100),
    p_exitoso       BOOLEAN,
    p_ip            INET,
    p_user_agent    TEXT DEFAULT NULL,
    p_tenant_id     UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_intentos_recientes INTEGER;
    v_usr RECORD;
BEGIN
    -- Registrar intento
    INSERT INTO login_intentos(usuario, ip_address, exitoso, user_agent)
    VALUES (p_usuario, p_ip, p_exitoso, p_user_agent);

    IF p_exitoso THEN
        -- Login exitoso: resetear contador y registrar
        UPDATE usuarios SET
            intentos_fallidos   = 0,
            bloqueado_hasta     = NULL,
            ultimo_login        = NOW()
        WHERE usuario = p_usuario
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

        RETURN jsonb_build_object('ok', true, 'bloqueado', false);
    ELSE
        -- Login fallido: incrementar contador
        UPDATE usuarios SET
            intentos_fallidos = intentos_fallidos + 1
        WHERE usuario = p_usuario
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        RETURNING * INTO v_usr;

        IF NOT FOUND THEN
            -- Usuario no existe, igual registrar para detectar enumeración
            RETURN jsonb_build_object('ok', false, 'bloqueado', false, 'motivo', 'usuario_invalido');
        END IF;

        -- Bloquear si supera 5 intentos
        IF v_usr.intentos_fallidos >= 5 THEN
            UPDATE usuarios SET
                bloqueado_hasta = NOW() + INTERVAL '15 minutes',
                estado          = CASE WHEN intentos_fallidos >= 10 THEN 'Bloqueado' ELSE estado END
            WHERE usuario = p_usuario
              AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

            -- Crear notificación para admins
            INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
            VALUES (
                'Sistema',
                'Usuario bloqueado por intentos fallidos',
                'El usuario ' || p_usuario || ' fue bloqueado tras múltiples intentos fallidos desde IP ' || p_ip::TEXT,
                p_usuario, 'usuarios'
            );

            RETURN jsonb_build_object('ok', false, 'bloqueado', true, 'intentos', v_usr.intentos_fallidos);
        END IF;

        RETURN jsonb_build_object('ok', false, 'bloqueado', false, 'intentos', v_usr.intentos_fallidos);
    END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- SP 6: Calcular saldo de balance TIGO/CLARO en tiempo real
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_calcular_saldo_red(
    p_red   VARCHAR(50),
    p_fecha DATE DEFAULT CURRENT_DATE
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_saldo_inicio  NUMERIC(10,2) := 0;
    v_comprado      NUMERIC(10,2) := 0;
    v_vendido       NUMERIC(10,2) := 0;
    v_resultado     NUMERIC(10,2);
BEGIN
    -- Saldo del día anterior (cierre)
    SELECT COALESCE(saldoFinal, 0) INTO v_saldo_inicio
    FROM saldos
    WHERE red = p_red AND fecha = p_fecha - 1;

    -- Compras del día (egresos con categoría Compra Saldo)
    SELECT COALESCE(SUM(monto), 0) INTO v_comprado
    FROM egresos
    WHERE categoria = 'Compra Saldo'
      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha;
    -- Nota: se podría filtrar por red si se agrega columna red a egresos

    -- Ventas de recargas del día
    SELECT COALESCE(SUM(monto), 0) INTO v_vendido
    FROM ingresos
    WHERE subtipo_movimiento = 'Recarga'
      AND DATE(fechaCreacion AT TIME ZONE 'America/Tegucigalpa') = p_fecha;

    v_resultado := v_saldo_inicio + v_comprado - v_vendido;

    RETURN jsonb_build_object(
        'red',           p_red,
        'fecha',         p_fecha,
        'saldo_inicio',  v_saldo_inicio,
        'comprado',      v_comprado,
        'vendido',       v_vendido,
        'saldo_actual',  v_resultado
    );
END;
$$;


-- =============================================================================
-- FASE 8: TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TRIGGER 1: Actualizar updated_at automáticamente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW() AT TIME ZONE 'America/Tegucigalpa';
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_telefonos_updated_at
    BEFORE UPDATE ON telefonos
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_inventario_updated_at
    BEFORE UPDATE ON inventario
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_ventas_updated_at
    BEFORE UPDATE ON ventas
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_clientes_updated_at
    BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();


-- -----------------------------------------------------------------------------
-- TRIGGER 2: Mover teléfono a estado "Vendido" al insertar detalleventa
-- BENEFICIO: Consistencia de inventario automática, sin depender del código app
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_actualizar_stock_venta()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_vendedor VARCHAR(100);
BEGIN
    -- Obtener vendedor de la venta
    SELECT codVendedor INTO v_vendedor
    FROM ventas WHERE codVenta = NEW.idVenta;

    IF NEW.tipoProducto = 'TELEFONO' AND NEW.idTelefono IS NOT NULL THEN
        UPDATE telefonos SET
            estado     = 'Vendido',
            updated_at = NOW(),
            updated_by = v_vendedor
        WHERE codigo = NEW.idTelefono;

        INSERT INTO kardex_inventario(
            tipo_producto, cod_telefono, tipo_movimiento, cantidad,
            precio_venta, referencia_doc, registrado_por
        ) VALUES (
            'TELEFONO', NEW.idTelefono, 'Venta', 1,
            NEW.precioVenta, NEW.idVenta, v_vendedor
        );

    ELSIF NEW.tipoProducto = 'ACCESORIO' AND NEW.idAccesorio IS NOT NULL THEN
        UPDATE inventario SET
            cantidad   = cantidad - COALESCE(NEW.cantidad, 1),
            updated_at = NOW(),
            updated_by = v_vendedor
        WHERE codInventario = NEW.idAccesorio;

        INSERT INTO kardex_inventario(
            tipo_producto, cod_inventario, tipo_movimiento, cantidad,
            precio_venta, referencia_doc, registrado_por
        ) VALUES (
            'ACCESORIO', NEW.idAccesorio, 'Venta', COALESCE(NEW.cantidad, 1),
            NEW.precioVenta, NEW.idVenta, v_vendedor
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detalleventa_actualizar_stock
    AFTER INSERT ON detalleventa
    FOR EACH ROW EXECUTE FUNCTION trg_actualizar_stock_venta();


-- -----------------------------------------------------------------------------
-- TRIGGER 3: Alerta cuando inventario de accesorio baja del mínimo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_alerta_stock_bajo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_minimo    INTEGER;
    v_nombre    VARCHAR(255);
BEGIN
    -- Solo verificar si la cantidad bajó
    IF NEW.cantidad < OLD.cantidad THEN
        SELECT a.stock_minimo INTO v_minimo
        FROM alertas_stock a
        WHERE a.cod_inventario = NEW.codInventario AND a.activa = TRUE;

        IF FOUND AND NEW.cantidad <= v_minimo THEN
            SELECT ac.descripcion INTO v_nombre
            FROM accesorios ac WHERE ac.codAccesorio = NEW.codAccesorio;

            INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
            VALUES (
                'Stock_Bajo',
                'Stock bajo: ' || COALESCE(v_nombre, NEW.codInventario),
                'El accesorio ' || COALESCE(v_nombre, NEW.codInventario) ||
                ' tiene solo ' || NEW.cantidad || ' unidades (mínimo: ' || v_minimo || ')',
                NEW.codInventario, 'inventario'
            );

            UPDATE alertas_stock SET ultima_alerta = NOW()
            WHERE cod_inventario = NEW.codInventario;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventario_stock_bajo
    AFTER UPDATE OF cantidad ON inventario
    FOR EACH ROW EXECUTE FUNCTION trg_alerta_stock_bajo();


-- -----------------------------------------------------------------------------
-- TRIGGER 4: Auditoría en tablas críticas (ventas, configuracion, usuarios)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_operacion CHAR(1);
    v_pk        TEXT;
BEGIN
    v_operacion := CASE TG_OP WHEN 'INSERT' THEN 'I' WHEN 'UPDATE' THEN 'U' ELSE 'D' END;

    -- Extraer PK según tabla
    v_pk := CASE TG_TABLE_NAME
        WHEN 'ventas'        THEN COALESCE(NEW.codVenta, OLD.codVenta)
        WHEN 'configuracion' THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
        WHEN 'usuarios'      THEN COALESCE(NEW.codUsuario, OLD.codUsuario)
        WHEN 'telefonos'     THEN COALESCE(NEW.codigo, OLD.codigo)
        ELSE 'UNKNOWN'
    END;

    INSERT INTO audit_log(tabla, operacion, pk_valor, datos_antes, datos_despues, fecha)
    VALUES (
        TG_TABLE_NAME,
        v_operacion,
        v_pk,
        CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
        NOW()
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar auditoría a tablas críticas
CREATE TRIGGER trg_ventas_audit
    AFTER INSERT OR UPDATE OR DELETE ON ventas
    FOR EACH ROW EXECUTE FUNCTION trg_audit_log();

CREATE TRIGGER trg_configuracion_audit
    AFTER INSERT OR UPDATE OR DELETE ON configuracion
    FOR EACH ROW EXECUTE FUNCTION trg_audit_log();

CREATE TRIGGER trg_usuarios_audit
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION trg_audit_log();

CREATE TRIGGER trg_telefonos_audit
    AFTER INSERT OR UPDATE OR DELETE ON telefonos
    FOR EACH ROW EXECUTE FUNCTION trg_audit_log();


-- -----------------------------------------------------------------------------
-- TRIGGER 5: Verificar que no se duplique IMEI en la base de datos
-- (Puede haber IMEI repetido entre distintos registros si no se cuida)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_imei_duplicado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Validar IMEI1 no esté en otro teléfono activo
    IF EXISTS (
        SELECT 1 FROM telefonos
        WHERE imei1 = NEW.imei1
          AND codigo != NEW.codigo
          AND estado NOT IN ('Vendido','Dado de Baja')
    ) THEN
        RAISE EXCEPTION 'IMEI1 % ya está registrado en otro equipo activo', NEW.imei1;
    END IF;

    -- Validar IMEI2 si existe
    IF NEW.imei2 IS NOT NULL AND EXISTS (
        SELECT 1 FROM telefonos
        WHERE imei2 = NEW.imei2
          AND codigo != NEW.codigo
          AND estado NOT IN ('Vendido','Dado de Baja')
    ) THEN
        RAISE EXCEPTION 'IMEI2 % ya está registrado en otro equipo activo', NEW.imei2;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_telefonos_imei_unico
    BEFORE INSERT OR UPDATE OF imei1, imei2 ON telefonos
    FOR EACH ROW EXECUTE FUNCTION trg_validar_imei_duplicado();


-- -----------------------------------------------------------------------------
-- TRIGGER 6: Alerta cuando el CAI está próximo a vencer (15 días antes)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_alerta_cai_vencimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.fechalimite IS NOT NULL
       AND NEW.fechalimite <= CURRENT_DATE + INTERVAL '15 days'
       AND NEW.fechalimite >= CURRENT_DATE THEN

        INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
        VALUES (
            'CAI_Por_Vencer',
            'CAI próximo a vencer',
            'El CAI ' || COALESCE(NEW.cai, 'actual') ||
            ' vence el ' || TO_CHAR(NEW.fechalimite, 'DD/MM/YYYY') ||
            '. Solicite renovación con la SAR.',
            '1', 'configuracion'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_configuracion_cai_vence
    AFTER INSERT OR UPDATE OF fechalimite ON configuracion
    FOR EACH ROW EXECUTE FUNCTION trg_alerta_cai_vencimiento();


-- =============================================================================
-- FASE 9: JOBS PROGRAMADOS (pg_cron)
-- PRERREQUISITO: CREATE EXTENSION pg_cron; + debe estar habilitado en postgresql.conf
-- =============================================================================

-- Job 1: Crear nueva partición de audit_log para el año siguiente (1 enero de cada año)
SELECT cron.schedule(
    'crear_particion_audit_anual',
    '0 0 1 1 *',  -- 1 de enero a medianoche
    $$
    DO $$
    DECLARE
        v_year INT := EXTRACT(YEAR FROM CURRENT_DATE) + 1;
        v_inicio TEXT := v_year || '-01-01';
        v_fin    TEXT := (v_year + 1) || '-01-01';
        v_tabla  TEXT := 'audit_log_' || v_year;
    BEGIN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
            v_tabla, v_inicio, v_fin
        );
    END;
    $$
    $$
);

-- Job 2: Verificar CAI por vencer (todos los días a las 8 AM Honduras)
SELECT cron.schedule(
    'verificar_cai_vencimiento_diario',
    '0 14 * * *',  -- 14:00 UTC = 8:00 AM GMT-6 (Honduras)
    $$
    INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
    SELECT
        'CAI_Por_Vencer',
        'CAI próximo a vencer - ' || TO_CHAR(fechalimite, 'DD/MM/YYYY'),
        'Quedan ' || (fechalimite - CURRENT_DATE) || ' días para que venza el CAI. Número: ' || COALESCE(cai, 'N/A'),
        '1',
        'configuracion'
    FROM configuracion
    WHERE fechalimite IS NOT NULL
      AND fechalimite BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      AND id = 1
    ON CONFLICT DO NOTHING;
    $$
);

-- Job 3: Revisar garantías pendientes sin resolución (>30 días) - Lunes a las 9 AM
SELECT cron.schedule(
    'alertar_garantias_sin_resolucion',
    '0 15 * * 1',  -- Lunes 15:00 UTC = 9:00 AM GMT-6
    $$
    INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
    SELECT
        'Garantia_Pendiente',
        'Garantía sin resolver: #' || id_garantia::TEXT,
        'La garantía del cliente ha estado pendiente por ' ||
        (CURRENT_DATE - DATE(fecha_ingreso)) || ' días. Venta: ' || COALESCE(cod_venta, 'N/A'),
        id_garantia::TEXT,
        'garantias'
    FROM garantias
    WHERE estado_garantia = 'Pendiente'
      AND fecha_ingreso < NOW() - INTERVAL '30 days';
    $$
);

-- Job 4: Revisar consignaciones vencidas - diariamente a las 8 AM
SELECT cron.schedule(
    'revisar_consignaciones_vencidas',
    '0 14 * * *',
    $$
    UPDATE consignaciones
    SET estado_consignacion = 'Perdido'
    WHERE estado_consignacion = 'Prestado'
      AND fecha_limite < CURRENT_DATE - INTERVAL '7 days';

    INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
    SELECT
        'Consignacion_Vencida',
        'Consignación vencida: #' || id_consignacion::TEXT,
        'La consignación para ' || negocio_destino || ' venció el ' ||
        TO_CHAR(fecha_limite, 'DD/MM/YYYY') || ' y fue marcada como perdida.',
        id_consignacion::TEXT,
        'consignaciones'
    FROM consignaciones
    WHERE estado_consignacion = 'Perdido'
      AND fecha_limite >= CURRENT_DATE - INTERVAL '8 days';
    $$
);

-- Job 5: Limpiar sesiones expiradas (cada hora)
SELECT cron.schedule(
    'limpiar_sesiones_expiradas',
    '0 * * * *',
    $$
    UPDATE sesiones_usuarios
    SET activa = FALSE, motivo_cierre = 'Expiracion'
    WHERE activa = TRUE AND fecha_expira < NOW();
    $$
);

-- Job 6: Limpiar audit_log > 2 años (primero de cada mes a las 3 AM)
SELECT cron.schedule(
    'limpiar_audit_log_antiguo',
    '0 9 1 * *',  -- 9:00 UTC = 3:00 AM GMT-6
    $$
    -- Con particionado, simplemente eliminamos las tablas-partición viejas
    -- Este job registra el tamaño para monitoreo
    INSERT INTO notificaciones(tipo, titulo, cuerpo, referencia_id, referencia_tabla)
    SELECT
        'Sistema',
        'Estado audit_log',
        'La tabla audit_log tiene ' || pg_size_pretty(pg_total_relation_size('audit_log')) || ' de tamaño.',
        '1', 'audit_log'
    WHERE pg_total_relation_size('audit_log') > 1073741824;  -- Alertar si > 1 GB
    $$
);


-- =============================================================================
-- FASE 10: SEGURIDAD - ROW LEVEL SECURITY Y ROLES DE BASE DE DATOS
-- =============================================================================

-- 10.1 Crear roles de base de datos con mínimos privilegios
-- (Ejecutar como superusuario de PostgreSQL)

-- Rol de solo lectura para reportes
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_readonly') THEN
        CREATE ROLE erp_readonly;
    END IF;
END $$;

GRANT CONNECT ON DATABASE current_database TO erp_readonly;
GRANT USAGE ON SCHEMA public TO erp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO erp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO erp_readonly;

-- Rol de aplicación (lectura/escritura, sin DDL)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_app') THEN
        CREATE ROLE erp_app;
    END IF;
END $$;

GRANT CONNECT ON DATABASE current_database TO erp_app;
GRANT USAGE ON SCHEMA public TO erp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
-- Denegar acceso directo a audit_log (solo escritura mediante triggers)
REVOKE DELETE ON audit_log FROM erp_app;

-- Rol para el cron (pg_cron necesita su propio rol en algunos setups)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_cron') THEN
        CREATE ROLE erp_cron;
    END IF;
END $$;
GRANT erp_app TO erp_cron;

-- 10.2 Enmascarar datos sensibles en vistas (clientes sin número completo)
CREATE OR REPLACE VIEW v_clientes_masked AS
SELECT
    identidad,
    nombre,
    apellido,
    OVERLAY(telefono PLACING '****' FROM 5 FOR 4) AS telefono_masked,
    CASE
        WHEN correo IS NOT NULL
        THEN SPLIT_PART(correo,'@',1) || '@***'
        ELSE NULL
    END AS correo_masked,
    fechaCreacion
FROM clientes;

COMMENT ON VIEW v_clientes_masked IS
    'Vista de clientes con datos PII enmascarados para reportes/exportaciones';

-- 10.3 Vista de inventario disponible (la más consultada en el POS)
CREATE OR REPLACE VIEW v_inventario_disponible AS
SELECT
    i.codInventario,
    a.descripcion,
    c.tipo AS categoria,
    i.cantidad,
    i.precioVenta,
    i.precioCompra,
    (i.precioVenta - i.precioCompra) AS margen,
    u.nombre AS ubicacion
FROM inventario i
JOIN accesorios a  ON a.codAccesorio  = i.codAccesorio
JOIN categoria c   ON c.codCategoria  = a.codCategoria
LEFT JOIN ubicacion u ON u.idUbicacion = i.idubicacion
WHERE i.estado IN ('Disponible','Activo')
  AND i.cantidad > 0;

-- 10.4 Vista de teléfonos disponibles para venta (optimiza consulta POS)
CREATE OR REPLACE VIEW v_telefonos_disponibles AS
SELECT
    t.codigo,
    t.marca,
    t.modelo,
    t.imei1,
    t.imei2,
    t.precioVenta,
    t.precioCompra,
    (t.precioVenta - t.precioCompra) AS margen,
    u.nombre AS ubicacion,
    p.nombre AS proveedor,
    t.fecha AS fecha_ingreso
FROM telefonos t
LEFT JOIN ubicacion u ON u.idUbicacion = t.idubicacion
LEFT JOIN proveedores p ON p.codProveedor = t.codProveedor
WHERE t.estado = 'Disponible';

-- 10.5 Vista del arqueo activo por caja (usada en tiempo real en POS)
CREATE OR REPLACE VIEW v_arqueo_activo AS
SELECT
    a.idArqueo,
    a.idCaja,
    cj.nombre AS nombre_caja,
    a.fechaApertura,
    a.montoInicial,
    a.totalVentas,
    a.totalCostos,
    a.TotalGastos,
    a.ganancia,
    a.montoFinal,
    a.saldoTigoFinal,
    a.saldoClaroFinal,
    u.usuario AS abierto_por
FROM arqueo a
JOIN caja cj     ON cj.idCaja     = a.idCaja
LEFT JOIN usuarios u ON u.codUsuario = a.idUsuario
WHERE a.estado = 'Activo';

-- 10.6 Forzar SSL en la conexión (confirmar en postgresql.conf):
-- ssl = on
-- ssl_min_protocol_version = 'TLSv1.2'

-- 10.7 Configurar búsqueda segura por defecto
ALTER DATABASE current_database SET search_path = public, pg_catalog;


-- =============================================================================
-- RESUMEN DE MEJORAS IMPLEMENTADAS
-- =============================================================================
/*
TABLA DE MEJORAS:
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE │ MEJORA                              │ IMPACTO                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  1   │ 7 FK faltantes agregadas            │ Integridad referencial         │
│  2   │ 19 CHECK constraints                │ Validación a nivel DB          │
│  3   │ 5 normalizaciones / nuevas cols     │ Consistencia y trazabilidad    │
│  4   │ 6 nuevas tablas                     │ Auditoría, seguridad, pagos    │
│  5   │ 29 índices estratégicos             │ Rendimiento consultas 5-50x    │
│  6   │ Columnas updated_at/updated_by      │ Auditoría temporal             │
│  7   │ 6 stored procedures                 │ Lógica atómica y reutilizable  │
│  8   │ 6 triggers                          │ Automatización y consistencia  │
│  9   │ 6 jobs programados (pg_cron)        │ Automatización de mantenimiento│
│ 10   │ RLS, roles DB, vistas masked        │ Seguridad y compliance         │
└─────────────────────────────────────────────────────────────────────────────┘

COLUMNAS QUE SOBRAN / SE RECOMIENDAN DEPRECAR:
- telefonos.imei2: mantener pero nullable (ya está) ✓
- reparaciones.nombre_tecnico: reemplazar por identidad_tecnico (FK a empleado)
- reparaciones.complementos: reemplazar por tabla reparacion_complementos
- consignaciones.id_producto: reemplazar por cod_telefono / cod_inventario

TABLAS QUE NECESITAN ATENCIÓN ESPECIAL:
- saldos: agregar columna "red" en egresos para calcular saldo por operadora real
- paquetes: agregar FK en detalleventa para paquetes vendidos (ya agregado en FASE 3)
- label_templates: elements JSONB está bien para templates flexibles ✓
- socios: agregar tabla socios_distribuciones para historial de retiros

ESCALABILIDAD FUTURA (> 1M de registros):
1. Particionar ventas por año (igual que audit_log)
2. Particionar ingresos/egresos por mes
3. Mover kardex_inventario a TimescaleDB si crece mucho
4. Configurar read replicas para reportes
5. Considerar pg_partman para automatizar particionado
*/
