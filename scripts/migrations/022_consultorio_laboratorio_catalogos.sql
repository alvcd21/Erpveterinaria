-- Catalogo clinico para pruebas de laboratorio veterinarias.
CREATE TABLE IF NOT EXISTS laboratorio_pruebas (
    id_prueba SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    categoria VARCHAR(120),
    nombre VARCHAR(180) NOT NULL,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_laboratorio_pruebas_tenant_nombre_lower
    ON laboratorio_pruebas (tenant_id, lower(nombre));

CREATE INDEX IF NOT EXISTS idx_laboratorio_pruebas_tenant_activo_nombre
    ON laboratorio_pruebas (tenant_id, activo, nombre);

INSERT INTO laboratorio_pruebas (tenant_id, categoria, nombre, descripcion)
SELECT t.id, seed.categoria, seed.nombre, seed.descripcion
FROM tenants t
CROSS JOIN (
    VALUES
        ('Hematologia', 'Hemograma completo', 'Conteo sanguineo completo para evaluacion general.'),
        ('Perfil clinico', 'Perfil de chequeo I', 'Hemograma, ALT, creatinina, glucosa y pruebas basicas.'),
        ('Perfil clinico', 'Perfil de chequeo II', 'Hemograma, ALT, AST, fosfatasa alcalina y perfil ampliado.'),
        ('Perfil clinico', 'Perfil de chequeo III', 'Hemograma, AST, GGT, glucosa y pruebas sericas.'),
        ('Renal', 'Perfil renal I', 'BUN, urea, creatinina y uroanalisis.'),
        ('Coprologia', 'Examen coprologico', 'Analisis de materia fecal y parasitos.'),
        ('Urianalisis', 'Uroanalisis', 'Analisis fisico, quimico y microscopico de orina.'),
        ('Bioquimica', 'ALT', 'Alanina aminotransferasa.'),
        ('Bioquimica', 'Creatinina', 'Marcador de funcion renal.'),
        ('Bioquimica', 'Glucosa', 'Medicion de glucosa en sangre.')
) AS seed(categoria, nombre, descripcion)
WHERE NOT EXISTS (
    SELECT 1
    FROM laboratorio_pruebas lp
    WHERE lp.tenant_id = t.id
      AND lower(lp.nombre) = lower(seed.nombre)
);
