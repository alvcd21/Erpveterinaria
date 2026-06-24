import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientService, PacientesService } from '../services/api';
import { Cliente, Paciente } from '../types';
import { AlertTriangle, ChevronLeft, ChevronRight, ImagePlus, Plus, RefreshCw, Search, UserPlus, Weight } from 'lucide-react';
import Swal from 'sweetalert2';

const PAGE_SIZE = 24;
const emptyPatient: Partial<Paciente> = { especie: 'Canino', estado: 'Activo' };
const inputClass = 'w-full p-2.5 rounded-xl border bg-slate-50';

function ageLabel(date?: string) {
  if (!date) return 'Edad no registrada';
  const birth = new Date(date);
  const months = Math.max(0, Math.floor((Date.now() - birth.getTime()) / 2629800000));
  if (months < 24) return `${months} meses`;
  return `${Math.floor(months / 12)} anos`;
}

function initials(name?: string) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Pacientes() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [filters, setFilters] = useState({ q: '', especie: '', sexo: '', estado: 'Activo', alertas: '', id_tutor: '' });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Paciente | null>(null);
  const [form, setForm] = useState<Partial<Paciente>>(emptyPatient);

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        PacientesService.getAll({ ...filters, limit: PAGE_SIZE, offset: nextPage * PAGE_SIZE }),
        ClientService.getAll(),
      ]);
      setPatients(p);
      setClients(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0); }, []);

  const clientOptions = useMemo(
    () => clients.map(c => ({ id: c.identidad, name: `${c.nombre} ${c.apellido || ''}`.trim(), phone: c.telefono || '', email: c.correo || '' })),
    [clients]
  );

  const species = useMemo(() => Array.from(new Set(patients.map(p => p.especie).filter(Boolean))).sort(), [patients]);

  const applyFilters = () => {
    setPage(0);
    load(0);
  };

  const changePage = (next: number) => {
    const safe = Math.max(0, next);
    setPage(safe);
    load(safe);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyPatient);
    setShowModal(true);
  };

  const openEdit = (patient: Paciente) => {
    setEditing(patient);
    setForm(patient);
    setShowModal(true);
  };

  const setPhoto = async (file?: File) => {
    if (!file) return;
    if (file.size > 900_000) {
      Swal.fire('Imagen muy grande', 'Use una foto menor a 900 KB para mantener la app rapida.', 'warning');
      return;
    }
    setForm({ ...form, foto_base64: await fileToBase64(file) });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await PacientesService.update(editing.id_paciente, form);
      else await PacientesService.create(form);
      setShowModal(false);
      await load();
      Swal.fire({ icon: 'success', title: 'Paciente guardado', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Pacientes</h2>
          <p className="text-sm text-slate-500">Busca por mascota, tutor, telefono, correo, especie, raza o microchip.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/clients')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
            <UserPlus size={18} /> Nuevo tutor
          </button>
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-black text-white hover:bg-teal-700">
            <Plus size={18} /> Nuevo paciente
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && applyFilters()} placeholder="Mascota, tutor, telefono o microchip" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-teal-200" />
          </div>
          <select value={filters.especie} onChange={e => setFilters({ ...filters, especie: e.target.value })} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">Todas las especies</option>
            {['Canino', 'Felino', 'Ave', 'Conejo', ...species.filter(s => !['Canino', 'Felino', 'Ave', 'Conejo'].includes(s))].map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={filters.sexo} onChange={e => setFilters({ ...filters, sexo: e.target.value })} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">Todo sexo</option><option>Macho</option><option>Hembra</option>
          </select>
          <select value={filters.alertas} onChange={e => setFilters({ ...filters, alertas: e.target.value })} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">Con/sin alertas</option><option value="true">Solo con alertas</option>
          </select>
          <button onClick={applyFilters} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white">Buscar</button>
          <select value={filters.id_tutor} onChange={e => setFilters({ ...filters, id_tutor: e.target.value })} className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">Todos los tutores</option>
            {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name} - {c.phone || c.email || c.id}</option>)}
          </select>
          <select value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm">
            <option value="Activo">Activos</option><option value="">Todos</option><option value="Inactivo">Inactivos</option>
          </select>
          <button onClick={() => load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 text-slate-600 hover:text-teal-600 px-3 py-2.5">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Refrescar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
          {patients.map(p => (
            <button key={p.id_paciente} onClick={() => openEdit(p)} className="text-left rounded-2xl border border-slate-100 bg-slate-50 hover:bg-teal-50 hover:border-teal-200 p-4 transition-colors">
              <div className="flex gap-3">
                {p.foto_base64 ? (
                  <img src={p.foto_base64} alt={p.nombre} className="h-16 w-16 rounded-2xl object-cover border border-white shadow-sm" />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-teal-100 text-teal-700 grid place-items-center font-black text-lg">{initials(p.nombre)}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <h3 className="font-black text-slate-900 truncate">{p.nombre}</h3>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-teal-700 border border-teal-100">{p.estado}</span>
                  </div>
                  <p className="text-xs text-slate-500">{p.especie}{p.raza ? ` - ${p.raza}` : ''} - {ageLabel(p.fecha_nacimiento)}</p>
                  <p className="text-xs text-slate-500 truncate">Tutor: {p.tutorNombre || 'Sin tutor'} {p.tutorTelefono ? `- ${p.tutorTelefono}` : ''}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-white p-3 border border-slate-100"><Weight size={13} className="text-slate-400 mb-1" />{p.peso_actual ? `${p.peso_actual} kg` : 'Sin peso'}</div>
                <div className="rounded-xl bg-white p-3 border border-slate-100">{p.microchip || 'Sin microchip'}</div>
                <div className="rounded-xl bg-white p-3 border border-slate-100">{p.totalConsultas || 0} consultas</div>
              </div>
              {(p.alergias || p.condiciones_cronicas) && (
                <p className="mt-3 text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 line-clamp-2 flex gap-2">
                  <AlertTriangle size={14} /> {p.alergias || p.condiciones_cronicas}
                </p>
              )}
            </button>
          ))}
          {!loading && patients.length === 0 && <div className="col-span-full p-10 text-center text-slate-400 font-bold">Sin pacientes para esos filtros.</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm">
          <span className="text-slate-500">Pagina {page + 1} - mostrando {patients.length} registros</span>
          <div className="flex gap-2">
            <button disabled={page === 0 || loading} onClick={() => changePage(page - 1)} className="px-3 py-2 rounded-xl border disabled:opacity-40"><ChevronLeft size={16} /></button>
            <button disabled={patients.length < PAGE_SIZE || loading} onClick={() => changePage(page + 1)} className="px-3 py-2 rounded-xl border disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 space-y-4 max-h-[92vh] overflow-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-lg text-slate-900">{editing ? 'Editar paciente' : 'Nuevo paciente'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500">Cerrar</button>
            </div>
            <div className="flex gap-4 items-center">
              {form.foto_base64 ? <img src={form.foto_base64} alt="Paciente" className="h-24 w-24 rounded-2xl object-cover border" /> : <div className="h-24 w-24 rounded-2xl bg-slate-100 grid place-items-center font-black text-slate-400">{initials(form.nombre)}</div>}
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <ImagePlus size={18} /> Agregar foto
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => setPhoto(e.target.files?.[0])} />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Tutor">
                <select required value={form.id_tutor || ''} onChange={e => setForm({ ...form, id_tutor: e.target.value })} className={inputClass}>
                  <option value="">Seleccione tutor</option>
                  {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name} - {c.phone || c.email || c.id}</option>)}
                </select>
              </Field>
              <Text label="Nombre" required value={form.nombre || ''} onChange={v => setForm({ ...form, nombre: v })} />
              <Text label="Especie" required value={form.especie || ''} onChange={v => setForm({ ...form, especie: v })} />
              <Text label="Raza" value={form.raza || ''} onChange={v => setForm({ ...form, raza: v })} />
              <Field label="Sexo">
                <select value={form.sexo || ''} onChange={e => setForm({ ...form, sexo: e.target.value })} className={inputClass}>
                  <option value="">No especificado</option><option>Macho</option><option>Hembra</option>
                </select>
              </Field>
              <Text label="Color" value={form.color || ''} onChange={v => setForm({ ...form, color: v })} />
              <Field label="Peso actual kg"><input type="number" step="0.001" value={form.peso_actual || ''} onChange={e => setForm({ ...form, peso_actual: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></Field>
              <Field label="Nacimiento"><input type="date" value={form.fecha_nacimiento || ''} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} className={inputClass} /></Field>
              <Text label="Microchip" value={form.microchip || ''} onChange={v => setForm({ ...form, microchip: v })} />
              <Text label="Estado reproductivo" value={form.estado_reproductivo || ''} onChange={v => setForm({ ...form, estado_reproductivo: v })} />
            </div>
            <TextArea label="Alergias" value={form.alergias || ''} onChange={v => setForm({ ...form, alergias: v })} />
            <TextArea label="Condiciones cronicas" value={form.condiciones_cronicas || ''} onChange={v => setForm({ ...form, condiciones_cronicas: v })} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-teal-600 font-black text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs font-bold text-slate-500">{label}<div className="mt-1">{children}</div></label>;
}

function Text({ label, value, onChange, required }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return <Field label={label}><input required={required} value={value} onChange={e => onChange(e.target.value)} className={inputClass} /></Field>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold text-slate-500">{label}<textarea value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50 min-h-[82px]" /></label>;
}
