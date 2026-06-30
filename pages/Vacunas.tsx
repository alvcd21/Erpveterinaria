import React, { useEffect, useState } from 'react';
import { MedicamentosService, PacientesService, RecordatoriosService, VacunasService } from '../services/api';
import { Paciente, RecordatorioVet, VacunaAplicada } from '../types';
import { Bell, Plus, X } from 'lucide-react';
import Swal from 'sweetalert2';

export default function Vacunas() {
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<VacunaAplicada[]>([]);
  const [reminders, setReminders] = useState<RecordatorioVet[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ fecha_aplicacion: new Date().toISOString().slice(0, 10) });

  const load = async () => {
    const [p, m, v, r] = await Promise.all([
      PacientesService.getAll(),
      MedicamentosService.getAll({ estado_catalogo: 'Listo para venta' } as any),
      VacunasService.getAplicadas(),
      RecordatoriosService.getAll({ tipo: 'vacuna_proxima' }),
    ]);
    setPatients(p);
    setMeds(m);
    setVaccines(v);
    setReminders(r);
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await VacunasService.aplicar({ ...form, id_paciente: Number(form.id_paciente) });
      setShowModal(false);
      setForm({ fecha_aplicacion: new Date().toISOString().slice(0, 10) });
      await load();
      Swal.fire({ icon: 'success', title: 'Vacuna registrada', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo registrar vacuna', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white"><Plus size={18} /> Registrar vacuna</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-800">Historial de aplicaciones</div>
          <div className="divide-y divide-slate-100">
            {vaccines.map(v => (
              <div key={v.id_vacuna_aplicada} className="p-4 flex justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{v.nombre_vacuna}</p>
                  <p className="text-xs text-slate-500">{v.pacienteNombre || `Paciente ${v.id_paciente}`} · {new Date(v.fecha_aplicacion).toLocaleDateString('es-HN')}</p>
                  {v.proxima_dosis && <p className="text-xs text-teal-700 font-bold mt-1">Proxima dosis: {new Date(v.proxima_dosis).toLocaleDateString('es-HN')}</p>}
                </div>
                <span className="text-xs text-slate-400">{v.veterinario || ''}</span>
              </div>
            ))}
            {vaccines.length === 0 && <div className="p-10 text-center text-slate-400 font-bold">Sin vacunas registradas.</div>}
          </div>
        </section>

        <aside className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><Bell size={16} className="text-amber-500" /> Recordatorios</h3>
          <div className="mt-4 space-y-3">
            {reminders.slice(0, 8).map(r => (
              <div key={r.id_recordatorio} className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs font-semibold text-amber-800">{r.asunto}</p>
                <p className="text-[11px] text-amber-700 mt-1">{new Date(r.fecha_programada).toLocaleString('es-HN')} · {r.estado}</p>
              </div>
            ))}
            {reminders.length === 0 && <p className="text-sm text-slate-400">Sin recordatorios de vacuna.</p>}
          </div>
        </aside>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-bold text-slate-800">Registrar vacuna</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
            <label className="block text-sm font-semibold text-indigo-900/70">Paciente
              <select required value={form.id_paciente || ''} onChange={e => setForm({ ...form, id_paciente: Number(e.target.value) })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white font-normal outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="">Seleccione paciente</option>
                {patients.map(p => <option key={p.id_paciente} value={p.id_paciente}>{p.nombre} · {p.tutorNombre}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-indigo-900/70">Nombre vacuna
              <input required value={form.nombre_vacuna || ''} onChange={e => setForm({ ...form, nombre_vacuna: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
            </label>
              <label className="text-sm font-semibold text-indigo-900/70">Medicamento/vacuna de inventario
                <select value={form.id_medicamento || ''} onChange={e => setForm({ ...form, id_medicamento: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white font-normal outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="">No descontar inventario</option>
                  {meds.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre_generico}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Fecha aplicacion
                <input type="date" value={form.fecha_aplicacion || ''} onChange={e => setForm({ ...form, fecha_aplicacion: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Proxima dosis
                <input type="date" value={form.proxima_dosis || ''} onChange={e => setForm({ ...form, proxima_dosis: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Veterinario
                <input value={form.veterinario || ''} onChange={e => setForm({ ...form, veterinario: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
            <label className="block text-sm font-semibold text-indigo-900/70 md:col-span-2">Notas
              <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
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
