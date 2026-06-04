import React, { useState } from 'react';
import { X, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { ClientService } from '../../services/api';
import { Cliente } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (client: Cliente) => void;
}

const EMPTY = { identidad: '', nombre: '', apellido: '', telefono: '', correo: '', direccion: '' };

export default function QuickClientModal({ visible, onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!visible) return null;

  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.identidad.trim()) { setError('La identidad es requerida'); return; }
    if (!form.nombre.trim())    { setError('El nombre es requerido'); return; }
    setLoading(true);
    try {
      const payload: Cliente = {
        identidad: form.identidad.trim(),
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        telefono: form.telefono.trim(),
        correo: form.correo.trim(),
        direccion: form.direccion.trim(),
      };
      await ClientService.create(payload);
      const newClient: Cliente = payload;
      setForm(EMPTY);
      onCreated(newClient);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al crear cliente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <UserPlus size={16} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Nuevo Cliente</h3>
              <p className="text-[10px] text-slate-400">Se agregará y seleccionará automáticamente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* Identidad */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              DNI / Identidad <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={form.identidad}
              onChange={e => set('identidad', e.target.value)}
              placeholder="0801-1990-12345"
              className="mt-1 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
            />
          </div>

          {/* Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Juan"
                className="mt-1 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Apellido</label>
              <input
                type="text"
                value={form.apellido}
                onChange={e => set('apellido', e.target.value)}
                placeholder="Pérez"
                className="mt-1 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              />
            </div>
          </div>

          {/* Teléfono + Correo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Teléfono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={e => set('telefono', e.target.value)}
                placeholder="9999-9999"
                className="mt-1 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Correo</label>
              <input
                type="email"
                value={form.correo}
                onChange={e => set('correo', e.target.value)}
                placeholder="correo@mail.com"
                className="mt-1 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />
              <span className="text-xs font-medium">{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              {loading ? 'Guardando...' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
