import React, { useState, useEffect, useRef } from 'react';
import { RecetasService, MedicamentosService, ClientService } from '../services/api';
import { Receta, DetalleReceta, Cliente } from '../types';
import { Search, Plus, FileText, Book, Archive, ChevronRight, X, Pill, Eye, CheckCircle } from 'lucide-react';
import Swal from 'sweetalert2';

type Tab = 'recetas' | 'psicotropicos' | 'retenidas';
type EstadoReceta = 'Pendiente' | 'Parcial' | 'Dispensada' | 'Vencida' | 'Anulada' | '';

const ESTADO_BADGE: Record<string, string> = {
  Pendiente: 'bg-blue-100 text-blue-700',
  Parcial: 'bg-yellow-100 text-yellow-700',
  Dispensada: 'bg-green-100 text-green-700',
  Vencida: 'bg-red-100 text-red-700',
  Anulada: 'bg-slate-200 text-slate-500',
};

const btn = 'bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm';
const card = 'bg-white rounded-2xl shadow-sm border border-slate-100';

interface DetalleDraft {
  id_medicamento: string;
  nombre: string;
  cantidad_prescrita: number;
  dosis_prescrita: string;
}

const emptyForm = {
  id_cliente: '',
  nombre_medico: '',
  numero_colegiado: '',
  especialidad: '',
  telefono_medico: '',
  clinica_hospital: '',
  fecha_emision: new Date().toISOString().slice(0, 10),
  tipo_receta: 'Normal' as 'Normal' | 'Cronica' | 'Controlada',
  diagnostico: '',
  imagen_base64: '',
};

export default function Recetas() {
  const [tab, setTab] = useState<Tab>('recetas');
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [medicamentos, setMedicamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<EstadoReceta>('');
  const [busqueda, setBusqueda] = useState('');
  const [selected, setSelected] = useState<Receta | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detalles, setDetalles] = useState<DetalleDraft[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [medSearch, setMedSearch] = useState('');
  const [imgPreview, setImgPreview] = useState('');
  const [dispensarModal, setDispensarModal] = useState<{ open: boolean; item: DetalleReceta | null }>({ open: false, item: null });
  const [cantDispensar, setCantDispensar] = useState(1);
  const [libroPsico, setLibroPsico] = useState<any[]>([]);
  const [retenidas, setRetenidas] = useState<any[]>([]);
  const [pFechaDesde, setPFechaDesde] = useState('');
  const [pFechaHasta, setPFechaHasta] = useState('');
  const [pMed, setPMed] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadRecetas(); loadClientes(); loadMeds(); }, []);
  useEffect(() => { if (tab === 'psicotropicos') loadPsico(); }, [tab]);
  useEffect(() => { if (tab === 'retenidas') loadRetenidas(); }, [tab]);

  async function loadRecetas() {
    setLoading(true);
    try { setRecetas(await RecetasService.getAll()); } catch { }
    setLoading(false);
  }
  async function loadClientes() { try { setClientes(await ClientService.getAll()); } catch { } }
  async function loadMeds() { try { setMedicamentos(await MedicamentosService.getAll()); } catch { } }
  async function loadPsico() { try { setLibroPsico(await RecetasService.getLibroPsicofarmaco({ fecha_desde: pFechaDesde, fecha_hasta: pFechaHasta, id_medicamento: pMed || undefined })); } catch { } }
  async function loadRetenidas() { try { setRetenidas(await RecetasService.getRetenidas()); } catch { } }

  const filtradas = recetas.filter(r => {
    const matchEstado = !filtroEstado || r.estado === filtroEstado;
    const q = busqueda.toLowerCase();
    const matchQ = !q || (r.nombreCliente || '').toLowerCase().includes(q) || (r.nombre_medico || '').toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q);
    return matchEstado && matchQ;
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setForm(p => ({ ...p, imagen_base64: b64 }));
      setImgPreview(b64);
    };
    reader.readAsDataURL(f);
  }

  function addMed() {
    const med = medicamentos.find(m => m.nombre_generico?.toLowerCase().includes(medSearch.toLowerCase()) || m.nombre_comercial?.toLowerCase().includes(medSearch.toLowerCase()));
    if (!med) { Swal.fire('No encontrado', 'Escribe el nombre exacto del medicamento', 'warning'); return; }
    setDetalles(p => [...p, { id_medicamento: med.codigo, nombre: med.nombre_generico, cantidad_prescrita: 1, dosis_prescrita: '' }]);
    setMedSearch('');
  }

  async function handleSave() {
    if (!form.id_cliente) { Swal.fire('Error', 'Seleccione un cliente', 'error'); return; }
    if (!form.nombre_medico) { Swal.fire('Error', 'Ingrese el nombre del médico', 'error'); return; }
    if (detalles.length === 0) { Swal.fire('Error', 'Agregue al menos un medicamento', 'error'); return; }
    try {
      await RecetasService.create({ ...form, detalle: detalles });
      Swal.fire('Guardado', 'Receta registrada correctamente', 'success');
      setShowModal(false);
      setForm(emptyForm);
      setDetalles([]);
      setImgPreview('');
      loadRecetas();
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  }

  async function handleDispensar() {
    if (!selected || !dispensarModal.item) return;
    try {
      await RecetasService.dispensar(selected.codigo, { id_detalle: dispensarModal.item.id, cantidad_a_dispensar: cantDispensar });
      Swal.fire('Dispensado', 'Medicamento dispensado correctamente', 'success');
      setDispensarModal({ open: false, item: null });
      const updated = await RecetasService.getById(selected.codigo);
      setSelected(updated);
      loadRecetas();
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  }

  const clientesFiltrados = clientes.filter(c =>
    `${c.nombre} ${c.apellido} ${c.identidad}`.toLowerCase().includes(clienteSearch.toLowerCase())
  ).slice(0, 8);

  return (
    <div className="p-6 space-y-4 bg-slate-50 min-h-screen">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="text-indigo-600" size={26} />
        <h1 className="text-2xl font-bold text-slate-800">Recetas</h1>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {([['recetas', 'Recetas', FileText], ['psicotropicos', 'Libro Psicotrópicos', Book], ['retenidas', 'Recetas Retenidas', Archive]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {tab === 'recetas' && (
        <div className="flex gap-4">
          <div className={`flex-1 ${card} p-4 space-y-3`}>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as EstadoReceta)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Todos los estados</option>
                {['Pendiente', 'Parcial', 'Dispensada', 'Vencida', 'Anulada'].map(s => <option key={s}>{s}</option>)}
              </select>
              <div className="flex items-center border border-slate-200 rounded-xl px-3 py-2 gap-2 flex-1 min-w-48">
                <Search size={15} className="text-slate-400" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, médico..." className="outline-none text-sm flex-1 bg-transparent" />
              </div>
              <button onClick={() => { setShowModal(true); setForm(emptyForm); setDetalles([]); setImgPreview(''); setClienteSearch(''); }} className={btn}>
                <Plus size={15} className="inline mr-1" />Nueva Receta
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase border-b border-slate-100">
                    {['Código', 'Cliente', 'Médico', 'Emisión', 'Vencimiento', 'Tipo', 'Estado', ''].map(h => (
                      <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="text-center py-10 text-slate-400">Cargando...</td></tr>
                  ) : filtradas.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-slate-400">Sin resultados</td></tr>
                  ) : filtradas.map(r => (
                    <tr key={r.codigo} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)}>
                      <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.codigo}</td>
                      <td className="py-2 px-3">{r.nombreCliente || r.id_cliente}</td>
                      <td className="py-2 px-3">{r.nombre_medico}</td>
                      <td className="py-2 px-3">{r.fecha_emision?.slice(0, 10)}</td>
                      <td className="py-2 px-3">{r.fecha_vencimiento?.slice(0, 10)}</td>
                      <td className="py-2 px-3">{r.tipo_receta}</td>
                      <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[r.estado] || ''}`}>{r.estado}</span></td>
                      <td className="py-2 px-3"><ChevronRight size={16} className="text-slate-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <div className={`w-96 ${card} p-4 space-y-3 flex-shrink-0`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-slate-800">{selected.codigo}</p>
                  <p className="text-sm text-slate-500">{selected.nombreCliente}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[selected.estado] || ''}`}>{selected.estado}</span>
                  <button onClick={() => setSelected(null)}><X size={16} /></button>
                </div>
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <p><b>Médico:</b> {selected.nombre_medico} {selected.numero_colegiado ? `(Col. ${selected.numero_colegiado})` : ''}</p>
                <p><b>Especialidad:</b> {selected.especialidad}</p>
                <p><b>Clínica:</b> {selected.clinica_hospital}</p>
                <p><b>Emisión:</b> {selected.fecha_emision?.slice(0, 10)} | <b>Vence:</b> {selected.fecha_vencimiento?.slice(0, 10)}</p>
                <p><b>Tipo:</b> {selected.tipo_receta}</p>
                {selected.diagnostico && <p><b>Diagnóstico:</b> {selected.diagnostico}</p>}
                {selected.totalItems !== undefined && (
                  <div className="flex gap-2 mt-1">
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs">
                      {selected.totalDispensado}/{selected.totalItems} dispensados
                    </span>
                  </div>
                )}
              </div>
              {(selected.imagen_base64 || selected.imagen_url) && (
                <img src={selected.imagen_base64 || selected.imagen_url} alt="Receta" className="rounded-xl w-full object-contain max-h-40 border" />
              )}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">Medicamentos prescritos</p>
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-400 border-b">{['Medicamento', 'Px', 'Dx', 'Pend', 'Estado', ''].map(h => <th key={h} className="py-1 text-left">{h}</th>)}</tr></thead>
                  <tbody>
                    {(selected.detalle || []).map(item => (
                      <tr key={item.id} className="border-b border-slate-50">
                        <td className="py-1">{item.nombreGenerico || item.nombre_prescrito}</td>
                        <td className="py-1">{item.cantidad_prescrita}</td>
                        <td className="py-1">{item.cantidad_dispensada}</td>
                        <td className="py-1">{Math.max(0, item.cantidad_prescrita - item.cantidad_dispensada)}</td>
                        <td className="py-1"><span className={`px-1.5 py-0.5 rounded-full ${item.estado === 'Dispensado' ? 'bg-green-100 text-green-700' : item.estado === 'Parcial' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>{item.estado}</span></td>
                        <td className="py-1">
                          {item.estado !== 'Dispensado' && (
                            <button onClick={() => { setDispensarModal({ open: true, item }); setCantDispensar(1); }}
                              className="text-indigo-600 hover:underline text-xs">Dispensar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!selected.detalle || selected.detalle.length === 0) && (
                      <tr><td colSpan={6} className="text-center text-slate-400 py-2">Sin detalle</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'psicotropicos' && (
        <div className={`${card} p-4 space-y-3`}>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={pFechaDesde} onChange={e => setPFechaDesde(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Desde" />
            <input type="date" value={pFechaHasta} onChange={e => setPFechaHasta(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Hasta" />
            <input value={pMed} onChange={e => setPMed(e.target.value)} placeholder="Medicamento..." className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            <button onClick={loadPsico} className={btn}>Filtrar</button>
            <button onClick={() => window.print()} className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm hover:bg-slate-50">Exportar PDF</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs uppercase border-b border-slate-100">
                {['Fecha', 'Medicamento', 'Tipo Mov.', 'Paciente', 'DNI', 'Médico', 'N° Receta', 'Entrada', 'Salida', 'Saldo'].map(h => (
                  <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {libroPsico.length === 0
                  ? <tr><td colSpan={10} className="text-center py-10 text-slate-400">Sin registros</td></tr>
                  : libroPsico.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 px-3">{r.fecha?.slice(0, 10)}</td>
                      <td className="py-2 px-3">{r.medicamento}</td>
                      <td className="py-2 px-3">{r.tipo_movimiento}</td>
                      <td className="py-2 px-3">{r.paciente}</td>
                      <td className="py-2 px-3">{r.dni}</td>
                      <td className="py-2 px-3">{r.medico}</td>
                      <td className="py-2 px-3 font-mono text-xs">{r.numero_receta}</td>
                      <td className="py-2 px-3 text-green-700">{r.entrada ?? '-'}</td>
                      <td className="py-2 px-3 text-red-600">{r.salida ?? '-'}</td>
                      <td className="py-2 px-3 font-semibold">{r.saldo}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'retenidas' && (
        <div className={`${card} p-4`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs uppercase border-b border-slate-100">
                {['N° Serie CMH', 'Receta', 'Paciente', 'Médico', 'Fecha Retención', 'Folio'].map(h => (
                  <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {retenidas.length === 0
                  ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">Sin recetas retenidas</td></tr>
                  : retenidas.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-xs">{r.numero_serie_cmh}</td>
                      <td className="py-2 px-3 font-mono text-xs">{r.codigo_receta}</td>
                      <td className="py-2 px-3">{r.paciente}</td>
                      <td className="py-2 px-3">{r.medico}</td>
                      <td className="py-2 px-3">{r.fecha_retencion?.slice(0, 10)}</td>
                      <td className="py-2 px-3">{r.folio}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 text-lg">Nueva Receta</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Buscar Cliente</label>
                <input value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} placeholder="Nombre o identidad..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1" />
                {clienteSearch && (
                  <div className="border border-slate-200 rounded-xl mt-1 overflow-hidden">
                    {clientesFiltrados.map(c => (
                      <button key={c.identidad} onClick={() => { setForm(p => ({ ...p, id_cliente: c.identidad })); setClienteSearch(`${c.nombre} ${c.apellido}`); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-slate-50 last:border-0">
                        {c.nombre} {c.apellido} <span className="text-slate-400">({c.identidad})</span>
                      </button>
                    ))}
                    {clientesFiltrados.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([['nombre_medico', 'Nombre Médico'], ['numero_colegiado', 'N° Colegiado'], ['especialidad', 'Especialidad'], ['telefono_medico', 'Teléfono Médico'], ['clinica_hospital', 'Clínica/Hospital']] as const).map(([field, label]) => (
                  <div key={field}>
                    <label className="text-xs font-semibold text-slate-600">{label}</label>
                    <input value={(form as any)[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-semibold text-slate-600">Fecha Emisión</label>
                  <input type="date" value={form.fecha_emision} onChange={e => setForm(p => ({ ...p, fecha_emision: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Tipo de Receta</label>
                <div className="flex gap-4 mt-1">
                  {(['Normal', 'Cronica', 'Controlada'] as const).map(t => (
                    <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="tipo" value={t} checked={form.tipo_receta === t} onChange={() => setForm(p => ({ ...p, tipo_receta: t }))} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Diagnóstico</label>
                <textarea value={form.diagnostico} onChange={e => setForm(p => ({ ...p, diagnostico: e.target.value }))}
                  rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Imagen de la Receta</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
                <button onClick={() => fileRef.current?.click()} className="mt-1 border border-dashed border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 w-full">
                  Seleccionar imagen
                </button>
                {imgPreview && <img src={imgPreview} alt="preview" className="mt-2 rounded-xl max-h-32 object-contain border w-full" />}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Medicamentos</label>
                <div className="flex gap-2 mt-1">
                  <input value={medSearch} onChange={e => setMedSearch(e.target.value)} placeholder="Buscar medicamento..." className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  <button onClick={addMed} className={btn}><Plus size={15} /></button>
                </div>
                {detalles.length > 0 && (
                  <table className="w-full text-sm mt-2">
                    <thead><tr className="text-slate-400 text-xs border-b">{['Medicamento', 'Cantidad', 'Dosis', ''].map(h => <th key={h} className="py-1 text-left">{h}</th>)}</tr></thead>
                    <tbody>
                      {detalles.map((d, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-1 text-xs">{d.nombre}</td>
                          <td className="py-1"><input type="number" min={1} value={d.cantidad_prescrita}
                            onChange={e => setDetalles(p => p.map((x, j) => j === i ? { ...x, cantidad_prescrita: +e.target.value } : x))}
                            className="w-16 border border-slate-200 rounded px-2 py-0.5 text-xs" /></td>
                          <td className="py-1"><input value={d.dosis_prescrita}
                            onChange={e => setDetalles(p => p.map((x, j) => j === i ? { ...x, dosis_prescrita: e.target.value } : x))}
                            placeholder="ej: 1 cada 8h" className="border border-slate-200 rounded px-2 py-0.5 text-xs w-28" /></td>
                          <td className="py-1"><button onClick={() => setDetalles(p => p.filter((_, j) => j !== i))}><X size={13} className="text-red-400" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowModal(false)} className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
                <button onClick={handleSave} className={btn}>Guardar Receta</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dispensarModal.open && dispensarModal.item && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Dispensar Medicamento</h2>
              <button onClick={() => setDispensarModal({ open: false, item: null })}><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-600">
              <b>{dispensarModal.item.nombreGenerico || dispensarModal.item.nombre_prescrito}</b><br />
              Prescrito: {dispensarModal.item.cantidad_prescrita} | Dispensado: {dispensarModal.item.cantidad_dispensada} | Pendiente: {Math.max(0, dispensarModal.item.cantidad_prescrita - dispensarModal.item.cantidad_dispensada)}
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-600">Cantidad a Dispensar</label>
              <input type="number" min={1} max={dispensarModal.item.cantidad_prescrita - dispensarModal.item.cantidad_dispensada}
                value={cantDispensar} onChange={e => setCantDispensar(+e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDispensarModal({ open: false, item: null })} className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDispensar} className={btn}><CheckCircle size={15} className="inline mr-1" />Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
