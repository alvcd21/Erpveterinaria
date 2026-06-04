import React from 'react';
import { X, ShoppingCart, Clock, RotateCcw, Trash2 } from 'lucide-react';
import { HeldCart } from './types';

interface Props {
  visible: boolean;
  heldCarts: HeldCart[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onDiscard: (id: string) => void;
}

function elapsed(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.floor(mins / 60)} h`;
}

export default function HoldPanel({ visible, heldCarts, onClose, onRestore, onDiscard }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
              <Clock size={16} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Ventas en Espera</h3>
              <p className="text-[10px] text-slate-400">{heldCarts.length} venta{heldCarts.length !== 1 ? 's' : ''} aparcada{heldCarts.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {heldCarts.length === 0 ? (
            <div className="text-center py-8 text-slate-300">
              <Clock size={36} strokeWidth={1.5} className="mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-400">No hay ventas en espera</p>
            </div>
          ) : (
            heldCarts.map(h => (
              <div key={h.id} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-start justify-between px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ShoppingCart size={13} className="text-slate-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {h.clienteNombre || 'Sin cliente'}
                      </span>
                      <span className="text-[9px] text-slate-400 shrink-0">{elapsed(h.savedAt)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {h.items.length} producto{h.items.length !== 1 ? 's' : ''}
                      {' · '}
                      <span className="font-bold text-indigo-600">
                        L {h.items.reduce((t, i) => t + i.cantidad * i.precioVenta, 0).toFixed(2)}
                      </span>
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      {h.items.slice(0, 2).map(i => (
                        <p key={i.key} className="text-[10px] text-slate-400 truncate">
                          {i.cantidad}× {i.nombre}
                        </p>
                      ))}
                      {h.items.length > 2 && (
                        <p className="text-[10px] text-slate-300">+{h.items.length - 2} más...</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex border-t border-slate-200">
                  <button
                    onClick={() => onDiscard(h.id)}
                    className="flex-1 py-2.5 text-[11px] font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-1 border-r border-slate-200"
                  >
                    <Trash2 size={12} /> Descartar
                  </button>
                  <button
                    onClick={() => { onRestore(h.id); onClose(); }}
                    className="flex-1 py-2.5 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <RotateCcw size={12} /> Restaurar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
