-- Enlaza una cotización con la venta generada al convertirla, y registra el
-- estado del ciclo de vida (Emitida / Aceptada / Vencida / Convertida).
-- (La columna estado ya existe desde 027; aquí solo se agrega el enlace.)

ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS venta_codigo VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_estado
    ON cotizaciones(tenant_id, estado);
