-- ============================================================
-- Migration 000: Core schema — base tables and idempotent DDL
-- Run automatically by config/migrations.js at server startup.
-- ============================================================

-- SaaS: tenants
CREATE TABLE IF NOT EXISTS tenants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              VARCHAR(50) UNIQUE NOT NULL,
    nombre_empresa    VARCHAR(255) NOT NULL,
    plan              VARCHAR(20) NOT NULL DEFAULT 'basico'
                        CHECK (plan IN ('basico','profesional','enterprise')),
    estado            VARCHAR(20) NOT NULL DEFAULT 'prueba'
                        CHECK (estado IN ('activo','suspendido','cancelado','prueba')),
    max_sucursales    INT DEFAULT 1,
    max_usuarios      INT DEFAULT 5,
    max_medicamentos  INT DEFAULT 500,
    fecha_vencimiento TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

CREATE TABLE IF NOT EXISTS label_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(50) DEFAULT 'GENERAL',
    type        VARCHAR(50) DEFAULT 'LABEL',
    data_source VARCHAR(50) DEFAULT 'NONE',
    is_default  BOOLEAN DEFAULT FALSE,
    width       NUMERIC(10,2) NOT NULL,
    height      NUMERIC(10,2) NOT NULL,
    elements    JSONB NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS configuracion (
    id               BIGSERIAL PRIMARY KEY,
    tenant_id        UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    nombreempresa    VARCHAR(255),
    rtn              VARCHAR(50),
    direccion        TEXT,
    telefono         VARCHAR(50),
    correo           VARCHAR(100),
    cai              VARCHAR(255),
    rangoinicial     VARCHAR(100),
    rangofinal       VARCHAR(100),
    fechalimite      DATE,
    isv              NUMERIC(5,2) DEFAULT 15,
    mensajefinal     TEXT
);

-- Bootstrap legacy ERP tables before the idempotent ALTER/INDEX blocks below.
-- Fresh Render databases do not have the original pharmacy schema yet.
CREATE TABLE IF NOT EXISTS sucursales (
    id_sucursal      SERIAL PRIMARY KEY,
    codigo           VARCHAR(10),
    nombre           VARCHAR(100) NOT NULL DEFAULT 'Sucursal Principal',
    direccion        TEXT,
    telefono         VARCHAR(20),
    ciudad           VARCHAR(60),
    regente_farmacia VARCHAR(100),
    numero_licencia  VARCHAR(50),
    estado           VARCHAR(20) DEFAULT 'Activa',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    tenant_id        UUID
);

CREATE TABLE IF NOT EXISTS empleado (
    identidad     VARCHAR(20) PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL DEFAULT '',
    apellido      VARCHAR(100),
    direccion     TEXT,
    telefono      VARCHAR(20),
    correo        VARCHAR(100),
    estado        VARCHAR(20) DEFAULT 'Activo',
    fechaCreacion TIMESTAMPTZ DEFAULT NOW(),
    tenant_id     UUID
);

CREATE TABLE IF NOT EXISTS roles (
    idrol     SERIAL PRIMARY KEY,
    nombre    VARCHAR(100) NOT NULL,
    estado    VARCHAR(20) DEFAULT 'Activo',
    tenant_id UUID
);

CREATE TABLE IF NOT EXISTS permisos (
    idPermiso VARCHAR(50) PRIMARY KEY,
    nombre    VARCHAR(100) NOT NULL,
    modulo    VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS usuarios (
    codUsuario               SERIAL PRIMARY KEY,
    usuario                  VARCHAR(100) UNIQUE NOT NULL,
    password                 VARCHAR(255) NOT NULL,
    identidad                VARCHAR(20),
    idCaja                   VARCHAR(100),
    idrol                    INT,
    id_sucursal              INT,
    estado                   VARCHAR(20) DEFAULT 'Activo',
    requires_password_change BOOLEAN DEFAULT FALSE,
    ultimo_login             TIMESTAMPTZ,
    intentos_fallidos        INTEGER DEFAULT 0,
    bloqueado_hasta          TIMESTAMPTZ,
    password_changed_at      TIMESTAMPTZ DEFAULT NOW(),
    tenant_id                UUID
);

CREATE TABLE IF NOT EXISTS rol_permisos (
    idRol     INT,
    idPermiso VARCHAR(50),
    PRIMARY KEY (idRol, idPermiso)
);

CREATE TABLE IF NOT EXISTS caja (
    idCaja      VARCHAR(100) PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL DEFAULT 'Caja Principal',
    estado      VARCHAR(20) DEFAULT 'Activo',
    id_sucursal INT,
    tenant_id   UUID
);

CREATE TABLE IF NOT EXISTS clientes (
    identidad                VARCHAR(20) PRIMARY KEY,
    nombre                   VARCHAR(100) NOT NULL,
    apellido                 VARCHAR(100),
    direccion                TEXT,
    telefono                 VARCHAR(20),
    correo                   VARCHAR(100),
    fecha_nacimiento         DATE,
    alergias_conocidas       TEXT,
    condiciones_cronicas     TEXT,
    medicamentos_habituales  TEXT,
    fechaCreacion            TIMESTAMPTZ DEFAULT NOW(),
    tenant_id                UUID
);

CREATE TABLE IF NOT EXISTS proveedores (
    codProveedor  VARCHAR(20) PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    telefono      VARCHAR(20),
    direccion     TEXT,
    correo        VARCHAR(100),
    rtn           VARCHAR(20),
    contacto      VARCHAR(100),
    fechaCreacion TIMESTAMPTZ DEFAULT NOW(),
    tenant_id     UUID
);

CREATE TABLE IF NOT EXISTS categorias_terapeuticas (
    id_categoria      SERIAL PRIMARY KEY,
    nombre            VARCHAR(100) NOT NULL,
    descripcion       TEXT,
    codigo_atc_nivel1 CHAR(1),
    activo            BOOLEAN DEFAULT TRUE,
    tenant_id         UUID
);

CREATE TABLE IF NOT EXISTS formas_farmaceuticas (
    id_forma    SERIAL PRIMARY KEY,
    nombre      VARCHAR(80) NOT NULL,
    unidad_base VARCHAR(30) NOT NULL,
    activo      BOOLEAN DEFAULT TRUE,
    tenant_id   UUID
);

CREATE TABLE IF NOT EXISTS principios_activos (
    id_principio        SERIAL PRIMARY KEY,
    nombre_dci          VARCHAR(200) NOT NULL UNIQUE,
    nombre_comun        VARCHAR(200),
    clase_farmacologica VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS medicamentos (
    codigo                    VARCHAR(20) PRIMARY KEY,
    nombre_generico           VARCHAR(200) NOT NULL,
    nombre_comercial          VARCHAR(200),
    concentracion             VARCHAR(80),
    id_forma                  INT,
    via_administracion        VARCHAR(50) DEFAULT 'Oral',
    id_categoria              INT,
    indicaciones              TEXT,
    contraindicaciones        TEXT,
    advertencias              TEXT,
    registro_sanitario        VARCHAR(30),
    fecha_vencimiento_rs      DATE,
    laboratorio               VARCHAR(150),
    pais_origen               VARCHAR(60) DEFAULT 'Honduras',
    requiere_receta           BOOLEAN DEFAULT FALSE,
    es_controlado             BOOLEAN DEFAULT FALSE,
    clase_controlado          VARCHAR(5),
    tipo_isv                  VARCHAR(10) DEFAULT 'exento',
    precio_costo_base         NUMERIC(12,4),
    margen_ganancia           NUMERIC(5,2) DEFAULT 30,
    stock_minimo              NUMERIC(12,4) DEFAULT 10,
    punto_reorden             NUMERIC(12,4) DEFAULT 20,
    codigo_ean13              VARCHAR(15),
    condicion_almacenamiento  VARCHAR(60) DEFAULT 'Temperatura ambiente',
    id_sucursal_principal     INT,
    activo                    BOOLEAN DEFAULT TRUE,
    fecha_alta                TIMESTAMPTZ DEFAULT NOW(),
    tenant_id                 UUID
);

CREATE TABLE IF NOT EXISTS medicamento_principios (
    id_medicamento VARCHAR(20),
    id_principio   INT,
    cantidad       NUMERIC(10,4),
    unidad_medida  VARCHAR(20),
    PRIMARY KEY (id_medicamento, id_principio)
);

CREATE TABLE IF NOT EXISTS medicamento_imagenes (
    id_imagen      SERIAL PRIMARY KEY,
    id_medicamento VARCHAR(20),
    url_imagen     TEXT,
    imagen_base64  TEXT,
    es_principal   BOOLEAN DEFAULT FALSE,
    descripcion    VARCHAR(100),
    fecha_upload   TIMESTAMPTZ DEFAULT NOW(),
    tenant_id      UUID
);

CREATE TABLE IF NOT EXISTS presentaciones_venta (
    id_presentacion            SERIAL PRIMARY KEY,
    id_medicamento             VARCHAR(20),
    nombre                     VARCHAR(80) NOT NULL,
    factor_conversion          NUMERIC(12,4) NOT NULL DEFAULT 1,
    descripcion_presentacion   VARCHAR(100),
    precio_venta               NUMERIC(12,2),
    precio_tercera_edad        NUMERIC(12,2),
    codigo_barras_presentacion VARCHAR(50),
    es_unidad_compra           BOOLEAN DEFAULT FALSE,
    es_unidad_venta            BOOLEAN DEFAULT TRUE,
    permite_fraccion           BOOLEAN DEFAULT FALSE,
    activo                     BOOLEAN DEFAULT TRUE,
    tenant_id                  UUID,
    UNIQUE(id_medicamento, nombre)
);

CREATE TABLE IF NOT EXISTS lotes_medicamento (
    id_lote                   SERIAL PRIMARY KEY,
    id_medicamento            VARCHAR(20),
    numero_lote               VARCHAR(80) NOT NULL,
    fecha_vencimiento_display VARCHAR(7) NOT NULL,
    fecha_vencimiento         DATE NOT NULL,
    fecha_fabricacion         DATE,
    cantidad_inicial          NUMERIC(12,4) NOT NULL,
    cantidad_actual           NUMERIC(12,4) NOT NULL,
    precio_compra_unitario    NUMERIC(12,4),
    id_sucursal               INT,
    id_proveedor              VARCHAR(20),
    fecha_ingreso             TIMESTAMPTZ DEFAULT NOW(),
    estado                    VARCHAR(20) DEFAULT 'Activo',
    notas                     TEXT,
    tenant_id                 UUID,
    UNIQUE(id_medicamento, numero_lote, id_sucursal)
);

CREATE TABLE IF NOT EXISTS ventas (
    codVenta                 VARCHAR(100) PRIMARY KEY,
    fecha                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    identidadCliente         VARCHAR(20),
    codVendedor              VARCHAR(100),
    total                    NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado                   VARCHAR(20) DEFAULT 'Activa',
    tipoCompra               VARCHAR(50) DEFAULT 'Contado',
    idCaja                   VARCHAR(100),
    monto_prima              NUMERIC(10,2) DEFAULT 0,
    monto_financiamiento     NUMERIC(10,2) DEFAULT 0,
    updated_at               TIMESTAMPTZ,
    updated_by               VARCHAR(100),
    descuento_autorizado_por VARCHAR(100),
    descuento_motivo         TEXT,
    numero_factura_sar       VARCHAR(30),
    rtn_cliente              VARCHAR(20) DEFAULT '0000-0000-000000',
    es_consumidor_final      BOOLEAN DEFAULT TRUE,
    tipo_descuento           VARCHAR(30),
    porcentaje_descuento     NUMERIC(5,2) DEFAULT 0,
    monto_descuento          NUMERIC(12,2) DEFAULT 0,
    subtotal_exento          NUMERIC(14,2) DEFAULT 0,
    subtotal_gravado         NUMERIC(14,2) DEFAULT 0,
    isv_calculado            NUMERIC(14,2) DEFAULT 0,
    isv                      NUMERIC(10,2) DEFAULT 0,
    descuento                NUMERIC(10,2) DEFAULT 0,
    id_receta                VARCHAR(20),
    id_sucursal              INT,
    tenant_id                UUID
);

CREATE TABLE IF NOT EXISTS detalleventa (
    codDetalleventa          VARCHAR(100) PRIMARY KEY,
    idVenta                  VARCHAR(100),
    producto                 VARCHAR(200),
    cantidad                 NUMERIC(12,4) NOT NULL DEFAULT 1,
    precioUnitario           NUMERIC(12,2) NOT NULL DEFAULT 0,
    precioVenta              NUMERIC(12,2),
    tipoProducto             VARCHAR(20) DEFAULT 'MEDICAMENTO',
    id_lote                  INT,
    id_presentacion          INT,
    cantidad_base_descontada NUMERIC(12,4),
    tipo_isv                 VARCHAR(10) DEFAULT 'exento',
    subtotal_exento          NUMERIC(12,2) DEFAULT 0,
    subtotal_gravado         NUMERIC(12,2) DEFAULT 0,
    isv_linea                NUMERIC(12,2) DEFAULT 0,
    tenant_id                UUID
);

CREATE TABLE IF NOT EXISTS recetas (
    codigo            VARCHAR(20) PRIMARY KEY,
    id_cliente        VARCHAR(20),
    nombre_medico     VARCHAR(150),
    numero_colegiado  VARCHAR(30),
    especialidad      VARCHAR(100),
    telefono_medico   VARCHAR(20),
    clinica_hospital  VARCHAR(150),
    fecha_emision     DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    tipo_receta       VARCHAR(20) DEFAULT 'Normal',
    diagnostico       TEXT,
    imagen_url        TEXT,
    imagen_base64     TEXT,
    estado            VARCHAR(20) DEFAULT 'Pendiente',
    id_sucursal       INT,
    registrado_por    VARCHAR(100),
    fecha_registro    TIMESTAMPTZ DEFAULT NOW(),
    notas             TEXT,
    tenant_id         UUID
);

CREATE TABLE IF NOT EXISTS detalle_receta (
    id                         SERIAL PRIMARY KEY,
    id_receta                  VARCHAR(20),
    id_medicamento             VARCHAR(20),
    nombre_prescrito           VARCHAR(200),
    dosis_prescrita            VARCHAR(100),
    cantidad_prescrita         NUMERIC(10,4) NOT NULL,
    unidad_prescrita           VARCHAR(30),
    cantidad_dispensada        NUMERIC(10,4) DEFAULT 0,
    fecha_ultima_dispensacion  DATE,
    estado                     VARCHAR(20) DEFAULT 'Pendiente',
    tenant_id                  UUID
);

CREATE TABLE IF NOT EXISTS ordenes_compra (
    codigo                 VARCHAR(20) PRIMARY KEY,
    id_proveedor           VARCHAR(20),
    id_sucursal            INT,
    fecha_orden            DATE DEFAULT CURRENT_DATE,
    fecha_entrega_esperada DATE,
    estado                 VARCHAR(20) DEFAULT 'Pendiente',
    total_estimado         NUMERIC(14,2),
    generada_por           VARCHAR(30) DEFAULT 'manual',
    notas                  TEXT,
    fecha_creacion         TIMESTAMPTZ DEFAULT NOW(),
    tenant_id              UUID
);

CREATE TABLE IF NOT EXISTS detalle_orden_compra (
    id                 SERIAL PRIMARY KEY,
    id_orden           VARCHAR(20),
    id_medicamento     VARCHAR(20),
    id_presentacion    INT,
    cantidad_ordenada  NUMERIC(12,4) NOT NULL,
    precio_unitario    NUMERIC(12,2),
    cantidad_recibida  NUMERIC(12,4) DEFAULT 0,
    estado_linea       VARCHAR(20) DEFAULT 'Pendiente',
    tenant_id          UUID
);

CREATE TABLE IF NOT EXISTS transferencias_sucursal (
    codigo              VARCHAR(20) PRIMARY KEY,
    id_sucursal_origen  INT,
    id_sucursal_destino INT,
    id_medicamento      VARCHAR(20),
    id_lote             INT,
    cantidad_base       NUMERIC(12,4) NOT NULL,
    motivo              TEXT,
    estado              VARCHAR(20) DEFAULT 'Pendiente',
    id_usuario_solicita INT,
    id_usuario_aprueba  INT,
    fecha_solicitud     TIMESTAMPTZ DEFAULT NOW(),
    fecha_resolucion    TIMESTAMPTZ,
    tenant_id           UUID
);

CREATE TABLE IF NOT EXISTS arqueo (
    idArqueo      VARCHAR(20) PRIMARY KEY,
    idCaja        VARCHAR(100),
    idUsuario     VARCHAR(100),
    fechaApertura TIMESTAMPTZ DEFAULT NOW(),
    fechaCierre   TIMESTAMPTZ,
    montoInicial  NUMERIC(14,2) DEFAULT 0,
    montoFinal    NUMERIC(14,2) DEFAULT 0,
    totalVentas   NUMERIC(14,2) DEFAULT 0,
    totalCostos   NUMERIC(14,2) DEFAULT 0,
    TotalGastos   NUMERIC(14,2) DEFAULT 0,
    ganancia      NUMERIC(14,2) DEFAULT 0,
    estado        VARCHAR(20) DEFAULT 'Activo',
    cerradoPor    VARCHAR(100),
    tenant_id     UUID
);

DO $$
BEGIN
    BEGIN ALTER TABLE ventas        ADD COLUMN idCaja VARCHAR(100);                            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN monto_prima NUMERIC(10,2) DEFAULT 0;            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN monto_financiamiento NUMERIC(10,2) DEFAULT 0;   EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN tipoProducto VARCHAR(20);                       EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE arqueo        ADD COLUMN totalCostos NUMERIC(10,2) DEFAULT 0;            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE arqueo        ADD COLUMN TotalGastos NUMERIC(10,2) DEFAULT 0;            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE arqueo        ADD COLUMN ganancia NUMERIC(10,2) DEFAULT 0;               EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE arqueo        ADD COLUMN totalVentas NUMERIC(10,2) DEFAULT 0;            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE arqueo        ADD COLUMN idUsuario VARCHAR(100);                         EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE usuarios      ADD COLUMN requires_password_change BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE usuarios      ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE medicamentos  ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE sucursales    ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE roles         ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE lotes_medicamento ADD COLUMN tenant_id UUID;                             EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE empleado      ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE clientes      ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE caja          ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE arqueo        ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE proveedores   ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE categorias_terapeuticas  ADD COLUMN tenant_id UUID;                      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE formas_farmaceuticas     ADD COLUMN tenant_id UUID;                      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE presentaciones_venta     ADD COLUMN tenant_id UUID;                      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE medicamento_imagenes     ADD COLUMN tenant_id UUID;                      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ordenes_compra           ADD COLUMN tenant_id UUID;                      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalle_orden_compra     ADD COLUMN tenant_id UUID;                      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE transferencias_sucursal  ADD COLUMN tenant_id UUID;                      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE recetas        ADD COLUMN tenant_id UUID;                                EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalle_receta ADD COLUMN tenant_id UUID;                                EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE label_templates ADD COLUMN tenant_id UUID;                               EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN tenant_id UUID;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;

    BEGIN
        ALTER TYPE subtipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Ajuste Utilidad Cambio';
        ALTER TYPE subtipo_egreso_contable     ADD VALUE IF NOT EXISTS 'Perdida Margen Garantia';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN ALTER TABLE usuarios ADD COLUMN ultimo_login TIMESTAMPTZ;                            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER DEFAULT 0;                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TIMESTAMPTZ;                         EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE usuarios ADD COLUMN password_changed_at TIMESTAMPTZ DEFAULT NOW();       EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas   ADD COLUMN updated_at TIMESTAMPTZ;                              EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas   ADD COLUMN updated_by VARCHAR(100);                             EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas   ADD COLUMN descuento_autorizado_por VARCHAR(100);               EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas   ADD COLUMN descuento_motivo TEXT;                               EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN logo_base64 TEXT;                               EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN id_presentacion INT;                            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN id_lote INT;                                    EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN producto VARCHAR(200);                          EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN precioUnitario NUMERIC(12,2);                   EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN cantidad_base_descontada NUMERIC(12,4);         EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN tipo_isv VARCHAR(10) DEFAULT 'exento';          EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN subtotal_exento NUMERIC(12,2) DEFAULT 0;        EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN subtotal_gravado NUMERIC(12,2) DEFAULT 0;       EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN isv_linea NUMERIC(12,2) DEFAULT 0;              EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN isv NUMERIC(10,2) DEFAULT 0;                    EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN descuento NUMERIC(10,2) DEFAULT 0;              EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN tipoCompra VARCHAR(50);                         EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE TABLE IF NOT EXISTS login_intentos (
    id         BIGSERIAL PRIMARY KEY,
    usuario    VARCHAR(100) NOT NULL,
    ip_address TEXT,
    exitoso    BOOLEAN NOT NULL,
    fecha      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    tenant_id  UUID
);

CREATE TABLE IF NOT EXISTS notificaciones (
    id               BIGSERIAL PRIMARY KEY,
    tipo             VARCHAR(50) NOT NULL,
    titulo           VARCHAR(255) NOT NULL,
    cuerpo           TEXT,
    para_usuario     VARCHAR(100),
    leida            BOOLEAN DEFAULT FALSE,
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    fecha_lectura    TIMESTAMPTZ,
    referencia_id    TEXT,
    referencia_tabla VARCHAR(100),
    id_sucursal      INT,
    tenant_id        UUID
);

CREATE TABLE IF NOT EXISTS kardex_inventario (
    id              BIGSERIAL PRIMARY KEY,
    tipo_producto   VARCHAR(20) NOT NULL DEFAULT 'MEDICAMENTO',
    cod_medicamento VARCHAR(20),
    id_lote         INT,
    tipo_movimiento VARCHAR(50) NOT NULL,
    cantidad        NUMERIC(12,4) NOT NULL,
    precio_costo    NUMERIC(10,2),
    precio_venta    NUMERIC(10,2),
    referencia_doc  VARCHAR(100),
    fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registrado_por  VARCHAR(100),
    observaciones   TEXT,
    tenant_id       UUID
);

CREATE TABLE IF NOT EXISTS pagos_venta (
    id_pago        SERIAL PRIMARY KEY,
    cod_venta      VARCHAR(100) NOT NULL,
    monto          NUMERIC(10,2) NOT NULL,
    fecha_pago     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metodo_pago    VARCHAR(50) NOT NULL,
    referencia     VARCHAR(255),
    idCaja         VARCHAR(100),
    registrado_por VARCHAR(100),
    notas          TEXT,
    tenant_id      UUID
);

CREATE TABLE IF NOT EXISTS configuracion_cai_historial (
    id             SERIAL PRIMARY KEY,
    cai            VARCHAR(255) NOT NULL,
    rangoinicial   VARCHAR(100) NOT NULL,
    rangofinal     VARCHAR(100) NOT NULL,
    fechalimite    DATE NOT NULL,
    fecha_registro TIMESTAMPTZ DEFAULT NOW(),
    registrado_por VARCHAR(100),
    tenant_id      UUID
);

DO $$
DECLARE
    only_tenant UUID;
BEGIN
    BEGIN ALTER TABLE notificaciones             ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE notificaciones             ADD COLUMN id_sucursal INT; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE login_intentos             ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE kardex_inventario          ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE pagos_venta                ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion_cai_historial ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;

    IF (SELECT COUNT(*) FROM tenants) = 1 THEN
        SELECT id INTO only_tenant FROM tenants LIMIT 1;
        UPDATE login_intentos              SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE notificaciones              SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE kardex_inventario           SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE pagos_venta                 SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE configuracion_cai_historial SET tenant_id = only_tenant WHERE tenant_id IS NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_login_usuario              ON login_intentos(usuario, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_login_ip                   ON login_intentos(ip_address, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_login_tenant_usuario_fecha ON login_intentos(tenant_id, usuario, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_notif_usuario              ON notificaciones(para_usuario, leida, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_usuario       ON notificaciones(tenant_id, para_usuario, leida, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_sucursal      ON notificaciones(tenant_id, id_sucursal, leida, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_fecha               ON kardex_inventario(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_tenant_fecha        ON kardex_inventario(tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_venta_tenant         ON pagos_venta(tenant_id, cod_venta, fecha_pago);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha               ON ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente             ON ventas(identidadCliente);
CREATE INDEX IF NOT EXISTS idx_ventas_caja                ON ventas(idCaja, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_detalle_venta              ON detalleventa(idVenta);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre            ON clientes(nombre, apellido);

CREATE TABLE IF NOT EXISTS sucursales (
    id_sucursal      SERIAL PRIMARY KEY,
    codigo           VARCHAR(10) NOT NULL,
    nombre           VARCHAR(100) NOT NULL,
    direccion        TEXT,
    telefono         VARCHAR(20),
    ciudad           VARCHAR(60),
    regente_farmacia VARCHAR(100),
    numero_licencia  VARCHAR(50),
    estado           VARCHAR(20) DEFAULT 'Activa',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    tenant_id        UUID
);

CREATE TABLE IF NOT EXISTS categorias_terapeuticas (
    id_categoria      SERIAL PRIMARY KEY,
    nombre            VARCHAR(100) NOT NULL,
    descripcion       TEXT,
    codigo_atc_nivel1 CHAR(1),
    activo            BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS formas_farmaceuticas (
    id_forma   SERIAL PRIMARY KEY,
    nombre     VARCHAR(80) NOT NULL,
    unidad_base VARCHAR(30) NOT NULL,
    activo     BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS principios_activos (
    id_principio         SERIAL PRIMARY KEY,
    nombre_dci           VARCHAR(200) NOT NULL UNIQUE,
    nombre_comun         VARCHAR(200),
    clase_farmacologica  VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS medicamentos (
    codigo                   VARCHAR(20) PRIMARY KEY,
    nombre_generico          VARCHAR(200) NOT NULL,
    nombre_comercial         VARCHAR(200),
    concentracion            VARCHAR(80),
    id_forma                 INT REFERENCES formas_farmaceuticas(id_forma),
    via_administracion       VARCHAR(50) DEFAULT 'Oral',
    id_categoria             INT REFERENCES categorias_terapeuticas(id_categoria),
    indicaciones             TEXT,
    contraindicaciones       TEXT,
    advertencias             TEXT,
    registro_sanitario       VARCHAR(30),
    fecha_vencimiento_rs     DATE,
    laboratorio              VARCHAR(150),
    pais_origen              VARCHAR(60) DEFAULT 'Honduras',
    requiere_receta          BOOLEAN DEFAULT FALSE,
    es_controlado            BOOLEAN DEFAULT FALSE,
    clase_controlado         VARCHAR(5),
    tipo_isv                 VARCHAR(10) DEFAULT 'exento',
    precio_costo_base        NUMERIC(12,4),
    margen_ganancia          NUMERIC(5,2) DEFAULT 30,
    stock_minimo             NUMERIC(12,4) DEFAULT 10,
    punto_reorden            NUMERIC(12,4) DEFAULT 20,
    codigo_ean13             VARCHAR(15),
    condicion_almacenamiento VARCHAR(60) DEFAULT 'Temperatura ambiente',
    id_sucursal_principal    INT,
    activo                   BOOLEAN DEFAULT TRUE,
    fecha_alta               TIMESTAMPTZ DEFAULT NOW(),
    tenant_id                UUID
);

CREATE TABLE IF NOT EXISTS medicamento_imagenes (
    id_imagen      SERIAL PRIMARY KEY,
    id_medicamento VARCHAR(20) REFERENCES medicamentos(codigo) ON DELETE CASCADE,
    url_imagen     TEXT,
    imagen_base64  TEXT,
    es_principal   BOOLEAN DEFAULT FALSE,
    descripcion    VARCHAR(100),
    fecha_upload   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presentaciones_venta (
    id_presentacion              SERIAL PRIMARY KEY,
    id_medicamento               VARCHAR(20) REFERENCES medicamentos(codigo) ON DELETE CASCADE,
    nombre                       VARCHAR(80) NOT NULL,
    factor_conversion            NUMERIC(12,4) NOT NULL DEFAULT 1,
    descripcion_presentacion     VARCHAR(100),
    precio_venta                 NUMERIC(12,2),
    precio_tercera_edad          NUMERIC(12,2),
    codigo_barras_presentacion   VARCHAR(50),
    es_unidad_compra             BOOLEAN DEFAULT FALSE,
    es_unidad_venta              BOOLEAN DEFAULT TRUE,
    permite_fraccion             BOOLEAN DEFAULT FALSE,
    activo                       BOOLEAN DEFAULT TRUE,
    UNIQUE(id_medicamento, nombre)
);

CREATE TABLE IF NOT EXISTS lotes_medicamento (
    id_lote                   SERIAL PRIMARY KEY,
    id_medicamento            VARCHAR(20) REFERENCES medicamentos(codigo),
    numero_lote               VARCHAR(80) NOT NULL,
    fecha_vencimiento_display VARCHAR(7) NOT NULL,
    fecha_vencimiento         DATE NOT NULL,
    fecha_fabricacion         DATE,
    cantidad_inicial          NUMERIC(12,4) NOT NULL,
    cantidad_actual           NUMERIC(12,4) NOT NULL,
    precio_compra_unitario    NUMERIC(12,4),
    id_sucursal               INT,
    id_proveedor              VARCHAR(20),
    fecha_ingreso             TIMESTAMPTZ DEFAULT NOW(),
    estado                    VARCHAR(20) DEFAULT 'Activo',
    notas                     TEXT,
    UNIQUE(id_medicamento, numero_lote, id_sucursal)
);

CREATE TABLE IF NOT EXISTS recetas (
    codigo           VARCHAR(20) PRIMARY KEY,
    id_cliente       VARCHAR(20),
    nombre_medico    VARCHAR(150),
    numero_colegiado VARCHAR(30),
    especialidad     VARCHAR(100),
    telefono_medico  VARCHAR(20),
    clinica_hospital VARCHAR(150),
    fecha_emision    DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    tipo_receta      VARCHAR(20) DEFAULT 'Normal',
    diagnostico      TEXT,
    imagen_url       TEXT,
    imagen_base64    TEXT,
    estado           VARCHAR(20) DEFAULT 'Pendiente',
    id_sucursal      INT,
    registrado_por   VARCHAR(100),
    fecha_registro   TIMESTAMPTZ DEFAULT NOW(),
    notas            TEXT
);

CREATE TABLE IF NOT EXISTS detalle_receta (
    id                       SERIAL PRIMARY KEY,
    id_receta                VARCHAR(20) REFERENCES recetas(codigo) ON DELETE CASCADE,
    id_medicamento           VARCHAR(20),
    nombre_prescrito         VARCHAR(200),
    dosis_prescrita          VARCHAR(100),
    cantidad_prescrita       NUMERIC(10,4) NOT NULL,
    unidad_prescrita         VARCHAR(30),
    cantidad_dispensada      NUMERIC(10,4) DEFAULT 0,
    fecha_ultima_dispensacion DATE,
    estado                   VARCHAR(20) DEFAULT 'Pendiente'
);

CREATE TABLE IF NOT EXISTS recetas_retenidas (
    id                SERIAL PRIMARY KEY,
    id_receta         VARCHAR(20) REFERENCES recetas(codigo) UNIQUE,
    numero_serie_cmh  VARCHAR(50) NOT NULL,
    fecha_retencion   DATE NOT NULL DEFAULT CURRENT_DATE,
    id_venta          VARCHAR(20),
    retenida_por      VARCHAR(100),
    folio_libro_control INT,
    tenant_id         UUID
);

CREATE TABLE IF NOT EXISTS libro_psicofarmacos (
    id_registro      SERIAL PRIMARY KEY,
    id_medicamento   VARCHAR(20),
    tipo_movimiento  VARCHAR(15) NOT NULL,
    fecha_movimiento TIMESTAMPTZ DEFAULT NOW(),
    id_venta         VARCHAR(20),
    id_receta_retenida INT,
    nombre_paciente  VARCHAR(150),
    dni_paciente     VARCHAR(20),
    nombre_medico    VARCHAR(150),
    numero_colegiado VARCHAR(30),
    numero_serie_receta VARCHAR(50),
    id_lote          INT,
    cantidad_entrada NUMERIC(10,4) DEFAULT 0,
    cantidad_salida  NUMERIC(10,4) DEFAULT 0,
    saldo_calculado  NUMERIC(10,4) NOT NULL,
    unidad           VARCHAR(30) NOT NULL,
    numero_folio     INT,
    registrado_por   VARCHAR(100) NOT NULL,
    notas            TEXT,
    tenant_id        UUID
);

CREATE TABLE IF NOT EXISTS ordenes_compra (
    codigo                VARCHAR(20) PRIMARY KEY,
    id_proveedor          VARCHAR(20),
    id_sucursal           INT,
    fecha_orden           DATE DEFAULT CURRENT_DATE,
    fecha_entrega_esperada DATE,
    estado                VARCHAR(20) DEFAULT 'Pendiente',
    total_estimado        NUMERIC(14,2),
    generada_por          VARCHAR(30) DEFAULT 'manual',
    notas                 TEXT,
    fecha_creacion        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detalle_orden_compra (
    id               SERIAL PRIMARY KEY,
    id_orden         VARCHAR(20) REFERENCES ordenes_compra(codigo) ON DELETE CASCADE,
    id_medicamento   VARCHAR(20),
    id_presentacion  INT,
    cantidad_ordenada NUMERIC(12,4) NOT NULL,
    precio_unitario  NUMERIC(12,2),
    cantidad_recibida NUMERIC(12,4) DEFAULT 0,
    estado_linea     VARCHAR(20) DEFAULT 'Pendiente'
);

CREATE TABLE IF NOT EXISTS recepciones_compra (
    codigo                    VARCHAR(20) PRIMARY KEY,
    id_orden                  VARCHAR(20),
    id_sucursal               INT,
    fecha_recepcion           TIMESTAMPTZ DEFAULT NOW(),
    numero_factura_proveedor  VARCHAR(50),
    recibido_por              VARCHAR(100),
    notas                     TEXT,
    tenant_id                 UUID
);

CREATE TABLE IF NOT EXISTS detalle_recepcion (
    id                         SERIAL PRIMARY KEY,
    id_recepcion               VARCHAR(20),
    id_medicamento             VARCHAR(20),
    id_presentacion            INT,
    numero_lote                VARCHAR(80) NOT NULL,
    fecha_vencimiento_display  VARCHAR(7) NOT NULL,
    fecha_vencimiento          DATE NOT NULL,
    cantidad_recibida          NUMERIC(12,4) NOT NULL,
    cantidad_base              NUMERIC(12,4) NOT NULL,
    precio_compra_presentacion NUMERIC(12,2) NOT NULL,
    precio_compra_unitario_base NUMERIC(12,4),
    tenant_id                  UUID,
    estado_empaque             VARCHAR(20) DEFAULT 'Bueno',
    aceptado                   BOOLEAN DEFAULT TRUE,
    motivo_rechazo             TEXT
);

CREATE TABLE IF NOT EXISTS transferencias_sucursal (
    codigo               VARCHAR(20) PRIMARY KEY,
    id_sucursal_origen   INT,
    id_sucursal_destino  INT,
    id_medicamento       VARCHAR(20),
    id_lote              INT,
    cantidad_base        NUMERIC(12,4) NOT NULL,
    motivo               TEXT,
    estado               VARCHAR(20) DEFAULT 'Pendiente',
    id_usuario_solicita  INT,
    id_usuario_aprueba   INT,
    fecha_solicitud      TIMESTAMPTZ DEFAULT NOW(),
    fecha_resolucion     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lotes_fefo          ON lotes_medicamento(id_medicamento, fecha_vencimiento ASC)
    WHERE estado = 'Activo' AND cantidad_actual > 0;
CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre ON medicamentos(nombre_generico);
CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento   ON lotes_medicamento(fecha_vencimiento) WHERE estado = 'Activo';
CREATE INDEX IF NOT EXISTS idx_recetas_estado      ON recetas(estado);

DO $$
DECLARE
    only_tenant UUID;
BEGIN
    BEGIN ALTER TABLE recetas_retenidas  ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE libro_psicofarmacos ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE recepciones_compra ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalle_recepcion  ADD COLUMN tenant_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;

    IF (SELECT COUNT(*) FROM tenants) = 1 THEN
        SELECT id INTO only_tenant FROM tenants LIMIT 1;
        UPDATE recetas_retenidas  SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE libro_psicofarmacos SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE recepciones_compra SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE detalle_recepcion  SET tenant_id = only_tenant WHERE tenant_id IS NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recetas_retenidas_tenant  ON recetas_retenidas(tenant_id, fecha_retencion DESC);
CREATE INDEX IF NOT EXISTS idx_libro_psico_tenant_fecha  ON libro_psicofarmacos(tenant_id, fecha_movimiento DESC);
CREATE INDEX IF NOT EXISTS idx_recepciones_tenant        ON recepciones_compra(tenant_id, fecha_recepcion DESC);
CREATE INDEX IF NOT EXISTS idx_detalle_recepcion_tenant  ON detalle_recepcion(tenant_id, id_recepcion);

DO $$
BEGIN
    BEGIN CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_usuario       ON usuarios(tenant_id, usuario);              EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_codusuario    ON usuarios(tenant_id, codUsuario);           EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_roles_tenant_idrol            ON roles(tenant_id, idrol);                   EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_empleado_tenant_identidad     ON empleado(tenant_id, identidad);            EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_cod        ON proveedores(tenant_id, codProveedor);      EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_medicamentos_tenant_activo_nombre ON medicamentos(tenant_id, activo, nombre_generico); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_lotes_tenant_med_estado_venc  ON lotes_medicamento(tenant_id, id_medicamento, estado, fecha_vencimiento); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_lotes_tenant_sucursal_estado  ON lotes_medicamento(tenant_id, id_sucursal, estado); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_presentaciones_tenant_med_activo ON presentaciones_venta(tenant_id, id_medicamento, activo); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_medimagenes_tenant_med_principal ON medicamento_imagenes(tenant_id, id_medicamento, es_principal); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_ventas_tenant_fecha_estado    ON ventas(tenant_id, fecha DESC, estado);     EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_detalleventa_tenant_venta     ON detalleventa(tenant_id, idVenta);          EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN CREATE INDEX IF NOT EXISTS idx_arqueo_tenant_caja_estado     ON arqueo(tenant_id, idCaja, estado);         EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
END $$;

DO $$
BEGIN
    BEGIN ALTER TABLE ventas        ADD COLUMN numero_factura_sar VARCHAR(30);                          EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN rtn_cliente VARCHAR(20) DEFAULT '0000-0000-000000';      EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN es_consumidor_final BOOLEAN DEFAULT TRUE;                EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN tipo_descuento VARCHAR(30);                              EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN porcentaje_descuento NUMERIC(5,2) DEFAULT 0;             EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN monto_descuento NUMERIC(12,2) DEFAULT 0;                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN subtotal_exento NUMERIC(14,2) DEFAULT 0;                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN subtotal_gravado NUMERIC(14,2) DEFAULT 0;                EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN isv_calculado NUMERIC(14,2) DEFAULT 0;                   EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN id_receta VARCHAR(20);                                   EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE ventas        ADD COLUMN id_sucursal INT;                                         EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN id_lote INT;                                             EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN id_presentacion INT;                                     EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN cantidad_base_descontada NUMERIC(12,4);                  EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN tipo_isv VARCHAR(10) DEFAULT 'exento';                   EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN subtotal_exento NUMERIC(12,2) DEFAULT 0;                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN subtotal_gravado NUMERIC(12,2) DEFAULT 0;                EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN isv_linea NUMERIC(12,2) DEFAULT 0;                       EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE clientes      ADD COLUMN fecha_nacimiento DATE;                                   EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE clientes      ADD COLUMN alergias_conocidas TEXT;                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE clientes      ADD COLUMN condiciones_cronicas TEXT;                               EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE clientes      ADD COLUMN medicamentos_habituales TEXT;                            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN punto_emision VARCHAR(10) DEFAULT '001-001';             EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN ultimo_correlativo_factura BIGINT DEFAULT 0;             EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN registro_sanitario_farmacia VARCHAR(50);                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN director_tecnico VARCHAR(100);                           EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN numero_colegiado_regente VARCHAR(30);                    EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN descuento_tercera_edad NUMERIC(5,2) DEFAULT 25.00;       EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN isv_tasa_general NUMERIC(5,2) DEFAULT 15.00;             EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE caja          ADD COLUMN id_sucursal INT;                                         EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE usuarios      ADD COLUMN id_sucursal INT;                                         EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE empleado      ADD COLUMN estado VARCHAR(20) DEFAULT 'Activo';                     EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE empleado      ADD COLUMN fechaCreacion TIMESTAMPTZ DEFAULT NOW();                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE proveedores   ADD COLUMN correo VARCHAR(100);                                     EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE proveedores   ADD COLUMN rtn VARCHAR(20);                                         EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE proveedores   ADD COLUMN contacto VARCHAR(100);                                   EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE detalleventa  ADD COLUMN precioVenta NUMERIC(12,2);                               EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN admin_email VARCHAR(100);                                EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN email_from VARCHAR(100);                                 EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN drive_folder_id VARCHAR(100);                            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN isv_tasa_especial NUMERIC(5,2) DEFAULT 18.00;            EXCEPTION WHEN duplicate_column THEN NULL; END;
    BEGIN ALTER TABLE configuracion ADD COLUMN tenant_id UUID;                                          EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE TABLE IF NOT EXISTS empleado (
    identidad     VARCHAR(20) PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL DEFAULT '',
    apellido      VARCHAR(100) NOT NULL DEFAULT '',
    direccion     TEXT,
    telefono      VARCHAR(20),
    estado        VARCHAR(20) DEFAULT 'Activo',
    fechaCreacion TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caja (
    idCaja      VARCHAR(20) PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL DEFAULT 'Caja Principal',
    estado      VARCHAR(20) DEFAULT 'Activo',
    id_sucursal INT
);

CREATE TABLE IF NOT EXISTS arqueo (
    idArqueo      VARCHAR(20) PRIMARY KEY,
    idCaja        VARCHAR(20),
    idUsuario     VARCHAR(100),
    fechaApertura TIMESTAMPTZ DEFAULT NOW(),
    fechaCierre   TIMESTAMPTZ,
    montoInicial  NUMERIC(10,2) DEFAULT 0,
    montoFinal    NUMERIC(10,2) DEFAULT 0,
    totalVentas   NUMERIC(10,2) DEFAULT 0,
    totalCostos   NUMERIC(10,2) DEFAULT 0,
    TotalGastos   NUMERIC(10,2) DEFAULT 0,
    ganancia      NUMERIC(10,2) DEFAULT 0,
    estado        VARCHAR(20) DEFAULT 'Activo'
);

INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_POS',               'Ver Punto de Venta',       'Ventas'),
    ('VER_CLIENTES',          'Ver Clientes',             'Ventas'),
    ('VER_INVENTARIO',        'Ver Inventario',           'Inventario'),
    ('VER_PROVEEDORES',       'Ver Proveedores',          'Inventario'),
    ('DISEÑAR_ETIQUETAS',     'Diseñar Etiquetas',        'Inventario'),
    ('VER_CAJA',              'Ver Caja y Movimientos',   'Finanzas'),
    ('VER_COSTOS',            'Ver Costos y Gastos',      'Finanzas'),
    ('VER_CONTABILIDAD',      'Ver Contabilidad',         'Finanzas'),
    ('VER_REPORTES',          'Ver Reportes',             'Administracion'),
    ('VER_ADMIN',             'Ver Administracion',       'Administracion'),
    ('GESTIONAR_PANEL_CAJAS', 'Gestionar Panel de Cajas', 'Administracion'),
    ('GESTIONAR_USUARIOS',    'Gestionar Usuarios',       'Administracion'),
    ('GESTIONAR_ROLES',       'Gestionar Roles',          'Administracion'),
    ('CONFIGURAR_EMPRESA',    'Configurar Empresa',       'Administracion')
ON CONFLICT (idPermiso) DO NOTHING;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('administrador', 'admin', 'superadmin')
  AND r.tenant_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.idRol = r.idrol AND rp.idPermiso = p.idPermiso
  );
