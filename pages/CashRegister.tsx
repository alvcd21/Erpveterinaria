
import React, { useState, useEffect } from 'react';
import { CashService, SalesService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo } from '../types';
import { 
  Lock, PlusCircle, RefreshCw, Smartphone, Trash2, Ban 
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';

// NOTE: PAQUETES can still be constant config or moved to DB if desired, keeping simple for UI
const PAQUETES_TIGO = [
  { id: 'TG-1', nombre: 'SUPER 1 DIA 32LPS', precio: 34 },
  { id: 'TG-2', nombre: 'SUPER 3 DIAS 60LPS', precio: 64 },
  { id: 'TG-3', nombre: 'SUPER 7 DIAS 115LPS', precio: 120 },
];
const PAQUETES_CLARO = [
  { id: 'CL-1', nombre: 'SUPER 1 DIA 15LPS', precio: 18 },
  { id: 'CL-2', nombre: 'SUPER 1 DIA 30LPS', precio: 32 },
];

type TabType = 'INGRESOS' | 'EGRESOS' | 'VENTAS' | 'RECARGAS';

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const { user } = useAuth();

  // Forms
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  const [ingresoForm, setIngresoForm] = useState({ descripcion: '', monto: '', costo: '0' });
  const [egresoForm, setEgresoForm] = useState({ descripcion: '', monto: '' });
  const [showEntryModal, setShowEntryModal] = useState<'INGRESO' | 'EGRESO' | null>(null);

  // Recargas
  const [recargaForm, setRecargaForm] = useState({ tipo: 'RECARGA', monto: '', paqueteId: '' });
  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const active = await CashService.getActiveArqueo();
      if (!active) {
        setArqueo(null);
        setShowOpenModal(true);
      } else {
        setArqueo(active);
        const [ing, egr, vts, slds] = await Promise.all([
           CashService.getIngresos(user?.idCaja || ''),
           CashService.getEgresos(user?.idCaja || ''),
           SalesService.getVentasDiarias(new Date().toISOString().split('T')[0]),
           CashService.getSaldosToday()
        ]);
        setIngresos(ing);
        setEgresos(egr);
        setVentas(vts);
        setSaldos(slds);
        setShowOpenModal(false);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial', 'error');
     try {
       await CashService.openCaja({
         montoInicial: Number(openForm.monto),
         saldoTigoInicial: Number(openForm.tigo || 0),
         saldoClaroInicial: Number(openForm.claro || 0)
       });
       Swal.fire('Éxito', 'Caja Aperturada', 'success');
       loadData();
     } catch (err: any) {
       Swal.fire('Error', err.message, 'error');
     }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const result = await Swal.fire({ title: '¿Cerrar Caja?', text: 'Finalizar turno.', icon: 'warning', showCancelButton: true });
     if(result.isConfirmed) {
       try {
         await CashService.closeCaja(arqueo.idArqueo);
         Swal.fire('Caja Cerrada', 'Turno finalizado', 'success');
         loadData(); 
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const handleSubmitIngreso = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!arqueo) return;
    try {
      await CashService.createIngreso({
        descripcion: ingresoForm.descripcion,
        monto: Number(ingresoForm.monto),
        costo: Number(ingresoForm.costo),
      });
      setShowEntryModal(null);
      setIngresoForm({ descripcion: '', monto: '', costo: '0' });
      loadData();
      Swal.fire('Guardado', 'Ingreso registrado', 'success');
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleSubmitEgreso = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!arqueo) return;
    try {
      await CashService.createEgreso({
        descripcion: egresoForm.descripcion,
        monto: Number(egresoForm.monto),
      });
      setShowEntryModal(null);
      setEgresoForm({ descripcion: '', monto: '' });
      loadData();
      Swal.fire('Guardado', 'Egreso registrado', 'success');
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleRecargaSubmit = async () => {
    if (!arqueo || !showRecargaModal) return;
    
    let montoCobrado = 0;
    let montoPagado = 0; // Costo real (Saldo descontado)
    let desc = '';
    
    if (showRecargaModal.tipo === 'PAQUETE') {
       const pq = (showRecargaModal.red === 'TIGO' ? PAQUETES_TIGO : PAQUETES_CLARO).find(p => p.id === recargaForm.paqueteId);
       if(!pq) return Swal.fire('Error', 'Seleccione paquete', 'error');
       montoCobrado = pq.precio;
       // Assuming profit margin for calculation example, or static cost map
       montoPagado = pq.precio * 0.93; 
       desc = pq.nombre;
    } else {
       if(!recargaForm.monto) return Swal.fire('Error', 'Ingrese monto', 'error');
       montoCobrado = Number(recargaForm.monto);
       montoPagado = montoCobrado; // Direct recharge usually costs same amount of balance
       desc = `RECARGA SALDO ${montoCobrado}`;
    }

    try {
      await CashService.createRecarga({
        red: showRecargaModal.red,
        tipo: showRecargaModal.tipo,
        descripcion: desc,
        precioCobrado: montoCobrado,
        precioPagado: montoPagado
      });
      
      setShowRecargaModal(null);
      setRecargaForm({ tipo: 'RECARGA', monto: '', paqueteId: '' });
      loadData();
      Swal.fire('Éxito', 'Recarga procesada', 'success');
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  // Calculations
  const totalIngresos = ingresos.reduce((a,b) => a + Number(b.monto), 0);
  const totalEgresos = egresos.reduce((a,b) => a + Number(b.monto), 0);
  const totalVentas = ventas.filter(v => v.estado !== 'Anulada').reduce((a,b) => a + Number(b.total), 0);
  const saldoCaja = (arqueo?.montoInicial || 0) + totalIngresos + totalVentas - totalEgresos;

  const getSaldoRed = (red: string) => {
    const s = saldos.find(x => x.red === red);
    // If saldoFinal is null (no transactions yet), assume init. 
    return s ? (s.saldoFinal !== null && s.saldoFinal !== undefined ? Number(s.saldoFinal) : Number(s.saldoInicio)) : 0;
  };

  return (
    <div className="space-y-6 min-h-[80vh] flex flex-col">
      {/* HEADER */}
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div>
               <h2 className="text-xl font-bold uppercase tracking-wider">Caja: {user?.idCaja}</h2>
               <p className="text-slate-400 text-sm">Usuario: {user?.nombreEmpleado}</p>
             </div>
             <div className="flex items-center gap-4">
               {arqueo ? (
                  <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2">
                    <Lock size={16}/> CIERRE DE CAJA
                  </button>
               ) : (
                  <span className="bg-amber-500 px-3 py-1 rounded text-xs font-bold text-black animate-pulse">CAJA CERRADA</span>
               )}
             </div>
         </div>

         {/* STATS */}
         {arqueo && (
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-white/10 p-3 rounded-xl">
                 <p className="text-xs text-slate-400 mb-1">EFECTIVO EN CAJA</p>
                 <h3 className="text-2xl font-bold">L. {saldoCaja.toFixed(2)}</h3>
              </div>
              <div className="bg-white/10 p-3 rounded-xl">
                 <p className="text-xs text-emerald-400 mb-1">VENTAS: {totalVentas.toFixed(1)}</p>
                 <p className="text-xs text-blue-200">INGRESOS: {totalIngresos.toFixed(1)}</p>
              </div>
              <div className="bg-blue-600/30 border border-blue-500/30 p-3 rounded-xl">
                 <p className="text-xs text-blue-200 mb-1 font-bold">SALDO TIGO</p>
                 <h3 className="text-xl font-bold">L. {getSaldoRed('TIGO').toFixed(2)}</h3>
              </div>
              <div className="bg-red-600/30 border border-red-500/30 p-3 rounded-xl">
                 <p className="text-xs text-red-200 mb-1 font-bold">SALDO CLARO</p>
                 <h3 className="text-xl font-bold">L. {getSaldoRed('CLARO').toFixed(2)}</h3>
              </div>
           </div>
         )}
      </div>

      {/* TABS */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
         {['INGRESOS', 'EGRESOS', 'RECARGAS', 'VENTAS'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as TabType)}
              className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 ${activeTab === tab ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {tab}
            </button>
         ))}
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
         
         {activeTab === 'INGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <h3 className="font-bold text-slate-700">Registro Ingresos Varios</h3>
                 <button onClick={() => setShowEntryModal('INGRESO')} className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700"><PlusCircle/></button>
              </div>
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase"><tr><th>Desc</th><th>Monto</th></tr></thead>
                  <tbody>
                    {ingresos.map(i => (
                      <tr key={i.idIngreso} className="border-b"><td className="p-3">{i.descripcion}</td><td className="p-3 font-bold text-emerald-600">{Number(i.monto).toFixed(2)}</td></tr>
                    ))}
                  </tbody>
              </table>
           </div>
         )}

         {activeTab === 'EGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <h3 className="font-bold text-slate-700">Registro Gastos de Caja</h3>
                 <button onClick={() => setShowEntryModal('EGRESO')} className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700"><PlusCircle/></button>
              </div>
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase"><tr><th>Desc</th><th>Monto</th></tr></thead>
                  <tbody>
                    {egresos.map(e => (
                      <tr key={e.idegresos} className="border-b"><td className="p-3">{e.descripcion}</td><td className="p-3 font-bold text-red-600">{Number(e.monto).toFixed(2)}</td></tr>
                    ))}
                  </tbody>
              </table>
           </div>
         )}

         {activeTab === 'RECARGAS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
               {['TIGO', 'CLARO'].map(red => (
                  <div key={red} className={`bg-white rounded-xl border shadow-sm flex flex-col ${red === 'TIGO' ? 'border-blue-100' : 'border-red-100'}`}>
                    <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} text-white p-4 rounded-t-xl flex justify-between items-center`}>
                       <h3 className="font-bold text-lg">{red}</h3>
                    </div>
                    <div className="p-6 flex-1 flex flex-col gap-4">
                        <button 
                          onClick={() => setShowRecargaModal({ red: red as any, tipo: 'RECARGA' })}
                          className={`w-full py-4 bg-slate-50 font-bold rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${red === 'TIGO' ? 'text-blue-700 border-blue-100 hover:bg-blue-600 hover:text-white' : 'text-red-700 border-red-100 hover:bg-red-600 hover:text-white'}`}
                        >
                           <Smartphone/> RECARGA NORMAL
                        </button>
                        <button 
                          onClick={() => setShowRecargaModal({ red: red as any, tipo: 'PAQUETE' })}
                          className={`w-full py-4 bg-slate-50 font-bold rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${red === 'TIGO' ? 'text-blue-700 border-blue-100 hover:bg-blue-600 hover:text-white' : 'text-red-700 border-red-100 hover:bg-red-600 hover:text-white'}`}
                        >
                           <Smartphone/> PAQUETES
                        </button>
                    </div>
                  </div>
               ))}
            </div>
         )}
         
         {activeTab === 'VENTAS' && (
           <div className="space-y-4">
              <h3 className="font-bold text-slate-700">Ventas del Día</h3>
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase"><tr><th>Factura</th><th>Total</th><th>Estado</th></tr></thead>
                  <tbody>
                    {ventas.map(v => (
                      <tr key={v.codVenta} className="border-b"><td className="p-3 font-mono">{v.codVenta}</td><td className="p-3 font-bold">{Number(v.total).toFixed(2)}</td><td className="p-3">{v.estado}</td></tr>
                    ))}
                  </tbody>
              </table>
           </div>
         )}
      </div>

      {/* OPEN BOX MODAL */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-slate-900/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
           <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl animate-fade-in">
              <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Apertura de Caja</h2>
              <div className="space-y-4">
                 <input type="number" className="w-full p-3 border-2 rounded-xl" placeholder="Efectivo Inicial" value={openForm.monto} onChange={e => setOpenForm({...openForm, monto: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <input type="number" className="w-full p-3 border-2 bg-blue-50 rounded-xl" placeholder="Saldo Tigo" value={openForm.tigo} onChange={e => setOpenForm({...openForm, tigo: e.target.value})} />
                    <input type="number" className="w-full p-3 border-2 bg-red-50 rounded-xl" placeholder="Saldo Claro" value={openForm.claro} onChange={e => setOpenForm({...openForm, claro: e.target.value})} />
                 </div>
                 <button onClick={handleOpenBox} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg mt-4">APERTURAR</button>
              </div>
           </div>
        </div>
      )}

      {/* RECARGA MODAL */}
      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg">{showRecargaModal.tipo} {showRecargaModal.red}</h3>
                  <button onClick={() => setShowRecargaModal(null)}><Ban size={20}/></button>
               </div>
               
               {showRecargaModal.tipo === 'PAQUETE' ? (
                  <select className="w-full p-3 border rounded-xl" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}>
                     <option value="">-- Paquete --</option>
                     {(showRecargaModal.red === 'TIGO' ? PAQUETES_TIGO : PAQUETES_CLARO).map(p => <option key={p.id} value={p.id}>{p.nombre} - L.{p.precio}</option>)}
                  </select>
               ) : (
                  <input type="number" className="w-full p-4 border-2 rounded-xl text-center text-2xl font-bold" placeholder="0.00" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto: e.target.value})} autoFocus />
               )}

               <button onClick={handleRecargaSubmit} className="w-full mt-6 py-4 rounded-xl font-bold text-white shadow-lg bg-slate-800">PROCESAR</button>
            </div>
         </div>
      )}

      {/* INGRESO/EGRESO MODAL */}
      {showEntryModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
               <h3 className="font-bold text-lg mb-4">{showEntryModal === 'INGRESO' ? 'Registrar Ingreso' : 'Registrar Gasto'}</h3>
               <form onSubmit={showEntryModal === 'INGRESO' ? handleSubmitIngreso : handleSubmitEgreso} className="space-y-4">
                  <input required className="w-full p-3 border rounded-xl" placeholder="Descripción" value={showEntryModal === 'INGRESO' ? ingresoForm.descripcion : egresoForm.descripcion} onChange={e => showEntryModal === 'INGRESO' ? setIngresoForm({...ingresoForm, descripcion:e.target.value}) : setEgresoForm({...egresoForm, descripcion:e.target.value})} />
                  <input required type="number" className="w-full p-3 border rounded-xl font-bold" placeholder="Monto" value={showEntryModal === 'INGRESO' ? ingresoForm.monto : egresoForm.monto} onChange={e => showEntryModal === 'INGRESO' ? setIngresoForm({...ingresoForm, monto:e.target.value}) : setEgresoForm({...egresoForm, monto:e.target.value})} />
                  {showEntryModal === 'INGRESO' && <input type="number" className="w-full p-3 border rounded-xl" placeholder="Costo (Opcional)" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo:e.target.value})} />}
                  <button type="submit" className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold">Guardar</button>
               </form>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
