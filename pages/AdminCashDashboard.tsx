
import React, { useEffect, useState } from 'react';
import { CashService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Saldo } from '../types';
import { Activity, Lock, Unlock, RefreshCw, AlertTriangle, Eye, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, Edit2, Trash2, FileText, Smartphone, Printer } from 'lucide-react';
import Swal from 'sweetalert2';

interface BoxStatus {
    idCaja: string;
    nombreCaja: string;
    idArqueo: string;
    estadoArqueo: string;
    montoInicial: number;
    montoFinal: number;
    ganancia: number;
    fechaApertura: string;
    fechaCierre?: string;
    usuario: string;
    nombreEmpleado: string;
}

const AdminCashDashboard: React.FC = () => {
  const [boxes, setBoxes] = useState<BoxStatus[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedBox, setSelectedBox] = useState<BoxStatus | null>(null);
  const [sessionDetails, setSessionDetails] = useState<{arqueo: Arqueo, ingresos: Ingreso[], egresos: Egreso[]} | null>(null);
  const [activeTab, setActiveTab] = useState<'MOVIMIENTOS' | 'CONFIG'>('MOVIMIENTOS');
  
  const [editForm, setEditForm] = useState({ montoInicial: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await CashService.getAdminBoxesStatus();
      setBoxes(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openManager = async (box: BoxStatus) => {
      if (!box.idArqueo) {
          return Swal.fire('Sin Sesión', 'Esta caja no tiene un arqueo activo.', 'info');
      }
      setSelectedBox(box);
      setEditForm({ montoInicial: String(box.montoInicial || 0) });
      try {
          const details = await CashService.getSessionDetails(box.idArqueo);
          setSessionDetails(details);
      } catch (e) { 
          console.error(e);
          Swal.fire('Error', 'No se pudieron cargar los detalles de auditoría.', 'error');
      }
  };

  const handleUpdateInitial = async () => {
      if(!selectedBox?.idArqueo) return;
      try {
          await CashService.updateInitialAmount(selectedBox.idArqueo, Number(editForm.montoInicial));
          Swal.fire('Actualizado', 'Monto inicial corregido.', 'success');
          loadData();
          openManager({ ...selectedBox, montoInicial: Number(editForm.montoInicial) });
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleReopenBox = async (id: string) => {
      const res = await Swal.fire({ title: '¿Reabrir Caja?', text: 'Se habilitará nuevamente para movimientos.', icon: 'warning', showCancelButton: true });
      if (res.isConfirmed) {
          try {
              await CashService.reopenBox(id);
              Swal.fire('Éxito', 'Caja reabierta.', 'success');
              loadData();
              setSelectedBox(null);
          } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><Activity className="text-indigo-600"/> Panel Administrativo de Cajas</h2>
            <p className="text-slate-500 text-sm">Auditoría de arqueos y corrección de montos.</p>
          </div>
          <button onClick={loadData} className="p-3 text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all"><RefreshCw size={24} className={loading ? "animate-spin" : ""} /></button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {boxes.map((box) => (
              <div key={box.idCaja} className={`bg-white rounded-3xl p-8 shadow-sm border-l-[6px] transition-all hover:shadow-xl ${box.estadoArqueo === 'Activo' ? 'border-l-emerald-500' : 'border-l-slate-300'}`}>
                  <div className="flex justify-between items-start mb-6">
                      <div>
                          <h3 className="font-black text-xl text-slate-800">{box.nombreCaja}</h3>
                          <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">{box.usuario || 'Cerrada'}</p>
                      </div>
                      <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${box.estadoArqueo === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {box.estadoArqueo || 'Inactiva'}
                      </span>
                  </div>

                  <div className="space-y-4 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100 font-bold">
                      <div className="flex justify-between text-xs uppercase tracking-tighter"><span className="text-slate-400">Monto Inicial</span><span className="text-slate-700">L. {Number(box.montoInicial).toLocaleString()}</span></div>
                      <div className="flex justify-between text-xs uppercase tracking-tighter border-t border-slate-200 pt-3"><span className="text-slate-400">Efectivo Actual</span><span className="text-emerald-600 font-black">L. {Number(box.montoFinal).toLocaleString()}</span></div>
                  </div>

                  <button onClick={() => openManager(box)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest"><Eye size={18}/> Gestionar / Auditar</button>
              </div>
          ))}
       </div>

       {/* AUDIT MODAL */}
       {selectedBox && sessionDetails && (
           <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-fade-in border border-slate-100">
                   <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                       <div>
                           <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{selectedBox.nombreCaja} - Auditoría</h2>
                           <p className="text-sm text-slate-500 font-bold">Sesión: {selectedBox.idArqueo} | Cajero: {selectedBox.nombreEmpleado}</p>
                       </div>
                       <button onClick={() => setSelectedBox(null)} className="p-3 hover:bg-white rounded-full transition-all shadow-sm"><X size={28} className="text-slate-400"/></button>
                   </div>

                   <div className="flex-1 flex overflow-hidden">
                       <div className="w-64 bg-slate-50 border-r border-slate-100 p-6 space-y-3">
                           <button onClick={() => setActiveTab('MOVIMIENTOS')} className={`w-full p-4 rounded-2xl font-black text-xs uppercase tracking-widest text-left flex items-center gap-3 transition-all ${activeTab === 'MOVIMIENTOS' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-white'}`}><Activity size={18}/> Movimientos</button>
                           <button onClick={() => setActiveTab('CONFIG')} className={`w-full p-4 rounded-2xl font-black text-xs uppercase tracking-widest text-left flex items-center gap-3 transition-all ${activeTab === 'CONFIG' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-white'}`}><Settings size={18}/> Configuración</button>
                       </div>

                       <div className="flex-1 p-8 overflow-y-auto">
                           {activeTab === 'MOVIMIENTOS' && (
                               <div className="grid grid-cols-1 gap-10">
                                   <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                       <div className="p-5 bg-emerald-50 text-emerald-800 font-black text-xs uppercase tracking-widest">Ingresos y Ventas</div>
                                       <table className="w-full text-sm text-left">
                                           <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 font-black"><tr><th className="p-4">Descripción</th><th className="p-4 text-right">Monto</th></tr></thead>
                                           <tbody className="divide-y divide-slate-100">
                                               {sessionDetails.ingresos.map((ing, i) => (
                                                   <tr key={i}><td className="p-4 font-bold text-slate-600">{ing.descripcion}</td><td className="p-4 text-right font-black text-emerald-600">L. {Number(ing.monto).toLocaleString()}</td></tr>
                                               ))}
                                           </tbody>
                                       </table>
                                   </div>
                                   <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                       <div className="p-5 bg-red-50 text-red-800 font-black text-xs uppercase tracking-widest">Salidas y Gastos</div>
                                       <table className="w-full text-sm text-left">
                                           <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 font-black"><tr><th className="p-4">Descripción</th><th className="p-4 text-right">Monto</th></tr></thead>
                                           <tbody className="divide-y divide-slate-100">
                                               {sessionDetails.egresos.map((egr, i) => (
                                                   <tr key={i}><td className="p-4 font-bold text-slate-600">{egr.descripcion}</td><td className="p-4 text-right font-black text-red-600">L. {Number(egr.monto).toLocaleString()}</td></tr>
                                               ))}
                                           </tbody>
                                       </table>
                                   </div>
                               </div>
                           )}

                           {activeTab === 'CONFIG' && (
                               <div className="max-w-md space-y-10">
                                   <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl">
                                       <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight mb-6">Corregir Monto Inicial</h3>
                                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Monto Inicial L.</label>
                                       <input type="number" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl outline-none focus:border-indigo-500 mb-6" value={editForm.montoInicial} onChange={e=>setEditForm({...editForm, montoInicial:e.target.value})} />
                                       <button onClick={handleUpdateInitial} className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs">Actualizar y Recalcular</button>
                                   </div>

                                   {selectedBox.estadoArqueo === 'Cerrada' && (
                                       <div className="bg-amber-50 p-8 rounded-3xl border-2 border-amber-100">
                                           <h3 className="text-amber-800 font-black text-lg uppercase tracking-tight mb-3">Reabrir Caja Cerrada</h3>
                                           <p className="text-sm text-amber-700 font-medium mb-6 opacity-80">Si se cerró por error, puede habilitarla de nuevo.</p>
                                           <button onClick={() => handleReopenBox(selectedBox.idArqueo)} className="w-full py-5 bg-amber-600 text-white font-black rounded-2xl shadow-xl hover:bg-amber-700 transition-all uppercase tracking-widest text-xs">REABRIR TURNO</button>
                                       </div>
                                   )}
                               </div>
                           )}
                       </div>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};

export default AdminCashDashboard;
