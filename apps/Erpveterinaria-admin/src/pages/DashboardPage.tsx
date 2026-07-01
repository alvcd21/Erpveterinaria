import { useEffect, useState } from 'react';
import type { ApiClient } from '../api';
import type { Overview } from '../types';

export function DashboardPage({ api }: { api: ApiClient; notify: (message: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.request<Overview>('/api/saas/overview')
      .then((result) => setOverview(result.data))
      .catch((err) => setError(err.message));
  }, [api]);

  if (error) return <div className="notice">{error}</div>;
  if (!overview) return <div className="panel">Cargando dashboard...</div>;

  const activeTenants = overview.tenants.find((item) => item.estado === 'activo')?.total || 0;
  const suspendedTenants = overview.tenants.find((item) => item.estado === 'suspendido')?.total || 0;

  return (
    <div className="grid">
      <section className="grid cols-4">
        <div className="metric"><span className="muted">Tenants activos</span><strong>{activeTenants}</strong></div>
        <div className="metric"><span className="muted">Suspendidos</span><strong>{suspendedTenants}</strong></div>
        <div className="metric"><span className="muted">MRR estimado</span><strong>${overview.subscriptions.mrr_estimado || 0}</strong></div>
        <div className="metric"><span className="muted">Features</span><strong>{overview.catalogo.features || 0}</strong></div>
      </section>

      <section className="table-card">
        <h3>Proximos vencimientos</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Tenant</th><th>Plan</th><th>Estado</th><th>Vence</th></tr>
            </thead>
            <tbody>
              {overview.proximos_vencimientos.map((item) => (
                <tr key={item.id}>
                  <td>{item.nombre_empresa || item.tenant_slug}</td>
                  <td>{item.plan_slug}</td>
                  <td><span className="badge">{item.status}</span></td>
                  <td>{item.current_period_end ? new Date(item.current_period_end).toLocaleDateString() : 'Sin fecha'}</td>
                </tr>
              ))}
              {overview.proximos_vencimientos.length === 0 && (
                <tr><td colSpan={4}>No hay vencimientos cercanos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
