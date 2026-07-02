import React from 'react';
import { Boxes, Edit2, Trash2 } from 'lucide-react';
import { Badge, Spinner, alertBadge, btnIcon } from './shared';

interface Props {
  loading: boolean;
  allLotes: any[];
  onEditLote: (lote: any) => void;
  onDeleteLote: (lote: any) => void;
}

export default function LotesTable({ loading, allLotes, onEditLote, onDeleteLote }: Props) {
  if (loading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['Medicamento', 'No. Lote', 'Vencimiento', 'Stock', 'Costo Unit.', 'Estado', 'Alerta', 'Acciones'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {allLotes.map(l => {
            const inactive = l.estado && l.estado !== 'Activo';
            return (
            <tr key={l.id_lote} className={`${inactive ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50'} transition-colors`}>
              <td className="px-4 py-3 font-medium text-slate-800">{l.medNombre}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500 bg-slate-50">{l.numero_lote}</td>
              <td className="px-4 py-3 text-slate-600 text-xs">{l.fecha_vencimiento_display}</td>
              <td className="px-4 py-3 font-semibold text-slate-800">{l.cantidad_actual}</td>
              <td className="px-4 py-3 text-slate-600 text-xs">L {Number(l.precio_compra_unitario ?? 0).toFixed(2)}</td>
              <td className="px-4 py-3"><Badge cls={inactive ? 'bg-slate-200 text-slate-600' : 'bg-emerald-50 text-emerald-700'}>{l.estado}</Badge></td>
              <td className="px-4 py-3">
                {l.alerta_vencimiento && (
                  <Badge cls={alertBadge[l.alerta_vencimiento] || 'bg-slate-100 text-slate-600'}>{l.alerta_vencimiento}</Badge>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditLote(l)}
                    className={`${btnIcon} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50`}
                    title="Editar lote"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteLote(l)}
                    disabled={inactive}
                    className={`${btnIcon} ${inactive ? 'cursor-not-allowed text-slate-300' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                    title="Dar de baja lote"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          );})}
          {allLotes.length === 0 && (
            <tr><td colSpan={8} className="py-16 text-center">
              <Boxes className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No hay lotes registrados</p>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
