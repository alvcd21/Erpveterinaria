import { useEffect, useState } from 'react';
import { Save, Search } from 'lucide-react';
import type { ApiClient } from '../api';
import type { Feature } from '../types';

type Props = { api: ApiClient; notify: (message: string) => void };

const emptyFeature = {
  feature_key: '',
  nombre: '',
  modulo: 'clinica',
  tipo: 'modulo',
  descripcion: '',
  estado: 'activo',
  orden: 100
};

export function FeaturesPage({ api, notify }: Props) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Feature | null>(null);
  const [form, setForm] = useState<Record<string, string | number>>(emptyFeature);
  const [error, setError] = useState('');

  async function load() {
    const result = await api.request<Feature[]>('/api/saas/features');
    setFeatures(result.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = features.filter((feature) => {
    const text = `${feature.feature_key} ${feature.nombre} ${feature.modulo}`.toLowerCase();
    return text.includes(filter.toLowerCase());
  });

  function selectFeature(feature: Feature) {
    setSelected(feature);
    setForm({
      feature_key: feature.feature_key,
      nombre: feature.nombre,
      modulo: feature.modulo,
      tipo: feature.tipo,
      descripcion: feature.descripcion || '',
      estado: feature.estado,
      orden: feature.orden
    });
  }

  function newFeature() {
    setSelected(null);
    setForm(emptyFeature);
  }

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const path = selected ? `/api/saas/features/${selected.feature_key}` : '/api/saas/features';
    const method = selected ? 'PUT' : 'POST';
    try {
      await api.request(path, { method, body: JSON.stringify(form) });
      notify('Feature guardada');
      await load();
      if (!selected) newFeature();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la feature');
    }
  }

  return (
    <div className="split">
      <section className="table-card">
        <div className="toolbar">
          <div className="field" style={{ flex: 1 }}>
            <label>Buscar feature</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="modulo_consultorio, agenda, IA..." />
          </div>
          <Search size={18} />
          <button className="btn ghost" onClick={newFeature}>Nueva feature</button>
        </div>
        {error && <div className="notice">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Feature</th><th>Modulo</th><th>Tipo</th><th>Estado</th></tr></thead>
            <tbody>
              {visible.map((feature) => (
                <tr key={feature.feature_key} onClick={() => selectFeature(feature)} style={{ cursor: 'pointer' }}>
                  <td><strong>{feature.nombre}</strong><br /><span className="muted">{feature.feature_key}</span></td>
                  <td>{feature.modulo}</td>
                  <td>{feature.tipo}</td>
                  <td><span className="badge">{feature.estado}</span></td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={4}>No hay features con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <form className="form-card grid" onSubmit={save}>
        <h3>{selected ? 'Editar feature' : 'Nueva feature'}</h3>
        <div className="field">
          <label>Llave tecnica</label>
          <input value={String(form.feature_key)} disabled={Boolean(selected)} onChange={(e) => update('feature_key', e.target.value)} placeholder="modulo_pacientes" />
        </div>
        <div className="field">
          <label>Nombre comercial</label>
          <input value={String(form.nombre)} onChange={(e) => update('nombre', e.target.value)} />
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label>Modulo</label>
            <input value={String(form.modulo)} onChange={(e) => update('modulo', e.target.value)} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={String(form.tipo)} onChange={(e) => update('tipo', e.target.value)}>
              <option value="modulo">Modulo</option>
              <option value="funcion">Funcion</option>
              <option value="ia">IA</option>
              <option value="reporte">Reporte</option>
              <option value="integracion">Integracion</option>
            </select>
          </div>
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label>Estado</label>
            <select value={String(form.estado)} onChange={(e) => update('estado', e.target.value)}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
          <div className="field">
            <label>Orden</label>
            <input type="number" value={form.orden} onChange={(e) => update('orden', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Descripcion</label>
          <textarea value={String(form.descripcion || '')} onChange={(e) => update('descripcion', e.target.value)} />
        </div>
        <button className="btn primary" type="submit"><Save size={16} /> Guardar feature</button>
      </form>
    </div>
  );
}
