
import React, { useState, useEffect } from 'react';
import { CashService, SalesService, PackagesService, ConfigService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete, EmpresaConfig } from '../types';
import { 
  Lock, PlusCircle, Smartphone, ArrowDownCircle, ArrowUpCircle, Wallet, Edit2, Trash2, X, CloudLightning, FileText, Printer, CheckCircle, RefreshCw, AlertTriangle
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

type TabType = 'INGRESOS' | 'EGRESO' | 'RECARGAS' | 'FACTURAS';

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
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
  
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ id: '', descripcion: '', monto: '' });

  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ red: 'TIGO', montoPagado: '' });

  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);
  const [recargaForm, setRecargaForm] = useState({ monto: '', paqueteId: '' });

  const getLocalDate = () => new Date().toISOString().split('T')[0];
  const getFullTimestamp = () => new Date().toLocaleString('en-US', {hour12:false});

  useEffect(() => { if (user) { loadData(); loadCatalogos(); } }, [user]);

  const loadCatalogos = async () => {
      try {
        const [paqs] = await Promise.all([PackagesService.getAll()]);
        setPaquetes(paqs || []);
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

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial', 'error');
     try {
       await CashService.openCaja({ montoInicial: Number(openForm.monto), saldoTigoInicial: Number(openForm.tigo || 0), saldoClaroInicial: Number(openForm.claro || 0), fechaLocal: getLocalDate() });
       loadData();
     } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const res = await Swal.fire({ title: '¿Finalizar Turno?', text: 'Se cerrará la caja actual.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Cerrar', confirmButtonColor: '#ef4444' });
     if(res.isConfirmed) {
       try {
         await CashService.closeCaja(arqueo.idArqueo);
         loadData();
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const handleIngresoAction = async () => {
     if (ingresoForm.irAPos) {
         navigate('/pos', { state: { customItem: { descripcion: ingresoForm.descripcion, precio: Number(ingresoForm.monto) } } });
         return;
     }
     try {
         await CashService.createIngreso({ descripcion: ingresoForm.descripcion, monto: Number(ingresoForm.monto), costo: Number(ingresoForm.costo), fechaCreacion: getFullTimestamp() });
         setShowIngresoModal(false); loadData();
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEgresoAction = async () => {
     try {
         await CashService.createEgreso({ descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto), fechaCreacion: getFullTimestamp() });
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
      } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleDeleteItem = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      const res = await Swal.fire({ title: '¿Eliminar registro?', text: "Se ajustará el balance.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar' });
      if (res.isConfirmed) {
          try {
              if (type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              loadData();
          } catch (e:any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center text-slate-400"><RefreshCw className="animate-spin mr-2"/> Cargando Caja...</div>;

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
    <div className="space-y-6 pb-20">
      <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-10 opacity-5"><CloudLightning size={200}/></div>
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
             <div>
                <div className="flex items-center gap-3 mb-2">
                    <span className="bg-indigo-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">ACTIVA</span>
                    <h2 className="text-2xl font-black uppercase tracking-widest">{user?.idCaja}</h2>
                </div>
                <p className="text-slate-400 font-medium">{user?.nombreEmpleado}</p>
             </div>
             <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-3 shadow-xl border border-red-500/50 transition-all active:scale-95">
                <Lock size={20}/> FINALIZAR TURNO
             </button>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 relative z-10">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Efectivo Actual</p>
                  <h3 className="text-3xl font-black">L. {(Number(arqueo.montoInicial) + ingresos.reduce((a,b)=>a+Number(b.monto),0) - egresos.reduce((a,b)=>a+Number(b.monto),0)).toLocaleString()}</h3>
              </div>
              <div className="bg-emerald-500/10 p-6 rounded-3xl border border-emerald-500/20">
                  <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-2">Entradas</p>
                  <h3 className="text-3xl font-black text-emerald-400">L. {ingresos.reduce((a,b)=>a+Number(b.monto),0).toLocaleString()}</h3>
              </div>
              <div className="bg-red-500/10 p-6 rounded-3xl border border-red-500/20">
                  <p className="text-[10px] text-red-300 font-black uppercase tracking-widest mb-2">Salidas</p>
                  <h3 className="text-3xl font-black text-red-200">L. {egresos.reduce((a,b)=>a+Number(b.monto),0).toLocaleString()}</h3>
              </div>
              <div className="bg-indigo-500/10 p-6 rounded-3xl border border-indigo-500/20">
                  <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mb-2">Ventas POS</p>
                  <h3 className="text-3xl font-black text-indigo-200">{ventas.length}</h3>
              </div>
         </div>
      </div>

      <div className="flex gap-4 overflow-x-auto no-scrollbar border-b border-slate-200 px-4">
         {[{ id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={20}/> }, { id: 'EGRESO', label: 'Egresos', icon: <ArrowDownCircle size={20}/> }, { id: 'RECARGAS', label: 'Recargas', icon: <Smartphone size={20}/> }, { id: 'FACTURAS', label: 'Facturas', icon: <FileText size={20}/> }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-8 py-5 font-black text-xs whitespace-nowrap transition-all border-b-[6px] flex items-center gap-3 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab.icon} {tab.label.toUpperCase()}
            </button>
         ))}
      </div>

      <div className="px-4">
      <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 p-8 min-h-[600px] animate-fade-in">
         {activeTab === 'INGRESOS' && (
           <div className="space-y-6">
              <div className="flex justify-between items-center bg-emerald-50 p-8 rounded-3xl border border-emerald-100">
                 <div><h3 className="font-black text-emerald-800 text-lg uppercase tracking-tight">Entradas Manuales</h3><p className="text-sm text-emerald-600 opacity-80 font-medium">Servicios técnicos o abonos manuales.</p></div>
                 <button onClick={() => { setIngresoForm({id:'', descripcion:'', monto:'', costo:'', irAPos:true}); setShowIngresoModal(true); }} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl hover:bg-emerald-700 shadow-xl flex items-center gap-3 font-black text-sm transition-all active:scale-95"><PlusCircle size={20}/> NUEVO INGRESO</button>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[11px] tracking-widest border-b"><tr><th className="p-5">Descripción</th><th className="p-5">Monto</th><th className="p-5 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {ingresos.length === 0 ? <tr><td colSpan={3} className="p-20 text-center text-slate-400 italic font-medium">No hay ingresos registrados hoy.</td></tr> : ingresos.map(i => (
                        <tr key={i.idIngreso} className="hover:bg-slate-50 transition-colors group"><td className="p-5 font-bold text-slate-700">{i.descripcion}</td><td className="p-5 font-black text-emerald-600 text-lg">L. {Number(i.monto).toFixed(2)}</td><td className="p-5 text-right"><button onClick={() => handleDeleteItem(i.idIngreso, 'INGRESO')} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={20}/></button></td></tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}

         {activeTab === 'EGRESO' && (
           <div className="space-y-6">
              <div className="flex justify-between items-center bg-red-50 p-8 rounded-3xl border border-red-100">
                 <div><h3 className="font-black text-red-800 text-lg uppercase tracking-tight">Salidas de Efectivo</h3><p className="text-sm text-red-600 opacity-80 font-medium">Pagos de servicios o gastos operativos.</p></div>
                 <button onClick={() => { setEgresoForm({id:'', descripcion:'', monto:''}); setShowEgresoModal(true); }} className="bg-red-600 text-white px-8 py-4 rounded-2xl hover:bg-red-700 shadow-xl flex items-center gap-3 font-black text-sm transition-all active:scale-95"><PlusCircle size={20}/> NUEVO EGRESO</button>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[11px] tracking-widest border-b"><tr><th className="p-5">Descripción</th><th className="p-5">Monto</th><th className="p-5 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {egresos.length === 0 ? <tr><td colSpan={3} className="p-20 text-center text-slate-400 italic font-medium">No hay egresos registrados hoy.</td></tr> : egresos.map(e => (
                        <tr key={e.idegresos} className="hover:bg-slate-50 transition-colors group"><td className="p-5 font-bold text-slate-700">{e.descripcion}</td><td className="p-5 font-black text-red-600 text-lg">L. {Number(e.monto).toFixed(2)}</td><td className="p-5 text-right"><button onClick={() => handleDeleteItem(e.idegresos, 'EGRESO')} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={20}/></button></td></tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}

         {activeTab === 'RECARGAS' && (
             <div className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {['TIGO', 'CLARO'].map(red => {
                        const sld = saldos.find(s => s.red === red);
                        return (
                           <div key={red} className={`rounded-[40px] border shadow-2xl overflow-hidden flex flex-col transition-all hover:scale-[1.02] ${red === 'TIGO' ? 'border-blue-100 shadow-blue-900/10' : 'border-red-100 shadow-red-900/10'}`}>
                             <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} text-white p-8 flex justify-between items-center`}>
                                <div><h3 className="font-black text-2xl uppercase tracking-tighter">{red}</h3><p className="text-[11px] font-black opacity-60 tracking-widest uppercase">RECARGAS</p></div>
                                <div className="text-right"><p className="text-[11px] opacity-70 uppercase tracking-widest font-black">Disponible</p><p className="text-4xl font-black">L. {(sld?.saldoFinal || 0).toLocaleString()}</p></div>
                             </div>
                             <div className="p-8 grid grid-cols-1 gap-6 bg-white flex-1">
                                 <div className="flex gap-4">
                                     <button onClick={() => setShowRecargaModal({ red: red as any, tipo: 'RECARGA' })} className={`flex-1 py-6 font-black rounded-3xl border-4 transition-all flex flex-col items-center gap-2 ${red === 'TIGO' ? 'border-blue-50 text-blue-600 hover:bg-blue-50' : 'border-red-50 text-red-600 hover:bg-red-50'}`}><Smartphone size={32}/><span className="text-xs uppercase tracking-widest">RECARGA</span></button>
                                     <button onClick={() => setShowRecargaModal({ red: red as any, tipo: 'PAQUETE' })} className={`flex-1 py-6 font-black rounded-3xl border-4 transition-all flex flex-col items-center gap-2 ${red === 'TIGO' ? 'border-blue-50 text-blue-600 hover:bg-blue-50' : 'border-red-50 text-red-600 hover:bg-red-50'}`}><PlusCircle size={32}/><span className="text-xs uppercase tracking-widest">PACKS</span></button>
                                 </div>
                                 <button onClick={() => { setSaldoForm({red: red as any, montoPagado: ''}); setShowSaldoModal(true); }} className="w-full py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-500 hover:bg-slate-100 flex items-center justify-center gap-3 text-xs tracking-widest uppercase"><Wallet size={20}/> COMPRAR SALDO</button>
                             </div>
                           </div>
                        );
                    })}
                </div>
             </div>
         )}

         {activeTab === 'FACTURAS' && (
           <div className="space-y-6">
              <div className="flex justify-between items-center bg-indigo-50 p-8 rounded-3xl border border-indigo-100">
                 <div><h3 className="font-black text-indigo-800 text-lg uppercase tracking-tight">Historial POS</h3><p className="text-sm text-indigo-600 opacity-80 font-medium">Facturas emitidas hoy.</p></div>
                 <button onClick={() => navigate('/pos')} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl hover:bg-indigo-700 shadow-xl flex items-center gap-3 font-black text-sm transition-all active:scale-95"><PlusCircle size={20}/> NUEVA VENTA</button>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[11px] tracking-widest border-b"><tr><th className="p-5">Factura</th><th className="p-5">Cliente</th><th className="p-5">Monto</th><th className="p-5 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {ventas.length === 0 ? <tr><td colSpan={4} className="p-20 text-center text-slate-400 italic font-medium">No hay ventas registradas hoy.</td></tr> : ventas.map(v => (
                        <tr key={v.codVenta} className={`hover:bg-slate-50 transition-colors ${v.estado === 'Anulada' ? 'opacity-40' : ''}`}>
                            <td className="p-5"><p className="font-black text-slate-800 text-sm">{v.codVenta}</p><p className="text-[10px] font-mono text-slate-400">{new Date(v.fecha).toLocaleTimeString()}</p></td>
                            <td className="p-5 font-bold text-slate-600 text-sm">{v.nombreCliente}</td>
                            <td className="p-5 font-black text-indigo-600 text-lg">L. {Number(v.total).toLocaleString()}</td>
                            <td className="p-5 text-right"><button className="p-3 text-slate-400 hover:text-indigo-600 transition-all"><Printer size={20}/></button></td>
                        </tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}
      </div>
      </div>

      {/* MODALS (Restaurados tal cual estaban) */}
      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl animate-fade-in border border-slate-100">
               <div className="flex justify-between items-center mb-8"><h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">Entrada Efectivo</h3><button onClick={() => setShowIngresoModal(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors"><X size={24}/></button></div>
               <div className="space-y-6">
                  <div><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Descripción</label><input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 font-bold" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion: e.target.value})} placeholder="Ej: Servicio Técnico..." /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-2 block">Monto (L.)</label><input type="number" className="w-full p-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl outline-none font-black text-emerald-700 text-xl" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto: e.target.value})} /></div>
                    <div><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Costo (L.)</label><input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo: e.target.value})} /></div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl border-2 border-indigo-100 cursor-pointer" onClick={() => setIngresoForm({...ingresoForm, irAPos: !ingresoForm.irAPos})}>
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${ingresoForm.irAPos ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>{ingresoForm.irAPos && <CheckCircle size={16} className="text-white"/>}</div>
                      <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">Generar Factura SAR</span>
                  </div>
               </div>
               <button onClick={handleIngresoAction} className="w-full mt-10 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-sm transition-all active:scale-95">GUARDAR REGISTRO</button>
            </div>
         </div>
      )}

      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl animate-fade-in border border-slate-100">
               <div className="flex justify-between items-center mb-8"><h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">Salida Efectivo</h3><button onClick={() => setShowEgresoModal(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors"><X size={24}/></button></div>
               <div className="space-y-6">
                  <div><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Descripción</label><input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-red-500 font-bold" value={egresoForm.descripcion} onChange={e => setEgresoForm({...egresoForm, descripcion: e.target.value})} placeholder="Ej: Pago de Luz..." /></div>
                  <div><label className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-2 block">Monto (L.)</label><input type="number" className="w-full p-4 bg-red-50 border-2 border-red-100 rounded-2xl outline-none font-black text-red-600 text-3xl text-center" value={egresoForm.monto} onChange={e => setEgresoForm({...egresoForm, monto: e.target.value})} /></div>
               </div>
               <button onClick={handleEgresoAction} className="w-full mt-10 py-5 bg-red-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-sm transition-all active:scale-95">REGISTRAR SALIDA</button>
            </div>
         </div>
      )}

      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl animate-fade-in border border-slate-100">
               <div className="flex justify-between items-center mb-8"><h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">{showRecargaModal.tipo === 'RECARGA' ? `Recarga ${showRecargaModal.red}` : `Paquete ${showRecargaModal.red}`}</h3><button onClick={() => setShowRecargaModal(null)} className="p-3 hover:bg-slate-100 rounded-full"><X size={24}/></button></div>
               <div className="space-y-6">
                  {showRecargaModal.tipo === 'RECARGA' ? (
                      <div><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 block text-center">Monto Recarga L.</label><input type="number" className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl outline-none text-5xl font-black text-center" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto: e.target.value})} placeholder="0" autoFocus /></div>
                  ) : (
                      <div><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Seleccione el Paquete</label><select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black text-sm" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}><option value="">-- SELECCIONAR --</option>{paquetes.filter(p => p.red === showRecargaModal.red).map(p => (<option key={p.idPaquete} value={p.idPaquete}>{p.nombre} - L. {p.precio}</option>))}</select></div>
                  )}
               </div>
               <button onClick={handleRecargaAction} className={`w-full mt-10 py-6 text-white font-black rounded-3xl shadow-xl uppercase tracking-widest text-sm transition-all active:scale-95 ${showRecargaModal.red === 'TIGO' ? 'bg-blue-600 shadow-blue-600/20' : 'bg-red-600 shadow-red-600/20'}`}>PROCESAR VENTA</button>
            </div>
         </div>
      )}

      {showSaldoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border border-slate-100">
               <div className="flex justify-between items-center mb-8"><h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">Compra Saldo {saldoForm.red}</h3><button onClick={() => setShowSaldoModal(false)}><X size={24}/></button></div>
               <div className="space-y-6">
                  <div className="bg-amber-50 p-6 rounded-2xl border-2 border-amber-100 text-amber-800 text-[10px] font-black tracking-widest flex gap-4 uppercase leading-relaxed"><AlertTriangle size={24} className="shrink-0"/> ESTO GENERARÁ UN EGRESO AUTOMÁTICO DE CAJA.</div>
                  <div><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 block text-center">Monto Pagado L.</label><input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none font-black text-3xl text-center" value={saldoForm.montoPagado} onChange={e => setSaldoForm({...saldoForm, montoPagado: e.target.value})} placeholder="0.00" autoFocus /></div>
               </div>
               <button onClick={handleBuySaldo} className="w-full mt-10 py-6 bg-slate-800 text-white font-black rounded-3xl shadow-2xl uppercase tracking-widest text-sm transition-all active:scale-95">CONFIRMAR COMPRA</button>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
