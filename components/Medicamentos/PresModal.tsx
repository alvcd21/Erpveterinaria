import React from 'react';
import { X } from 'lucide-react';
import { PresentacionVenta } from '../../types';
import { inp, btnPrimary, btnSecondary, btnIcon, FieldLabel } from './shared';

interface Props {
  show: boolean;
  editingId: number | null;
  form: Partial<PresentacionVenta>;
  onChange: (form: Partial<PresentacionVenta>) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function PresModal({ show, editingId, form, onChange, onSave, onClose }: Props) {
  if (!show) return null;

  const set = (patch: Partial<PresentacionVenta>) => onChange({ ...form, ...patch });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{editingId ? 'Editar Presentación' : 'Nueva Presentación'}</h2>
          <button onClick={onClose} className={`${btnIcon} text-slate-400 hover:bg-slate-100`}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <FieldLabel>Nombre *</FieldLabel>
            <input className={inp} placeholder="Ej. Caja x 12, Tableta, Frasco" value={form.nombre || ''} onChange={e => set({ nombre: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Factor Conversión</FieldLabel>
              <input type="number" min="0.001" step="0.001" className={inp} value={form.factor_conversion ?? 1} onChange={e => set({ factor_conversion: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>Precio Venta (L)</FieldLabel>
              <input type="number" min="0" step="0.01" className={inp} value={form.precio_venta ?? 0} onChange={e => set({ precio_venta: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>Precio 3a Edad (L)</FieldLabel>
              <input type="number" min="0" step="0.01" className={inp} value={form.precio_tercera_edad || ''} onChange={e => set({ precio_tercera_edad: Number(e.target.value) })} placeholder="Opcional" />
            </div>
            <div>
              <FieldLabel>Código de Barras</FieldLabel>
              <input className={inp} value={form.codigo_barras_presentacion || ''} onChange={e => set({ codigo_barras_presentacion: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-5 pt-1">
            {(['es_unidad_venta', 'es_unidad_compra', 'permite_fraccion'] as const).map(key => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={(form as any)[key] || false} onChange={e => set({ [key]: e.target.checked } as any)} className="accent-indigo-600 w-4 h-4" />
                {key === 'es_unidad_venta' ? 'Unidad de Venta' : key === 'es_unidad_compra' ? 'Unidad de Compra' : 'Permite Fracción'}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className={btnSecondary}>Cancelar</button>
          <button onClick={onSave} className={btnPrimary}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
