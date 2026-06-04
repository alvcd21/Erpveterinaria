-- =====================================================
-- STORED PROCEDURES — FARMACIA ERP
-- =====================================================
-- INSTRUCCIONES PARA RENDER:
-- El editor web de Render divide el script en cada ";" y rompe
-- las funciones PL/pgSQL. Usa UNA de estas opciones:
--
-- OPCIÓN A (recomendada): Conectarte por psql desde tu terminal:
--   psql "tu_connection_string_de_render" -f scripts/farmacia_funciones.sql
--
-- OPCIÓN B: En el editor web de Render, copia y pega CADA función
--   por separado (una a la vez), selecciona todo el bloque
--   desde CREATE OR REPLACE hasta el último punto y coma.
--
-- NOTA: El servidor funciona SIN estas funciones (tiene fallback).
--   Son opcionales pero mejoran el rendimiento y la seguridad.
-- =====================================================


-- =====================================================
-- FUNCIÓN 1: sp_registrar_intento_login
-- Pegar en Render como una sola consulta completa
-- =====================================================
CREATE OR REPLACE FUNCTION sp_registrar_intento_login(
    p_usuario    TEXT,
    p_exitoso    BOOLEAN,
    p_ip         INET,
    p_user_agent TEXT,
    p_tenant_id  UUID DEFAULT NULL
) RETURNS JSONB AS $func$
DECLARE
    v_intentos INT := 0;
BEGIN
    INSERT INTO login_intentos(usuario, ip_address, exitoso, user_agent, tenant_id)
    VALUES (p_usuario, p_ip, p_exitoso, p_user_agent, p_tenant_id);

    IF NOT p_exitoso THEN
        UPDATE usuarios
        SET intentos_fallidos = COALESCE(intentos_fallidos, 0) + 1
        WHERE usuario = p_usuario
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        RETURNING intentos_fallidos INTO v_intentos;

        IF v_intentos >= 5 THEN
            UPDATE usuarios SET bloqueado_hasta = NOW() + INTERVAL '15 minutes'
            WHERE usuario = p_usuario
              AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
            RETURN jsonb_build_object('bloqueado', true, 'intentos', v_intentos);
        END IF;
        RETURN jsonb_build_object('bloqueado', false, 'intentos', v_intentos);
    ELSE
        UPDATE usuarios
        SET intentos_fallidos = 0, ultimo_login = NOW(), bloqueado_hasta = NULL
        WHERE usuario = p_usuario
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
        RETURN jsonb_build_object('bloqueado', false, 'exitoso', true);
    END IF;
END;
$func$ LANGUAGE plpgsql;


-- =====================================================
-- FUNCIÓN 2: sp_anular_venta
-- Pegar en Render como una sola consulta completa
-- (DESPUÉS de haber pegado la función 1)
-- =====================================================
CREATE OR REPLACE FUNCTION sp_anular_venta(
    p_cod_venta   TEXT,
    p_cod_usuario TEXT,
    p_motivo      TEXT DEFAULT 'Sin motivo',
    p_tenant_id   UUID DEFAULT NULL
) RETURNS JSONB AS $func$
DECLARE
    v_detalle RECORD;
    v_lineas  INT := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ventas
        WHERE codVenta = p_cod_venta
          AND estado = 'Activa'
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Venta no encontrada o ya anulada');
    END IF;

    FOR v_detalle IN
        SELECT id_lote, COALESCE(cantidad_base_descontada, cantidad) AS cant
        FROM detalleventa
        WHERE idVenta = p_cod_venta
          AND id_lote IS NOT NULL
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    LOOP
        UPDATE lotes_medicamento
        SET cantidad_actual = cantidad_actual + v_detalle.cant
        WHERE id_lote = v_detalle.id_lote
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
        v_lineas := v_lineas + 1;
    END LOOP;

    UPDATE ventas
    SET estado                   = 'Anulada',
        descuento_motivo         = p_motivo,
        descuento_autorizado_por = p_cod_usuario,
        updated_at               = NOW(),
        updated_by               = p_cod_usuario
    WHERE codVenta = p_cod_venta
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    RETURN jsonb_build_object('ok', true, 'codVenta', p_cod_venta, 'lineas_revertidas', v_lineas);
END;
$func$ LANGUAGE plpgsql;
