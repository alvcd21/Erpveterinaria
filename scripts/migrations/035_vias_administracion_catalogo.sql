-- ============================================================
-- Migration 035: Catálogo de vías de administración
--
-- Hasta ahora medicamentos.via_administracion era texto libre. Se agrega un
-- catálogo por-clínica (como formas_farmaceuticas / categorias_terapeuticas)
-- para poder crear/editar/eliminar vías y usarlas en el desplegable del
-- medicamento. La columna medicamentos.via_administracion se conserva (guarda
-- el nombre elegido), así que no se rompe nada existente.
-- ============================================================

CREATE TABLE IF NOT EXISTS vias_administracion (
    id_via     SERIAL PRIMARY KEY,
    nombre     VARCHAR(60) NOT NULL,
    activo     BOOLEAN NOT NULL DEFAULT TRUE,
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_vias_administracion_tenant_nombre
    ON vias_administracion (tenant_id, nombre);

-- RLS (la tabla es nueva; 023 ya corrió, así que se habilita aquí).
DO $do$
BEGIN
    EXECUTE 'ALTER TABLE public.vias_administracion ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.vias_administracion FORCE ROW LEVEL SECURITY';
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'vias_administracion' AND policyname = 'tenant_isolation'
    ) THEN
        EXECUTE 'CREATE POLICY tenant_isolation ON public.vias_administracion FOR ALL '
             || 'USING (rls_bypass_active() OR tenant_id = current_tenant_id()) '
             || 'WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id())';
    END IF;
END
$do$;

-- Siembra de vías por defecto para las clínicas existentes (bajo bypass porque
-- la tabla tiene FORCE RLS). Mantener sincronizado con services/catalogSeed.js.
SELECT set_config('app.bypass_rls', 'true', false);

INSERT INTO vias_administracion (nombre, tenant_id)
SELECT v.nombre, t.id
FROM tenants t
CROSS JOIN (VALUES
    ('Oral'),
    ('Intravenosa (IV)'),
    ('Intramuscular (IM)'),
    ('Subcutánea (SC)'),
    ('Tópica'),
    ('Oftálmica'),
    ('Ótica'),
    ('Nasal'),
    ('Rectal'),
    ('Inhalatoria'),
    ('Intraperitoneal'),
    ('Intramamaria')
) AS v(nombre)
ON CONFLICT (tenant_id, nombre) DO NOTHING;

SELECT set_config('app.bypass_rls', '', false);
