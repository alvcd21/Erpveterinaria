ALTER TABLE IF EXISTS empleado
    ADD COLUMN IF NOT EXISTS id_sucursal INT;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'empleado')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sucursales') THEN
        BEGIN
            ALTER TABLE empleado
                ADD CONSTRAINT empleado_id_sucursal_fkey
                FOREIGN KEY (id_sucursal) REFERENCES sucursales(id_sucursal);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_empleado_tenant_sucursal
    ON empleado(tenant_id, id_sucursal);

ALTER TABLE IF EXISTS ventas
    ADD COLUMN IF NOT EXISTS client_mutation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_tenant_client_mutation
    ON ventas(tenant_id, client_mutation_id)
    WHERE client_mutation_id IS NOT NULL;
