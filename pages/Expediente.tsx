import React, { useEffect, useMemo, useState } from 'react';
import { ConsultasService, PacientesService } from '../services/api';
import { Consulta, Paciente } from '../types';
import { ChevronLeft, ChevronRight, ClipboardPlus, FileHeart, Plus, Save, Search } from 'lucide-react';
import Swal from 'sweetalert2';

const PAGE_SIZE = 20;

function patientLabel(p: Paciente) {
  return `${p.nombre} - ${p.especie}${p.raza ? ` - ${p.raza}` : ''}`;
}

function initials(name?: string) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function Expediente() {
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Paciente[]>([]);
  const [patient, setPatient] = useState<Paciente | null>(null);
  const [consultations, setConsultations] = useState<Consulta[]>([]);
  const [filters, setFilters] = useState({ q: '', estado: '', desde: '', hasta: '' });
  const [page, setPage] = useState(0);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [form, setForm] = useState<Partial<Consulta>>({ estado: 'Abierta' });
  const [showForm, setShowForm] = useState(false);

  const selectedPatient = useMemo(() => patient, [patient]);

  const searchPatients = async () => {
    setLoadingPatients(true);
    try {
      setPatientResults(await PacientesService.getAll({ q: patientSearch, estado: 'Activo', limit: 12, offset: 0 }));
    } finally {
      setLoadingPatients(false);
    }
  };

  const loadRecord = async (nextPage = page, selected = patient) => {
    if (!selected) return;
    setLoadingRecord(true);
    try {
      const [detail, list] = await Promise.all([
        PacientesService.getById(selected.id_paciente),
        ConsultasService.getAll({
          id_paciente: selected.id_paciente,
          ...filters,
          limit: PAGE_SIZE,
          offset: nextPage * PAGE_SIZE,
        }),
      ]);
      setPatient(detail);
      setConsultations(list);
    } finally {
      setLoadingRecord(false);
    }
  };

  useEffect(() => { searchPatients(); }, []);

  const selectPatient = async (p: Paciente) => {
    setPatient(p);
    setPage(0);
    setPatientSearch(p.nombre);
    setPatientResults([]);
    setLoadingRecord(true);
    try {
      const [detail, list] = await Promise.all([
        PacientesService.getById(p.id_paciente),
        ConsultasService.getAll({ id_paciente: p.id_paciente, limit: PAGE_SIZE, offset: 0 }),
      ]);
      setPatient(detail);
      setConsultations(list);
    } finally {
      setLoadingRecord(false);
    }
  };

  const applyFilters = () => {
    setPage(0);
    loadRecord(0);
  };

  const changePage = (next: number) => {
    const safe = Math.max(0, next);
    setPage(safe);
    loadRecord(safe);
  };

  const openNew = () => {
    if (!patient) return Swal.fire('Seleccione paciente', 'Busque y elija un paciente para abrir consulta.', 'warning');
    setForm({ id_paciente: patient.id_paciente, estado: 'Abierta', motivo: '', subjetivo: '', objetivo: '', evaluacion: '', plan: '' });
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    try {
      await ConsultasService.create({ ...form, id_paciente: patient.id_paciente });
      setShowForm(false);
      await loadRecord(0, patient);
      Swal.fire({ icon: 'success', title: 'Consulta guardada', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar consulta', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2"><FileHeart className="text-teal-600" /> Expediente Clinico</h2>
          <p className="text-sm text-slate-500">Busque por mascota, tutor, telefono, correo o microchip. Sin listas interminables.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-black text-white"><Plus size={18} /> Nueva consulta</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={patientSearch} onChange={e => setPatientSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPatients()} placeholder="Buscar paciente, tutor, telefono o microchip" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm" />
          </div>
          <button onClick={searchPatients} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white">{loadingPatients ? 'Buscando...' : 'Buscar'}</button>
        </div>
        {patientResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {patientResults.map(p => (
              <button key={p.id_paciente} onClick={() => selectPatient(p)} className="rounded-xl border border-slate-200 p-3 text-left hover:border-teal-300 hover:bg-teal-50">
                <div className="flex gap-3 items-center">
                  {p.foto_base64 ? <img src={p.foto_base64} alt={p.nombre} className="h-12 w-12 rounded-xl object-cover" /> : <div className="h-12 w-12 rounded-xl bg-teal-100 text-teal-700 grid place-items-center font-black">{initials(p.nombre)}</div>}
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 truncate">{patientLabel(p)}</p>
                    <p className="text-xs text-slate-500 truncate">{p.tutorNombre || 'Sin tutor'} {p.tutorTelefono ? `- ${p.tutorTelefono}` : ''}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {patient && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <aside className="bg-white rounded-2xl border border-slate-200 p-5 h-fit">
            <div className="flex gap-4">
              {patient.foto_base64 ? <img src={patient.foto_base64} alt={patient.nombre} className="h-20 w-20 rounded-2xl object-cover" /> : <div className="h-20 w-20 rounded-2xl bg-teal-100 text-teal-700 grid place-items-center font-black text-xl">{initials(patient.nombre)}</div>}
              <div>
                <h3 className="font-black text-xl text-slate-900">{patient.nombre}</h3>
                <p className="text-sm text-slate-500">{patient.especie}{patient.raza ? ` - ${patient.raza}` : ''}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <Info label="Tutor" value={patient.tutorNombre} />
              <Info label="Telefono" value={patient.tutorTelefono} />
              <Info label="Correo" value={patient.tutorCorreo} />
              <Info label="Peso actual" value={patient.peso_actual ? `${patient.peso_actual} kg` : 'Sin peso'} />
              <Info label="Microchip" value={patient.microchip || 'No registrado'} />
            </div>
            {(patient.alergias || patient.condiciones_cronicas) && (
              <div className="mt-5 rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">
                <b>Alertas clinicas</b>
                <p className="mt-1">{patient.alergias || patient.condiciones_cronicas}</p>
              </div>
            )}
          </aside>

          <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-3">
              <input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && applyFilters()} placeholder="Buscar SOAP, motivo o diagnostico" className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" />
              <select value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm">
                <option value="">Todo estado</option><option>Abierta</option><option>Cerrada</option><option>Anulada</option>
              </select>
              <input type="date" value={filters.desde} onChange={e => setFilters({ ...filters, desde: e.target.value })} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" />
              <button onClick={applyFilters} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white">Filtrar</button>
            </div>
            <div className="divide-y divide-slate-100 min-h-[220px]">
              {loadingRecord ? <div className="p-10 text-center text-slate-400 font-bold">Cargando expediente...</div> : consultations.map(c => (
                <article key={c.id_consulta} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-black text-slate-900">{c.motivo || 'Consulta veterinaria'}</h3>
                    <span className="text-xs font-black rounded-full bg-slate-100 px-3 py-1">{new Date(c.fecha).toLocaleString('es-HN')}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <Soap label="S" value={c.subjetivo} />
                    <Soap label="O" value={c.objetivo} />
                    <Soap label="A" value={c.evaluacion} />
                    <Soap label="P" value={c.plan} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {c.peso && <span>Peso: <b>{c.peso} kg</b></span>}
                    {c.temperatura && <span>Temp: <b>{c.temperatura} C</b></span>}
                    {c.frecuencia_cardiaca && <span>FC: <b>{c.frecuencia_cardiaca}</b></span>}
                    {c.frecuencia_respiratoria && <span>FR: <b>{c.frecuencia_respiratoria}</b></span>}
                  </div>
                </article>
              ))}
              {!loadingRecord && consultations.length === 0 && <div className="p-10 text-center text-slate-400 font-bold">Sin consultas para esos filtros.</div>}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm">
              <span className="text-slate-500">Pagina {page + 1} - {consultations.length} consultas</span>
              <div className="flex gap-2">
                <button disabled={page === 0 || loadingRecord} onClick={() => changePage(page - 1)} className="px-3 py-2 rounded-xl border disabled:opacity-40"><ChevronLeft size={16} /></button>
                <button disabled={consultations.length < PAGE_SIZE || loadingRecord} onClick={() => changePage(page + 1)} className="px-3 py-2 rounded-xl border disabled:opacity-40"><ChevronRight size={16} /></button>
              </div>
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] overflow-auto">
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2"><ClipboardPlus className="text-teal-600" /> Nueva consulta para {selectedPatient?.nombre}</h3>
            <label className="block text-xs font-bold text-slate-500">Motivo
              <input value={form.motivo || ''} onChange={e => setForm({ ...form, motivo: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['subjetivo', 'Subjetivo'],
                ['objetivo', 'Objetivo'],
                ['evaluacion', 'Evaluacion'],
                ['plan', 'Plan'],
              ].map(([key, label]) => (
                <label key={key} className="text-xs font-bold text-slate-500">{label}
                  <textarea value={(form as any)[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50 min-h-[110px]" />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Num label="Peso kg" value={form.peso} onChange={v => setForm({ ...form, peso: v })} />
              <Num label="Temp C" value={form.temperatura} onChange={v => setForm({ ...form, temperatura: v })} />
              <Num label="FC" value={form.frecuencia_cardiaca} onChange={v => setForm({ ...form, frecuencia_cardiaca: v })} />
              <Num label="FR" value={form.frecuencia_respiratoria} onChange={v => setForm({ ...form, frecuencia_respiratoria: v })} />
              <label className="text-xs font-bold text-slate-500">Cond. corporal
                <input value={form.condicion_corporal || ''} onChange={e => setForm({ ...form, condicion_corporal: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-500">Notas de alta
              <textarea value={form.notas_alta || ''} onChange={e => setForm({ ...form, notas_alta: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
              <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 font-black text-white"><Save size={16} /> Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return <div><p className="text-xs font-black text-slate-400 uppercase">{label}</p><p className="font-bold text-slate-800">{value || 'No registrado'}</p></div>;
}

function Soap({ label, value }: { label: string; value?: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><b className="text-teal-700">{label}</b><p className="mt-1 text-slate-600">{value || 'Sin datos'}</p></div>;
}

function Num({ label, value, onChange }: { label: string; value?: number; onChange: (n: number | undefined) => void }) {
  return <label className="text-xs font-bold text-slate-500">{label}<input type="number" step="0.01" value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" /></label>;
}
