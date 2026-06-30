-- Consultorio clínico: expediente unificado por paciente.

CREATE TABLE IF NOT EXISTS paciente_eventos_clinicos (
    id_evento       BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    id_paciente     INT NOT NULL REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
    id_tutor        VARCHAR(100),
    id_consulta     INT REFERENCES consultas(id_consulta) ON DELETE SET NULL,
    id_cita         INT REFERENCES citas(id_cita) ON DELETE SET NULL,
    tipo            VARCHAR(40) NOT NULL,
    titulo          VARCHAR(180) NOT NULL,
    fecha_evento    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estado          VARCHAR(30) NOT NULL DEFAULT 'Registrado',
    resumen         TEXT,
    detalle         TEXT,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    adjuntos        JSONB NOT NULL DEFAULT '[]'::jsonb,
    enviar_correo   BOOLEAN NOT NULL DEFAULT FALSE,
    correo_enviado  BOOLEAN NOT NULL DEFAULT FALSE,
    correo_destino  VARCHAR(255),
    creado_por      VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (tipo IN (
        'historia','consulta','vacuna','formula','desparasitacion','hospitalizacion',
        'cirugia','orden','laboratorio','imagenologia','grooming','guarderia',
        'seguimiento','documento','remision','cita','mensaje'
    ))
);

CREATE INDEX IF NOT EXISTS idx_paciente_eventos_tenant_paciente
    ON paciente_eventos_clinicos(tenant_id, id_paciente, fecha_evento DESC);

CREATE INDEX IF NOT EXISTS idx_paciente_eventos_tenant_tipo
    ON paciente_eventos_clinicos(tenant_id, tipo, fecha_evento DESC);

CREATE INDEX IF NOT EXISTS idx_paciente_eventos_payload
    ON paciente_eventos_clinicos USING GIN(payload);

INSERT INTO permisos (idPermiso, nombre, modulo)
VALUES
    ('VER_CONSULTORIO', 'Ver Consultorio Clínico', 'Clinica'),
    ('GESTIONAR_CONSULTORIO', 'Gestionar Consultorio Clínico', 'Clinica')
ON CONFLICT (idPermiso) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo;

INSERT INTO plan_features (plan, feature_key, descripcion)
VALUES
    ('profesional', 'modulo_consultorio', 'Consultorio clínico integral por paciente'),
    ('enterprise', 'modulo_consultorio', 'Consultorio clínico integral por paciente')
ON CONFLICT (plan, feature_key) DO UPDATE SET
    descripcion = EXCLUDED.descripcion;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT DISTINCT rp.idRol, v.new_perm
FROM rol_permisos rp
JOIN (VALUES
    ('VER_EXPEDIENTE', 'VER_CONSULTORIO'),
    ('EDITAR_EXPEDIENTE', 'GESTIONAR_CONSULTORIO')
) AS v(old_perm, new_perm) ON rp.idPermiso = v.old_perm
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('administrador', 'admin', 'superadmin')
  AND p.idPermiso IN ('VER_CONSULTORIO', 'GESTIONAR_CONSULTORIO')
ON CONFLICT DO NOTHING;
