import React from 'react';
import { Boxes } from 'lucide-react';
import { Badge, Spinner, alertBadge } from './shared';

interface Props {
  loading: boolean;
  allLotes: any[];
}

export default function LotesTable({ loading, allLotes }: Props) {
  if (loading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['Medicamento', 'N° Lote', 'Vencimiento', 'Stock', 'Costo Unit.', 'Estado', 'Alerta'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {allLotes.map(l => (
            <tr key={l.id_lote} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-800">{l.medNombre}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500 bg-slate-50">{l.numero_lote}</td>
              <td className="px-4 py-3 text-slate-600 text-xs">{l.fecha_vencimiento_display}</td>
              <td className="px-4 py-3 font-semibold text-slate-800">{l.cantidad_actual}</td>
              <td className="px-4 py-3 text-slate-600 text-xs">L {Number(l.precio_compra_unitario ?? 0).toFixed(2)}</td>
              <td className="px-4 py-3"><Badge cls="bg-slate-100 text-slate-600">{l.estado}</Badge></td>
              <td className="px-4 py-3">
                {l.alerta_vencimiento && (
                  <Badge cls={alertBadge[l.alerta_vencimiento] || 'bg-slate-100 text-slate-600'}>{l.alerta_vencimiento}</Badge>
                )}
              </td>
            </tr>
          ))}
          {allLotes.length === 0 && (
            <tr><td colSpan={7} className="py-16 text-center">
              <Boxes className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No hay lotes registrados</p>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
