import React, { useEffect, useState } from 'react';
import { ServiciosVeterinariosService } from '../services/api';
import { ServicioVeterinario } from '../types';
import { Plus, X } from 'lucide-react';
import Swal from 'sweetalert2';

const blank: Partial<ServicioVeterinario> = { categoria: 'Consulta', duracion_minutos: 30, precio: 0, tipo_isv: 'exento', requiere_paciente: true, activo: true };

export default function ServiciosVeterinarios() {
  const [services, setServices] = useState<ServicioVeterinario[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ServicioVeterinario | null>(null);
  const [form, setForm] = useState<Partial<ServicioVeterinario>>(blank);

  const load = async () => setServices(await ServiciosVeterinariosService.getAll());
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(blank); setShowModal(true); };
  const openEdit = (s: ServicioVeterinario) => { setEditing(s); setForm(s); setShowModal(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await ServiciosVeterinariosService.update(editing.id_servicio, form);
      else await ServiciosVeterinariosService.create(form);
      setShowModal(false);
      await load();
      Swal.fire({ icon: 'success', title: 'Servicio guardado', timer: 1200, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white"><Plus size={18} /> Nuevo servicio</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
            <tr><th className="p-4">Servicio</th><th className="p-4">Categoria</th><th className="p-4">Duracion</th><th className="p-4">Precio</th><th className="p-4">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {services.map(s => (
              <tr key={s.id_servicio} onClick={() => openEdit(s)} className="hover:bg-teal-50 cursor-pointer">
                <td className="p-4 font-semibold text-slate-800">{s.nombre}<p className="text-xs text-slate-400">{s.descripcion}</p></td>
                <td className="p-4 text-sm text-slate-600">{s.categoria}</td>
                <td className="p-4 text-sm">{s.duracion_minutos} min</td>
                <td className="p-4 font-semibold text-teal-700">L. {Number(s.precio).toFixed(2)}</td>
                <td className="p-4"><span className={`text-xs font-semibold rounded-full px-2 py-1 ${s.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.activo ? 'Activo' : 'Inactivo'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-bold text-slate-800">{editing ? 'Editar servicio' : 'Nuevo servicio'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
            <label className="block text-sm font-semibold text-indigo-900/70 md:col-span-2">Nombre
              <input required value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
            </label>
              <label className="text-sm font-semibold text-indigo-900/70">Categoria
                <input value={form.categoria || ''} onChange={e => setForm({ ...form, categoria: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Codigo
                <input value={form.codigo || ''} onChange={e => setForm({ ...form, codigo: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Duracion minutos
                <input type="number" value={form.duracion_minutos || 0} onChange={e => setForm({ ...form, duracion_minutos: Number(e.target.value) })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Precio
                <input type="number" step="0.01" value={form.precio || 0} onChange={e => setForm({ ...form, precio: Number(e.target.value) })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
            <label className="block text-sm font-semibold text-indigo-900/70 md:col-span-2">Descripcion
              <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
            </label>
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-6">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 font-semibold text-slate-600">Cancelar</button>
              <button className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 font-semibold text-white shadow-lg shadow-indigo-600/20">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
