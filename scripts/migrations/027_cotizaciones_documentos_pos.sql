-- Cotizaciones y documentos de venta no fiscales.
-- La venta fiscal conserva numero_factura SAR; la no fiscal no consume correlativo.

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(30) NOT NULL DEFAULT 'factura_fiscal';

UPDATE ventas
SET tipo_documento = 'factura_fiscal'
WHERE tipo_documento IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_ventas_tipo_documento'
    ) THEN
        ALTER TABLE ventas
            ADD CONSTRAINT chk_ventas_tipo_documento
            CHECK (tipo_documento IN ('factura_fiscal', 'factura_no_fiscal'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS cotizaciones (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(100) NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT NOW(),
    cod_vendedor VARCHAR(100),
    identidad_cliente VARCHAR(100),
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado VARCHAR(30) NOT NULL DEFAULT 'Emitida',
    tipo_compra VARCHAR(20) NOT NULL DEFAULT 'Contado',
    isv NUMERIC(12,2) NOT NULL DEFAULT 0,
    descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
    valido_hasta DATE,
    observaciones TEXT,
    client_mutation_id VARCHAR(120),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detalle_cotizacion (
    id_detalle SERIAL PRIMARY KEY,
    codigo_cotizacion VARCHAR(100) NOT NULL,
    producto TEXT NOT NULL,
    cantidad NUMERIC(12,3) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
    tipo_producto VARCHAR(30) NOT NULL DEFAULT 'MEDICAMENTO',
    id_medicamento VARCHAR(100),
    id_presentacion INTEGER,
    id_servicio INTEGER,
    tipo_isv VARCHAR(20) DEFAULT 'exento',
    subtotal_exento NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal_gravado NUMERIC(12,2) NOT NULL DEFAULT 0,
    isv_linea NUMERIC(12,2) NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizaciones_tenant_codigo
    ON cotizaciones(tenant_id, codigo);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizaciones_tenant_client_mutation
    ON cotizaciones(tenant_id, client_mutation_id)
    WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_fecha
    ON cotizaciones(tenant_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_cotizacion_tenant_codigo
    ON detalle_cotizacion(tenant_id, codigo_cotizacion);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_detalle_cotizacion_cotizacion'
    ) THEN
        ALTER TABLE detalle_cotizacion
            ADD CONSTRAINT fk_detalle_cotizacion_cotizacion
            FOREIGN KEY (tenant_id, codigo_cotizacion)
            REFERENCES cotizaciones(tenant_id, codigo)
            ON DELETE CASCADE;
    END IF;
END $$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['cotizaciones', 'detalle_cotizacion']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = t
              AND policyname = 'tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY tenant_isolation ON public.%I FOR ALL ' ||
                'USING (rls_bypass_active() OR tenant_id = current_tenant_id()) ' ||
                'WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id())',
                t
            );
        END IF;
    END LOOP;
END $$;
