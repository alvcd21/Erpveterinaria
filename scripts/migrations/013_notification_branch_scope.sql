ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS id_sucursal INT;

CREATE INDEX IF NOT EXISTS idx_notif_tenant_sucursal
    ON notificaciones(tenant_id, id_sucursal, leida, fecha_creacion DESC);
