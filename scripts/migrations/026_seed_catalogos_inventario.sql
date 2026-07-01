-- ============================================================
-- Migration 026: Siembra catálogos base de inventario por clínica
--
-- Las tablas formas_farmaceuticas y categorias_terapeuticas son por-tenant y
-- arrancaban vacías (no había forma de llenarlas desde la app), por lo que los
-- selects de "Forma farmacéutica" y "Categoría terapéutica" salían en blanco.
--
-- Esta migración: (1) agrega un índice único (tenant_id, nombre) para evitar
-- duplicados y permitir upserts, y (2) siembra valores por defecto para TODAS
-- las clínicas existentes. Las clínicas nuevas se siembran en el onboarding
-- (services/catalogSeed.js) — mantener ambas listas sincronizadas.
--
-- Nota RLS: estas tablas tienen FORCE ROW LEVEL SECURITY (migración 023). Se
-- activa el bypass durante la migración para poder insertar filas de todos los
-- tenants, y se desactiva al final.
-- ============================================================

SELECT set_config('app.bypass_rls', 'true', false);

CREATE UNIQUE INDEX IF NOT EXISTS ux_formas_farmaceuticas_tenant_nombre
    ON formas_farmaceuticas (tenant_id, nombre);

CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_terapeuticas_tenant_nombre
    ON categorias_terapeuticas (tenant_id, nombre);

-- Formas farmacéuticas por defecto para cada tenant.
INSERT INTO formas_farmaceuticas (nombre, unidad_base, tenant_id)
SELECT v.nombre, v.unidad_base, t.id
FROM tenants t
CROSS JOIN (VALUES
    ('Tableta', 'tableta'),
    ('Comprimido', 'comprimido'),
    ('Cápsula', 'cápsula'),
    ('Jarabe', 'ml'),
    ('Suspensión', 'ml'),
    ('Solución inyectable', 'ml'),
    ('Gotas', 'ml'),
    ('Crema', 'g'),
    ('Ungüento', 'g'),
    ('Gel', 'g'),
    ('Polvo', 'g'),
    ('Spray', 'ml'),
    ('Pipeta', 'pipeta'),
    ('Shampoo', 'ml'),
    ('Collar', 'unidad')
) AS v(nombre, unidad_base)
ON CONFLICT (tenant_id, nombre) DO NOTHING;

-- Categorías terapéuticas por defecto para cada tenant.
INSERT INTO categorias_terapeuticas (nombre, tenant_id)
SELECT v.nombre, t.id
FROM tenants t
CROSS JOIN (VALUES
    ('Antibióticos'),
    ('Antiinflamatorios (AINEs)'),
    ('Analgésicos'),
    ('Antiparasitarios internos'),
    ('Antiparasitarios externos'),
    ('Antifúngicos'),
    ('Antihistamínicos'),
    ('Corticosteroides'),
    ('Vitaminas y suplementos'),
    ('Vacunas'),
    ('Anestésicos y sedantes'),
    ('Dermatológicos'),
    ('Oftálmicos'),
    ('Óticos'),
    ('Gastrointestinales'),
    ('Cardiológicos'),
    ('Hormonales'),
    ('Fluidoterapia'),
    ('Otros')
) AS v(nombre)
ON CONFLICT (tenant_id, nombre) DO NOTHING;

SELECT set_config('app.bypass_rls', '', false);
