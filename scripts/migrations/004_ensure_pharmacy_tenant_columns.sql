-- Ensures tenant_id exists on all pharmacy tables that the API queries reference.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS). Backfills from parent table.

ALTER TABLE IF EXISTS lotes_medicamento       ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS presentaciones_venta    ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS medicamento_imagenes    ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS categorias_terapeuticas ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS formas_farmaceuticas    ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS detalle_receta          ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS ordenes_compra          ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS detalle_orden_compra    ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS transferencias_sucursal ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Backfill tenant_id on lotes from the parent medicamentos row
UPDATE lotes_medicamento l
SET tenant_id = m.tenant_id
FROM medicamentos m
WHERE l.id_medicamento = m.codigo
  AND l.tenant_id IS NULL
  AND m.tenant_id IS NOT NULL;

-- Backfill tenant_id on presentaciones from the parent medicamentos row
UPDATE presentaciones_venta pv
SET tenant_id = m.tenant_id
FROM medicamentos m
WHERE pv.id_medicamento = m.codigo
  AND pv.tenant_id IS NULL
  AND m.tenant_id IS NOT NULL;

-- Backfill tenant_id on imagenes from the parent medicamentos row
UPDATE medicamento_imagenes mi
SET tenant_id = m.tenant_id
FROM medicamentos m
WHERE mi.id_medicamento = m.codigo
  AND mi.tenant_id IS NULL
  AND m.tenant_id IS NOT NULL;

-- Backfill categorias_terapeuticas and formas_farmaceuticas from medicamentos (single-tenant scenario)
UPDATE categorias_terapeuticas ct
SET tenant_id = (
    SELECT m.tenant_id FROM medicamentos m
    WHERE m.id_categoria = ct.id_categoria AND m.tenant_id IS NOT NULL
    LIMIT 1
)
WHERE ct.tenant_id IS NULL;

UPDATE formas_farmaceuticas ff
SET tenant_id = (
    SELECT m.tenant_id FROM medicamentos m
    WHERE m.id_forma = ff.id_forma AND m.tenant_id IS NOT NULL
    LIMIT 1
)
WHERE ff.tenant_id IS NULL;

-- If there is exactly one tenant, fill remaining NULLs
DO $$
DECLARE only_tenant UUID;
BEGIN
    IF (SELECT COUNT(*) FROM tenants) = 1 THEN
        SELECT id INTO only_tenant FROM tenants LIMIT 1;
        UPDATE lotes_medicamento       SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE presentaciones_venta    SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE medicamento_imagenes    SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE categorias_terapeuticas SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE formas_farmaceuticas    SET tenant_id = only_tenant WHERE tenant_id IS NULL;
    END IF;
END $$;
