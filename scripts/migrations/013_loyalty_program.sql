-- ══════════════════════════════════════════════════════════════
-- Migration 013: Loyalty Program
-- ══════════════════════════════════════════════════════════════

-- Config per tenant (chain-wide) with optional per-branch overrides
CREATE TABLE IF NOT EXISTS loyalty_configs (
    id                    BIGSERIAL PRIMARY KEY,
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id_sucursal           INT REFERENCES sucursales(id_sucursal),  -- NULL = applies to entire chain
    activo                BOOLEAN NOT NULL DEFAULT TRUE,
    nombre_programa       VARCHAR(100) NOT NULL DEFAULT 'Programa de Lealtad',
    earn_rate             NUMERIC(8,4) NOT NULL DEFAULT 1.0,        -- points per L1 spent
    earn_min_purchase     NUMERIC(10,2) NOT NULL DEFAULT 0,         -- min purchase to earn
    redeem_rate           NUMERIC(8,4) NOT NULL DEFAULT 100.0,      -- points needed per L1 discount
    redeem_min_points     INT NOT NULL DEFAULT 500,                 -- min points before redeeming
    redeem_max_pct        NUMERIC(5,2) NOT NULL DEFAULT 30.0,       -- max % of total redeemable
    expiry_months         INT NOT NULL DEFAULT 12,                  -- 0 = never expires
    expiry_type           VARCHAR(20) NOT NULL DEFAULT 'rolling'
                            CHECK (expiry_type IN ('rolling','anniversary','never')),
    tier_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    tier_thresholds       JSONB NOT NULL DEFAULT '{"silver":5000,"gold":15000}',
    tier_multipliers      JSONB NOT NULL DEFAULT '{"bronze":1.0,"silver":1.5,"gold":2.0}',
    bonus_birthday_pts    INT NOT NULL DEFAULT 0,
    bonus_enrollment_pts  INT NOT NULL DEFAULT 0,
    excluded_categories   INT[] NOT NULL DEFAULT '{}',
    exclude_ihss          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique: one config per (tenant, branch), with NULL branch = chain-wide
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_config_unique
    ON loyalty_configs(tenant_id, COALESCE(id_sucursal, -1));

CREATE INDEX IF NOT EXISTS idx_loyalty_config_tenant
    ON loyalty_configs(tenant_id);

-- One account per customer per tenant (points are chain-wide by default)
CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id                    BIGSERIAL PRIMARY KEY,
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    identidad_cliente     VARCHAR(50) NOT NULL,
    puntos_disponibles    INT NOT NULL DEFAULT 0 CHECK (puntos_disponibles >= 0),
    puntos_vitalicios     INT NOT NULL DEFAULT 0 CHECK (puntos_vitalicios >= 0),
    tier_actual           VARCHAR(20) NOT NULL DEFAULT 'bronze',
    fecha_inscripcion     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_ultimo_mov      TIMESTAMPTZ,
    UNIQUE(tenant_id, identidad_cliente)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_tenant
    ON loyalty_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_identidad
    ON loyalty_accounts(tenant_id, identidad_cliente);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_tier
    ON loyalty_accounts(tenant_id, tier_actual);

-- Immutable audit trail of every points movement
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id                    BIGSERIAL PRIMARY KEY,
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id            BIGINT NOT NULL REFERENCES loyalty_accounts(id),
    tipo                  VARCHAR(20) NOT NULL
                            CHECK (tipo IN ('earn','redeem','expire','adjust','reversal','bonus')),
    puntos_delta          INT NOT NULL,
    puntos_antes          INT NOT NULL,
    puntos_despues        INT NOT NULL,
    cod_venta             VARCHAR(100),
    id_sucursal           INT REFERENCES sucursales(id_sucursal),
    usuario_id            INT,
    descripcion           VARCHAR(500),
    expires_at            TIMESTAMPTZ,  -- only for 'earn' with rolling expiry
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_account
    ON loyalty_transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_tenant
    ON loyalty_transactions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_venta
    ON loyalty_transactions(tenant_id, cod_venta);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_expires
    ON loyalty_transactions(tenant_id, expires_at)
    WHERE tipo = 'earn' AND expires_at IS NOT NULL;

-- Links a redemption to a sale for reversal on void/return
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id                    BIGSERIAL PRIMARY KEY,
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id            BIGINT NOT NULL REFERENCES loyalty_accounts(id),
    transaction_id        BIGINT NOT NULL REFERENCES loyalty_transactions(id),
    cod_venta             VARCHAR(100) NOT NULL,
    puntos_usados         INT NOT NULL,
    valor_descuento_lps   NUMERIC(10,2) NOT NULL,
    reversed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_venta
    ON loyalty_redemptions(tenant_id, cod_venta);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_account
    ON loyalty_redemptions(account_id);
