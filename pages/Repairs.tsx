
import React, { useState, useEffect, useMemo } from 'react';
import { RepairService, InventoryService, ClientService, ConfigService } from '../services/api';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { downloadRepairOrderPDF } from '../services/DocumentService';
import { Reparacion, Telefono, Cliente } from '../types';
import { 
  Wrench, PlusCircle, Search, Clock, CheckCircle, Package, DollarSign, User, Smartphone, X, Save, RefreshCw, AlertCircle, FileText, Trash2, Edit2, Check, Info, ShoppingCart
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';

const COMPLEMENTOS_OPCIONES = [
    "Cargador", "Cobertor/Case", "Cable USB", "Memoria MicroSD", "Chip/SIM", "Batería", "Lápiz/Stylus"
];


const Repairs: React.FC = () => {
  const { user } = useAuth();
  const [repairs, setRepairs] = useState<Reparacion[]>([]);
  const [phones, setPhones] = useState<Telefono[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [companyConfig, setCompanyConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);

  const [form, setForm] = useState<Partial<Reparacion>>({
      estado_reparacion: 'Pendiente',
      pago_tecnico_estado: 'Pendiente',
      complementos: '',
      marca: '',
      modelo: '',
      identidad_cliente: ''
  });

  const [selectedComplementos, setSelectedComplementos] = useState<string[]>([]);

  useEffect(() => { loadData(); loadDependencies(); }, []);

  const loadDependencies = async () => {
      try {
          const [p, c, cfg] = await Promise.all([
              InventoryService.getTelefonos(),
              ClientService.getAll(),
              ConfigService.get()
          ]);
          setPhones(p || []);
          setClients(c || []);
          setCompanyConfig(cfg);
      } catch (e) { console.error(e); }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await RepairService.getAll();
      setRepairs(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useOfflineSync(loadData);

  const uniqueBrands = useMemo(() => Array.from(new Set(phones.map(p => p.marca))).sort(), [phones]);
  const availableModels = useMemo(() => {
      if (!form.marca) return [];
      return Array.from(new Set(phones.filter(p => p.marca === form.marca).map(p => p.modelo))).sort();
  }, [phones, form.marca]);

  const toggleComplemento = (comp: string) => {
      setSelectedComplementos(prev => 
          prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp]
      );
  };

  const openNew = () => {
      setIsEditing(false);
      setCurrentId(null);
      setSelectedComplementos([]);
      setForm({
          estado_reparacion: 'Pendiente',
          pago_tecnico_estado: 'Pendiente',
          complementos: '',
          marca: '',
          modelo: '',
          identidad_cliente: '',
          descripcion_falla: '',
          imei_equipo: '',
          nombre_tecnico: '',
          costo_tecnico: 0,
          precio_cliente: 0
      });
      setShowModal(true);
  };

  const openEdit = (r: Reparacion) => {
      setIsEditing(true);
      setCurrentId(r.id_reparacion);
      const comps = r.complementos ? r.complementos.split(', ') : [];
      setSelectedComplementos(comps);
      setForm(r);
      setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const payload = { 
            ...form, 
            complementos: selectedComplementos.join(', '),
            marca_modelo: `${form.marca} ${form.modelo}` // Fallback para legacy
        };
        
        if (isEditing && currentId) {
            await RepairService.update(currentId, payload);
            Swal.fire('Actualizado', 'Orden modificada', 'success');
        } else {
            await RepairService.create(payload);
            Swal.fire('Éxito', 'Orden de servicio creada', 'success');
        }
        setShowModal(false);
        loadData();
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleDelete = async (id: number) => {
      const result = await Swal.fire({
          title: '¿Eliminar Reparación?',
          text: 'Se borrará permanentemente el registro.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444'
      });
      if (result.isConfirmed) {
          try {
              await RepairService.delete(id);
              loadData();
              Swal.fire('Eliminado', '', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const updateStatus = async (id: number, currentStatus: string) => {
    const { value: newStatus } = await Swal.fire({
      title: 'Cambiar Estado',
      input: 'select',
      inputOptions: { 'Pendiente': 'Pendiente', 'En Taller': 'En Taller', 'Listo': 'Listo', 'Entregado': 'Entregado' },
      inputValue: currentStatus,
      showCancelButton: true
    });
    if (newStatus) { try { await RepairService.updateStatus(id, newStatus); loadData(); } catch (e: any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const handleBillRepair = async (r: Reparacion) => {
      const result = await Swal.fire({
          title: '¿Facturar Reparación?',
          text: `Se registrará un ingreso de L. ${r.precio_cliente} y el estado cambiará a ENTREGADO.`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, Facturar',
          confirmButtonColor: '#10b981'
      });
      if (result.isConfirmed) {
          try {
              await RepairService.billRepair(r.id_reparacion);
              loadData();
              Swal.fire('Facturado', 'Ingreso registrado y orden entregada.', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const payTechnician = async (id: number) => {
      const result = await Swal.fire({ title: '¿Pagar Técnico?', text: 'Registra egreso de caja.', icon: 'question', showCancelButton: true });
      if (result.isConfirmed) { try { await RepairService.payTechnician(id); loadData(); Swal.fire('Pagado', 'Gasto registrado.', 'success'); } catch (e: any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const filtered = repairs.filter(r => 
      (r.marca_modelo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.marca || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.modelo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.nombre_tecnico || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.imei_equipo || '').includes(searchTerm)
  );

  return (
    <div className="space-y-6 animate-fade-in h-full flex flex-col pb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Wrench className="text-indigo-600"/> Servicio Técnico Especializado</h2>
                <p className="text-slate-500 text-sm">Control integral de reparaciones, garantías y técnicos.</p>
            </div>
            <button onClick={openNew} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95">
                <PlusCircle size={20}/> Nueva Reparación
            </button>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar por equipo, técnico o IMEI..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={loadData} className="w-full md:w-auto p-2.5 text-slate-500 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 shadow-sm transition-all flex items-center justify-center">
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left min-w-[700px]">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase sticky top-0 z-10 tracking-widest border-b">
                        <tr>
                            <th className="p-4">Dispositivo</th>
                            <th className="p-4">Cliente / Técnico</th>
                            <th className="p-4">Progreso</th>
                            <th className="p-4 text-right">Monto</th>
                            <th className="p-4 text-center">Pago Téc.</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={6} className="p-10 text-center text-slate-400 italic">No hay órdenes registradas.</td></tr>
                        ) : filtered.map(r => (
                            <tr key={r.id_reparacion} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-slate-100 p-2.5 rounded-2xl text-slate-500"><Smartphone size={20}/></div>
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{r.marca} {r.modelo}</p>
                                            <p className="text-[10px] font-mono text-slate-400 uppercase">{r.imei_equipo || 'SIN IMEI'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <p className="text-xs font-bold text-slate-600">{r.nombre_cliente || 'Consumidor Final'}</p>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1"><Wrench size={10}/> Téc: {r.nombre_tecnico}</p>
                                </td>
                                <td className="p-4">
                                    <button onClick={() => updateStatus(r.id_reparacion, r.estado_reparacion)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 transition-all hover:scale-105 ${r.estado_reparacion === 'Entregado' ? 'bg-indigo-100 text-indigo-700' : r.estado_reparacion === 'Listo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {r.estado_reparacion === 'Entregado' ? <CheckCircle size={12}/> : <Clock size={12}/>}
                                        {r.estado_reparacion}
                                    </button>
                                </td>
                                <td className="p-4 text-right font-black text-indigo-600 text-sm">L. {Number(r.precio_cliente).toFixed(2)}</td>
                                <td className="p-4 text-center">
                                    {r.pago_tecnico_estado === 'Pagado' ? (
                                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">Pagado</span>
                                    ) : (
                                        <button onClick={() => payTechnician(r.id_reparacion)} className="text-[9px] font-black text-red-600 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-50 transition-all uppercase">Pendiente</button>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-1.5 transition-opacity">
                                        {r.estado_reparacion !== 'Entregado' && (
                                            <button onClick={() => handleBillRepair(r)} className="p-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 active:scale-90 transition-all" title="Cobrar / Facturar"><ShoppingCart size={16}/></button>
                                        )}
                                        <button onClick={() => downloadRepairOrderPDF(r).then(res => { if (!res.success) Swal.fire('Sin plantilla', res.message, 'warning'); })} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Descargar PDF"><FileText size={16}/></button>
                                        <button onClick={() => openEdit(r)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Editar"><Edit2 size={16}/></button>
                                        <button onClick={() => handleDelete(r.id_reparacion)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {showModal && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
                <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col h-[90vh]">
                    <div className="p-5 md:p-6 border-b flex justify-between items-center bg-white">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-600 p-2 rounded-xl text-white"><Wrench size={24}/></div>
                            <div>
                                <h3 className="text-lg md:text-xl font-bold">{isEditing ? 'Actualizar Reparación' : 'Nueva Orden de Servicio'}</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Servicio Técnico SmartCloud</p>
                            </div>
                        </div>
                        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full"><X/></button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-5 md:p-8 space-y-6 overflow-y-auto custom-scrollbar bg-slate-50/30">
                        {/* SECCIÓN CLIENTE */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2"><User size={14}/> Propietario</h4>
                            <select required className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20" value={form.identidad_cliente} onChange={e => setForm({...form, identidad_cliente: e.target.value})}>
                                <option value="">-- Vincular Cliente --</option>
                                {clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido} ({c.identidad})</option>)}
                            </select>
                        </div>

                        {/* SECCIÓN DISPOSITIVO */}
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2"><Smartphone size={14}/> Dispositivo</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Marca</label>
                                    <input required list="brands-repair" className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" value={form.marca || ''} onChange={e => setForm({...form, marca: e.target.value, modelo: ''})} placeholder="Ej: Samsung" />
                                    <datalist id="brands-repair">{uniqueBrands.map(b => <option key={b} value={b}/>)}</datalist>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Modelo</label>
                                    <input required list="models-repair" className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" value={form.modelo || ''} onChange={e => setForm({...form, modelo: e.target.value})} placeholder="Ej: Galaxy S22" disabled={!form.marca} />
                                    <datalist id="models-repair">{availableModels.map(m => <option key={m} value={m}/>)}</datalist>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">IMEI o Serie</label>
                                <input className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500/20" value={form.imei_equipo || ''} onChange={e => setForm({...form, imei_equipo: e.target.value})} placeholder="0000 0000 0000 000" />
                            </div>
                        </div>

                        {/* SECCIÓN FALLA Y COMPLEMENTOS */}
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2"><AlertCircle size={14}/> Detalle de Recepción</h4>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Falla Reportada</label>
                                <textarea required className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" value={form.descripcion_falla || ''} onChange={e => setForm({...form, descripcion_falla: e.target.value})} rows={2} placeholder="Describa el problema..." />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-1">Artículos Adicionales</label>
                                <div className="flex flex-wrap gap-2">
                                    {COMPLEMENTOS_OPCIONES.map(c => (
                                        <button key={c} type="button" onClick={() => toggleComplemento(c)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${selectedComplementos.includes(c) ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                            {selectedComplementos.includes(c) && <Check size={10} className="inline mr-1"/>} {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN COSTOS */}
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                             <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2"><DollarSign size={14}/> Presupuesto y Técnico</h4>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Precio Cliente (L.)</label>
                                    <input type="number" required className="w-full p-3 bg-indigo-50 border-none rounded-2xl font-black text-indigo-700 text-lg outline-none" value={form.precio_cliente || ''} onChange={e => setForm({...form, precio_cliente: Number(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Costo Técnico (L.)</label>
                                    <input type="number" required className="w-full p-3 bg-red-50 border-none rounded-2xl font-black text-red-700 text-lg outline-none" value={form.costo_tecnico || ''} onChange={e => setForm({...form, costo_tecnico: Number(e.target.value)})} />
                                </div>
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Técnico/Taller Asignado</label>
                                <input required className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none" value={form.nombre_tecnico || ''} onChange={e => setForm({...form, nombre_tecnico: e.target.value})} placeholder="Nombre del encargado" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Entrega Estimada</label>
                                    <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold" value={form.fecha_entrega_estimada || ''} onChange={e => setForm({...form, fecha_entrega_estimada: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">Estado Inicial</label>
                                    <select className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none" value={form.estado_reparacion} onChange={e => setForm({...form, estado_reparacion: e.target.value as any})}>
                                        <option value="Pendiente">Pendiente</option>
                                        <option value="En Taller">En Taller</option>
                                        <option value="Listo">Listo</option>
                                        <option value="Entregado">Entregado</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm active:scale-95">
                            <Save size={20}/> {isEditing ? 'GUARDAR CAMBIOS' : 'GENERAR ORDEN'}
                        </button>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default Repairs;
