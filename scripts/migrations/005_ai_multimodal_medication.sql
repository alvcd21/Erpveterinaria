CREATE TABLE IF NOT EXISTS ai_process_settings (
    id              BIGSERIAL PRIMARY KEY,
    process_key     VARCHAR(80) NOT NULL,
    provider        VARCHAR(30) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini')),
    model           VARCHAR(120) NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    temperature     NUMERIC(3,2) NOT NULL DEFAULT 0.20,
    max_tokens      INTEGER NOT NULL DEFAULT 1800,
    tenant_id       UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
    updated_by      TEXT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (process_key, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_process_settings_global
    ON ai_process_settings(process_key)
    WHERE tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS ai_analysis_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NULL REFERENCES tenants(id) ON DELETE SET NULL,
    user_id         INTEGER NULL,
    process_key     VARCHAR(80) NOT NULL,
    provider        VARCHAR(30) NOT NULL,
    model           VARCHAR(120) NOT NULL,
    status          VARCHAR(30) NOT NULL,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    image_count     INTEGER NOT NULL DEFAULT 0,
    image_metadata  JSONB NOT NULL DEFAULT '[]'::jsonb,
    token_usage     JSONB NULL,
    cost_estimate   NUMERIC(12,6) NULL,
    error_summary   TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_tenant_process
    ON ai_analysis_logs(tenant_id, process_key, created_at DESC);

INSERT INTO ai_process_settings (process_key, provider, model, enabled, temperature, max_tokens, tenant_id)
VALUES (
    'medication_intake',
    COALESCE(NULLIF(current_setting('app.ai_default_provider', true), ''), 'openai'),
    COALESCE(NULLIF(current_setting('app.ai_default_model', true), ''), 'gpt-4o-mini'),
    TRUE,
    0.20,
    1800,
    NULL
)
ON CONFLICT DO NOTHING;
