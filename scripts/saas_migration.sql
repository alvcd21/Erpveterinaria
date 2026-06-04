-- =====================================================
-- FARMACIA ERP — MIGRACIÓN SAAS MULTI-TENANCY
-- Versión : 1.0.0
-- Fecha   : 2026-05-06
-- Autor   : Architecture Agent (SPARC)
--
-- DESCRIPCIÓN:
--   Transforma el esquema single-tenant en uno multi-tenant
--   usando Row-Level Security (shared schema, shared database).
--   El script es IDEMPOTENTE: puede ejecutarse múltiples veces
--   sin errores gracias al uso de IF NOT EXISTS, ON CONFLICT
--   y bloques DO $$ BEGIN ... EXCEPTION WHEN ... END $$.
--
-- ORDEN DE EJECUCIÓN:
--   1. Crear tabla tenants
--   2. Insertar tenant default
--   3. Agregar columna tenant_id a cada tabla y backfill
--   4. Agregar FK constraints
--   5. Corregir configuracion (eliminar single_row, new PK)
--   6. Corregir usuarios.usuario UNIQUE → compuesta
--   7. Habilitar RLS y crear políticas
--   8. Crear índices de rendimiento
--   9. Crear vistas de gestión SaaS
--  10. Crear tabla saas_audit_log
--
-- REQUISITOS PREVIOS:
--   - PostgreSQL 14+
--   - Extensión pgcrypto activa (gen_random_uuid)
--   - Ejecutar como superusuario o rol con SUPERUSER/BYPASSRLS
-- =====================================================

-- Asegurar extensión uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- PASO 1: TABLA MAESTRA DE TENANTS
-- =====================================================

CREATE TABLE IF NOT EXISTS tenants (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                    VARCHAR(50) UNIQUE NOT NULL
                                CHECK (slug ~ '^[a-z0-9-]+$'),
    nombre_empresa          VARCHAR(200) NOT NULL,
    email_contacto          VARCHAR(100) NOT NULL,
    telefono                VARCHAR(30),
    pais                    VARCHAR(60)  DEFAULT 'Honduras',
    plan                    VARCHAR(20)  DEFAULT 'basico'
                                CHECK (plan IN ('basico', 'profesional', 'enterprise')),
    estado                  VARCHAR(20)  DEFAULT 'activo'
                                CHECK (estado IN ('activo', 'suspendido', 'cancelado', 'prueba')),
    max_sucursales          INT          DEFAULT 1,
    max_usuarios            INT          DEFAULT 10,
    max_medicamentos        INT          DEFAULT 500,
    fecha_inicio            DATE         DEFAULT CURRENT_DATE,
    fecha_vencimiento       DATE,
    stripe_customer_id      VARCHAR(100),
    stripe_subscription_id  VARCHAR(100),
    configuracion_extra     JSONB        DEFAULT '{}',
    created_at              TIMESTAMPTZ  DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE tenants IS
    'Registro maestro de clientes SaaS. Cada fila representa una cadena de farmacias con su plan de suscripción.';

COMMENT ON COLUMN tenants.slug IS
    'Identificador URL-safe único. Usado en subdominios (slug.erpfarmacia.com) y header X-Tenant-ID.';

COMMENT ON COLUMN tenants.plan IS
    'basico=L.1500/mes | profesional=L.3500/mes | enterprise=L.7500/mes';

-- =====================================================
-- PASO 2: TENANT DEFAULT (datos existentes)
-- =====================================================

INSERT INTO tenants (
    id, slug, nombre_empresa, email_contacto,
    plan, estado, max_sucursales, max_usuarios, max_medicamentos
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Farmacia Principal',
    'admin@farmacia.com',
    'enterprise',
    'activo',
    999,   -- sin límite efectivo para datos históricos
    9999,
    999999
)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- PASO 3: AGREGAR tenant_id A CADA TABLA + BACKFILL
-- =====================================================
-- Patrón seguro:
--   a) ADD COLUMN IF NOT EXISTS (sin NOT NULL aún)
--   b) UPDATE … WHERE tenant_id IS NULL   (backfill)
--   c) ALTER COLUMN SET NOT NULL          (después del backfill)
--   d) ADD CONSTRAINT FK … (si aún no existe)
-- =====================================================

-- Macro interna: helper para agregar FK idempotente
-- (PostgreSQL no tiene ADD FOREIGN KEY IF NOT EXISTS antes de v15)

-- -----------------------------------------------
-- 3.1 usuarios
-- -----------------------------------------------
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE usuarios
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE usuarios ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE usuarios
        ADD CONSTRAINT fk_usuarios_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.2 roles
-- -----------------------------------------------
ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE roles
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE roles ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE roles
        ADD CONSTRAINT fk_roles_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.3 permisos
-- NOTA: permisos es un catálogo global (idPermiso como PK varchar).
-- Se agrega tenant_id para soporte de permisos custom por tenant,
-- pero los registros globales del catálogo no necesitan tenant.
-- Se mantienen como NULL = permiso global.
-- -----------------------------------------------
ALTER TABLE permisos
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- permisos del catálogo global se dejan con tenant_id = NULL (global)
-- Los permisos custom de un tenant tendrán su tenant_id

DO $$ BEGIN
    ALTER TABLE permisos
        ADD CONSTRAINT fk_permisos_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.4 rol_permisos
-- -----------------------------------------------
ALTER TABLE rol_permisos
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE rol_permisos
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE rol_permisos ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE rol_permisos
        ADD CONSTRAINT fk_rol_permisos_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.5 empleado
-- -----------------------------------------------
ALTER TABLE empleado
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE empleado
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE empleado ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE empleado
        ADD CONSTRAINT fk_empleado_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.6 sucursales
-- -----------------------------------------------
ALTER TABLE sucursales
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE sucursales
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE sucursales ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE sucursales
        ADD CONSTRAINT fk_sucursales_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- El código de sucursal debe ser único POR tenant, no globalmente.
-- Se elimina el UNIQUE simple y se reemplaza por unique compuesto.
DO $$ BEGIN
    ALTER TABLE sucursales DROP CONSTRAINT sucursales_codigo_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE sucursales
        ADD CONSTRAINT uq_sucursales_codigo_tenant UNIQUE (tenant_id, codigo);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.7 caja
-- -----------------------------------------------
ALTER TABLE caja
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE caja
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE caja ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE caja
        ADD CONSTRAINT fk_caja_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.8 clientes
-- -----------------------------------------------
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE clientes
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE clientes ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE clientes
        ADD CONSTRAINT fk_clientes_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- identidad de cliente es única por tenant, no globalmente
-- (dos cadenas pueden tener el mismo cliente en sus sistemas)
-- La PK varchar se mantiene; la unicidad efectiva es (tenant_id, identidad).
-- No se puede cambiar la PK sin recrear la tabla, así que
-- se documenta con un índice único compuesto en su lugar.
DO $$ BEGIN
    ALTER TABLE clientes
        ADD CONSTRAINT uq_clientes_identidad_tenant UNIQUE (tenant_id, identidad);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.9 proveedores
-- -----------------------------------------------
ALTER TABLE proveedores
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE proveedores
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE proveedores ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE proveedores
        ADD CONSTRAINT fk_proveedores_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.10 medicamentos
-- -----------------------------------------------
ALTER TABLE medicamentos
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE medicamentos
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE medicamentos ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE medicamentos
        ADD CONSTRAINT fk_medicamentos_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- El código de medicamento (VARCHAR(20) PK) debe ser único por tenant.
-- Como la PK simple ya existe, se agrega un índice único compuesto
-- para garantizar unicidad cross-tenant correcta.
DO $$ BEGIN
    ALTER TABLE medicamentos
        ADD CONSTRAINT uq_medicamentos_codigo_tenant UNIQUE (tenant_id, codigo);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.11 lotes_medicamento
-- -----------------------------------------------
ALTER TABLE lotes_medicamento
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE lotes_medicamento
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE lotes_medicamento ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE lotes_medicamento
        ADD CONSTRAINT fk_lotes_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.12 presentaciones_venta
-- -----------------------------------------------
ALTER TABLE presentaciones_venta
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE presentaciones_venta
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE presentaciones_venta ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE presentaciones_venta
        ADD CONSTRAINT fk_presentaciones_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.13 categorias_terapeuticas
-- -----------------------------------------------
ALTER TABLE categorias_terapeuticas
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE categorias_terapeuticas
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE categorias_terapeuticas ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE categorias_terapeuticas
        ADD CONSTRAINT fk_categorias_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.14 formas_farmaceuticas
-- -----------------------------------------------
ALTER TABLE formas_farmaceuticas
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE formas_farmaceuticas
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE formas_farmaceuticas ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE formas_farmaceuticas
        ADD CONSTRAINT fk_formas_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.15 ventas
-- -----------------------------------------------
ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE ventas
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE ventas ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ventas
        ADD CONSTRAINT fk_ventas_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.16 detalleventa
-- -----------------------------------------------
ALTER TABLE detalleventa
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE detalleventa
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE detalleventa ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE detalleventa
        ADD CONSTRAINT fk_detalleventa_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.17 arqueo
-- -----------------------------------------------
ALTER TABLE arqueo
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE arqueo
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE arqueo ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE arqueo
        ADD CONSTRAINT fk_arqueo_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.18 recetas
-- -----------------------------------------------
ALTER TABLE recetas
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE recetas
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE recetas ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE recetas
        ADD CONSTRAINT fk_recetas_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.19 detalle_receta
-- -----------------------------------------------
ALTER TABLE detalle_receta
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE detalle_receta
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE detalle_receta ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE detalle_receta
        ADD CONSTRAINT fk_detalle_receta_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.20 ordenes_compra
-- -----------------------------------------------
ALTER TABLE ordenes_compra
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE ordenes_compra
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE ordenes_compra ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ordenes_compra
        ADD CONSTRAINT fk_ordenes_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.21 detalle_orden_compra
-- -----------------------------------------------
ALTER TABLE detalle_orden_compra
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE detalle_orden_compra
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE detalle_orden_compra ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE detalle_orden_compra
        ADD CONSTRAINT fk_detalle_orden_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.22 recepciones_compra
-- -----------------------------------------------
ALTER TABLE recepciones_compra
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE recepciones_compra
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE recepciones_compra ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE recepciones_compra
        ADD CONSTRAINT fk_recepciones_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.23 transferencias_sucursal
-- -----------------------------------------------
ALTER TABLE transferencias_sucursal
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE transferencias_sucursal
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE transferencias_sucursal ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE transferencias_sucursal
        ADD CONSTRAINT fk_transferencias_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.24 label_templates
-- -----------------------------------------------
ALTER TABLE label_templates
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE label_templates
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE label_templates ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE label_templates
        ADD CONSTRAINT fk_label_templates_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.25 notificaciones
-- -----------------------------------------------
ALTER TABLE notificaciones
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE notificaciones
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE notificaciones ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE notificaciones
        ADD CONSTRAINT fk_notificaciones_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.26 kardex_inventario
-- -----------------------------------------------
ALTER TABLE kardex_inventario
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE kardex_inventario
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE kardex_inventario ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE kardex_inventario
        ADD CONSTRAINT fk_kardex_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- 3.27 pagos_venta
-- -----------------------------------------------
ALTER TABLE pagos_venta
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE pagos_venta
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE pagos_venta ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE pagos_venta
        ADD CONSTRAINT fk_pagos_venta_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PASO 4: CORREGIR TABLA configuracion
--
-- Problema: CONSTRAINT single_row CHECK (id = 1)
--   impide tener una fila por tenant.
-- Solución:
--   a) Eliminar el CHECK constraint
--   b) Agregar tenant_id
--   c) Cambiar PK de INTEGER a UUID (requiere recrear la tabla)
--      — Para no romper datos existentes, se usa una estrategia
--        alternativa: agregar columna tenant_id, crear UNIQUE
--        (tenant_id) y dejar id INTEGER por compatibilidad con
--        código que ya usa id=1. El código de la app se migrará
--        en la fase 2 para usar tenant_id como selector.
-- =====================================================

-- 4a. Eliminar constraint single_row
DO $$ BEGIN
    ALTER TABLE configuracion DROP CONSTRAINT single_row;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 4b. Agregar tenant_id
ALTER TABLE configuracion
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE configuracion
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DO $$ BEGIN
    ALTER TABLE configuracion ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE configuracion
        ADD CONSTRAINT fk_configuracion_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4c. Garantizar una sola configuración por tenant
DO $$ BEGIN
    ALTER TABLE configuracion
        ADD CONSTRAINT uq_configuracion_tenant UNIQUE (tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4d. Agregar columnas de auditoría si no existen
ALTER TABLE configuracion
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================
-- PASO 5: CORREGIR usuarios.usuario UNIQUE
--
-- Antes: UNIQUE(usuario)    — global
-- Después: UNIQUE(tenant_id, usuario) — por tenant
-- =====================================================

-- Eliminar el UNIQUE simple que impide duplicados cross-tenant
DO $$ BEGIN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_usuario_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Agregar UNIQUE compuesto
DO $$ BEGIN
    ALTER TABLE usuarios
        ADD CONSTRAINT uq_usuarios_usuario_tenant UNIQUE (tenant_id, usuario);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PASO 6: ROW LEVEL SECURITY (RLS)
--
-- Estrategia: current_setting('app.current_tenant_id', true)
-- El backend ejecuta:
--   SET LOCAL app.current_tenant_id = '<uuid>';
-- al inicio de cada request (dentro de la transacción).
--
-- Super-admin bypass: SET LOCAL app.bypass_rls = 'true';
--
-- Las políticas usan USING + WITH CHECK para cubrir
-- SELECT, INSERT, UPDATE y DELETE.
-- =====================================================

-- Función auxiliar para extraer el tenant_id del contexto de sesión
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', true)::UUID;
EXCEPTION
    WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'app.current_tenant_id no es un UUID válido: %',
            current_setting('app.current_tenant_id', true);
    WHEN others THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION current_tenant_id IS
    'Retorna el UUID del tenant activo desde la variable de sesión app.current_tenant_id. Retorna NULL si no está configurada (usado por super-admin).';

-- Función para comprobar si el bypass está activo
CREATE OR REPLACE FUNCTION rls_bypass_active() RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(current_setting('app.bypass_rls', true), 'false') = 'true';
EXCEPTION WHEN others THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Macro interna para política estándar:
--   USING (rls_bypass_active() OR tenant_id = current_tenant_id())

-- -----------------------------------------------
-- RLS: tenants
-- (solo super-admin ve todos; un tenant se ve a sí mismo)
-- -----------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_tenants_select ON tenants;
CREATE POLICY policy_tenants_select ON tenants
    FOR SELECT USING (
        rls_bypass_active()
        OR id = current_tenant_id()
    );

DROP POLICY IF EXISTS policy_tenants_modify ON tenants;
CREATE POLICY policy_tenants_modify ON tenants
    FOR ALL USING (rls_bypass_active());

-- -----------------------------------------------
-- RLS: usuarios
-- -----------------------------------------------
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_usuarios ON usuarios;
CREATE POLICY policy_usuarios ON usuarios
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: roles
-- -----------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_roles ON roles;
CREATE POLICY policy_roles ON roles
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: permisos (catálogo global visible por todos; permisos custom solo por tenant)
-- -----------------------------------------------
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_permisos ON permisos;
CREATE POLICY policy_permisos ON permisos
    FOR SELECT USING (
        tenant_id IS NULL               -- permiso global del catálogo
        OR rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

DROP POLICY IF EXISTS policy_permisos_write ON permisos;
CREATE POLICY policy_permisos_write ON permisos
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: rol_permisos
-- -----------------------------------------------
ALTER TABLE rol_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rol_permisos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_rol_permisos ON rol_permisos;
CREATE POLICY policy_rol_permisos ON rol_permisos
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: empleado
-- -----------------------------------------------
ALTER TABLE empleado ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleado FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_empleado ON empleado;
CREATE POLICY policy_empleado ON empleado
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: sucursales
-- -----------------------------------------------
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sucursales FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_sucursales ON sucursales;
CREATE POLICY policy_sucursales ON sucursales
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: caja
-- -----------------------------------------------
ALTER TABLE caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_caja ON caja;
CREATE POLICY policy_caja ON caja
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: clientes
-- -----------------------------------------------
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_clientes ON clientes;
CREATE POLICY policy_clientes ON clientes
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: proveedores
-- -----------------------------------------------
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_proveedores ON proveedores;
CREATE POLICY policy_proveedores ON proveedores
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: medicamentos
-- -----------------------------------------------
ALTER TABLE medicamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicamentos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_medicamentos ON medicamentos;
CREATE POLICY policy_medicamentos ON medicamentos
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: lotes_medicamento
-- -----------------------------------------------
ALTER TABLE lotes_medicamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_medicamento FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_lotes_medicamento ON lotes_medicamento;
CREATE POLICY policy_lotes_medicamento ON lotes_medicamento
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: presentaciones_venta
-- -----------------------------------------------
ALTER TABLE presentaciones_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentaciones_venta FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_presentaciones_venta ON presentaciones_venta;
CREATE POLICY policy_presentaciones_venta ON presentaciones_venta
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: categorias_terapeuticas
-- -----------------------------------------------
ALTER TABLE categorias_terapeuticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_terapeuticas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_categorias_terapeuticas ON categorias_terapeuticas;
CREATE POLICY policy_categorias_terapeuticas ON categorias_terapeuticas
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: formas_farmaceuticas
-- -----------------------------------------------
ALTER TABLE formas_farmaceuticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE formas_farmaceuticas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_formas_farmaceuticas ON formas_farmaceuticas;
CREATE POLICY policy_formas_farmaceuticas ON formas_farmaceuticas
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: ventas
-- -----------------------------------------------
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_ventas ON ventas;
CREATE POLICY policy_ventas ON ventas
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: detalleventa
-- -----------------------------------------------
ALTER TABLE detalleventa ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalleventa FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_detalleventa ON detalleventa;
CREATE POLICY policy_detalleventa ON detalleventa
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: arqueo
-- -----------------------------------------------
ALTER TABLE arqueo ENABLE ROW LEVEL SECURITY;
ALTER TABLE arqueo FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_arqueo ON arqueo;
CREATE POLICY policy_arqueo ON arqueo
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: recetas
-- -----------------------------------------------
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_recetas ON recetas;
CREATE POLICY policy_recetas ON recetas
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: detalle_receta
-- -----------------------------------------------
ALTER TABLE detalle_receta ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_receta FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_detalle_receta ON detalle_receta;
CREATE POLICY policy_detalle_receta ON detalle_receta
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: ordenes_compra
-- -----------------------------------------------
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_compra FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_ordenes_compra ON ordenes_compra;
CREATE POLICY policy_ordenes_compra ON ordenes_compra
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: detalle_orden_compra
-- -----------------------------------------------
ALTER TABLE detalle_orden_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_orden_compra FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_detalle_orden_compra ON detalle_orden_compra;
CREATE POLICY policy_detalle_orden_compra ON detalle_orden_compra
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: recepciones_compra
-- -----------------------------------------------
ALTER TABLE recepciones_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE recepciones_compra FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_recepciones_compra ON recepciones_compra;
CREATE POLICY policy_recepciones_compra ON recepciones_compra
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: transferencias_sucursal
-- -----------------------------------------------
ALTER TABLE transferencias_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias_sucursal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_transferencias_sucursal ON transferencias_sucursal;
CREATE POLICY policy_transferencias_sucursal ON transferencias_sucursal
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: label_templates
-- -----------------------------------------------
ALTER TABLE label_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_label_templates ON label_templates;
CREATE POLICY policy_label_templates ON label_templates
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: notificaciones
-- -----------------------------------------------
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_notificaciones ON notificaciones;
CREATE POLICY policy_notificaciones ON notificaciones
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: kardex_inventario
-- -----------------------------------------------
ALTER TABLE kardex_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE kardex_inventario FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_kardex_inventario ON kardex_inventario;
CREATE POLICY policy_kardex_inventario ON kardex_inventario
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: pagos_venta
-- -----------------------------------------------
ALTER TABLE pagos_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_venta FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_pagos_venta ON pagos_venta;
CREATE POLICY policy_pagos_venta ON pagos_venta
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- -----------------------------------------------
-- RLS: configuracion
-- -----------------------------------------------
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_configuracion ON configuracion;
CREATE POLICY policy_configuracion ON configuracion
    FOR ALL USING (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    )
    WITH CHECK (
        rls_bypass_active()
        OR tenant_id = current_tenant_id()
    );

-- =====================================================
-- PASO 7: ÍNDICES DE RENDIMIENTO POR TENANT
-- =====================================================
-- Un índice por tenant_id en cada tabla grande asegura que
-- el planner de PostgreSQL use Index Scan en lugar de Seq Scan
-- incluso con RLS activo.

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant
    ON usuarios(tenant_id);

CREATE INDEX IF NOT EXISTS idx_roles_tenant
    ON roles(tenant_id);

CREATE INDEX IF NOT EXISTS idx_rol_permisos_tenant
    ON rol_permisos(tenant_id);

CREATE INDEX IF NOT EXISTS idx_empleado_tenant
    ON empleado(tenant_id);

CREATE INDEX IF NOT EXISTS idx_sucursales_tenant
    ON sucursales(tenant_id);

CREATE INDEX IF NOT EXISTS idx_caja_tenant
    ON caja(tenant_id);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant
    ON clientes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant
    ON proveedores(tenant_id);

CREATE INDEX IF NOT EXISTS idx_medicamentos_tenant
    ON medicamentos(tenant_id);

CREATE INDEX IF NOT EXISTS idx_lotes_medicamento_tenant
    ON lotes_medicamento(tenant_id);

CREATE INDEX IF NOT EXISTS idx_presentaciones_venta_tenant
    ON presentaciones_venta(tenant_id);

CREATE INDEX IF NOT EXISTS idx_categorias_terapeuticas_tenant
    ON categorias_terapeuticas(tenant_id);

CREATE INDEX IF NOT EXISTS idx_formas_farmaceuticas_tenant
    ON formas_farmaceuticas(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ventas_tenant
    ON ventas(tenant_id);

-- Índice compuesto: tenant + fecha para reportes por período
CREATE INDEX IF NOT EXISTS idx_ventas_tenant_fecha
    ON ventas(tenant_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_detalleventa_tenant
    ON detalleventa(tenant_id);

CREATE INDEX IF NOT EXISTS idx_arqueo_tenant
    ON arqueo(tenant_id);

CREATE INDEX IF NOT EXISTS idx_recetas_tenant
    ON recetas(tenant_id);

CREATE INDEX IF NOT EXISTS idx_detalle_receta_tenant
    ON detalle_receta(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_tenant
    ON ordenes_compra(tenant_id);

CREATE INDEX IF NOT EXISTS idx_detalle_orden_compra_tenant
    ON detalle_orden_compra(tenant_id);

CREATE INDEX IF NOT EXISTS idx_recepciones_compra_tenant
    ON recepciones_compra(tenant_id);

CREATE INDEX IF NOT EXISTS idx_transferencias_sucursal_tenant
    ON transferencias_sucursal(tenant_id);

CREATE INDEX IF NOT EXISTS idx_label_templates_tenant
    ON label_templates(tenant_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant
    ON notificaciones(tenant_id);

CREATE INDEX IF NOT EXISTS idx_kardex_inventario_tenant
    ON kardex_inventario(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pagos_venta_tenant
    ON pagos_venta(tenant_id);

CREATE INDEX IF NOT EXISTS idx_configuracion_tenant
    ON configuracion(tenant_id);

-- Índice en tenants por slug (lookup más frecuente en resolución de tenant)
CREATE INDEX IF NOT EXISTS idx_tenants_slug
    ON tenants(slug);

CREATE INDEX IF NOT EXISTS idx_tenants_estado
    ON tenants(estado)
    WHERE estado = 'activo';

-- =====================================================
-- PASO 8: VISTA tenant_plan_limits
-- =====================================================

CREATE OR REPLACE VIEW tenant_plan_limits AS
SELECT
    id,
    slug,
    nombre_empresa,
    email_contacto,
    plan,
    estado,
    max_sucursales,
    max_usuarios,
    max_medicamentos,
    fecha_inicio,
    fecha_vencimiento,
    stripe_customer_id,
    stripe_subscription_id,
    CASE
        WHEN fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE
        THEN TRUE
        ELSE FALSE
    END AS plan_activo,
    CASE
        WHEN fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE
        THEN (CURRENT_DATE - fecha_vencimiento)
        ELSE 0
    END AS dias_vencido,
    CASE
        WHEN fecha_vencimiento IS NOT NULL
        THEN (fecha_vencimiento - CURRENT_DATE)
        ELSE NULL
    END AS dias_para_vencer
FROM tenants;

COMMENT ON VIEW tenant_plan_limits IS
    'Vista de límites de plan por tenant. Usada por el middleware para aplicar throttling.';

-- =====================================================
-- PASO 9: VISTA tenant_usage (uso actual por tenant)
-- =====================================================

CREATE OR REPLACE VIEW tenant_usage AS
SELECT
    t.id                    AS tenant_id,
    t.slug,
    t.nombre_empresa,
    t.plan,
    t.estado,
    -- Sucursales activas
    (SELECT COUNT(*) FROM sucursales s
     WHERE s.tenant_id = t.id AND s.estado = 'Activa')  AS sucursales_activas,
    t.max_sucursales,
    -- Usuarios activos
    (SELECT COUNT(*) FROM usuarios u
     WHERE u.tenant_id = t.id AND u.estado = 'Activo')  AS usuarios_activos,
    t.max_usuarios,
    -- Medicamentos registrados
    (SELECT COUNT(*) FROM medicamentos m
     WHERE m.tenant_id = t.id AND m.activo = TRUE)       AS medicamentos_registrados,
    t.max_medicamentos,
    -- Ventas del mes actual
    (SELECT COUNT(*) FROM ventas v
     WHERE v.tenant_id = t.id
       AND DATE_TRUNC('month', v.fecha) = DATE_TRUNC('month', NOW()))
        AS ventas_mes_actual,
    -- Volumen ventas mes actual
    (SELECT COALESCE(SUM(v.total), 0) FROM ventas v
     WHERE v.tenant_id = t.id
       AND DATE_TRUNC('month', v.fecha) = DATE_TRUNC('month', NOW())
       AND v.estado != 'Anulada')
        AS monto_ventas_mes,
    -- Porcentaje de uso
    ROUND(
        (SELECT COUNT(*) FROM sucursales s WHERE s.tenant_id = t.id AND s.estado = 'Activa')::NUMERIC
        / NULLIF(t.max_sucursales, 0) * 100, 1
    ) AS pct_uso_sucursales,
    ROUND(
        (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id AND u.estado = 'Activo')::NUMERIC
        / NULLIF(t.max_usuarios, 0) * 100, 1
    ) AS pct_uso_usuarios,
    ROUND(
        (SELECT COUNT(*) FROM medicamentos m WHERE m.tenant_id = t.id AND m.activo = TRUE)::NUMERIC
        / NULLIF(t.max_medicamentos, 0) * 100, 1
    ) AS pct_uso_medicamentos,
    t.created_at,
    t.fecha_vencimiento
FROM tenants t;

COMMENT ON VIEW tenant_usage IS
    'Métricas de uso actual por tenant. Usada para facturación, alertas de sobre-uso y dashboards de administración.';

-- =====================================================
-- PASO 10: TABLA saas_audit_log
-- =====================================================

CREATE TABLE IF NOT EXISTS saas_audit_log (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       UUID        REFERENCES tenants(id) ON DELETE SET NULL,
    tenant_slug     VARCHAR(50),
    actor_usuario   VARCHAR(100),
    actor_ip        INET,
    accion          VARCHAR(100) NOT NULL,
    recurso_tabla   VARCHAR(100),
    recurso_id      TEXT,
    datos_extra     JSONB        DEFAULT '{}',
    resultado       VARCHAR(20)  DEFAULT 'ok'
                        CHECK (resultado IN ('ok', 'error', 'denegado')),
    mensaje_error   TEXT,
    fecha           TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_tenant_fecha
    ON saas_audit_log(tenant_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_saas_audit_accion
    ON saas_audit_log(accion, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_saas_audit_actor
    ON saas_audit_log(actor_usuario, fecha DESC);

COMMENT ON TABLE saas_audit_log IS
    'Registro de auditoría a nivel SaaS: cambios de plan, activaciones, suspensiones, intentos de acceso cross-tenant.';

-- =====================================================
-- PASO 11: TRIGGER updated_at para tenants
-- =====================================================

CREATE OR REPLACE FUNCTION trg_tenants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_tenants_set_updated_at
        BEFORE UPDATE ON tenants
        FOR EACH ROW EXECUTE FUNCTION trg_tenants_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PASO 12: FUNCIÓN HELPER para el backend Node.js
--
-- El backend debe llamar a set_tenant_context() al inicio
-- de cada request para configurar el contexto RLS.
-- =====================================================

CREATE OR REPLACE FUNCTION set_tenant_context(
    p_tenant_id  TEXT,
    p_bypass_rls BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
BEGIN
    IF p_bypass_rls THEN
        PERFORM set_config('app.bypass_rls', 'true', TRUE);  -- TRUE = local (duración de la transacción)
        PERFORM set_config('app.current_tenant_id', '', TRUE);
    ELSE
        IF p_tenant_id IS NULL OR p_tenant_id = '' THEN
            RAISE EXCEPTION 'set_tenant_context: tenant_id no puede ser nulo';
        END IF;
        PERFORM set_config('app.bypass_rls', 'false', TRUE);
        PERFORM set_config('app.current_tenant_id', p_tenant_id, TRUE);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_tenant_context IS
    'Configura el contexto de tenant para la transacción actual.
     Llamar al inicio de cada request:
       await client.query("SELECT set_tenant_context($1)", [tenantId]);
     Para super-admin:
       await client.query("SELECT set_tenant_context(NULL, TRUE)");';

-- =====================================================
-- PASO 13: FUNCIÓN VALIDADORA de límites de plan
-- =====================================================

CREATE OR REPLACE FUNCTION check_tenant_limit(
    p_tenant_id  UUID,
    p_recurso    TEXT   -- 'sucursales' | 'usuarios' | 'medicamentos'
) RETURNS JSONB AS $$
DECLARE
    v_tenant  tenants%ROWTYPE;
    v_actual  INT;
    v_max     INT;
BEGIN
    SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'error', 'Tenant no encontrado');
    END IF;

    IF v_tenant.estado != 'activo' THEN
        RETURN jsonb_build_object('ok', FALSE, 'error', 'Tenant suspendido o cancelado');
    END IF;

    IF v_tenant.fecha_vencimiento IS NOT NULL AND v_tenant.fecha_vencimiento < CURRENT_DATE THEN
        RETURN jsonb_build_object('ok', FALSE, 'error', 'Plan vencido', 'fecha_vencimiento', v_tenant.fecha_vencimiento);
    END IF;

    CASE p_recurso
        WHEN 'sucursales' THEN
            SELECT COUNT(*) INTO v_actual FROM sucursales
            WHERE tenant_id = p_tenant_id AND estado = 'Activa';
            v_max := v_tenant.max_sucursales;

        WHEN 'usuarios' THEN
            SELECT COUNT(*) INTO v_actual FROM usuarios
            WHERE tenant_id = p_tenant_id AND estado = 'Activo';
            v_max := v_tenant.max_usuarios;

        WHEN 'medicamentos' THEN
            SELECT COUNT(*) INTO v_actual FROM medicamentos
            WHERE tenant_id = p_tenant_id AND activo = TRUE;
            v_max := v_tenant.max_medicamentos;

        ELSE
            RETURN jsonb_build_object('ok', FALSE, 'error', 'Recurso desconocido: ' || p_recurso);
    END CASE;

    IF v_actual >= v_max THEN
        RETURN jsonb_build_object(
            'ok',       FALSE,
            'error',    'Límite de ' || p_recurso || ' alcanzado',
            'actual',   v_actual,
            'maximo',   v_max,
            'plan',     v_tenant.plan
        );
    END IF;

    RETURN jsonb_build_object(
        'ok',       TRUE,
        'actual',   v_actual,
        'maximo',   v_max,
        'restante', v_max - v_actual
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_tenant_limit IS
    'Verifica si un tenant puede crear más recursos según su plan.
     Retorna JSONB con ok=true/false.
     Ejemplo: SELECT check_tenant_limit(tenant_id::UUID, ''sucursales'');';

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

DO $$
DECLARE
    v_tenants     INT;
    v_tables_rls  INT;
BEGIN
    SELECT COUNT(*) INTO v_tenants FROM tenants;
    SELECT COUNT(*) INTO v_tables_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relrowsecurity = TRUE
      AND n.nspname = 'public';

    RAISE NOTICE '============================================';
    RAISE NOTICE 'MIGRACIÓN SAAS COMPLETADA';
    RAISE NOTICE 'Tenants registrados   : %', v_tenants;
    RAISE NOTICE 'Tablas con RLS activo : %', v_tables_rls;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'PRÓXIMOS PASOS:';
    RAISE NOTICE '1. Agregar middleware tenant en Node.js (middleware/tenant.js)';
    RAISE NOTICE '2. Actualizar login para aceptar tenantSlug en el body';
    RAISE NOTICE '3. Agregar tenantId al payload JWT';
    RAISE NOTICE '4. Llamar SET LOCAL app.current_tenant_id en cada request';
    RAISE NOTICE '5. Crear portal de administración de tenants';
    RAISE NOTICE '============================================';
END $$;

-- =====================================================
-- FIN DEL SCRIPT DE MIGRACIÓN SAAS
-- =====================================================
