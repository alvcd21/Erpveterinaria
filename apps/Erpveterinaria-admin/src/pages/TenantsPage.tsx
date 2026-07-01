import { useEffect, useState } from 'react';
import { CheckCircle2, PauseCircle, Search } from 'lucide-react';
import { ApiClient, queryString } from '../api';
import type { Entitlement, Pagination, Plan, Tenant } from '../types';

type Props = { api: ApiClient; notify: (message: string) => void };

const emptyTenant = {
  slug: '',
  nombre_empresa: '',
  plan: 'basico',
  admin_email: '',
  admin_password: ''
};

export function TenantsPage({ api, notify }: Props) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ search: '', estado: '', plan: '' });
  const [form, setForm] = useState(emptyTenant);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  function load(page = pagination.page) {
    const qs = queryString({ ...filters, page, limit: pagination.limit });
    api.request<Tenant[]>(`/api/saas/tenants${qs}`)
      .then((result) => {
        setTenants(result.data);
        if (result.pagination) setPagination(result.pagination);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load(1);
    api.request<Plan[]>('/api/saas/plans').then((result) => setPlans(result.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.request('/api/saas/tenants', { method: 'POST', body: JSON.stringify(form) });
      setForm(emptyTenant);
      notify('Tenant creado');
      load(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el tenant');
    }
  }

  async function openEntitlements(tenant: Tenant) {
    setSelected(tenant);
    const result = await api.request<Entitlement>(`/api/saas/tenants/${tenant.id}/entitlements`);
    setEntitlement(result.data);
    const next: Record<string, string> = {};
    result.data.overrides.forEach((item) => {
      next[item.feature_key] = item.enabled ? 'true' : 'false';
    });
    setOverrides(next);
  }

  async function saveEntitlements() {
    if (!selected || !entitlement) return;
    const payload = entitlement.planFeatures.map((item) => ({
      feature_key: item.feature_key,
      enabled: overrides[item.feature_key] === undefined || overrides[item.feature_key] === ''
        ? null
        : overrides[item.feature_key] === 'true',
      reason: 'Override definido desde panel SaaS'
    }));
    const result = await api.request<Pick<Entitlement, 'effectiveFeatures' | 'overrides'>>(
      `/api/saas/tenants/${selected.id}/entitlements`,
      { method: 'PUT', body: JSON.stringify({ overrides: payload }) }
    );
    setEntitlement((current) => current ? { ...current, ...result.data } : current);
    notify('Overrides actualizados');
  }

  async function changeTenantState(tenant: Tenant, action: 'suspend' | 'activate') {
    await api.request(`/api/saas/tenants/${tenant.id}/${action}`, { method: 'POST' });
    notify(action === 'suspend' ? 'Tenant suspendido' : 'Tenant activado');
    load();
  }

  return (
    <div className="split">
      <section className="grid">
        <div className="table-card">
          <div className="toolbar">
            <div className="field" style={{ flex: 1, minWidth: 240 }}>
              <label>Buscar</label>
              <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Empresa o slug" />
            </div>
            <div className="field">
              <label>Estado</label>
              <select value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}>
                <option value="">Todos</option>
                <option value="activo">Activo</option>
                <option value="prueba">Prueba</option>
                <option value="suspendido">Suspendido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <button className="btn primary" onClick={() => load(1)}><Search size={16} /> Buscar</button>
          </div>
          {error && <div className="notice">{error}</div>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Uso</th><th>Acciones</th></tr></thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td><strong>{tenant.nombre_empresa}</strong><br /><span className="muted">{tenant.slug}</span></td>
                    <td>{tenant.plan}</td>
                    <td><span className="badge">{tenant.estado}</span></td>
                    <td>{tenant.usuarios_count || 0} usuarios / {tenant.medicamentos_count || 0} items</td>
                    <td>
                      <div className="toolbar">
                        <button className="btn ghost" onClick={() => openEntitlements(tenant)}>Features</button>
                        {tenant.estado === 'suspendido' ? (
                          <button className="btn success" onClick={() => changeTenantState(tenant, 'activate')}><CheckCircle2 size={16} /> Activar</button>
                        ) : (
                          <button className="btn danger" onClick={() => changeTenantState(tenant, 'suspend')}><PauseCircle size={16} /> Suspender</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <button className="btn" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Anterior</button>
            <span className="muted">Pagina {pagination.page} de {Math.max(Math.ceil(pagination.total / pagination.limit), 1)}</span>
            <button className="btn" disabled={pagination.page * pagination.limit >= pagination.total} onClick={() => load(pagination.page + 1)}>Siguiente</button>
          </div>
        </div>

        {entitlement && selected && (
          <div className="table-card">
            <h3>Overrides de {selected.nombre_empresa}</h3>
            <p className="muted">Heredar usa el plan base. Activar o desactivar fuerza la funcion solo para este tenant.</p>
            <div className="feature-matrix">
              {entitlement.planFeatures.map((feature) => (
                <label className="field" key={feature.feature_key}>
                  <span>{feature.nombre}</span>
                  <select value={overrides[feature.feature_key] || ''} onChange={(e) => setOverrides({ ...overrides, [feature.feature_key]: e.target.value })}>
                    <option value="">Heredar del plan</option>
                    <option value="true">Forzar activar</option>
                    <option value="false">Forzar desactivar</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="toolbar" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={saveEntitlements}>Guardar overrides</button>
            </div>
          </div>
        )}
      </section>

      <aside className="form-card">
        <h3>Crear tenant</h3>
        <form className="grid" onSubmit={createTenant}>
          <div className="field"><label>Slug</label><input value={form.slug} onChange={(e) => updateForm('slug', e.target.value)} placeholder="clinica-agalta" /></div>
          <div className="field"><label>Nombre empresa</label><input value={form.nombre_empresa} onChange={(e) => updateForm('nombre_empresa', e.target.value)} /></div>
          <div className="field"><label>Plan</label><select value={form.plan} onChange={(e) => updateForm('plan', e.target.value)}>{plans.map((plan) => <option key={plan.slug}>{plan.slug}</option>)}</select></div>
          <div className="field"><label>Admin inicial</label><input value={form.admin_email} onChange={(e) => updateForm('admin_email', e.target.value)} placeholder="admin@clinica.com" /></div>
          <div className="field"><label>Password admin</label><input type="password" value={form.admin_password} onChange={(e) => updateForm('admin_password', e.target.value)} /></div>
          <button className="btn primary" type="submit">Crear tenant</button>
        </form>
      </aside>
    </div>
  );
}
