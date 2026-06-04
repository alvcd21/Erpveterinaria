-- =============================================================
-- FARMACIA ERP - DATOS DE PRUEBA
-- Basado en: scripts/migrate_farmacia.sql (esquema exacto)
-- Idempotente: puede ejecutarse varias veces sin error
-- =============================================================

SET TIME ZONE 'America/Tegucigalpa';

-- ================================================================
-- 1. SUCURSALES
-- ================================================================
INSERT INTO sucursales (codigo, nombre, direccion, telefono, ciudad, estado)
VALUES
    ('SUC-001', 'Farmacia Central',   'Av. Principal #123, Tegucigalpa', '2222-1111', 'Tegucigalpa',    'Activa'),
    ('SUC-002', 'Farmacia San Pedro', 'Col. Los Andes, San Pedro Sula',  '2333-2222', 'San Pedro Sula', 'Activa')
ON CONFLICT (codigo) DO UPDATE
    SET nombre    = EXCLUDED.nombre,
        direccion = EXCLUDED.direccion,
        ciudad    = EXCLUDED.ciudad;

-- ================================================================
-- 2. EMPLEADOS
-- Solo columnas presentes en ambas versiones del esquema
-- ================================================================
INSERT INTO empleado (identidad, nombre, apellido, telefono)
VALUES
    ('0801199001001', 'Alvaro',   'Cadenas Flores',  '9999-0001'),
    ('0801199001002', 'Maria',    'Lopez Garcia',    '9999-0002'),
    ('0801199001003', 'Roberto',  'Martinez Cruz',   '9999-0003')
ON CONFLICT (identidad) DO NOTHING;

-- ================================================================
-- 3. ROLES (WHERE NOT EXISTS evita duplicados - tabla sin UNIQUE en nombre)
-- ================================================================
INSERT INTO roles (nombre, estado)
SELECT t.nombre, 'Activo'
FROM (VALUES
    ('SuperAdmin'), ('GerenteSucursal'), ('Farmaceutico'),
    ('Auxiliar Farmacia'), ('Bodega'), ('Cajero')
) AS t(nombre)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE LOWER(r.nombre) = LOWER(t.nombre));

-- ================================================================
-- 4. CAJA
-- ================================================================
INSERT INTO caja (idCaja, nombre, estado, id_sucursal)
VALUES
    ('CAJA-001', 'Caja Principal',    'Activo', (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001')),
    ('CAJA-002', 'Caja Sucursal SPS', 'Activo', (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-002'))
ON CONFLICT (idCaja) DO NOTHING;

-- ================================================================
-- 5. PERMISOS
-- ================================================================
INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_POS',               'Ver Punto de Venta',       'Ventas'),
    ('VER_CLIENTES',          'Ver Clientes',             'Ventas'),
    ('VER_INVENTARIO',        'Ver Inventario',           'Inventario'),
    ('VER_PROVEEDORES',       'Ver Proveedores',          'Inventario'),
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

-- ================================================================
-- 6. ROL_PERMISOS - Todos los permisos a SuperAdmin
-- ================================================================
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('superadmin', 'administrador', 'admin')
  AND NOT EXISTS (
      SELECT 1 FROM rol_permisos rp
      WHERE rp.idRol = r.idrol AND rp.idPermiso = p.idPermiso
  );

-- ================================================================
-- 7. CONFIGURACION
-- ================================================================
INSERT INTO configuracion (
    id, nombreempresa, rtn, direccion, telefono, correo,
    isv, punto_emision, descuento_tercera_edad, isv_tasa_general
) VALUES (
    1, 'Farmacia Farmasas', '0801-1990-01234',
    'Av. Principal #123, Tegucigalpa', '2222-1111', 'info@farmasas.hn',
    15.00, '001-001', 25.00, 15.00
)
ON CONFLICT (id) DO UPDATE
    SET nombreempresa = EXCLUDED.nombreempresa,
        telefono      = EXCLUDED.telefono;

-- ================================================================
-- 8. CLIENTES
-- ================================================================
INSERT INTO clientes (identidad, nombre, apellido, telefono, fecha_nacimiento, condiciones_cronicas)
VALUES
    ('0801198501001', 'Juan Carlos', 'Martinez Reyes',  '9911-0001', '1985-03-15', 'Hipertension'),
    ('0801199201002', 'Rosa Elena',  'Funez Aguilar',   '9911-0002', '1992-07-22', 'Asma'),
    ('0801197501003', 'Manuel',      'Espinoza Torres', '9911-0003', '1975-11-08', 'Diabetes Tipo 2'),
    ('0801195501004', 'Ana Lucia',   'Perdomo Zelaya',  '9911-0004', '1955-01-30', 'Artritis, Hipertension'),
    ('0801196801005', 'Hector',      'Bustillo Nunez',  '9911-0005', '1968-09-12', 'Dislipidemia'),
    ('0801200001006', 'Sofia',       'Ramos Contreras', '9911-0006', '2000-04-25', NULL)
ON CONFLICT (identidad) DO NOTHING;

-- ================================================================
-- 9. PROVEEDORES
-- ================================================================
INSERT INTO proveedores (codProveedor, nombre, telefono, direccion, contacto)
VALUES
    ('PROV-0001', 'Laboratorios Infab S.A.',     '2232-1000', 'Tegucigalpa',     'Karla Mejia'),
    ('PROV-0002', 'Distribuidora Medica HN',      '2556-2000', 'San Pedro Sula',  'Jorge Pineda'),
    ('PROV-0003', 'Abbott Laboratories Honduras', '2234-3000', 'Tegucigalpa',     'Sandra Leal'),
    ('PROV-0004', 'Merck Sharp Dohme HN',         '2230-4000', 'Tegucigalpa',     'Carlos Reyes'),
    ('PROV-0005', 'Genericos Centroamerica S.A.', '2545-5000', 'Choloma, Cortes', 'Mirna Flores')
ON CONFLICT (codProveedor) DO NOTHING;

-- ================================================================
-- 10. PRINCIPIOS ACTIVOS
-- ================================================================
INSERT INTO principios_activos (nombre_dci, nombre_comun, clase_farmacologica)
VALUES
    ('paracetamol',            'Acetaminofen',   'Analgesico / Antipiretico'),
    ('ibuprofeno',             'Ibuprofeno',     'AINE'),
    ('amoxicilina',            'Amoxicilina',    'Antibiotico betalactamico'),
    ('losartan potasico',      'Losartan',       'Antagonista Angiotensina II'),
    ('metformina clorhidrato', 'Metformina',     'Biguanida antidiabetica'),
    ('atorvastatina calcica',  'Atorvastatina',  'Estatina hipolipemiante'),
    ('omeprazol',              'Omeprazol',      'Inhibidor bomba de protones'),
    ('salbutamol',             'Salbutamol',     'Broncodilatador beta-2'),
    ('loratadina',             'Loratadina',     'Antihistaminico no sedante'),
    ('diazepam',               'Diazepam',       'Benzodiazepina - CONTROLADO')
ON CONFLICT (nombre_dci) DO NOTHING;

-- ================================================================
-- 11. MEDICAMENTOS
-- Subqueries con LIMIT 1 por si hay duplicados en tablas de catálogo
-- ================================================================
INSERT INTO medicamentos (
    codigo, nombre_generico, nombre_comercial, concentracion,
    id_forma, via_administracion, id_categoria,
    requiere_receta, es_controlado, tipo_isv,
    precio_costo_base, margen_ganancia, stock_minimo, punto_reorden,
    laboratorio, id_sucursal_principal, activo
) VALUES
    ('MED-0001', 'Paracetamol',            'Tempra / Acetafen', '500mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Tableta' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Analgesicos y Antipiréticos' LIMIT 1),
     FALSE, FALSE, 'exento', 1.50, 30, 50, 100, 'Laboratorios Infab',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0002', 'Ibuprofeno',             'Advil / Ibufen',    '400mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Tableta' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Antiinflamatorios' LIMIT 1),
     FALSE, FALSE, 'exento', 1.80, 30, 40, 80, 'Laboratorios Infab',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0003', 'Amoxicilina',            'Amoxil',            '500mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Capsula' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Antibioticos' LIMIT 1),
     TRUE, FALSE, 'exento', 3.50, 30, 30, 60, 'Distribuidora Medica HN',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0004', 'Losartan potasico',      'Cozaar',            '50mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Tableta' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Antihipertensivos' LIMIT 1),
     TRUE, FALSE, 'exento', 4.20, 30, 30, 60, 'MSD Honduras',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0005', 'Metformina clorhidrato', 'Glucophage',        '850mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Tableta' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Antidiabeticos' LIMIT 1),
     TRUE, FALSE, 'exento', 3.80, 30, 40, 80, 'MSD Honduras',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0006', 'Atorvastatina calcica',  'Lipitor',           '20mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Tableta' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Cardiovasculares' LIMIT 1),
     TRUE, FALSE, 'exento', 8.00, 30, 20, 40, 'Abbott Laboratories',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0007', 'Omeprazol',              'Prilosec',          '20mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Capsula' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Gastrointestinales' LIMIT 1),
     FALSE, FALSE, 'exento', 2.80, 30, 30, 60, 'Laboratorios Infab',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0008', 'Salbutamol',             'Ventolin',          '100mcg/dosis',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Aerosol Inhalador' LIMIT 1),
     'Inhalatoria',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Respiratorios' LIMIT 1),
     TRUE, FALSE, 'exento', 85.00, 30, 10, 20, 'GSK Honduras',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0009', 'Loratadina',             'Claritine',         '10mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Tableta' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Antihistaminicos' LIMIT 1),
     FALSE, FALSE, 'exento', 2.50, 30, 20, 40, 'Genericos Centroamerica',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE),

    ('MED-0010', 'Diazepam',               'Valium',            '5mg',
     (SELECT id_forma FROM formas_farmaceuticas WHERE nombre = 'Tableta' LIMIT 1),
     'Oral',
     (SELECT id_categoria FROM categorias_terapeuticas WHERE nombre = 'Neurologicos / Psicotropicos' LIMIT 1),
     TRUE, TRUE, 'exento', 5.00, 30, 10, 20, 'Roche Honduras',
     (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001'), TRUE)

ON CONFLICT (codigo) DO NOTHING;

-- ================================================================
-- 12. PRESENTACIONES DE VENTA
-- UNIQUE: (id_medicamento, nombre)
-- ================================================================
INSERT INTO presentaciones_venta
    (id_medicamento, nombre, factor_conversion, descripcion_presentacion, precio_venta, precio_tercera_edad, es_unidad_venta)
VALUES
    ('MED-0001', 'Unidad',          1,   'Tableta suelta',          2.00,  1.50, TRUE),
    ('MED-0001', 'Caja x 100 tab', 100, 'Caja de 100 tabletas',  120.00, 90.00, TRUE),
    ('MED-0002', 'Unidad',          1,   'Tableta suelta',          2.50,  1.90, TRUE),
    ('MED-0002', 'Caja x 20 tab',  20,  'Caja de 20 tabletas',    38.00, 28.50, TRUE),
    ('MED-0003', 'Unidad',          1,   'Capsula suelta',          5.00,  3.75, TRUE),
    ('MED-0003', 'Caja x 30 caps', 30,  'Caja de 30 capsulas',   130.00, 97.50, TRUE),
    ('MED-0004', 'Unidad',          1,   'Tableta suelta',          6.00,  4.50, TRUE),
    ('MED-0004', 'Caja x 30 tab',  30,  'Caja de 30 tabletas',   165.00,123.75, TRUE),
    ('MED-0005', 'Unidad',          1,   'Tableta suelta',          5.50,  4.13, TRUE),
    ('MED-0005', 'Caja x 30 tab',  30,  'Caja de 30 tabletas',   153.00,114.75, TRUE),
    ('MED-0006', 'Unidad',          1,   'Tableta suelta',         11.00,  8.25, TRUE),
    ('MED-0006', 'Caja x 30 tab',  30,  'Caja de 30 tabletas',   320.00,240.00, TRUE),
    ('MED-0007', 'Unidad',          1,   'Capsula suelta',          4.00,  3.00, TRUE),
    ('MED-0007', 'Caja x 28 caps', 28,  'Caja de 28 capsulas',    95.00, 71.25, TRUE),
    ('MED-0008', 'Inhalador',      200, 'Inhalador 200 dosis',   260.00,195.00, TRUE),
    ('MED-0009', 'Unidad',          1,   'Tableta suelta',          3.50,  2.63, TRUE),
    ('MED-0009', 'Caja x 10 tab',  10,  'Caja de 10 tabletas',    30.00, 22.50, TRUE),
    ('MED-0010', 'Unidad',          1,   'Tableta suelta (ctrl)',   7.00,  5.25, TRUE),
    ('MED-0010', 'Caja x 20 tab',  20,  'Caja x 20 controlado',  125.00, 93.75, TRUE)
ON CONFLICT (id_medicamento, nombre) DO NOTHING;

-- ================================================================
-- 13. LOTES DE MEDICAMENTO
-- UNIQUE: (id_medicamento, numero_lote, id_sucursal)
-- ================================================================
INSERT INTO lotes_medicamento (
    id_medicamento, numero_lote, fecha_vencimiento_display, fecha_vencimiento,
    cantidad_inicial, cantidad_actual, precio_compra_unitario,
    id_sucursal, id_proveedor, estado
) VALUES
    ('MED-0001','LOTE-PAR-001','12/2027','2027-12-01',500,480, 1.50,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0001','Activo'),
    ('MED-0002','LOTE-IBU-001','06/2027','2027-06-01',300,285, 1.80,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0001','Activo'),
    ('MED-0003','LOTE-AMO-001','03/2027','2027-03-01',200,195, 3.50,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0002','Activo'),
    ('MED-0004','LOTE-LOS-001','09/2027','2027-09-01',150,143, 4.20,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0004','Activo'),
    ('MED-0005','LOTE-MET-001','11/2027','2027-11-01',200,188, 3.80,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0004','Activo'),
    ('MED-0006','LOTE-ATO-001','08/2027','2027-08-01',100, 92, 8.00,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0003','Activo'),
    ('MED-0007','LOTE-OME-001','05/2027','2027-05-01',250,241, 2.80,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0001','Activo'),
    ('MED-0008','LOTE-SAL-001','10/2027','2027-10-01', 30, 28,85.00,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0002','Activo'),
    ('MED-0009','LOTE-LOR-001','07/2027','2027-07-01',150,147, 2.50,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0005','Activo'),
    ('MED-0010','LOTE-DIA-001','04/2027','2027-04-01', 50, 48, 5.00,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0002','Activo'),
    ('MED-0001','LOTE-PAR-VEN','06/2026','2026-06-01', 20, 18, 1.20,(SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'),'PROV-0001','Activo')
ON CONFLICT (id_medicamento, numero_lote, id_sucursal) DO NOTHING;

-- ================================================================
-- 14. RECETAS
-- ================================================================
INSERT INTO recetas (
    codigo, id_cliente, nombre_medico, numero_colegiado, especialidad,
    fecha_emision, fecha_vencimiento, tipo_receta, diagnostico, estado, id_sucursal
) VALUES
    ('REC-0001','0801198501001','Dr. Carlos Andino',    'CMH-1234','Medicina General',
     CURRENT_DATE-5, CURRENT_DATE+25,'Normal',  'Hipertension arterial cronica',   'Pendiente',
     (SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001')),
    ('REC-0002','0801199201002','Dra. Silvia Morazan',  'CMH-5678','Neumologia',
     CURRENT_DATE-2, CURRENT_DATE+28,'Normal',  'Asma bronquial persistente',       'Dispensada',
     (SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001')),
    ('REC-0003','0801197501003','Dr. Fernando Zavala',  'CMH-9012','Endocrinologia',
     CURRENT_DATE-1, CURRENT_DATE+29,'Normal',  'Diabetes Mellitus Tipo 2',         'Pendiente',
     (SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001')),
    ('REC-0004','0801196801005','Dr. Ramon Valladares', 'CMH-3456','Cardiologia',
     CURRENT_DATE,   CURRENT_DATE+30,'Normal',  'Dislipidemia mixta',               'Pendiente',
     (SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001')),
    ('REC-0005','0801195501004','Dra. Elena Rubio',     'CMH-7890','Neurologia',
     CURRENT_DATE-3, CURRENT_DATE+27,'Retenida','Epilepsia - medicamento controlado','Pendiente',
     (SELECT id_sucursal FROM sucursales WHERE codigo='SUC-001'))
ON CONFLICT (codigo) DO NOTHING;

-- ================================================================
-- 15. ARQUEO
-- Solo columnas de migrate_farmacia.sql (sin idUsuario para compatibilidad)
-- ================================================================
INSERT INTO arqueo (
    idArqueo, idCaja,
    montoInicial, montoFinal, totalVentas, totalCostos, TotalGastos, ganancia,
    estado, fechaApertura
) VALUES (
    'ARQ-0001', 'CAJA-001',
    2000.00, 2000.00, 0, 0, 0, 0,
    'Activo', NOW()
)
ON CONFLICT (idArqueo) DO NOTHING;

-- ================================================================
-- 16. VENTAS
-- ================================================================
INSERT INTO ventas (
    codVenta, fecha, identidadCliente, codVendedor,
    total, estado, idCaja, subtotal_exento, isv_calculado, id_sucursal
)
SELECT
    v.codVenta,
    v.fecha::TIMESTAMPTZ,
    v.identidadCliente,
    u.codUsuario::TEXT,
    v.total, v.estado, 'CAJA-001', v.total, 0,
    (SELECT id_sucursal FROM sucursales WHERE codigo = 'SUC-001')
FROM (VALUES
    ('VEN-0001', (NOW()-INTERVAL '4 days')::TEXT, '0801198501001', 375.00, 'Completada'),
    ('VEN-0002', (NOW()-INTERVAL '3 days')::TEXT, '0801199201002', 280.00, 'Completada'),
    ('VEN-0003', (NOW()-INTERVAL '2 days')::TEXT, '0801197501003', 195.00, 'Completada'),
    ('VEN-0004', (NOW()-INTERVAL '1 day')::TEXT,  '0801196801005', 525.00, 'Completada'),
    ('VEN-0005',  NOW()::TEXT,                     NULL,           120.00, 'Activa')
) AS v(codVenta, fecha, identidadCliente, total, estado)
CROSS JOIN (SELECT codUsuario FROM usuarios ORDER BY codUsuario LIMIT 1) u
ON CONFLICT (codVenta) DO NOTHING;

-- ================================================================
-- 17. DETALLE DE VENTAS
-- Columnas exactas de migrate_farmacia.sql:
--   SIN precioVenta (no existe). Precio va en precioUnitario (NOT NULL).
-- ================================================================
INSERT INTO detalleventa (
    codDetalleventa, idVenta, producto, cantidad,
    precioUnitario, tipoProducto, tipo_isv, subtotal_exento
) VALUES
    ('DV-0001','VEN-0001','Losartan 50mg - Caja x 30 tab',       1, 165.00,'MEDICAMENTO','exento',165.00),
    ('DV-0002','VEN-0001','Metformina 850mg - Caja x 30 tab',    1, 153.00,'MEDICAMENTO','exento',153.00),
    ('DV-0003','VEN-0002','Salbutamol Inhalador 200 dosis',       1, 260.00,'MEDICAMENTO','exento',260.00),
    ('DV-0004','VEN-0003','Omeprazol 20mg - Caja x 28 caps',     1,  95.00,'MEDICAMENTO','exento', 95.00),
    ('DV-0005','VEN-0004','Metformina 850mg - Caja x 30 tab',    1, 153.00,'MEDICAMENTO','exento',153.00),
    ('DV-0006','VEN-0004','Atorvastatina 20mg - Caja x 30 tab',  1, 320.00,'MEDICAMENTO','exento',320.00),
    ('DV-0007','VEN-0005','Paracetamol 500mg - Caja x 100 tab',  1, 120.00,'MEDICAMENTO','exento',120.00)
ON CONFLICT (codDetalleventa) DO NOTHING;

-- ================================================================
-- 18. INGRESOS
-- Solo columnas comunes a ambas versiones del esquema
-- ================================================================
INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento)
VALUES
    ('ING-0001','CAJA-001','Venta VEN-0001',375.00,148.00,'Venta'),
    ('ING-0002','CAJA-001','Venta VEN-0002',280.00, 95.00,'Venta'),
    ('ING-0003','CAJA-001','Venta VEN-0003',195.00,112.00,'Venta'),
    ('ING-0004','CAJA-001','Venta VEN-0004',525.00,210.00,'Venta'),
    ('ING-0005','CAJA-001','Venta VEN-0005',120.00, 75.00,'Venta')
ON CONFLICT (idIngreso) DO NOTHING;

-- ================================================================
-- 19. EGRESOS
-- Solo columnas comunes a ambas versiones del esquema
-- ================================================================
INSERT INTO egresos (idEgresos, idCaja, descripcion, monto, categoria)
VALUES
    ('EGR-0001','CAJA-001','Electricidad - Mayo 2026',          850.00,'Gasto Operativo'),
    ('EGR-0002','CAJA-001','Agua potable - Mayo 2026',          150.00,'Gasto Operativo'),
    ('EGR-0003','CAJA-001','Compra Paracetamol - PROV-0001',  1800.00,'Compra de Producto'),
    ('EGR-0004','CAJA-001','Material de limpieza y empaques',   250.00,'Gasto Operativo'),
    ('EGR-0005','CAJA-001','Compra Metformina - PROV-0004',   2560.00,'Compra de Producto')
ON CONFLICT (idEgresos) DO NOTHING;

-- ================================================================
-- 20. SOCIOS
-- ================================================================
INSERT INTO socios (nombre, porcentaje_participacion, estado)
SELECT t.nombre, t.porc, 'Activo'
FROM (VALUES
    ('Alvaro Cadenas',           60.00::NUMERIC),
    ('Socio B Inversiones S.A.', 40.00::NUMERIC)
) AS t(nombre, porc)
WHERE NOT EXISTS (SELECT 1 FROM socios s WHERE s.nombre = t.nombre);

-- ================================================================
-- VERIFICACION
-- ================================================================
SELECT tabla, registros FROM (
    SELECT 'Sucursales'     AS tabla, COUNT(*)::INT AS registros FROM sucursales            UNION ALL
    SELECT 'Empleados'      AS tabla, COUNT(*)::INT AS registros FROM empleado              UNION ALL
    SELECT 'Roles'          AS tabla, COUNT(*)::INT AS registros FROM roles                 UNION ALL
    SELECT 'Usuarios'       AS tabla, COUNT(*)::INT AS registros FROM usuarios              UNION ALL
    SELECT 'Caja'           AS tabla, COUNT(*)::INT AS registros FROM caja                  UNION ALL
    SELECT 'Clientes'       AS tabla, COUNT(*)::INT AS registros FROM clientes              UNION ALL
    SELECT 'Proveedores'    AS tabla, COUNT(*)::INT AS registros FROM proveedores           UNION ALL
    SELECT 'Medicamentos'   AS tabla, COUNT(*)::INT AS registros FROM medicamentos          UNION ALL
    SELECT 'Presentaciones' AS tabla, COUNT(*)::INT AS registros FROM presentaciones_venta  UNION ALL
    SELECT 'Lotes'          AS tabla, COUNT(*)::INT AS registros FROM lotes_medicamento     UNION ALL
    SELECT 'Recetas'        AS tabla, COUNT(*)::INT AS registros FROM recetas               UNION ALL
    SELECT 'Arqueo'         AS tabla, COUNT(*)::INT AS registros FROM arqueo                UNION ALL
    SELECT 'Ventas'         AS tabla, COUNT(*)::INT AS registros FROM ventas                UNION ALL
    SELECT 'Detalle Ventas' AS tabla, COUNT(*)::INT AS registros FROM detalleventa          UNION ALL
    SELECT 'Ingresos'       AS tabla, COUNT(*)::INT AS registros FROM ingresos              UNION ALL
    SELECT 'Egresos'        AS tabla, COUNT(*)::INT AS registros FROM egresos               UNION ALL
    SELECT 'Socios'         AS tabla, COUNT(*)::INT AS registros FROM socios
) AS r ORDER BY tabla;
