-- =====================================================
-- FARMACIA ERP - ESQUEMA COMPLETO POSTGRESQL
-- Ejecutar en la base de datos PostgreSQL de Render
-- =====================================================

SET TIME ZONE 'America/Tegucigalpa';

-- =====================================================
-- 1. MULTISUBCURSAL
-- =====================================================
CREATE TABLE IF NOT EXISTS sucursales (
    id_sucursal       SERIAL PRIMARY KEY,
    codigo            VARCHAR(10) UNIQUE NOT NULL,
    nombre            VARCHAR(100) NOT NULL,
    direccion         TEXT,
    telefono          VARCHAR(20),
    ciudad            VARCHAR(60),
    regente_farmacia  VARCHAR(100),
    numero_licencia   VARCHAR(50),
    estado            VARCHAR(20) DEFAULT 'Activa',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. PERSONAL Y ACCESO
-- =====================================================
CREATE TABLE IF NOT EXISTS empleado (
    identidad  VARCHAR(20) PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    apellido   VARCHAR(100),
    direccion  TEXT,
    telefono   VARCHAR(20),
    correo     VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS roles (
    idrol   SERIAL PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL,
    estado  VARCHAR(20) DEFAULT 'Activo'
);

CREATE TABLE IF NOT EXISTS permisos (
    idPermiso  VARCHAR(50) PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    modulo     VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS usuarios (
    codUsuario                SERIAL PRIMARY KEY,
    usuario                   VARCHAR(100) UNIQUE NOT NULL,
    password                  VARCHAR(255) NOT NULL,
    identidad                 VARCHAR(20) REFERENCES empleado(identidad),
    idCaja                    VARCHAR(100),
    idrol                     INT REFERENCES roles(idrol),
    id_sucursal               INT REFERENCES sucursales(id_sucursal),
    estado                    VARCHAR(20) DEFAULT 'Activo',
    requires_password_change  BOOLEAN DEFAULT FALSE,
    ultimo_login              TIMESTAMPTZ,
    intentos_fallidos         INTEGER DEFAULT 0,
    bloqueado_hasta           TIMESTAMPTZ,
    password_changed_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rol_permisos (
    idRol      INT REFERENCES roles(idrol),
    idPermiso  VARCHAR(50) REFERENCES permisos(idPermiso),
    PRIMARY KEY (idRol, idPermiso)
);

-- =====================================================
-- 3. INFRAESTRUCTURA COMERCIAL
-- =====================================================
CREATE TABLE IF NOT EXISTS caja (
    idCaja      VARCHAR(100) PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    estado      VARCHAR(20) DEFAULT 'Activo',
    id_sucursal INT REFERENCES sucursales(id_sucursal)
);

CREATE TABLE IF NOT EXISTS clientes (
    identidad              VARCHAR(20) PRIMARY KEY,
    nombre                 VARCHAR(100) NOT NULL,
    apellido               VARCHAR(100),
    direccion              TEXT,
    telefono               VARCHAR(20),
    correo                 VARCHAR(100),
    fecha_nacimiento       DATE,
    alergias_conocidas     TEXT,
    condiciones_cronicas   TEXT,
    medicamentos_habituales TEXT,
    fechaCreacion          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedores (
    codProveedor   VARCHAR(20) PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    telefono       VARCHAR(20),
    direccion      TEXT,
    correo         VARCHAR(100),
    rtn            VARCHAR(20),
    contacto       VARCHAR(100),
    fechaCreacion  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ubicacion (
    idUbicacion  VARCHAR(20) PRIMARY KEY,
    nombre       VARCHAR(100) NOT NULL,
    descripcion  TEXT,
    estante      VARCHAR(20),
    nivel        VARCHAR(20),
    estado       VARCHAR(20) DEFAULT 'Activo'
);

CREATE TABLE IF NOT EXISTS configuracion (
    id                         INTEGER PRIMARY KEY DEFAULT 1,
    nombreempresa              VARCHAR(255),
    rtn                        VARCHAR(50),
    direccion                  TEXT,
    telefono                   VARCHAR(50),
    correo                     VARCHAR(100),
    cai                        VARCHAR(255),
    rangoinicial               VARCHAR(100),
    rangofinal                 VARCHAR(100),
    fechalimite                DATE,
    isv                        NUMERIC(5,2) DEFAULT 15,
    mensajefinal               TEXT,
    logo_base64                TEXT,
    punto_emision              VARCHAR(10) DEFAULT '001-001',
    ultimo_correlativo_factura BIGINT DEFAULT 0,
    registro_sanitario_farmacia VARCHAR(50),
    director_tecnico           VARCHAR(100),
    numero_colegiado_regente   VARCHAR(30),
    descuento_tercera_edad     NUMERIC(5,2) DEFAULT 25.00,
    isv_tasa_general           NUMERIC(5,2) DEFAULT 15.00,
    isv_tasa_especial          NUMERIC(5,2) DEFAULT 18.00,
    CONSTRAINT single_row CHECK (id = 1)
);

-- =====================================================
-- 4. CATÁLOGO FARMACÉUTICO
-- =====================================================
CREATE TABLE IF NOT EXISTS categorias_terapeuticas (
    id_categoria     SERIAL PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    descripcion      TEXT,
    codigo_atc_nivel1 CHAR(1),
    activo           BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS formas_farmaceuticas (
    id_forma    SERIAL PRIMARY KEY,
    nombre      VARCHAR(80) NOT NULL,
    unidad_base VARCHAR(30) NOT NULL,
    activo      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS principios_activos (
    id_principio          SERIAL PRIMARY KEY,
    nombre_dci            VARCHAR(200) NOT NULL UNIQUE,
    nombre_comun          VARCHAR(200),
    clase_farmacologica   VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS medicamentos (
    codigo                    VARCHAR(20) PRIMARY KEY,
    nombre_generico           VARCHAR(200) NOT NULL,
    nombre_comercial          VARCHAR(200),
    concentracion             VARCHAR(80),
    id_forma                  INT REFERENCES formas_farmaceuticas(id_forma),
    via_administracion        VARCHAR(50) DEFAULT 'Oral',
    id_categoria              INT REFERENCES categorias_terapeuticas(id_categoria),
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
    id_sucursal_principal     INT REFERENCES sucursales(id_sucursal),
    activo                    BOOLEAN DEFAULT TRUE,
    fecha_alta                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicamento_principios (
    id_medicamento VARCHAR(20) REFERENCES medicamentos(codigo) ON DELETE CASCADE,
    id_principio   INT REFERENCES principios_activos(id_principio),
    cantidad       NUMERIC(10,4),
    unidad_medida  VARCHAR(20),
    PRIMARY KEY (id_medicamento, id_principio)
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

-- Presentaciones de venta: unidad, blíster x10, caja x30, cajón, etc.
-- factor_conversion = cuántas unidades base contiene esta presentación
CREATE TABLE IF NOT EXISTS presentaciones_venta (
    id_presentacion            SERIAL PRIMARY KEY,
    id_medicamento             VARCHAR(20) REFERENCES medicamentos(codigo) ON DELETE CASCADE,
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
    UNIQUE(id_medicamento, nombre)
);

-- =====================================================
-- 5. LOTES Y STOCK (FEFO)
-- =====================================================
CREATE TABLE IF NOT EXISTS lotes_medicamento (
    id_lote                    SERIAL PRIMARY KEY,
    id_medicamento             VARCHAR(20) REFERENCES medicamentos(codigo),
    numero_lote                VARCHAR(80) NOT NULL,
    fecha_vencimiento_display  VARCHAR(7) NOT NULL,  -- 'MM/YYYY'
    fecha_vencimiento          DATE NOT NULL,          -- primer día del mes
    fecha_fabricacion          DATE,
    cantidad_inicial           NUMERIC(12,4) NOT NULL,
    cantidad_actual            NUMERIC(12,4) NOT NULL,
    precio_compra_unitario     NUMERIC(12,4),
    id_sucursal                INT REFERENCES sucursales(id_sucursal),
    id_proveedor               VARCHAR(20) REFERENCES proveedores(codProveedor),
    fecha_ingreso              TIMESTAMPTZ DEFAULT NOW(),
    estado                     VARCHAR(20) DEFAULT 'Activo',
    notas                      TEXT,
    UNIQUE(id_medicamento, numero_lote, id_sucursal)
);

CREATE INDEX IF NOT EXISTS idx_lotes_fefo
    ON lotes_medicamento(id_medicamento, fecha_vencimiento ASC)
    WHERE estado = 'Activo' AND cantidad_actual > 0;

CREATE INDEX IF NOT EXISTS idx_lotes_alertas
    ON lotes_medicamento(fecha_vencimiento, estado)
    WHERE estado = 'Activo';

-- =====================================================
-- 6. VENTAS
-- =====================================================
CREATE TABLE IF NOT EXISTS ventas (
    codVenta                  VARCHAR(20) PRIMARY KEY,
    fecha                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    identidadCliente          VARCHAR(20) REFERENCES clientes(identidad),
    codVendedor               VARCHAR(100),
    total                     NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado                    VARCHAR(20) DEFAULT 'Activa',
    tipoCompra                VARCHAR(30) DEFAULT 'Contado',
    idCaja                    VARCHAR(100) REFERENCES caja(idCaja),
    monto_prima               NUMERIC(10,2) DEFAULT 0,
    monto_financiamiento      NUMERIC(10,2) DEFAULT 0,
    updated_at                TIMESTAMPTZ,
    updated_by                VARCHAR(100),
    descuento_autorizado_por  VARCHAR(100),
    descuento_motivo          TEXT,
    -- Campos específicos farmacia
    numero_factura_sar        VARCHAR(30),
    rtn_cliente               VARCHAR(20) DEFAULT '0000-0000-000000',
    es_consumidor_final       BOOLEAN DEFAULT TRUE,
    tipo_descuento            VARCHAR(30),
    porcentaje_descuento      NUMERIC(5,2) DEFAULT 0,
    monto_descuento           NUMERIC(12,2) DEFAULT 0,
    subtotal_exento           NUMERIC(14,2) DEFAULT 0,
    subtotal_gravado          NUMERIC(14,2) DEFAULT 0,
    isv_calculado             NUMERIC(14,2) DEFAULT 0,
    id_receta                 VARCHAR(20),
    id_sucursal               INT REFERENCES sucursales(id_sucursal)
);

CREATE TABLE IF NOT EXISTS detalleventa (
    codDetalleventa        VARCHAR(20) PRIMARY KEY,
    idVenta                VARCHAR(20) REFERENCES ventas(codVenta),
    producto               VARCHAR(200),
    cantidad               NUMERIC(12,4) NOT NULL DEFAULT 1,
    precioUnitario         NUMERIC(12,2) NOT NULL,
    tipoProducto           VARCHAR(20) DEFAULT 'MEDICAMENTO',
    -- Campos farmacia
    id_lote                INT REFERENCES lotes_medicamento(id_lote),
    id_presentacion        INT REFERENCES presentaciones_venta(id_presentacion),
    cantidad_base_descontada NUMERIC(12,4),
    tipo_isv               VARCHAR(10) DEFAULT 'exento',
    subtotal_exento        NUMERIC(12,2) DEFAULT 0,
    subtotal_gravado       NUMERIC(12,2) DEFAULT 0,
    isv_linea              NUMERIC(12,2) DEFAULT 0
);

-- =====================================================
-- 7. RECETAS MÉDICAS
-- =====================================================
CREATE TABLE IF NOT EXISTS recetas (
    codigo             VARCHAR(20) PRIMARY KEY,
    id_cliente         VARCHAR(20) REFERENCES clientes(identidad),
    nombre_medico      VARCHAR(150),
    numero_colegiado   VARCHAR(30),
    especialidad       VARCHAR(100),
    telefono_medico    VARCHAR(20),
    clinica_hospital   VARCHAR(150),
    fecha_emision      DATE NOT NULL,
    fecha_vencimiento  DATE NOT NULL,
    tipo_receta        VARCHAR(20) DEFAULT 'Normal',
    diagnostico        TEXT,
    imagen_url         TEXT,
    imagen_base64      TEXT,
    estado             VARCHAR(20) DEFAULT 'Pendiente',
    id_sucursal        INT REFERENCES sucursales(id_sucursal),
    registrado_por     VARCHAR(100),
    fecha_registro     TIMESTAMPTZ DEFAULT NOW(),
    notas              TEXT
);

CREATE TABLE IF NOT EXISTS detalle_receta (
    id                          SERIAL PRIMARY KEY,
    id_receta                   VARCHAR(20) REFERENCES recetas(codigo) ON DELETE CASCADE,
    id_medicamento              VARCHAR(20) REFERENCES medicamentos(codigo),
    nombre_prescrito            VARCHAR(200),
    dosis_prescrita             VARCHAR(100),
    cantidad_prescrita          NUMERIC(10,4) NOT NULL,
    unidad_prescrita            VARCHAR(30),
    cantidad_dispensada         NUMERIC(10,4) DEFAULT 0,
    fecha_ultima_dispensacion   DATE,
    estado                      VARCHAR(20) DEFAULT 'Pendiente'
);

CREATE TABLE IF NOT EXISTS recetas_retenidas (
    id                SERIAL PRIMARY KEY,
    id_receta         VARCHAR(20) REFERENCES recetas(codigo) UNIQUE,
    numero_serie_cmh  VARCHAR(50) NOT NULL,
    fecha_retencion   DATE NOT NULL DEFAULT CURRENT_DATE,
    id_venta          VARCHAR(20),
    retenida_por      VARCHAR(100),
    folio_libro_control INT
);

-- =====================================================
-- 8. LIBRO DE PSICOTRÓPICOS (OBLIGATORIO JNCD)
-- =====================================================
CREATE TABLE IF NOT EXISTS libro_psicofarmacos (
    id_registro         SERIAL PRIMARY KEY,
    id_medicamento      VARCHAR(20) REFERENCES medicamentos(codigo),
    tipo_movimiento     VARCHAR(15) NOT NULL,
    fecha_movimiento    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id_venta            VARCHAR(20),
    id_receta_retenida  INT REFERENCES recetas_retenidas(id),
    nombre_paciente     VARCHAR(150),
    dni_paciente        VARCHAR(20),
    nombre_medico       VARCHAR(150),
    numero_colegiado    VARCHAR(30),
    numero_serie_receta VARCHAR(50),
    id_lote             INT REFERENCES lotes_medicamento(id_lote),
    cantidad_entrada    NUMERIC(10,4) DEFAULT 0,
    cantidad_salida     NUMERIC(10,4) DEFAULT 0,
    saldo_calculado     NUMERIC(10,4) NOT NULL,
    unidad              VARCHAR(30) NOT NULL,
    numero_folio        INT,
    registrado_por      VARCHAR(100) NOT NULL,
    notas               TEXT
);

-- =====================================================
-- 9. COMPRAS A PROVEEDORES
-- =====================================================
CREATE TABLE IF NOT EXISTS ordenes_compra (
    codigo                 VARCHAR(20) PRIMARY KEY,
    id_proveedor           VARCHAR(20) REFERENCES proveedores(codProveedor),
    id_sucursal            INT REFERENCES sucursales(id_sucursal),
    fecha_orden            DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega_esperada DATE,
    estado                 VARCHAR(20) DEFAULT 'Pendiente',
    total_estimado         NUMERIC(14,2),
    generada_por           VARCHAR(30) DEFAULT 'manual',
    notas                  TEXT,
    fecha_creacion         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detalle_orden_compra (
    id                SERIAL PRIMARY KEY,
    id_orden          VARCHAR(20) REFERENCES ordenes_compra(codigo) ON DELETE CASCADE,
    id_medicamento    VARCHAR(20) REFERENCES medicamentos(codigo),
    id_presentacion   INT REFERENCES presentaciones_venta(id_presentacion),
    cantidad_ordenada NUMERIC(12,4) NOT NULL,
    precio_unitario   NUMERIC(12,2),
    cantidad_recibida NUMERIC(12,4) DEFAULT 0,
    estado_linea      VARCHAR(20) DEFAULT 'Pendiente'
);

CREATE TABLE IF NOT EXISTS recepciones_compra (
    codigo                      VARCHAR(20) PRIMARY KEY,
    id_orden                    VARCHAR(20) REFERENCES ordenes_compra(codigo),
    id_sucursal                 INT REFERENCES sucursales(id_sucursal),
    fecha_recepcion             TIMESTAMPTZ DEFAULT NOW(),
    numero_factura_proveedor    VARCHAR(50),
    recibido_por                VARCHAR(100),
    notas                       TEXT
);

CREATE TABLE IF NOT EXISTS detalle_recepcion (
    id                          SERIAL PRIMARY KEY,
    id_recepcion                VARCHAR(20) REFERENCES recepciones_compra(codigo) ON DELETE CASCADE,
    id_medicamento              VARCHAR(20) REFERENCES medicamentos(codigo),
    id_presentacion             INT REFERENCES presentaciones_venta(id_presentacion),
    numero_lote                 VARCHAR(80) NOT NULL,
    fecha_vencimiento_display   VARCHAR(7) NOT NULL,
    fecha_vencimiento           DATE NOT NULL,
    cantidad_recibida           NUMERIC(12,4) NOT NULL,
    cantidad_base               NUMERIC(12,4) NOT NULL,
    precio_compra_presentacion  NUMERIC(12,2) NOT NULL,
    precio_compra_unitario_base NUMERIC(12,4),
    temperatura_llegada         NUMERIC(5,2),
    estado_empaque              VARCHAR(20) DEFAULT 'Bueno',
    aceptado                    BOOLEAN DEFAULT TRUE,
    motivo_rechazo              TEXT
);

-- =====================================================
-- 10. TRANSFERENCIAS ENTRE SUCURSALES
-- =====================================================
CREATE TABLE IF NOT EXISTS transferencias_sucursal (
    codigo               VARCHAR(20) PRIMARY KEY,
    id_sucursal_origen   INT REFERENCES sucursales(id_sucursal),
    id_sucursal_destino  INT REFERENCES sucursales(id_sucursal),
    id_medicamento       VARCHAR(20) REFERENCES medicamentos(codigo),
    id_lote              INT REFERENCES lotes_medicamento(id_lote),
    cantidad_base        NUMERIC(12,4) NOT NULL,
    motivo               TEXT,
    estado               VARCHAR(20) DEFAULT 'Pendiente',
    id_usuario_solicita  INT,
    id_usuario_aprueba   INT,
    fecha_solicitud      TIMESTAMPTZ DEFAULT NOW(),
    fecha_resolucion     TIMESTAMPTZ
);

-- =====================================================
-- 11. FINANZAS
-- =====================================================
CREATE TABLE IF NOT EXISTS arqueo (
    idArqueo      VARCHAR(20) PRIMARY KEY,
    idCaja        VARCHAR(100) REFERENCES caja(idCaja),
    montoInicial  NUMERIC(14,2) DEFAULT 0,
    montoFinal    NUMERIC(14,2) DEFAULT 0,
    totalVentas   NUMERIC(14,2) DEFAULT 0,
    totalCostos   NUMERIC(14,2) DEFAULT 0,
    TotalGastos   NUMERIC(14,2) DEFAULT 0,
    ganancia      NUMERIC(14,2) DEFAULT 0,
    estado        VARCHAR(20) DEFAULT 'Activo',
    fechaApertura TIMESTAMPTZ DEFAULT NOW(),
    fechaCierre   TIMESTAMPTZ,
    cerradoPor    VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ingresos (
    idIngreso           VARCHAR(20) PRIMARY KEY,
    idCaja              VARCHAR(100) REFERENCES caja(idCaja),
    descripcion         TEXT,
    monto               NUMERIC(14,2) NOT NULL,
    costo               NUMERIC(14,2) DEFAULT 0,
    fecha               DATE,
    tipo                VARCHAR(50),
    subtipo_movimiento  VARCHAR(50),
    fechaCreacion       TIMESTAMPTZ DEFAULT NOW(),
    registrado_por      VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS egresos (
    idEgresos          VARCHAR(20) PRIMARY KEY,
    idCaja             VARCHAR(100) REFERENCES caja(idCaja),
    descripcion        TEXT,
    monto              NUMERIC(14,2) NOT NULL,
    fecha              DATE,
    categoria          VARCHAR(50) DEFAULT 'Gasto Operativo',
    fechaCreacion      TIMESTAMPTZ DEFAULT NOW(),
    registrado_por     VARCHAR(100),
    id_socio_asignado  INT
);

CREATE TABLE IF NOT EXISTS socios (
    id_socio                  SERIAL PRIMARY KEY,
    nombre                    VARCHAR(100) NOT NULL,
    porcentaje_participacion  NUMERIC(5,2) DEFAULT 0,
    estado                    VARCHAR(20) DEFAULT 'Activo',
    fecha_ingreso             DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS pagos_venta (
    id_pago        SERIAL PRIMARY KEY,
    cod_venta      VARCHAR(20) NOT NULL,
    monto          NUMERIC(14,2) NOT NULL,
    fecha_pago     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metodo_pago    VARCHAR(50) NOT NULL,
    referencia     VARCHAR(255),
    idCaja         VARCHAR(100),
    registrado_por VARCHAR(100),
    notas          TEXT
);

-- =====================================================
-- 12. AUDITORÍA Y SISTEMA
-- =====================================================
CREATE TABLE IF NOT EXISTS login_intentos (
    id          BIGSERIAL PRIMARY KEY,
    usuario     VARCHAR(100) NOT NULL,
    ip_address  TEXT,
    exitoso     BOOLEAN NOT NULL,
    fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent  TEXT
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
    referencia_tabla VARCHAR(100)
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
    observaciones   TEXT
);

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

CREATE TABLE IF NOT EXISTS configuracion_cai_historial (
    id             SERIAL PRIMARY KEY,
    cai            VARCHAR(255) NOT NULL,
    rangoinicial   VARCHAR(100) NOT NULL,
    rangofinal     VARCHAR(100) NOT NULL,
    fechalimite    DATE NOT NULL,
    fecha_registro TIMESTAMPTZ DEFAULT NOW(),
    registrado_por VARCHAR(100)
);

-- =====================================================
-- 13. ÍNDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_login_usuario     ON login_intentos(usuario, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_login_ip          ON login_intentos(ip_address, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_notif_usuario     ON notificaciones(para_usuario, leida, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_fecha      ON kardex_inventario(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha      ON ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente    ON ventas(identidadCliente);
CREATE INDEX IF NOT EXISTS idx_ventas_caja       ON ventas(idCaja, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_sucursal   ON ventas(id_sucursal, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_detalle_venta     ON detalleventa(idVenta);
CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre    ON medicamentos(nombre_generico);
CREATE INDEX IF NOT EXISTS idx_medicamentos_comercial ON medicamentos(nombre_comercial);
CREATE INDEX IF NOT EXISTS idx_medicamentos_cat       ON medicamentos(id_categoria);
CREATE INDEX IF NOT EXISTS idx_medicamentos_ean       ON medicamentos(codigo_ean13);
CREATE INDEX IF NOT EXISTS idx_lotes_med         ON lotes_medicamento(id_medicamento);
CREATE INDEX IF NOT EXISTS idx_recetas_cliente   ON recetas(id_cliente);
CREATE INDEX IF NOT EXISTS idx_recetas_estado    ON recetas(estado);
CREATE INDEX IF NOT EXISTS idx_presentaciones    ON presentaciones_venta(id_medicamento);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre   ON clientes(nombre, apellido);

-- =====================================================
-- 14. DATOS INICIALES
-- =====================================================
-- =====================================================
-- 15. MIGRACIONES ADICIONALES (ejecutar sobre BD existente)
-- =====================================================
ALTER TABLE caja    ADD COLUMN IF NOT EXISTS id_sucursal INT REFERENCES sucursales(id_sucursal);
ALTER TABLE empleado ADD COLUMN IF NOT EXISTS id_sucursal INT REFERENCES sucursales(id_sucursal);

INSERT INTO sucursales (codigo, nombre, estado)
VALUES ('SUC-001', 'Sucursal Principal', 'Activa')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO configuracion (id, nombreempresa, isv, punto_emision, descuento_tercera_edad, isv_tasa_general)
VALUES (1, 'Farmacia', 15.00, '001-001', 25.00, 15.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categorias_terapeuticas (nombre, descripcion, codigo_atc_nivel1) VALUES
    ('Analgésicos y Antipiréticos', 'Alivio del dolor y fiebre', 'N'),
    ('Antibióticos', 'Tratamiento de infecciones bacterianas', 'J'),
    ('Antiinflamatorios', 'Reducción de la inflamación', 'M'),
    ('Antihistamínicos', 'Tratamiento de alergias', 'R'),
    ('Antihipertensivos', 'Control de la presión arterial', 'C'),
    ('Antidiabéticos', 'Control de glucosa en sangre', 'A'),
    ('Vitaminas y Suplementos', 'Soporte nutricional', 'A'),
    ('Dermatológicos', 'Tratamiento de afecciones de la piel', 'D'),
    ('Oftalmológicos', 'Tratamiento de afecciones oculares', 'S'),
    ('Pediátricos', 'Medicamentos para niños', 'N'),
    ('Ginecológicos', 'Salud femenina', 'G'),
    ('Gastrointestinales', 'Tratamiento digestivo', 'A'),
    ('Respiratorios', 'Tratamiento de vías respiratorias', 'R'),
    ('Cardiovasculares', 'Salud del corazón', 'C'),
    ('Neurológicos / Psicotrópicos', 'Sistema nervioso - controlados', 'N'),
    ('Material de Curación', 'Curaciones y vendajes', NULL),
    ('Equipos Médicos', 'Tensiómetros, glucómetros, etc.', NULL),
    ('Cosméticos y Cuidado Personal', 'Higiene y belleza', NULL),
    ('Bebidas y Snacks', 'Productos de consumo general', NULL),
    ('Genéricos', 'Medicamentos genéricos', 'J')
ON CONFLICT DO NOTHING;

INSERT INTO formas_farmaceuticas (nombre, unidad_base) VALUES
    ('Tableta', 'tableta'),
    ('Cápsula', 'cápsula'),
    ('Cápsula Blanda (Gel)', 'cápsula'),
    ('Gragea', 'gragea'),
    ('Jarabe', 'ml'),
    ('Suspensión Oral', 'ml'),
    ('Solución Oral', 'ml'),
    ('Gotas Orales', 'ml'),
    ('Solución Inyectable', 'ampolla'),
    ('Polvo para Inyectable', 'vial'),
    ('Crema', 'gramo'),
    ('Gel', 'gramo'),
    ('Pomada', 'gramo'),
    ('Loción', 'ml'),
    ('Shampoo Medicado', 'ml'),
    ('Gotas Oftálmicas', 'ml'),
    ('Gotas Óticas', 'ml'),
    ('Spray Nasal', 'dosis'),
    ('Aerosol Inhalador', 'dosis'),
    ('Supositorio', 'supositorio'),
    ('Óvulo', 'óvulo'),
    ('Parche Transdérmico', 'parche'),
    ('Polvo para Suspensión', 'ml'),
    ('Solución Tópica', 'ml'),
    ('Dispositivo / Equipo', 'unidad')
ON CONFLICT DO NOTHING;

INSERT INTO roles (nombre, estado) VALUES
    ('SuperAdmin', 'Activo'),
    ('GerenteSucursal', 'Activo'),
    ('Farmacéutico', 'Activo'),
    ('Auxiliar Farmacia', 'Activo'),
    ('Bodega', 'Activo'),
    ('Cajero', 'Activo')
ON CONFLICT DO NOTHING;

INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_POS',               'Ver Punto de Venta',        'Ventas'),
    ('VER_CLIENTES',          'Ver Clientes',              'Ventas'),
    ('VER_INVENTARIO',        'Ver Inventario',            'Inventario'),
    ('VER_PROVEEDORES',       'Ver Proveedores',           'Inventario'),
    ('DISEÑAR_ETIQUETAS',     'Diseñar Etiquetas',         'Inventario'),
    ('VER_CAJA',              'Ver Caja y Movimientos',    'Finanzas'),
    ('VER_CONTABILIDAD',      'Ver Contabilidad',          'Finanzas'),
    ('VER_REPORTES',          'Ver Reportes',              'Administracion'),
    ('VER_ADMIN',             'Ver Administracion',        'Administracion'),
    ('GESTIONAR_PANEL_CAJAS', 'Gestionar Panel de Cajas',  'Administracion'),
    ('GESTIONAR_USUARIOS',    'Gestionar Usuarios',        'Administracion'),
    ('GESTIONAR_ROLES',       'Gestionar Roles',           'Administracion'),
    ('CONFIGURAR_EMPRESA',    'Configurar Empresa',        'Administracion')
ON CONFLICT (idPermiso) DO NOTHING;

-- Grant all permissions to SuperAdmin role (global, no tenant_id)
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('superadmin', 'admin', 'administrador')
  AND r.tenant_id IS NULL
ON CONFLICT (idRol, idPermiso) DO NOTHING;

-- =====================================================
-- 15. STORED PROCEDURES
-- NOTA: NO ejecutar estas funciones en el editor web de Render.
-- Ejecutar cada función POR SEPARADO usando psql o
-- el archivo scripts/farmacia_funciones.sql con psql.
-- El servidor tiene lógica de fallback si las funciones no existen.
-- =====================================================

-- =====================================================
-- FIN DEL SCRIPT DE MIGRACIÓN
-- =====================================================
