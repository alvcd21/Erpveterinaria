import { useEffect, useState } from 'react';
import { queryString, type ApiClient } from '../api';
import type { AuditLog, Pagination } from '../types';

export function AuditPage({ api }: { api: ApiClient; notify: (message: string) => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0 });
  const [filters, setFilters] = useState({ action: '', entity_type: '' });
  const [error, setError] = useState('');

  async function load(page = pagination.page) {
    const qs = queryString({ ...filters, page, limit: pagination.limit });
    const result = await api.request<AuditLog[]>(`/api/saas/audit-log${qs}`);
    setLogs(result.data);
    if (result.pagination) setPagination(result.pagination);
  }

  useEffect(() => {
    load(1).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="table-card">
      <div className="toolbar">
        <div className="field">
          <label>Accion</label>
          <input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="saas.plan.update" />
        </div>
        <div className="field">
          <label>Entidad</label>
          <input value={filters.entity_type} onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })} placeholder="plan, tenant, subscription" />
        </div>
        <button className="btn primary" onClick={() => load(1)}>Filtrar</button>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Actor</th><th>Accion</th><th>Entidad</th><th>Tenant</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString()}</td>
                <td>{log.actor_email || 'sistema'}</td>
                <td><span className="badge">{log.action}</span></td>
                <td>{log.entity_type}<br /><span className="muted">{log.entity_id || ''}</span></td>
                <td>{log.tenant_id || '-'}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5}>No hay eventos de auditoria.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button className="btn" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Anterior</button>
        <span className="muted">Pagina {pagination.page} de {Math.max(Math.ceil(pagination.total / pagination.limit), 1)}</span>
        <button className="btn" disabled={pagination.page * pagination.limit >= pagination.total} onClick={() => load(pagination.page + 1)}>Siguiente</button>
      </div>
    </section>
  );
}
