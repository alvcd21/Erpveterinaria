import React from 'react';
import { AlertTriangle, Boxes } from 'lucide-react';
import { Badge, Spinner, alertBadge } from './shared';

interface Props {
  loading: boolean;
  alertasVenc: any[];
  stockCritico: any[];
}

export default function AlertasSection({ loading, alertasVenc, stockCritico }: Props) {
  if (loading) return <Spinner />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">Vencimiento Próximo</h2>
            <p className="text-xs text-slate-400">{alertasVenc.length} alertas activas</p>
          </div>
        </div>
        <div className="divide-y divide-slate-50 max-h-96 overflow-auto">
          {alertasVenc.length === 0
            ? <div className="py-12 text-center text-slate-400 text-sm"><AlertTriangle className="w-6 h-6 mx-auto mb-2 text-slate-200" />Sin alertas de vencimiento</div>
            : alertasVenc.map(a => (
              <div key={a.idLote} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{a.nombreGenerico}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Lote: {a.numeroLote}</p>
                  </div>
                  <Badge cls={alertBadge[a.nivel_alerta] || 'bg-slate-100 text-slate-600'}>{a.nivel_alerta}</Badge>
                </div>
                <div className="flex gap-3 mt-1.5 text-xs text-slate-500">
                  <span>Vence: <strong>{a.fechaVencimientoDisplay}</strong></span>
                  <span>Stock: <strong>{a.cantidadActual}</strong></span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
            <Boxes className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">Stock Crítico</h2>
            <p className="text-xs text-slate-400">{stockCritico.length} productos bajo mínimo</p>
          </div>
        </div>
        <div className="divide-y divide-slate-50 max-h-96 overflow-auto">
          {stockCritico.length === 0
            ? <div className="py-12 text-center text-slate-400 text-sm"><Boxes className="w-6 h-6 mx-auto mb-2 text-slate-200" />Sin productos en stock crítico</div>
            : stockCritico.map(s => (
              <div key={s.codigo} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{s.nombreGenerico}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.categoria || 'Sin categoría'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-600 leading-none">{s.stockActual}</p>
                    <p className="text-xs text-slate-400">unidades</p>
                  </div>
                </div>
                <div className="mt-1.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, (s.stockActual / (s.stockMinimo || 1)) * 100)}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1">Mínimo: {s.stockMinimo} · Reorden: {s.puntoReorden}</p>
              </div>
            ))
          }
        </div>
      </div>

    </div>
  );
}
