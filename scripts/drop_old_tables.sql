-- =====================================================
-- LIMPIEZA DE TABLAS LEGACY — FARMACIA ERP
-- Ejecutar en PostgreSQL (Render) después de hacer
-- backup de la base de datos.
-- =====================================================

-- 1. Eliminar tablas del sistema de celulares (hijas primero)
DROP TABLE IF EXISTS reparacion_complementos CASCADE;
DROP TABLE IF EXISTS consignaciones CASCADE;
DROP TABLE IF EXISTS garantias CASCADE;
DROP TABLE IF EXISTS reparaciones CASCADE;
DROP TABLE IF EXISTS ingresos CASCADE;
DROP TABLE IF EXISTS egresos CASCADE;
DROP TABLE IF EXISTS saldos CASCADE;
DROP TABLE IF EXISTS paquetes CASCADE;
DROP TABLE IF EXISTS telefonos CASCADE;
DROP TABLE IF EXISTS inventario CASCADE;
DROP TABLE IF EXISTS accesorios CASCADE;
DROP TABLE IF EXISTS categoria CASCADE;
DROP TABLE IF EXISTS socios CASCADE;
DROP TABLE IF EXISTS ubicacion CASCADE;
DROP TABLE IF EXISTS costos CASCADE;

-- 2. Limpiar columnas legacy en detalleventa
ALTER TABLE detalleventa DROP COLUMN IF EXISTS idIngreso;
ALTER TABLE detalleventa DROP COLUMN IF EXISTS idTelefono;
ALTER TABLE detalleventa DROP COLUMN IF EXISTS idAccesorio;
ALTER TABLE detalleventa DROP COLUMN IF EXISTS estado;

-- 3. Limpiar columnas de saldo de operadoras en arqueo
ALTER TABLE arqueo DROP COLUMN IF EXISTS saldoTigoFinal;
ALTER TABLE arqueo DROP COLUMN IF EXISTS saldoClaroFinal;

-- 4. Limpiar columnas KrediYa de ventas
ALTER TABLE ventas DROP COLUMN IF EXISTS es_krediya;
ALTER TABLE ventas DROP COLUMN IF EXISTS estado_pago_financiera;
ALTER TABLE ventas DROP COLUMN IF EXISTS monto_financiera;
ALTER TABLE ventas DROP COLUMN IF EXISTS monto_prima_efectivo;

-- 5. Limpiar columnas de saldos de operadoras en configuracion
ALTER TABLE configuracion DROP COLUMN IF EXISTS saldo_tigo_umbral;
ALTER TABLE configuracion DROP COLUMN IF EXISTS saldo_claro_umbral;

-- 6. Limpiar SP y funciones relacionadas con tablas eliminadas
DROP FUNCTION IF EXISTS sp_cerrar_arqueo(VARCHAR, VARCHAR, NUMERIC, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS sp_calcular_saldo_red(VARCHAR, DATE) CASCADE;

-- =====================================================
-- FIN DE LIMPIEZA
-- Tablas farmacia que se MANTIENEN:
--   sucursales, empleado, roles, permisos, usuarios, rol_permisos,
--   caja, clientes, proveedores, configuracion, arqueo,
--   categorias_terapeuticas, formas_farmaceuticas, principios_activos,
--   medicamentos, medicamento_principios, medicamento_imagenes,
--   presentaciones_venta, lotes_medicamento,
--   ventas, detalleventa, pagos_venta,
--   recetas, detalle_receta, recetas_retenidas,
--   libro_psicofarmacos,
--   ordenes_compra, detalle_orden_compra, recepciones_compra, detalle_recepcion,
--   transferencias_sucursal,
--   login_intentos, notificaciones, kardex_inventario,
--   label_templates, configuracion_cai_historial
-- =====================================================
