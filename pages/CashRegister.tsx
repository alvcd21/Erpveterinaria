
import React, { useState, useEffect } from 'react';
import { CashService, SalesService, PackagesService, ConfigService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete, EmpresaConfig } from '../types';
import { 
  Lock, PlusCircle, Smartphone, ArrowDownCircle, ArrowUpCircle, Wallet, Edit2, Trash2, X, CloudLightning, FileText, Printer, CheckCircle, RefreshCw, AlertTriangle
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'INGRESOS' | 'EGRESO' | 'VENTAS' | 'RECARGAS';

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);

  const [existingBalances, setExistingBalances] = useState({ tigo: false, claro: false });
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  
  const { user } = useAuth();
  const navigate = useNavigate();

  // Modals
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [ingresoForm, setIngresoForm] = useState({ id: '', descripcion: '', monto: '', costo: '', irAPos: true });
  const [isEditingIngreso, setIsEditingIngreso] = useState(false);
  
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ id: '', descripcion: '', monto: '' });
  const [isEditingEgreso, setIsEditingEgreso] = useState(false);

  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ red: 'TIGO', montoPagado: '' });

  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);
  const [recargaForm, setRecargaForm] = useState({ monto: '', paqueteId: '' });

  const getLocalDate = () => new Date().toISOString().split('T')[0];
  const getFullLocalTimestamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  useEffect(() => { if (user) { loadData(); loadCatalogos(); } }, [user]);

  const loadCatalogos = async () => {
      try {
        const [paqs, cfg] = await Promise.all([PackagesService.getAll(), ConfigService.get()]);
        setPaquetes(paqs || []);
        setCompanyConfig(cfg);
      } catch(e) { console.error(e); }
  };

  const loadData = async () => {
    if (!user?.idCaja) return; 
    setIsLoading(true);
    try {
      const active = await CashService.getActiveArqueo();
      const localDate = getLocalDate();
      if (!active) {
        setArqueo(null);
        const status = await CashService.getSaldosStatus(localDate);
        setExistingBalances(status);
      } else {
        setArqueo(active);
        const [ing, egr, vts, slds] = await Promise.all([
           CashService.getIngresos(user.idCaja, localDate),
           CashService.getEgresos(user.idCaja, localDate),
           SalesService.getVentasDiarias(localDate),
           CashService.getSaldosToday(localDate)
        ]);
        setIngresos(ing || []);
        setEgresos(egr || []);
        setVentas(vts || []);
        setSaldos(slds || []);
      }
    } catch (error) { console.error(error); }
    finally { setIsLoading(false); }
  };

  const handleDeleteItem = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      const result = await Swal.fire({
          title: '¿Eliminar registro?',
          text: "Esta acción afectará el balance de caja.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Sí, eliminar'
      });

      if (result.isConfirmed) {
          try {
              if (type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              loadData();
          } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
      }
  };

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial', 'error');
     try {
       await CashService.openCaja({ montoInicial: Number(openForm.monto), saldoTigoInicial: Number(openForm.tigo || 0), saldoClaroInicial: Number(openForm.claro || 0), fechaLocal: getLocalDate() });
       loadData();
     } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const res = await Swal.fire({ title: '¿Cerrar Caja?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Cerrar', confirmButtonColor: '#ef4444' });
     if(res.isConfirmed) {
       try {
         await CashService.closeCaja(arqueo.idArqueo);
         loadData();
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const handleIngresoAction = async () => {
     if (ingresoForm.irAPos && !isEditingIngreso) {
         navigate('/pos', { state: { customItem: { descripcion: ingresoForm.descripcion, precio: Number(ingresoForm.monto) } } });
         return;
     }
     try {
         if (isEditingIngreso) await CashService.updateIngreso(ingresoForm.id, { descripcion: ingresoForm.descripcion, monto: Number(ingresoForm.monto), costo: Number(ingresoForm.costo) });
         else await CashService.createIngreso({ descripcion: ingresoForm.descripcion, monto: Number(ingresoForm.monto), costo: Number(ingresoForm.costo), fechaCreacion: getFullLocalTimestamp() });
         setShowIngresoModal(false); loadData();
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEgresoAction = async () => {
     try {
         if (isEditingEgreso) await CashService.updateEgreso(egresoForm.id, { descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto) });
         else await CashService.createEgreso({ descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto), fechaCreacion: getFullLocalTimestamp() });
         setShowEgresoModal(false); loadData();
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleBuySaldo = async () => {
      try {
          await CashService.buySaldo({ red: saldoForm.red, monto: Number(saldoForm.montoPagado) });
          setShowSaldoModal(false); loadData();
      } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleRecargaAction = async () => {
      if(!showRecargaModal) return;
      try {
          let desc = '', mnt = 0, cst = 0;
          if (showRecargaModal.tipo === 'RECARGA') {
              mnt = Number(recargaForm.monto);
              cst = mnt * 0.95;
              desc = `RECARGA ${showRecargaModal.red} L. ${mnt}`;
          } else {
              const paq = paquetes.find(p => p.idPaquete === recargaForm.paqueteId);
              if (!paq) return;
              mnt = Number(paq.precio); cst = Number(paq.costo);
              desc = `PAQUETE ${paq.nombre} (${showRecargaModal.red})`;
          }
          await CashService.createRecarga({ red: showRecargaModal.red, monto: mnt, costo: cst, descripcion: desc });
          setShowRecargaModal(null); setRecargaForm({monto:'', paqueteId:''}); loadData();
          Swal.fire({ icon: 'success', title: 'Operación Exitosa', toast: true, position: 'top-end', timer: 2000 });
      } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleAnularVenta = async (id: string) => {
      const res = await Swal.fire({ title: '¿Anular Venta?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Anular' });
      if(res.isConfirmed) {
          try {
              await SalesService.anularVenta(id);
              loadData();
          } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
      }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center text-slate-400"><RefreshCw className="animate-spin mr-2"/> Cargando...</div>;

  if (!arqueo) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6">
              <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl p-8 border border-slate-100">
                  <div className="flex flex-col items-center mb-8">
                      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg mb-4"><CloudLightning className="text-white" size={32} /></div>
                      <h2 className="text-3xl font-bold text-slate-800 text-center">Apertura de Turno</h2>
                  </div>
                  <div className="space-y-6">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block">Efectivo Inicial L.</label>
                          <input type="number" className="w-full p-4 text-3xl font-black text-center border-2 border-slate-200 rounded-2xl outline-none focus:border-indigo-500" value={openForm.monto} onChange={e => setOpenForm({...openForm, monto: e.target.value})} autoFocus placeholder="0.00"/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="text-[10px] font-black text-blue-500 uppercase ml-1">Saldo Tigo</label><input type="number" className="w-full p-3 border-2 border-blue-100 bg-blue-50/30 rounded-xl font-bold" value={openForm.tigo} onChange={e => setOpenForm({...openForm, tigo: e.target.value})} placeholder="L. 0.00" disabled={existingBalances.tigo}/></div>
                          <div><label className="text-[10px] font-black text-red-500 uppercase ml-1">Saldo Claro</label><input type="number" className="w-full p-3 border-2 border-red-100 bg-red-50/30 rounded-xl font-bold" value={openForm.claro} onChange={e => setOpenForm({...openForm, claro: e.target.value})} placeholder="L. 0.00" disabled={existingBalances.claro}/></div>
                      </div>
                      <button onClick={handleOpenBox} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-lg transition-all active:scale-95"><Lock size={22}/> ABRIR CAJA</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 flex flex-col pb-10">
      <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-8 opacity-10"><CloudLightning size={150}/></div>
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
             <div><div className="flex items-center gap-2 mb-1"><span className="bg-indigo-500 px-2 py-0.5 rounded text-[10px] font-black uppercase">ACTIVA</span><h2 className="text-xl font-black uppercase tracking-wider">{user?.idCaja}</h2></div><p className="text-slate-400 text-sm">{user?.nombreEmpleado}</p></div>
             <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-5 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg border border-red-500/50 transition-all active:scale-95"><Lock size={18}/> FINALIZAR TURNO</button>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 relative z-10">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm"><p className="text-[10px] text-slate-400 font-black uppercase">Efectivo Actual</p><h3 className="text-2xl font-black mt-1">L. {(Number(arqueo.montoInicial) + ingresos.reduce((a,b)=>a+Number(b.monto),0) - egresos.reduce((a,b)=>a+Number(b.monto),0)).toLocaleString()}</h3></div>
              <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20"><p className="text-[10px] text-emerald-400 font-black uppercase">Entradas</p><h3 className="text-2xl font-black text-emerald-400 mt-1">L. {ingresos.reduce((a,b)=>a+Number(b.monto),0).toLocaleString()}</h3></div>
              <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20"><p className="text-[10px] text-red-300 font-black uppercase">Salidas</p><h3 className="text-2xl font-black text-red-200 mt-1">L. {egresos.reduce((a,b)=>a+Number(b.monto),0).toLocaleString()}</h3></div>
              <div className="bg-indigo-500/10 p-4 rounded-2xl border border-indigo-500/20"><p className="text-[10px] text-indigo-300 font-black uppercase">Ventas POS</p><h3 className="text-2xl font-black text-indigo-200 mt-1">{ventas.length}</h3></div>
         </div>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
         {[{ id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={18}/> }, { id: 'EGRESO', label: 'Egresos', icon: <ArrowDownCircle size={18}/> }, { id: 'RECARGAS', label: 'Recargas', icon: <Smartphone size={18}/> }, { id: 'VENTAS', label: 'Facturas', icon: <FileText size={18}/> }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-4 font-black text-xs whitespace-nowrap transition-all border-b-4 flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.icon} {tab.label.toUpperCase()}</button>
         ))}
      </div>

      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
         {activeTab === 'INGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                 <div><h3 className="font-black text-emerald-800 text-sm uppercase">Entradas Manuales</h3><p className="text-xs text-emerald-600">Servicios técnicos o abonos manuales.</p></div>
                 <button onClick={() => { setIsEditingIngreso(false); setIngresoForm({id:'', descripcion:'', monto:'', costo:'', irAPos:true}); setShowIngresoModal(true); }} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-700 shadow-lg flex items-center gap-2 font-black text-xs transition-all active:scale-95"><PlusCircle size={18}/> NUEVO INGRESO</button>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[10px]"><tr><th className="p-4">Descripción</th><th className="p-4">Monto</th><th className="p-4 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {ingresos.length === 0 ? <tr><td colSpan={3} className="p-12 text-center text-slate-400 italic">No hay ingresos registrados hoy.</td></tr> : ingresos.map(i => (
                        <tr key={i.idIngreso} className="hover:bg-slate-50 transition-colors group"><td className="p-4 font-bold text-slate-700">{i.descripcion}</td><td className="p-4 font-black text-emerald-600">L. {Number(i.monto).toFixed(2)}</td><td className="p-4 text-right flex justify-end gap-2"><button onClick={() => { setIngresoForm({id:i.idIngreso, descripcion:i.descripcion, monto:String(i.monto), costo:String(i.costo), irAPos:false}); setIsEditingIngreso(true); setShowIngresoModal(true); }} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button><button onClick={() => handleDeleteItem(i.idIngreso, 'INGRESO')} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button></td></tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}

         {activeTab === 'EGRESO' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-red-50 p-5 rounded-2xl border border-red-100">
                 <div><h3 className="font-black text-red-800 text-sm uppercase">Salidas de Efectivo</h3><p className="text-xs text-red-600">Pagos de servicios o gastos operativos.</p></div>
                 <button onClick={() => { setIsEditingEgreso(false); setEgresoForm({id:'', descripcion:'', monto:''}); setShowEgresoModal(true); }} className="bg-red-600 text-white px-5 py-2.5 rounded-xl hover:bg-red-700 shadow-lg flex items-center gap-2 font-black text-xs transition-all active:scale-95"><PlusCircle size={18}/> NUEVO EGRESO</button>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[10px]"><tr><th className="p-4">Descripción</th><th className="p-4">Monto</th><th className="p-4 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {egresos.length === 0 ? <tr><td colSpan={3} className="p-12 text-center text-slate-400 italic">No hay egresos registrados hoy.</td></tr> : egresos.map(e => (
                        <tr key={e.idegresos} className="hover:bg-slate-50 transition-colors group"><td className="p-4 font-bold text-slate-700">{e.descripcion}</td><td className="p-4 font-black text-red-600">L. {Number(e.monto).toFixed(2)}</td><td className="p-4 text-right flex justify-end gap-2"><button onClick={() => { setEgresoForm({id:e.idegresos, descripcion:e.descripcion, monto:String(e.monto)}); setIsEditingEgreso(true); setShowEgresoModal(true); }} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button><button onClick={() => handleDeleteItem(e.idegresos, 'EGRESO')} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button></td></tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}

         {activeTab === 'RECARGAS' && (
             <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {['TIGO', 'CLARO'].map(red => {
                        const sld = saldos.find(s => s.red === red);
                        return (
                           <div key={red} className={`rounded-3xl border shadow-lg overflow-hidden flex flex-col ${red === 'TIGO' ? 'border-blue-100' : 'border-red-100'}`}>
                             <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} text-white p-5 flex justify-between items-center`}>
                                <div><h3 className="font-black text-lg uppercase">{red}</h3><p className="text-[10px] opacity-70">RECARGAS</p></div>
                                <div className="text-right"><p className="text-[10px] opacity-70 uppercase tracking-widest font-bold">Disponible</p><p className="text-2xl font-black">L. {(sld?.saldoFinal || 0).toLocaleString()}</p></div>
                             </div>
                             <div className="p-6 grid grid-cols-1 gap-4 bg-white flex-1">
                                 <div className="flex gap-2">
                                     <button onClick={() => setShowRecargaModal({ red: red as any, tipo: 'RECARGA' })} className={`flex-1 py-4 font-black rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${red === 'TIGO' ? 'border-blue-50 text-blue-600 hover:bg-blue-50' : 'border-red-50 text-red-600 hover:bg-red-50'}`}><Smartphone size={24}/><span className="text-[10px] uppercase">Recarga</span></button>
                                     <button onClick={() => setShowRecargaModal({ red: red as any, tipo: 'PAQUETE' })} className={`flex-1 py-4 font-black rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${red === 'TIGO' ? 'border-blue-50 text-blue-600 hover:bg-blue-50' : 'border-red-50 text-red-600 hover:bg-red-50'}`}><PlusCircle size={24}/><span className="text-[10px] uppercase">Packs</span></button>
                                 </div>
                                 <button onClick={() => { setSaldoForm({red: red as any, montoPagado: ''}); setShowSaldoModal(true); }} className="w-full py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-500 hover:bg-slate-100 flex items-center justify-center gap-2 text-xs"><Wallet size={16}/> COMPRAR SALDO</button>
                             </div>
                           </div>
                        );
                    })}
                </div>
             </div>
         )}

         {activeTab === 'VENTAS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
                 <div><h3 className="font-black text-indigo-800 text-sm uppercase">Historial POS</h3><p className="text-xs text-indigo-600">Facturas emitidas hoy.</p></div>
                 <button onClick={() => navigate('/pos')} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 shadow-lg flex items-center gap-2 font-black text-xs transition-all active:scale-95"><PlusCircle size={18}/> NUEVA VENTA</button>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[10px]"><tr><th className="p-4">Factura</th><th className="p-4">Cliente</th><th className="p-4">Monto</th><th className="p-4 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {ventas.length === 0 ? <tr><td colSpan={4} className="p-12 text-center text-slate-400 italic">No hay ventas registradas hoy.</td></tr> : ventas.map(v => (
                        <tr key={v.codVenta} className={`hover:bg-slate-50 transition-colors ${v.estado === 'Anulada' ? 'opacity-50' : ''}`}>
                            <td className="p-4"><p className="font-black text-slate-800 text-sm">{v.codVenta}</p><p className="text-[10px] font-mono text-slate-400">{new Date(v.fecha).toLocaleTimeString()}</p></td>
                            <td className="p-4 font-bold text-slate-600 text-sm">{v.nombreCliente}</td>
                            <td className="p-4 font-black text-indigo-600">L. {Number(v.total).toLocaleString()}</td>
                            <td className="p-4 text-right flex justify-end gap-2"><button className="p-2 text-slate-400 hover:text-indigo-600" title="Reimprimir"><Printer size={16}/></button>{v.estado !== 'Anulada' && <button onClick={() => handleAnularVenta(v.codVenta)} className="p-2 text-red-400 hover:text-red-600" title="Anular"><X size={16}/></button>}</td>
                        </tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}
      </div>

      {/* MODAL INGRESO */}
      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in border border-slate-100">
               <div className="flex justify-between items-center mb-6"><h3 className="font-black text-lg text-slate-800 uppercase">{isEditingIngreso ? 'Editar Registro' : 'Entrada Efectivo'}</h3><button onClick={() => setShowIngresoModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button></div>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion: e.target.value})} placeholder="Ej: Reparación Pantalla..." /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-black text-emerald-500 uppercase mb-1 block">Monto (L.)</label><input type="number" className="w-full p-3 bg-emerald-50 border border-emerald-100 rounded-xl outline-none font-black text-emerald-700 text-lg" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto: e.target.value})} /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Costo (L.)</label><input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo: e.target.value})} /></div>
                  </div>
                  {!isEditingIngreso && (<div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100 cursor-pointer" onClick={() => setIngresoForm({...ingresoForm, irAPos: !ingresoForm.irAPos})}><div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${ingresoForm.irAPos ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>{ingresoForm.irAPos && <CheckCircle size={14} className="text-white"/>}</div><span className="text-xs font-bold text-indigo-700">Generar Factura SAR</span></div>)}
               </div>
               <button onClick={handleIngresoAction} className="w-full mt-6 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-sm transition-all active:scale-95">GUARDAR REGISTRO</button>
            </div>
         </div>
      )}

      {/* MODAL EGRESO */}
      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in border border-slate-100">
               <div className="flex justify-between items-center mb-6"><h3 className="font-black text-lg text-slate-800 uppercase">{isEditingEgreso ? 'Editar Registro' : 'Salida Efectivo'}</h3><button onClick={() => setShowEgresoModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button></div>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción / Concepto</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 font-bold" value={egresoForm.descripcion} onChange={e => setEgresoForm({...egresoForm, descripcion: e.target.value})} placeholder="Ej: Pago de Luz..." /></div>
                  <div><label className="text-[10px] font-black text-red-500 uppercase mb-1 block">Monto (L.)</label><input type="number" className="w-full p-3 bg-red-50 border border-red-100 rounded-xl outline-none font-black text-red-600 text-2xl" value={egresoForm.monto} onChange={e => setEgresoForm({...egresoForm, monto: e.target.value})} /></div>
               </div>
               <button onClick={handleEgresoAction} className="w-full mt-6 py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-sm transition-all active:scale-95">REGISTRAR SALIDA</button>
            </div>
         </div>
      )}

      {/* MODAL RECARGA / PAQUETE */}
      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in border border-slate-100">
               <div className="flex justify-between items-center mb-6"><h3 className="font-black text-lg text-slate-800 uppercase">{showRecargaModal.tipo === 'RECARGA' ? `Recarga ${showRecargaModal.red}` : `Paquete ${showRecargaModal.red}`}</h3><button onClick={() => setShowRecargaModal(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button></div>
               <div className="space-y-4">
                  {showRecargaModal.tipo === 'RECARGA' ? (<div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block text-center">Monto Recarga L.</label><input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-3xl font-black text-center" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto: e.target.value})} placeholder="0" autoFocus /></div>) : (<div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Seleccione el Paquete</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}><option value="">-- Seleccionar --</option>{paquetes.filter(p => p.red === showRecargaModal.red).map(p => (<option key={p.idPaquete} value={p.idPaquete}>{p.nombre} - L. {p.precio}</option>))}</select></div>)}
               </div>
               <button onClick={handleRecargaAction} className={`w-full mt-6 py-4 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-sm transition-all active:scale-95 ${showRecargaModal.red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'}`}>PROCESAR VENTA</button>
            </div>
         </div>
      )}

      {/* MODAL COMPRA SALDO */}
      {showSaldoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in border border-slate-100">
               <div className="flex justify-between items-center mb-6"><h3 className="font-black text-lg text-slate-800 uppercase">Compra Saldo {saldoForm.red}</h3><button onClick={() => setShowSaldoModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button></div>
               <div className="space-y-4">
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-800 text-[10px] font-bold flex gap-2"><AlertTriangle size={16} className="shrink-0"/> ESTO GENERARÁ UN EGRESO AUTOMÁTICO PARA EL CUADRE.</div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto Pagado L.</label><input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-black text-2xl text-center" value={saldoForm.montoPagado} onChange={e => setSaldoForm({...saldoForm, montoPagado: e.target.value})} placeholder="0.00" autoFocus /></div>
               </div>
               <button onClick={handleBuySaldo} className="w-full mt-6 py-4 bg-slate-800 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-sm">CONFIRMAR COMPRA</button>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
