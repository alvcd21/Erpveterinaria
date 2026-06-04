-- Versioned migration: SaaS tenant hardening before enabling RLS.
-- Run manually against a reviewed backup/snapshot before production rollout.

BEGIN;

ALTER TABLE IF EXISTS login_intentos ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE IF EXISTS notificaciones ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS kardex_inventario ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS pagos_venta ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS configuracion_cai_historial ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS recetas_retenidas ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS libro_psicofarmacos ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS recepciones_compra ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS detalle_recepcion ADD COLUMN IF NOT EXISTS tenant_id UUID;

DO $$
DECLARE
    only_tenant UUID;
BEGIN
    IF (SELECT COUNT(*) FROM tenants) = 1 THEN
        SELECT id INTO only_tenant FROM tenants LIMIT 1;
        UPDATE login_intentos SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE notificaciones SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE kardex_inventario SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE pagos_venta SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE configuracion_cai_historial SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE recetas_retenidas SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE libro_psicofarmacos SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE recepciones_compra SET tenant_id = only_tenant WHERE tenant_id IS NULL;
        UPDATE detalle_recepcion SET tenant_id = only_tenant WHERE tenant_id IS NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_login_tenant_usuario_fecha ON login_intentos(tenant_id, usuario, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_usuario ON notificaciones(tenant_id, para_usuario, leida, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_tenant_fecha ON kardex_inventario(tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_venta_tenant ON pagos_venta(tenant_id, cod_venta, fecha_pago);
CREATE INDEX IF NOT EXISTS idx_cai_historial_tenant ON configuracion_cai_historial(tenant_id, fecha_registro DESC);
CREATE INDEX IF NOT EXISTS idx_recetas_retenidas_tenant ON recetas_retenidas(tenant_id, fecha_retencion DESC);
CREATE INDEX IF NOT EXISTS idx_libro_psico_tenant_fecha ON libro_psicofarmacos(tenant_id, fecha_movimiento DESC);
CREATE INDEX IF NOT EXISTS idx_recepciones_tenant ON recepciones_compra(tenant_id, fecha_recepcion DESC);
CREATE INDEX IF NOT EXISTS idx_detalle_recepcion_tenant ON detalle_recepcion(tenant_id, id_recepcion);

CREATE OR REPLACE FUNCTION sp_registrar_intento_login(
    p_usuario VARCHAR,
    p_exitoso BOOLEAN,
    p_ip INET,
    p_user_agent TEXT,
    p_tenant_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_intentos INTEGER := 0;
    v_bloqueado BOOLEAN := FALSE;
BEGIN
    INSERT INTO login_intentos(usuario, ip_address, exitoso, user_agent, tenant_id)
    VALUES (p_usuario, p_ip::TEXT, p_exitoso, p_user_agent, p_tenant_id);

    IF NOT p_exitoso THEN
        UPDATE usuarios
        SET intentos_fallidos = COALESCE(intentos_fallidos, 0) + 1,
            bloqueado_hasta = CASE
                WHEN COALESCE(intentos_fallidos, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
                ELSE bloqueado_hasta
            END
        WHERE usuario = p_usuario
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        RETURNING intentos_fallidos, bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()
        INTO v_intentos, v_bloqueado;
    ELSE
        UPDATE usuarios
        SET intentos_fallidos = 0,
            bloqueado_hasta = NULL,
            ultimo_login = NOW()
        WHERE usuario = p_usuario
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    END IF;

    RETURN jsonb_build_object('ok', TRUE, 'intentos', COALESCE(v_intentos, 0), 'bloqueado', COALESCE(v_bloqueado, FALSE));
END;
$$ LANGUAGE plpgsql;

COMMIT;
