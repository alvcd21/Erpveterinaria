DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM (
            SELECT tenant_id, idCaja
            FROM usuarios
            WHERE idCaja IS NOT NULL AND estado = 'Activo'
            GROUP BY tenant_id, idCaja
            HAVING COUNT(*) > 1
        ) duplicates
    ) THEN
        EXECUTE '
            CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_tenant_active_caja
            ON usuarios(tenant_id, idCaja)
            WHERE idCaja IS NOT NULL AND estado = ''Activo''
        ';
    END IF;
END $$;
