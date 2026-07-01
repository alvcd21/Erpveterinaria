import { useEffect, useState } from 'react';
import { CreditCard, RefreshCw, XCircle } from 'lucide-react';
import { queryString, type ApiClient } from '../api';
import type { Pagination, Plan, Subscription, Tenant } from '../types';

type Props = { api: ApiClient; notify: (message: string) => void };

const emptyForm = {
  tenant_id: '',
  plan_slug: 'basico',
  status: 'active',
  billing_cycle: 'monthly',
  current_period_start: new Date().toISOString().slice(0, 10),
  current_period_end: ''
};

export function SubscriptionsPage({ api, notify }: Props) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', tenant_id: '' });
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');

  async function load(page = pagination.page) {
    const qs = queryString({ ...filters, page, limit: pagination.limit });
    const result = await api.request<Subscription[]>(`/api/saas/subscriptions${qs}`);
    setSubscriptions(result.data);
    if (result.pagination) setPagination(result.pagination);
  }

  useEffect(() => {
    load(1).catch((err) => setError(err.message));
    api.request<Tenant[]>('/api/saas/tenants?limit=200').then((result) => setTenants(result.data)).catch(() => undefined);
    api.request<Plan[]>('/api/saas/plans').then((result) => setPlans(result.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(subscription: Subscription) {
    setSelectedId(subscription.id);
    setForm({
      tenant_id: subscription.tenant_id,
      plan_slug: subscription.plan_slug,
      status: subscription.status,
      billing_cycle: subscription.billing_cycle,
      current_period_start: subscription.current_period_start?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      current_period_end: subscription.current_period_end?.slice(0, 10) || ''
    });
  }

  function clear() {
    setSelectedId('');
    setForm(emptyForm);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const method = selectedId ? 'PUT' : 'POST';
    const path = selectedId ? `/api/saas/subscriptions/${selectedId}` : '/api/saas/subscriptions';
    try {
      await api.request(path, { method, body: JSON.stringify(form) });
      notify('Suscripcion guardada');
      clear();
      await load(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la suscripcion');
    }
  }

  async function renew(subscription: Subscription) {
    const end = window.prompt('Nueva fecha de vencimiento (YYYY-MM-DD)', subscription.current_period_end?.slice(0, 10) || '');
    if (!end) return;
    await api.request(`/api/saas/subscriptions/${subscription.id}/renew`, {
      method: 'POST',
      body: JSON.stringify({ current_period_end: end })
    });
    notify('Suscripcion renovada');
    load();
  }

  async function cancel(subscription: Subscription) {
    const reason = window.prompt('Motivo de cancelacion', 'Cancelacion manual');
    if (reason === null) return;
    await api.request(`/api/saas/subscriptions/${subscription.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    notify('Suscripcion cancelada');
    load();
  }

  return (
    <div className="split">
      <section className="table-card">
        <div className="toolbar">
          <div className="field">
            <label>Estado</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Todos</option>
              <option value="active">Activa</option>
              <option value="past_due">Vencida</option>
              <option value="suspended">Suspendida</option>
              <option value="canceled">Cancelada</option>
            </select>
          </div>
          <button className="btn primary" onClick={() => load(1)}>Filtrar</button>
        </div>
        {error && <div className="notice">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tenant</th><th>Plan</th><th>Ciclo</th><th>Periodo</th><th>Acciones</th></tr></thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr key={subscription.id}>
                  <td><strong>{subscription.nombre_empresa}</strong><br /><span className="muted">{subscription.tenant_slug}</span></td>
                  <td><span className="badge">{subscription.plan_slug}</span></td>
                  <td>{subscription.billing_cycle}</td>
                  <td>{subscription.current_period_start?.slice(0, 10)} - {subscription.current_period_end?.slice(0, 10) || 'sin fin'}</td>
                  <td>
                    <div className="toolbar">
                      <button className="btn ghost" onClick={() => edit(subscription)}><CreditCard size={16} /> Editar</button>
                      <button className="btn success" onClick={() => renew(subscription)}><RefreshCw size={16} /> Renovar</button>
                      <button className="btn danger" onClick={() => cancel(subscription)}><XCircle size={16} /> Cancelar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && <tr><td colSpan={5}>No hay suscripciones.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <button className="btn" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Anterior</button>
          <span className="muted">Pagina {pagination.page}</span>
          <button className="btn" disabled={pagination.page * pagination.limit >= pagination.total} onClick={() => load(pagination.page + 1)}>Siguiente</button>
        </div>
      </section>

      <form className="form-card grid" onSubmit={save}>
        <h3>{selectedId ? 'Editar suscripcion' : 'Nueva suscripcion'}</h3>
        <div className="field">
          <label>Tenant</label>
          <select value={form.tenant_id} onChange={(e) => update('tenant_id', e.target.value)} disabled={Boolean(selectedId)}>
            <option value="">Seleccione tenant</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.nombre_empresa} ({tenant.slug})</option>)}
          </select>
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label>Plan</label>
            <select value={form.plan_slug} onChange={(e) => update('plan_slug', e.target.value)}>
              {plans.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Estado</label>
            <select value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="active">Activa</option>
              <option value="trialing">Prueba</option>
              <option value="past_due">Vencida</option>
              <option value="suspended">Suspendida</option>
              <option value="canceled">Cancelada</option>
            </select>
          </div>
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label>Ciclo</label>
            <select value={form.billing_cycle} onChange={(e) => update('billing_cycle', e.target.value)}>
              <option value="monthly">Mensual</option>
              <option value="annual">Anual</option>
              <option value="trial">Prueba</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="field"><label>Inicio</label><input type="date" value={form.current_period_start} onChange={(e) => update('current_period_start', e.target.value)} /></div>
        </div>
        <div className="field"><label>Vencimiento</label><input type="date" value={form.current_period_end} onChange={(e) => update('current_period_end', e.target.value)} /></div>
        <div className="toolbar">
          <button className="btn primary" type="submit">Guardar suscripcion</button>
          {selectedId && <button className="btn ghost" type="button" onClick={clear}>Cancelar edicion</button>}
        </div>
      </form>
    </div>
  );
}
