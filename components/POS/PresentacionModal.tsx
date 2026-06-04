import React, { useState } from 'react';
import { X, ArrowRightLeft, Pill, ShoppingCart, ZoomIn } from 'lucide-react';
import { PresentacionModalState } from './types';

interface Props {
  modal: PresentacionModalState;
  pendingCrossBranch: { id_sucursal: number; nombre: string } | null;
  onClose: () => void;
  onSelectPres: (id: number) => void;
  onConfirm: () => void;
}

function ProductImage({ url, base64, name, onClick }: { url?: string; base64?: string; name: string; onClick?: () => void }) {
  const [err, setErr] = useState(false);
  const src = base64
    ? (base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64.replace(/\s/g, '')}`)
    : url;

  if (!src || err) {
    return (
      <div className="w-20 h-20 rounded-2xl bg-indigo-500/20 flex items-center justify-center shrink-0 border-2 border-indigo-400/20">
        <Pill size={30} className="text-indigo-200" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative group w-20 h-20 rounded-2xl shrink-0 overflow-hidden border-2 border-white/30 shadow-lg focus:outline-none"
    >
      <img
        src={src}
        alt={name}
        onError={() => setErr(true)}
        className="w-full h-full object-contain bg-white/20"
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <ZoomIn size={18} className="text-white" />
      </div>
    </button>
  );
}

export default function PresentacionModal({ modal, pendingCrossBranch, onClose, onSelectPres, onConfirm }: Props) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  if (!modal.visible) return null;
  const p = modal.product;
  const pres = p.presentaciones || [];

  const imageSrc = p.imagenBase64
    ? (p.imagenBase64.startsWith('data:') ? p.imagenBase64 : `data:image/jpeg;base64,${p.imagenBase64.replace(/\s/g, '')}`)
    : p.urlImagen;

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in">

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-600 to-indigo-800 p-5 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-8 w-16 h-16 bg-white/5 rounded-full translate-y-1/2" />

          <div className="relative flex items-start gap-4">
            <ProductImage
              url={p.urlImagen}
              base64={p.imagenBase64}
              name={p.nombreGenerico}
              onClick={imageSrc ? () => setPreviewSrc(imageSrc) : undefined}
            />
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest mb-1.5">
                Seleccionar presentación
              </p>
              <h3 className="font-black text-white text-sm leading-snug">
                {p.nombreGenerico}{p.concentracion ? ` ${p.concentracion}` : ''}
              </h3>
              {p.nombreComercial && (
                <p className="text-xs text-indigo-200 mt-0.5 truncate">{p.nombreComercial}</p>
              )}
              {pendingCrossBranch && (
                <div className="flex items-center gap-1 mt-2 bg-orange-400/20 rounded-lg px-2 py-1 w-fit">
                  <ArrowRightLeft size={10} className="text-orange-300 shrink-0" />
                  <span className="text-[10px] font-bold text-orange-200">Entrega: {pendingCrossBranch.nombre}</span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white p-1 transition-colors shrink-0 hover:bg-white/10 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Presentations list */}
        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
            {pres.length} presentaci{pres.length !== 1 ? 'ones' : 'ón'} disponible{pres.length !== 1 ? 's' : ''}
          </p>
          {pres.map((pr, idx) => {
            const selected = modal.selectedId === pr.id_presentacion;
            return (
              <button
                key={pr.id_presentacion ?? idx}
                onClick={() => onSelectPres(pr.id_presentacion)}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 text-left transition-all ${
                  selected
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm shadow-indigo-100'
                    : 'border-slate-100 bg-slate-50 hover:border-indigo-200 hover:bg-indigo-50/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {selected && (
                      <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      </div>
                    )}
                    {!selected && (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                    )}
                    <span className="text-sm font-bold text-slate-800">{pr.nombre}</span>
                  </div>
                  {pr.precio_tercera_edad && (
                    <p className="text-[10px] text-purple-500 font-bold mt-1 ml-6">
                      3a edad: L {Number(pr.precio_tercera_edad).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span className={`font-black text-sm ${selected ? 'text-indigo-600' : 'text-slate-700'}`}>
                    L {Number(pr.precio_venta ?? 0).toFixed(2)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!modal.selectedId}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center gap-2 shadow-sm shadow-indigo-200 disabled:shadow-none"
          >
            <ShoppingCart size={15} /> Agregar al carrito
          </button>
        </div>
      </div>

      {/* Full-screen image preview overlay */}
      {previewSrc && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={() => setPreviewSrc(null)}
          >
            <X size={22} />
          </button>
          <img
            src={previewSrc}
            alt={p.nombreGenerico}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
