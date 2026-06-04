-- Solicitudes de ampliación de cuota IA enviadas por los admins de cada tenant.
CREATE TABLE IF NOT EXISTS ai_upgrade_requests (
    id                   BIGSERIAL PRIMARY KEY,
    tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_actual          VARCHAR(20),
    tokens_consumidos    BIGINT,
    tokens_limite        BIGINT,
    pct_usado            NUMERIC(5,1),
    paquete_solicitado   VARCHAR(80)  NOT NULL,
    motivo               TEXT,
    estado               VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente','en_revision','completada','rechazada')),
    respuesta_admin      TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_upgrade_requests_tenant
    ON ai_upgrade_requests(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_upgrade_requests_estado
    ON ai_upgrade_requests(estado) WHERE estado = 'pendiente';
