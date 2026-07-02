import React, { useEffect, useState } from 'react';
import { Pill, Plus, Trash2 } from 'lucide-react';
import { MedicamentosService } from '../../services/api';
import { Medicamento, PresentacionVenta } from '../../types';

export type MedicationItem = {
  id: string;
  medicamento?: string;
  id_medicamento?: string;
  presentacion?: string;
  cantidad?: number;
  frecuencia?: string;
};

type MedicationItemsEditorProps = {
  value?: MedicationItem[];
  onChange: (value: MedicationItem[]) => void;
};

const nombreProducto = (p: Medicamento) => p.nombre_comercial || p.nombre_generico || p.codigo;

export function MedicationItemsEditor({ value = [], onChange }: MedicationItemsEditorProps) {
  const rows = value.length ? value : [newMedicationRow()];

  // Inventario para el buscador (se carga una vez; si el rol no tiene acceso,
  // la lista queda vacía y el campo sigue funcionando como texto libre).
  const [productos, setProductos] = useState<Medicamento[]>([]);
  const [presCache, setPresCache] = useState<Record<string, PresentacionVenta[]>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    MedicamentosService.getAll({}).then(list => { if (alive) setProductos(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const loadPres = (codigo?: string) => {
    if (!codigo || presCache[codigo]) return;
    MedicamentosService.getPresentaciones(codigo)
      .then(list => setPresCache(prev => ({ ...prev, [codigo]: list || [] })))
      .catch(() => {});
  };

  // Precarga las presentaciones de las filas que ya tienen un producto asociado
  // (p.ej. al editar una receta guardada).
  useEffect(() => {
    rows.forEach(r => { if (r.id_medicamento) loadPres(r.id_medicamento); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateRow = (id: string, patch: Partial<MedicationItem>) => {
    onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const addRow = () => onChange([...rows, newMedicationRow()]);

  const removeRow = (id: string) => {
    onChange(rows.length === 1 ? [newMedicationRow()] : rows.filter(row => row.id !== id));
  };

  const selectProducto = (rowId: string, p: Medicamento) => {
    updateRow(rowId, { medicamento: nombreProducto(p), id_medicamento: p.codigo, presentacion: '' });
    loadPres(p.codigo);
    setOpenRow(null);
  };

  const sugerencias = (query = '') => {
    const q = query.trim().toLowerCase();
    const base = q
      ? productos.filter(p =>
          (p.nombre_comercial || '').toLowerCase().includes(q) ||
          (p.nombre_generico || '').toLowerCase().includes(q) ||
          (p.codigo || '').toLowerCase().includes(q))
      : productos;
    return base.slice(0, 8);
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200';

  return (
    <div className="md:col-span-2 rounded-2xl border border-violet-200 bg-violet-50/20 p-3">
      <div className="mb-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
          <Pill size={17} />
          <span>Medicamentos recetados</span>
        </div>
      </div>
      <div className="space-y-4">
        {rows.map(row => {
          const opciones = sugerencias(row.medicamento);
          const presentaciones = row.id_medicamento ? (presCache[row.id_medicamento] || []) : [];
          return (
            <article key={row.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                  <Pill size={17} />
                  <span>Medicamento</span>
                </div>
                <button type="button" onClick={() => removeRow(row.id)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600">
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr_90px]">
                <FieldShell label="Medicamento">
                  <div className="relative">
                    <input
                      value={row.medicamento || ''}
                      onChange={event => { updateRow(row.id, { medicamento: event.target.value, id_medicamento: undefined }); setOpenRow(row.id); }}
                      onFocus={() => setOpenRow(row.id)}
                      onBlur={() => setTimeout(() => setOpenRow(prev => (prev === row.id ? null : prev)), 150)}
                      placeholder="Buscar por nombre o código, o escribir…"
                      className={inputCls}
                      autoComplete="off"
                    />
                    {openRow === row.id && opciones.length > 0 && (
                      <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        {opciones.map(p => (
                          <li key={p.codigo}>
                            <button
                              type="button"
                              onMouseDown={event => { event.preventDefault(); selectProducto(row.id, p); }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                            >
                              <span className="truncate text-slate-700">{nombreProducto(p)}</span>
                              <span className="shrink-0 text-xs font-medium text-slate-400">{p.codigo}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </FieldShell>
                <FieldShell label="Presentación">
                  <input
                    value={row.presentacion || ''}
                    onChange={event => updateRow(row.id, { presentacion: event.target.value })}
                    list={`pres-${row.id}`}
                    placeholder={presentaciones.length ? 'Elige o escribe…' : 'Tableta, jarabe, ampolla...'}
                    className={inputCls}
                    autoComplete="off"
                  />
                  <datalist id={`pres-${row.id}`}>
                    {presentaciones.map(p => <option key={p.id_presentacion} value={p.nombre} />)}
                  </datalist>
                </FieldShell>
                <FieldShell label="Cantidad">
                  <input
                    type="number"
                    min="1"
                    value={row.cantidad || ''}
                    onChange={event => updateRow(row.id, { cantidad: event.target.value ? Number(event.target.value) : undefined })}
                    className={inputCls}
                  />
                </FieldShell>
              </div>
              <div className="mt-4">
                <FieldShell label="Frecuencia (cada cuánto se debe tomar)">
                  <textarea
                    value={row.frecuencia || ''}
                    onChange={event => updateRow(row.id, { frecuencia: event.target.value })}
                    placeholder="Ej. 1 tableta cada 12 horas por 7 días, vía oral"
                    className="w-full min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                  />
                </FieldShell>
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" onClick={addRow} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
        <Plus size={17} /> Agregar medicamento
      </button>
    </div>
  );
}

function newMedicationRow(): MedicationItem {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, cantidad: 1 };
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-normal text-indigo-900/70">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span>{label}</span>
      </span>
      {children}
    </label>
  );
}
