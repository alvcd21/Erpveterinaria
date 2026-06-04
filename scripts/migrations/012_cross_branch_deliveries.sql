CREATE TABLE IF NOT EXISTS entregas_sucursal (
    id                      BIGSERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cod_venta               VARCHAR(100) NOT NULL,
    id_sucursal_facturacion INT  NOT NULL REFERENCES sucursales(id_sucursal),
    id_sucursal_origen      INT  NOT NULL REFERENCES sucursales(id_sucursal),
    id_medicamento          VARCHAR(100) NOT NULL,
    nombre_medicamento      VARCHAR(255) NOT NULL,
    cantidad                NUMERIC(10,3) NOT NULL,
    nombre_presentacion     VARCHAR(100),
    identidad_cliente       VARCHAR(50),
    nombre_cliente          VARCHAR(255),
    estado                  VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
                              CHECK (estado IN ('Pendiente','Entregado','Cancelado')),
    fecha_creacion          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_entrega           TIMESTAMPTZ,
    entregado_por           VARCHAR(100),
    notas_entrega           TEXT
);

CREATE INDEX IF NOT EXISTS idx_entregas_tenant_origen ON entregas_sucursal(tenant_id, id_sucursal_origen, estado);
CREATE INDEX IF NOT EXISTS idx_entregas_tenant_venta  ON entregas_sucursal(tenant_id, cod_venta);
