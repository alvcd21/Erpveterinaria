import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { ApiClient } from '../api';
import type { Feature, Plan } from '../types';

type Props = { api: ApiClient; notify: (message: string) => void };

const planDefaults = {
  slug: '',
  nombre: '',
  descripcion: '',
  estado: 'borrador',
  moneda: 'USD',
  precio_mensual: 0,
  precio_anual: 0,
  max_sucursales: 1,
  max_usuarios: 5,
  max_medicamentos: 500,
  ai_tokens_mensual: 100000,
  ai_requests_mensual: 200,
  ai_requests_diario: 30,
  trial_dias: 14,
  orden: 100
};

function planToDraft(plan: Plan): Record<string, string | number> {
  return {
    slug: plan.slug,
    nombre: plan.nombre,
    descripcion: plan.descripcion || '',
    estado: plan.estado,
    moneda: plan.moneda,
    precio_mensual: plan.precio_mensual,
    precio_anual: plan.precio_anual,
    max_sucursales: plan.max_sucursales,
    max_usuarios: plan.max_usuarios,
    max_medicamentos: plan.max_medicamentos,
    ai_tokens_mensual: plan.ai_tokens_mensual,
    ai_requests_mensual: plan.ai_requests_mensual,
    ai_requests_diario: plan.ai_requests_diario,
    trial_dias: plan.trial_dias,
    orden: plan.orden
  };
}

export function PlansPage({ api, notify }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [draft, setDraft] = useState<Record<string, string | number>>(planDefaults);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const selectedPlan = useMemo(() => plans.find((plan) => plan.slug === selectedSlug), [plans, selectedSlug]);

  async function load() {
    const [plansResult, featuresResult] = await Promise.all([
      api.request<Plan[]>('/api/saas/plans'),
      api.request<Feature[]>('/api/saas/features')
    ]);
    setPlans(plansResult.data);
    setFeatures(featuresResult.data);
    const first = plansResult.data[0];
    if (first) selectPlan(first);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPlan(plan: Plan) {
    setSelectedSlug(plan.slug);
    setDraft(planToDraft(plan));
    setSelectedFeatures(new Set((plan.features || []).filter((item) => item.enabled).map((item) => item.feature_key)));
  }

  function updateDraft(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleFeature(key: string) {
    setSelectedFeatures((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function savePlan(event: React.FormEvent) {
    event.preventDefault();
    const body = { ...draft, features: Array.from(selectedFeatures) };
    const path = selectedPlan ? `/api/saas/plans/${selectedPlan.slug}` : '/api/saas/plans';
    const method = selectedPlan ? 'PUT' : 'POST';
    try {
      await api.request(path, { method, body: JSON.stringify(body) });
      notify('Plan guardado');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el plan');
    }
  }

  function newPlan() {
    setSelectedSlug('');
    setDraft(planDefaults);
    setSelectedFeatures(new Set());
  }

  return (
    <div className="split">
      <section className="table-card">
        <div className="toolbar">
          <h3 style={{ flex: 1 }}>Planes</h3>
          <button className="btn ghost" onClick={newPlan}>Nuevo plan</button>
        </div>
        {error && <div className="notice">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Plan</th><th>Estado</th><th>Precio</th><th>Limites</th></tr></thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.slug} onClick={() => selectPlan(plan)} style={{ cursor: 'pointer' }}>
                  <td><strong>{plan.nombre}</strong><br /><span className="muted">{plan.slug}</span></td>
                  <td><span className="badge">{plan.estado}</span></td>
                  <td>{plan.moneda} {plan.precio_mensual}/mes</td>
                  <td>{plan.max_usuarios} usuarios, {plan.max_sucursales} sucursales</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form className="form-card grid" onSubmit={savePlan}>
        <h3>{selectedPlan ? `Editar ${selectedPlan.nombre}` : 'Nuevo plan'}</h3>
        <div className="grid cols-2">
          <div className="field"><label>Slug</label><input value={String(draft.slug)} disabled={Boolean(selectedPlan)} onChange={(e) => updateDraft('slug', e.target.value)} /></div>
          <div className="field"><label>Nombre</label><input value={String(draft.nombre)} onChange={(e) => updateDraft('nombre', e.target.value)} /></div>
          <div className="field"><label>Estado</label><select value={String(draft.estado)} onChange={(e) => updateDraft('estado', e.target.value)}><option>borrador</option><option>activo</option><option>archivado</option></select></div>
          <div className="field"><label>Moneda</label><input value={String(draft.moneda)} onChange={(e) => updateDraft('moneda', e.target.value)} /></div>
          <div className="field"><label>Precio mensual</label><input type="number" value={draft.precio_mensual} onChange={(e) => updateDraft('precio_mensual', e.target.value)} /></div>
          <div className="field"><label>Precio anual</label><input type="number" value={draft.precio_anual} onChange={(e) => updateDraft('precio_anual', e.target.value)} /></div>
          <div className="field"><label>Max usuarios</label><input type="number" value={draft.max_usuarios} onChange={(e) => updateDraft('max_usuarios', e.target.value)} /></div>
          <div className="field"><label>Max sucursales</label><input type="number" value={draft.max_sucursales} onChange={(e) => updateDraft('max_sucursales', e.target.value)} /></div>
          <div className="field"><label>Max inventario</label><input type="number" value={draft.max_medicamentos} onChange={(e) => updateDraft('max_medicamentos', e.target.value)} /></div>
          <div className="field"><label>Trial dias</label><input type="number" value={draft.trial_dias} onChange={(e) => updateDraft('trial_dias', e.target.value)} /></div>
        </div>
        <div className="field"><label>Descripcion</label><textarea value={String(draft.descripcion || '')} onChange={(e) => updateDraft('descripcion', e.target.value)} /></div>
        <h3>Features incluidas</h3>
        <div className="feature-matrix">
          {features.map((feature) => (
            <label className="check-row" key={feature.feature_key}>
              <input type="checkbox" checked={selectedFeatures.has(feature.feature_key)} onChange={() => toggleFeature(feature.feature_key)} />
              <span><strong>{feature.nombre}</strong><br /><small className="muted">{feature.modulo} - {feature.feature_key}</small></span>
            </label>
          ))}
        </div>
        <button className="btn primary" type="submit"><Save size={16} /> Guardar plan</button>
      </form>
    </div>
  );
}
