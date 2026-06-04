-- Sistema de cuotas de IA por tenant.
-- Crea: ai_quota_plans (plantillas por plan), ai_quota_usage (contadores en tiempo real).
-- Agrega columnas de override y control a tenants.

-- ── 1. Plantillas de cuota por plan ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_quota_plans (
    plan                VARCHAR(20) PRIMARY KEY
                        CHECK (plan IN ('basico', 'profesional', 'enterprise')),
    tokens_mensual      BIGINT  NOT NULL DEFAULT 100000,
    requests_mensual    INT     NOT NULL DEFAULT 200,
    requests_diario     INT     NOT NULL DEFAULT 30,
    procesos_habilitados TEXT[]  NOT NULL DEFAULT ARRAY[
        'symptom_recommendation',
        'drug_interactions'
    ],
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_quota_plans (plan, tokens_mensual, requests_mensual, requests_diario, procesos_habilitados)
VALUES
    ('basico',       100000,   200,   30,  ARRAY['symptom_recommendation','drug_interactions']),
    ('profesional',  500000,  1000,  100,  ARRAY['medication_intake','symptom_recommendation','drug_interactions','client_analysis','cash_anomaly','restock_prediction']),
    ('enterprise', 5000000, 99999,  500,  ARRAY['medication_intake','symptom_recommendation','drug_interactions','client_analysis','cash_anomaly','restock_prediction'])
ON CONFLICT (plan) DO UPDATE
    SET tokens_mensual      = EXCLUDED.tokens_mensual,
        requests_mensual    = EXCLUDED.requests_mensual,
        requests_diario     = EXCLUDED.requests_diario,
        procesos_habilitados = EXCLUDED.procesos_habilitados,
        updated_at          = NOW();

-- ── 2. Contadores de uso en tiempo real ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_quota_usage (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    periodo             CHAR(7) NOT NULL,               -- '2026-05'
    tokens_consumidos   BIGINT  NOT NULL DEFAULT 0,
    requests_totales    INT     NOT NULL DEFAULT 0,
    requests_hoy        INT     NOT NULL DEFAULT 0,
    fecha_reset_diario  DATE    NOT NULL DEFAULT CURRENT_DATE,
    alerta_80_enviada   BOOLEAN NOT NULL DEFAULT FALSE,
    alerta_100_enviada  BOOLEAN NOT NULL DEFAULT FALSE,
    ultimo_exceso_at    TIMESTAMPTZ NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_ai_quota_usage_tenant_periodo
    ON ai_quota_usage(tenant_id, periodo DESC);

-- ── 3. Columnas de override y control en tenants ─────────────────────────────
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS ai_habilitado          BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS ai_tokens_override     BIGINT      NULL,
    ADD COLUMN IF NOT EXISTS ai_requests_override   INT         NULL,
    ADD COLUMN IF NOT EXISTS ai_req_diario_override INT         NULL;

-- ── 4. Vista de uso consolidado (útil para SuperAdmin) ──────────────────────
CREATE OR REPLACE VIEW v_ai_quota_status AS
SELECT
    t.id               AS tenant_id,
    t.slug,
    t.nombre_empresa,
    t.plan,
    t.ai_habilitado,
    p.tokens_mensual,
    p.requests_mensual,
    p.requests_diario,
    COALESCE(t.ai_tokens_override,   p.tokens_mensual)   AS tokens_limite,
    COALESCE(t.ai_requests_override, p.requests_mensual) AS requests_limite,
    COALESCE(t.ai_req_diario_override, p.requests_diario) AS req_diario_limite,
    TO_CHAR(NOW() AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM') AS periodo_actual,
    COALESCE(u.tokens_consumidos, 0)  AS tokens_consumidos,
    COALESCE(u.requests_totales,  0)  AS requests_totales,
    COALESCE(u.requests_hoy,      0)  AS requests_hoy,
    CASE
        WHEN NOT t.ai_habilitado THEN 'deshabilitado'
        WHEN COALESCE(u.tokens_consumidos, 0) >= COALESCE(t.ai_tokens_override, p.tokens_mensual) THEN 'agotado'
        WHEN COALESCE(u.tokens_consumidos, 0) >= COALESCE(t.ai_tokens_override, p.tokens_mensual) * 0.80 THEN 'alerta'
        ELSE 'ok'
    END AS estado_cuota,
    ROUND(
        COALESCE(u.tokens_consumidos, 0) * 100.0
        / NULLIF(COALESCE(t.ai_tokens_override, p.tokens_mensual), 0)
    , 1) AS pct_tokens_usado,
    u.alerta_80_enviada,
    u.alerta_100_enviada,
    u.ultimo_exceso_at
FROM tenants t
JOIN ai_quota_plans p ON p.plan = t.plan
LEFT JOIN ai_quota_usage u
    ON u.tenant_id = t.id
    AND u.periodo = TO_CHAR(NOW() AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM');
