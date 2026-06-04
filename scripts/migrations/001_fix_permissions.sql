-- Converts old-style perm_* permission IDs to the canonical VER_*/GESTIONAR_* IDs
-- required by endpointPermissionGuard. Runs once automatically at server startup.

-- 1. Ensure canonical permissions exist
INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_POS',               'Ver Punto de Venta',        'Ventas'),
    ('VER_CLIENTES',          'Ver Clientes',              'Ventas'),
    ('VER_INVENTARIO',        'Ver Inventario',            'Inventario'),
    ('VER_PROVEEDORES',       'Ver Proveedores',           'Inventario'),
    ('DISEÑAR_ETIQUETAS',     'Diseñar Etiquetas',         'Inventario'),
    ('VER_CAJA',              'Ver Caja y Movimientos',    'Finanzas'),
    ('VER_CONTABILIDAD',      'Ver Contabilidad',          'Finanzas'),
    ('VER_REPORTES',          'Ver Reportes',              'Administracion'),
    ('VER_ADMIN',             'Ver Administracion',        'Administracion'),
    ('GESTIONAR_PANEL_CAJAS', 'Gestionar Panel de Cajas',  'Administracion'),
    ('GESTIONAR_USUARIOS',    'Gestionar Usuarios',        'Administracion'),
    ('GESTIONAR_ROLES',       'Gestionar Roles',           'Administracion'),
    ('CONFIGURAR_EMPRESA',    'Configurar Empresa',        'Administracion')
ON CONFLICT (idPermiso) DO NOTHING;

-- 2. Add new rol_permisos entries derived from old-style entries (deduplicated)
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT DISTINCT rp.idrol, m.new_id
FROM rol_permisos rp
JOIN (VALUES
    ('perm_medicamentos_ver',       'VER_INVENTARIO'),
    ('perm_medicamentos_crear',     'VER_INVENTARIO'),
    ('perm_medicamentos_editar',    'VER_INVENTARIO'),
    ('perm_medicamentos_eliminar',  'VER_INVENTARIO'),
    ('perm_lotes_ver',              'VER_INVENTARIO'),
    ('perm_lotes_crear',            'VER_INVENTARIO'),
    ('perm_compras_ver',            'VER_INVENTARIO'),
    ('perm_compras_crear',          'VER_INVENTARIO'),
    ('perm_transferencias_crear',   'VER_INVENTARIO'),
    ('perm_transferencias_aprobar', 'VER_INVENTARIO'),
    ('perm_ventas_ver',             'VER_POS'),
    ('perm_ventas_crear',           'VER_POS'),
    ('perm_ventas_anular',          'VER_POS'),
    ('perm_recetas_ver',            'VER_CAJA'),
    ('perm_recetas_crear',          'VER_CAJA'),
    ('perm_recetas_dispensar',      'VER_CAJA'),
    ('perm_controlados_dispensar',  'VER_CAJA'),
    ('perm_controlados_ver_libro',  'VER_CAJA'),
    ('perm_caja_ver',               'VER_CAJA'),
    ('perm_caja_abrir',             'VER_CAJA'),
    ('perm_caja_cerrar',            'VER_CAJA'),
    ('perm_reportes_ver',           'VER_REPORTES'),
    ('perm_clientes_ver',           'VER_CLIENTES'),
    ('perm_clientes_crear',         'VER_CLIENTES'),
    ('perm_proveedores_ver',        'VER_PROVEEDORES'),
    ('perm_sucursales_ver',         'GESTIONAR_PANEL_CAJAS'),
    ('perm_sucursales_admin',       'GESTIONAR_PANEL_CAJAS'),
    ('perm_usuarios_admin',         'GESTIONAR_USUARIOS'),
    ('perm_config_admin',           'CONFIGURAR_EMPRESA')
) AS m(old_id, new_id) ON rp.idpermiso = m.old_id
ON CONFLICT (idRol, idPermiso) DO NOTHING;

-- 3. Remove old-style rol_permisos entries
DELETE FROM rol_permisos WHERE idpermiso LIKE 'perm_%';

-- 4. Remove old-style permissions catalog entries
DELETE FROM permisos WHERE idPermiso LIKE 'perm_%';

-- 5. Grant all permissions to admin roles
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('superadmin', 'admin', 'administrador')
ON CONFLICT (idRol, idPermiso) DO NOTHING;
