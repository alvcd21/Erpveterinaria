import React from 'react';
import { Edit2, Pill } from 'lucide-react';
import { Medicamento } from '../../types';
import { Badge, Spinner, btnIcon, catalogStatusBadge } from './shared';

interface Props {
  loading: boolean;
  medicamentos: Medicamento[];
  selectedMed: Medicamento | null;
  onSelect: (m: Medicamento) => void;
  onEdit: (m: Medicamento) => void;
  onToggleActivo: (m: Medicamento) => void;
}

function stockBadge(m: Medicamento) {
  const s = Number(m.stockTotal ?? 0);
  if (s === 0) return <Badge cls="bg-red-100 text-red-700">{s}</Badge>;
  if (s <= Number(m.stock_minimo ?? 0)) return <Badge cls="bg-amber-100 text-amber-700">{s}</Badge>;
  return <Badge cls="bg-emerald-100 text-emerald-700">{s}</Badge>;
}

export default function MedicamentosTable({ loading, medicamentos, selectedMed, onSelect, onEdit, onToggleActivo }: Props) {
  if (loading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <table className="w-full text-sm min-w-[820px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['', 'Codigo', 'Medicamento', 'Marca', 'Concentracion', 'Estado', 'Stock', 'Control', ''].map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {medicamentos.map(m => (
            <tr key={m.codigo}
              onClick={() => onSelect(m)}
              className={`cursor-pointer transition-colors ${selectedMed?.codigo === m.codigo ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-slate-50'} ${!m.activo ? 'opacity-50' : ''}`}>

              <td className="pl-4 pr-2 py-2.5">
                <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {(m.urlImagenPrincipal || m.imagenBase64Principal)
                    ? <img src={m.urlImagenPrincipal || m.imagenBase64Principal} className="w-full h-full object-cover" alt="" />
                    : <Pill className="w-4 h-4 text-slate-400" />}
                </div>
              </td>

              <td className="px-4 py-2.5">
                <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{m.codigo}</span>
              </td>

              <td className="px-4 py-2.5">
                <p className="font-semibold text-slate-800 leading-tight">{m.nombre_generico}</p>
                <p className="text-xs text-slate-400 mt-0.5">{m.formaNombre || 'Sin forma definida'}</p>
              </td>

              <td className="px-4 py-2.5 text-slate-600 text-xs">{m.nombre_comercial || 'Sin marca'}</td>
              <td className="px-4 py-2.5 text-slate-600 text-xs">{m.concentracion || '-'}</td>
              <td className="px-4 py-2.5">{catalogStatusBadge(m.estadoCatalogo)}</td>
              <td className="px-4 py-2.5">{stockBadge(m)}</td>

              <td className="px-4 py-2.5">
                <div className="flex gap-1.5 flex-wrap">
                  {m.requiere_receta && <Badge cls="bg-amber-100 text-amber-700">Receta</Badge>}
                  {m.es_controlado && <Badge cls="bg-red-100 text-red-700">Controlado</Badge>}
                  {!m.requiere_receta && !m.es_controlado && <span className="text-slate-300 text-xs">Libre</span>}
                </div>
              </td>

              <td className="px-4 py-2.5">
                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => onEdit(m)} className={`${btnIcon} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50`} title="Editar datos basicos">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onToggleActivo(m)}
                    className={`${btnIcon} text-xs font-medium ${m.activo ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                    title={m.activo ? 'Desactivar' : 'Activar'}>
                    {m.activo ? 'Off' : 'On'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {medicamentos.length === 0 && (
            <tr><td colSpan={9} className="py-16 text-center">
              <Pill className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No se encontraron medicamentos</p>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
