-- Adjust Basic plan access for veterinary clinics and disable AI for Basic.

INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
    ('basico', 'modulo_consultorio',      'Consultorio y expediente clinico'),
    ('basico', 'modulo_vacunas',          'Vacunas y medicina preventiva'),
    ('basico', 'modulo_hospitalizacion',  'Flowboard clinico'),
    ('basico', 'modulo_vencimientos',     'Control de vencimientos'),
    ('basico', 'modulo_proveedores',      'Gestion de proveedores'),
    ('basico', 'modulo_etiquetas',        'Disenador de etiquetas'),
    ('basico', 'modulo_ordenes_compra',   'Ordenes de compra'),
    ('basico', 'modulo_panel_cajas',      'Panel de cajas')
ON CONFLICT (plan, feature_key) DO UPDATE SET
    descripcion = EXCLUDED.descripcion;

DELETE FROM plan_features
WHERE plan = 'basico'
  AND feature_key IN ('ia_basica', 'ia_avanzada');

INSERT INTO saas_features (feature_key, nombre, modulo, tipo, descripcion, orden)
VALUES
    ('modulo_consultorio',      'Consultorio',              'Clinica',        'modulo', 'Consultorio y expediente clinico', 30),
    ('modulo_vacunas',          'Vacunas',                  'Clinica',        'modulo', 'Vacunas y medicina preventiva', 40),
    ('modulo_hospitalizacion',  'Flowboard',                'Clinica',        'modulo', 'Flowboard clinico', 50),
    ('modulo_vencimientos',     'Control de vencimientos',  'Inventario',     'modulo', 'Control de vencimientos', 40),
    ('modulo_proveedores',      'Proveedores',              'Inventario',     'modulo', 'Gestion de proveedores', 50),
    ('modulo_etiquetas',        'Etiquetas',                'Inventario',     'modulo', 'Disenador de etiquetas', 60),
    ('modulo_ordenes_compra',   'Ordenes de compra',        'Inventario',     'modulo', 'Ordenes de compra', 70),
    ('modulo_panel_cajas',      'Panel de cajas',           'Administracion', 'modulo', 'Panel de administracion de cajas', 80)
ON CONFLICT (feature_key) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo,
    tipo = EXCLUDED.tipo,
    descripcion = EXCLUDED.descripcion,
    orden = EXCLUDED.orden,
    estado = 'activo',
    updated_at = NOW();

INSERT INTO saas_plan_features (plan_slug, feature_key, enabled)
VALUES
    ('basico', 'modulo_consultorio', TRUE),
    ('basico', 'modulo_vacunas', TRUE),
    ('basico', 'modulo_hospitalizacion', TRUE),
    ('basico', 'modulo_vencimientos', TRUE),
    ('basico', 'modulo_proveedores', TRUE),
    ('basico', 'modulo_etiquetas', TRUE),
    ('basico', 'modulo_ordenes_compra', TRUE),
    ('basico', 'modulo_panel_cajas', TRUE)
ON CONFLICT (plan_slug, feature_key) DO UPDATE SET
    enabled = TRUE,
    updated_at = NOW();

DELETE FROM saas_plan_features
WHERE plan_slug = 'basico'
  AND feature_key IN ('ia_basica', 'ia_avanzada');

UPDATE saas_plans
SET ai_tokens_mensual = 0,
    ai_requests_mensual = 0,
    ai_requests_diario = 0,
    updated_at = NOW()
WHERE slug = 'basico';

UPDATE ai_quota_plans
SET tokens_mensual = 0,
    requests_mensual = 0,
    requests_diario = 0,
    procesos_habilitados = ARRAY[]::text[],
    updated_at = NOW()
WHERE plan = 'basico';

UPDATE tenants
SET ai_habilitado = FALSE,
    ai_tokens_override = NULL,
    ai_requests_override = NULL,
    ai_req_diario_override = NULL,
    updated_at = NOW()
WHERE plan = 'basico';

UPDATE tenant_subscriptions
SET limits_snapshot = jsonb_set(
        jsonb_set(
            jsonb_set(limits_snapshot, '{ai_tokens_mensual}', '0'::jsonb, TRUE),
            '{ai_requests_mensual}', '0'::jsonb, TRUE
        ),
        '{ai_requests_diario}', '0'::jsonb, TRUE
    ),
    updated_at = NOW()
WHERE plan_slug = 'basico'
  AND is_current = TRUE;
