import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPermissionGuardStatsForTests,
  endpointPermissionGuard,
  getPermissionGuardStats,
} from '../../middleware/permissions.js';

function runGuard({
  method = 'GET',
  path = '/api/no-rule/123',
  user = { rol: 'Recepcionista', permisos: [] },
} = {}) {
  let nextCalled = false;
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  endpointPermissionGuard(
    { method, originalUrl: path, user },
    res,
    () => {
      nextCalled = true;
    }
  );

  return { nextCalled, res };
}

afterEach(() => {
  delete process.env.PERMISSIONS_STRICT_MODE;
  __resetPermissionGuardStatsForTests();
  vi.restoreAllMocks();
});

describe('endpointPermissionGuard', () => {
  it('permite una ruta con permiso aceptado', () => {
    const result = runGuard({
      path: '/api/pacientes',
      user: { rol: 'Recepcionista', permisos: ['VER_PACIENTES'] },
    });

    expect(result.nextCalled).toBe(true);
    expect(result.res.statusCode).toBe(null);
  });

  it('registra pero permite endpoints sin regla en modo auditoria', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = runGuard({ path: '/api/sin-regla/ABC-123?x=1' });
    const stats = getPermissionGuardStats();

    expect(result.nextCalled).toBe(true);
    expect(stats.unmatchedRequests).toBe(1);
    expect(stats.unmatchedRouteCount).toBe(1);
    expect(stats.routes[0].path).toBe('/api/sin-regla/:id');
  });

  it('bloquea endpoints sin regla en modo estricto para no administradores', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.PERMISSIONS_STRICT_MODE = 'true';

    const result = runGuard({ path: '/api/sin-regla/99' });

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(403);
    expect(result.res.body.code).toBe('PERMISSION_RULE_MISSING');
  });

  it('permite endpoints sin regla en modo estricto para administradores', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.PERMISSIONS_STRICT_MODE = 'true';

    const result = runGuard({
      path: '/api/sin-regla/99',
      user: { rol: 'Administrador', permisos: [] },
    });

    expect(result.nextCalled).toBe(true);
  });
});
