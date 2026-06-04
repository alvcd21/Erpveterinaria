import React, { useState, useRef, useEffect } from 'react';
import {
  ShoppingCart, X, Minus, Plus, Trash2,
  AlertTriangle, ArrowRightLeft, RefreshCw, Clock,
} from 'lucide-react';
import { CartItem, CartTotals } from './types';

interface Props {
  cart: CartItem[];
  thirdAgeMode: boolean;
  totals: CartTotals;
  heldCount: number;
  onUpdateQty: (key: string, delta: number) => void;
  onUpdateQtyDirect: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onClearCart: () => void;
  onHoldCart: () => void;
  onShowHeld: () => void;
}

function QtyInput({ item, onDelta, onDirect }: { item: CartItem; onDelta: (d: number) => void; onDirect: (q: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.cantidad));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setVal(String(item.cantidad)); }, [item.cantidad, editing]);

  const commit = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) onDirect(n);
    else setVal(String(item.cantidad));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={val}
        min={1}
        max={item.stock || 9999}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setVal(String(item.cantidad)); } }}
        className="w-10 text-center text-[12px] font-black bg-white border border-indigo-400 rounded-md py-0.5 outline-none focus:ring-1 focus:ring-indigo-400"
        autoFocus
      />
    );
  }
  return (
    <button
      onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 10); }}
      title="Click para editar cantidad"
      className="w-8 text-center text-[12px] font-black text-slate-800 hover:text-indigo-600 hover:bg-indigo-50 rounded-md py-0.5 transition-colors cursor-text"
    >
      {item.cantidad}
    </button>
  );
}

export default function CartPanel({
  cart, thirdAgeMode, totals, heldCount,
  onUpdateQty, onUpdateQtyDirect, onRemove, onClearCart, onHoldCart, onShowHeld,
}: Props) {
  const cartCount = cart.reduce((a, b) => a + b.cantidad, 0);

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 w-full lg:w-[288px] xl:w-[300px] shrink-0 min-h-0 h-full">

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={17} className="text-indigo-500" />
            <h3 className="font-black text-sm text-slate-800">Carrito</h3>
            {cartCount > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onShowHeld} title="Ventas en espera" className="relative p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors">
              <Clock size={15} />
              {heldCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
                  {heldCount}
                </span>
              )}
            </button>
            {cart.length > 0 && (
              <button onClick={onHoldCart} title="Apartar venta" className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-[10px] font-bold flex items-center gap-1">
                <Clock size={13} /> <span className="hidden sm:inline">Apartar</span>
              </button>
            )}
            {cart.length > 0 && (
              <button onClick={onClearCart} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Limpiar carrito">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-1.5">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-200 py-10 gap-3">
            <ShoppingCart size={44} strokeWidth={1} />
            <div className="text-center">
              <p className="text-xs font-bold text-slate-400">Carrito vacío</p>
              <p className="text-[11px] text-slate-300 mt-0.5">Selecciona productos del catálogo</p>
            </div>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.key} className={`rounded-xl border px-3 py-2 ${item.id_sucursal_origen ? 'border-orange-200 bg-orange-50/40' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    {(item.requiereReceta || item.esControlado) && (
                      <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                    )}
                    <p className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2">{item.nombre}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">
                      L {(thirdAgeMode && item.precioTerceraEdad ? item.precioTerceraEdad : item.precioVenta).toFixed(2)} c/u
                    </span>
                    {thirdAgeMode && item.precioTerceraEdad && (
                      <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1 rounded">3a edad</span>
                    )}
                  </div>
                  {item.sucursal_nombre_origen && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <ArrowRightLeft size={9} className="text-orange-500 shrink-0" />
                      <span className="text-[9px] font-bold text-orange-600">Entrega: {item.sucursal_nombre_origen}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => onRemove(item.key)} className="text-slate-200 hover:text-red-500 transition-colors p-1 shrink-0 mt-0.5">
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center bg-white border border-slate-200 rounded-lg">
                  <button
                    onClick={() => onUpdateQty(item.key, -1)}
                    disabled={item.cantidad <= 1}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition-colors rounded-l-lg"
                  >
                    <Minus size={11} />
                  </button>
                  <QtyInput item={item} onDelta={d => onUpdateQty(item.key, d)} onDirect={q => onUpdateQtyDirect(item.key, q)} />
                  <button
                    onClick={() => onUpdateQty(item.key, 1)}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors rounded-r-lg"
                  >
                    <Plus size={11} />
                  </button>
                </div>
                <span className="font-black text-indigo-600 text-[13px]">
                  L {(item.cantidad * (thirdAgeMode && item.precioTerceraEdad ? item.precioTerceraEdad : item.precioVenta)).toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Running total strip */}
      {cart.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2.5 shrink-0 flex items-center justify-between bg-slate-50/60 rounded-b-2xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cartCount} ítem{cartCount !== 1 ? 's' : ''}</span>
          <span className="text-base font-black text-indigo-600">L {totals.total.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
