
import React, { useState, useEffect } from 'react';
import { CashService, SalesService, PackagesService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete } from '../types';
import { 
  Lock, PlusCircle, Smartphone, Ban, ShoppingCart, ArrowDownCircle, ArrowUpCircle, Wallet 
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

type TabType = 'INGRESOS' | 'EGRESOS' | 'VENTAS' | 'RECARGAS';

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  
  // Data Lists
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);

  const [showOpenModal, setShowOpenModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Forms
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  
  // Modals Control
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [ingresoForm, setIngresoForm] = useState({ descripcion: '', monto: '', irAPos: true });
  
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ descripcion: '', monto: '' });

  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ red: 'TIGO', montoPagado: '', montoRecibido: '' });

  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);
  const [recargaForm, setRecargaForm] = useState({ tipo: 'RECARGA', monto: '', paqueteId: '' });

  useEffect(() => {
    loadData();
    loadCatalogos();
  }, []);

  const loadCatalogos = async () => {
      const paqs = await PackagesService.getAll();
      setPaquetes(paqs);
  };

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
     const result = await Swal.fire({ 
         title: '¿Cerrar Caja?', 
         text: 'Se calcularán ganancias y se cerrará el turno.', 
         icon: 'warning', 
         showCancelButton: true,
         confirmButtonText: 'Sí, Cerrar Caja',
         confirmButtonColor: '#ef4444'
     });
     
     if(result.isConfirmed) {
       try {
         const response = await CashService.closeCaja(arqueo.idArqueo);
         
         // Mostrar Resumen Final
         const { resumen } = response;
         await Swal.fire({
             title: 'Cierre Exitoso',
             html: `
                <div class="text-left space-y-2">
                    <p><strong>Total Ingresos:</strong> L. ${Number(resumen.totalIngresos).toFixed(2)}</p>
                    <p><strong>Total Costos:</strong> L. ${Number(resumen.totalCostos).toFixed(2)}</p>
                    <p><strong>Total Gastos (Egresos):</strong> L. ${Number(resumen.totalEgresos).toFixed(2)}</p>
                    <hr/>
                    <p class="text-xl text-indigo-600 font-bold">Ganancia: L. ${Number(resumen.ganancia).toFixed(2)}</p>
                    <p class="text-lg text-emerald-600 font-bold">Efectivo Final en Caja: L. ${Number(resumen.montoFinal).toFixed(2)}</p>
                </div>
             `,
             icon: 'success'
         });
         
         loadData(); 
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const handleCreateIngreso = async () => {
     // Si selecciona "Ir a POS", redirigimos
     if (ingresoForm.irAPos) {
         navigate('/pos', { 
             state: { 
                 customItem: {
                     descripcion: ingresoForm.descripcion,
                     precio: Number(ingresoForm.monto)
                 }
             } 
         });
         return;
     }

     // Si no, guardamos como ingreso simple (legacy behavior)
     try {
         await CashService.createIngreso({
             descripcion: ingresoForm.descripcion,
             monto: Number(ingresoForm.monto),
             costo: 0 // Ingreso manual sin costo especificado
         });
         setShowIngresoModal(false);
         setIngresoForm({ descripcion: '', monto: '', irAPos: true });
         loadData();
         Swal.fire('Guardado', 'Ingreso registrado', 'success');
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleCreateEgreso = async () => {
     try {
         await CashService.createEgreso({
             descripcion: egresoForm.descripcion,
             monto: Number(egresoForm.monto)
         });
         setShowEgresoModal(false);
         setEgresoForm({ descripcion: '', monto: '' });
         loadData();
         Swal.fire('Guardado', 'Gasto registrado', 'success');
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleBuySaldo = async () => {
      try {
          await CashService.buySaldo({
              red: saldoForm.red,
              montoPagado: Number(saldoForm.montoPagado),
              montoRecibido: Number(saldoForm.montoRecibido)
          });
          setShowSaldoModal(false);
          setSaldoForm({ red: 'TIGO', montoPagado: '', montoRecibido: '' });
          loadData();
          Swal.fire('Éxito', 'Compra de Saldo registrada', 'success');
      } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleRecargaSubmit = async () => {
    if (!arqueo || !showRecargaModal) return;
    
    let montoCobrado = 0;
    let montoPagado = 0; // Costo (Saldo a descontar)
    let desc = '';
    
    if (showRecargaModal.tipo === 'PAQUETE') {
       const pq = paquetes.find(p => p.idPaquete === recargaForm.paqueteId);
       if(!pq) return Swal.fire('Error', 'Seleccione paquete', 'error');
       
       montoCobrado = Number(pq.precio);
       montoPagado = Number(pq.costo);
       desc = pq.nombre;
    } else {
       if(!recargaForm.monto) return Swal.fire('Error', 'Ingrese monto', 'error');
       montoCobrado = Number(recargaForm.monto);
       montoPagado = montoCobrado; // En recargas normales, costo es igual al saldo enviado usualmente
       desc = `SALDO ${montoCobrado}`;
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
  // Nota: Ventas ya está incluido en Ingresos si el backend lo registra automáticamente. 
  // Para evitar doble conteo visual:
  // Si backend hace: Venta POS -> Insert Ingreso. Entonces totalIngresos YA TIENE las ventas.
  // Saldo Caja = Inicial + Ingresos - Egresos.
  const saldoCaja = (arqueo?.montoInicial || 0) + totalIngresos - totalEgresos;

  const getSaldoRed = (red: string) => {
    const s = saldos.find(x => x.red === red);
    return s ? (s.saldoFinal !== null && s.saldoFinal !== undefined ? Number(s.saldoFinal) : Number(s.saldoInicio)) : 0;
  };

  const paquetesFiltrados = showRecargaModal ? paquetes.filter(p => p.red === showRecargaModal.red && p.estado === 'Activo') : [];

  return (
    <div className="space-y-6 min-h-[80vh] flex flex-col pb-10">
      {/* HEADER */}
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div>
               <h2 className="text-xl font-bold uppercase tracking-wider">Caja: {user?.idCaja}</h2>
               <p className="text-slate-400 text-sm">Usuario: {user?.nombreEmpleado}</p>
             </div>
             <div className="flex items-center gap-4">
               {arqueo ? (
                  <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg border border-red-500">
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
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5">
                 <p className="text-xs text-slate-400 mb-1 font-bold uppercase">Efectivo en Caja</p>
                 <h3 className="text-3xl font-bold tracking-tight">L. {saldoCaja.toFixed(2)}</h3>
              </div>
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5">
                 <p className="text-xs text-emerald-400 mb-1 font-bold uppercase">Total Ingresos Hoy</p>
                 <h3 className="text-xl font-bold">L. {totalIngresos.toFixed(2)}</h3>
                 <p className="text-[10px] text-slate-400 mt-1">Incluye Ventas POS</p>
              </div>
              <div className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-xl">
                 <p className="text-xs text-blue-200 mb-1 font-bold uppercase">Saldo Tigo</p>
                 <h3 className="text-xl font-bold">L. {getSaldoRed('TIGO').toFixed(2)}</h3>
              </div>
              <div className="bg-red-600/20 border border-red-500/30 p-4 rounded-xl">
                 <p className="text-xs text-red-200 mb-1 font-bold uppercase">Saldo Claro</p>
                 <h3 className="text-xl font-bold">L. {getSaldoRed('CLARO').toFixed(2)}</h3>
              </div>
           </div>
         )}
      </div>

      {/* TABS */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
         {[
            { id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={18}/> },
            { id: 'EGRESOS', label: 'Gastos/Compras', icon: <ArrowDownCircle size={18}/> },
            { id: 'RECARGAS', label: 'Recargas', icon: <Smartphone size={18}/> },
            { id: 'VENTAS', label: 'Historial Ventas', icon: <ShoppingCart size={18}/> }
         ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {tab.icon} {tab.label}
            </button>
         ))}
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
         
         {activeTab === 'INGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                 <div>
                    <h3 className="font-bold text-emerald-800">Registrar Ingreso Manual</h3>
                    <p className="text-xs text-emerald-600">Para productos fuera de inventario o servicios.</p>
                 </div>
                 <button onClick={() => setShowIngresoModal(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 shadow-md flex items-center gap-2 font-bold text-sm">
                    <PlusCircle size={18}/> Nuevo Ingreso
                 </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs"><tr><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3">Estado</th></tr></thead>
                    <tbody>
                        {ingresos.map(i => (
                        <tr key={i.idIngreso} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-700">{i.descripcion}</td>
                            <td className="p-3 font-bold text-emerald-600">L. {Number(i.monto).toFixed(2)}</td>
                            <td className="p-3 text-xs text-slate-400">{i.estado}</td>
                        </tr>
                        ))}
                    </tbody>
                </table>
              </div>
           </div>
         )}

         {activeTab === 'EGRESOS' && (
           <div className="space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex justify-between items-center bg-red-50 p-4 rounded-xl border border-red-100">
                        <div>
                            <h3 className="font-bold text-red-800">Registrar Gasto Operativo</h3>
                            <p className="text-xs text-red-600">Salidas de dinero de caja.</p>
                        </div>
                        <button onClick={() => setShowEgresoModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-md flex items-center gap-2 font-bold text-sm">
                            <ArrowDownCircle size={18}/> Nuevo Gasto
                        </button>
                    </div>
                    <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <div>
                            <h3 className="font-bold text-blue-800">Compra de Saldo</h3>
                            <p className="text-xs text-blue-600">Reabastecer saldo Tigo/Claro.</p>
                        </div>
                        <button onClick={() => setShowSaldoModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-md flex items-center gap-2 font-bold text-sm">
                            <Wallet size={18}/> Comprar Saldo
                        </button>
                    </div>
               </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs"><tr><th className="p-3">Descripción</th><th className="p-3">Monto</th></tr></thead>
                    <tbody>
                        {egresos.map(e => (
                        <tr key={e.idegresos} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-700">{e.descripcion}</td>
                            <td className="p-3 font-bold text-red-600">L. {Number(e.monto).toFixed(2)}</td>
                        </tr>
                        ))}
                    </tbody>
                </table>
              </div>
           </div>
         )}

         {activeTab === 'RECARGAS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
               {['TIGO', 'CLARO'].map(red => (
                  <div key={red} className={`bg-white rounded-xl border shadow-sm flex flex-col ${red === 'TIGO' ? 'border-blue-100' : 'border-red-100'}`}>
                    <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} text-white p-4 rounded-t-xl flex justify-between items-center`}>
                       <h3 className="font-bold text-lg">{red}</h3>
                       <span className="text-xs bg-white/20 px-2 py-1 rounded">Saldo: {getSaldoRed(red)}</span>
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
              <h3 className="font-bold text-slate-700">Historial Ventas POS</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs"><tr><th className="p-3">Factura</th><th className="p-3">Cliente</th><th className="p-3">Total</th><th className="p-3">Estado</th></tr></thead>
                    <tbody>
                        {ventas.map(v => (
                        <tr key={v.codVenta} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-mono text-xs">{v.codVenta}</td>
                            <td className="p-3 text-xs">{v.nombreCliente}</td>
                            <td className="p-3 font-bold">L. {Number(v.total).toFixed(2)}</td>
                            <td className="p-3"><span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">{v.estado}</span></td>
                        </tr>
                        ))}
                    </tbody>
                </table>
              </div>
           </div>
         )}
      </div>

      {/* --- MODALS --- */}

      {/* OPEN BOX */}
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

      {/* RECARGA */}
      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-fade-in">
               <div className="flex justify-between items-center mb-4 border-b pb-2">
                  <h3 className="font-bold text-lg">{showRecargaModal.tipo} {showRecargaModal.red}</h3>
                  <button onClick={() => setShowRecargaModal(null)}><Ban size={20} className="text-slate-400 hover:text-red-500"/></button>
               </div>
               
               {showRecargaModal.tipo === 'PAQUETE' ? (
                  <select className="w-full p-3 border rounded-xl bg-slate-50" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}>
                     <option value="">-- Seleccionar Paquete --</option>
                     {paquetesFiltrados.map(p => (
                         <option key={p.idPaquete} value={p.idPaquete}>
                             {p.nombre} - L.{p.precio} (Costo: L.{p.costo})
                         </option>
                     ))}
                  </select>
               ) : (
                  <input type="number" className="w-full p-4 border-2 rounded-xl text-center text-3xl font-bold tracking-widest" placeholder="0.00" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto: e.target.value})} autoFocus />
               )}

               <button onClick={handleRecargaSubmit} className="w-full mt-6 py-4 rounded-xl font-bold text-white shadow-lg bg-slate-800 hover:bg-slate-700 transition-colors">PROCESAR</button>
            </div>
         </div>
      )}

      {/* COMPRA SALDO */}
      {showSaldoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-slate-800">Comprar Saldo</h3>
                  <button onClick={() => setShowSaldoModal(false)}><Ban size={20} className="text-slate-400"/></button>
                </div>
                <div className="space-y-4">
                    <select className="w-full p-3 border rounded-xl bg-slate-50" value={saldoForm.red} onChange={e => setSaldoForm({...saldoForm, red: e.target.value})}>
                        <option value="TIGO">TIGO</option>
                        <option value="CLARO">CLARO</option>
                    </select>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Dinero Pagado (Egreso)</label>
                        <input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600" placeholder="L. Pagados" value={saldoForm.montoPagado} onChange={e => setSaldoForm({...saldoForm, montoPagado: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Saldo Recibido</label>
                        <input type="number" className="w-full p-3 border rounded-xl font-bold text-blue-600" placeholder="Saldo Recibido" value={saldoForm.montoRecibido} onChange={e => setSaldoForm({...saldoForm, montoRecibido: e.target.value})} />
                    </div>
                    <button onClick={handleBuySaldo} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">Registrar Compra</button>
                </div>
            </div>
         </div>
      )}

      {/* INGRESO MODAL */}
      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-fade-in">
               <h3 className="font-bold text-lg mb-4">Registrar Ingreso</h3>
               <div className="space-y-4">
                  <input className="w-full p-3 border rounded-xl" placeholder="Descripción del producto/servicio" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion:e.target.value})} />
                  <input type="number" className="w-full p-3 border rounded-xl font-bold" placeholder="Precio Venta" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto:e.target.value})} />
                  
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <input 
                        type="checkbox" 
                        id="irAPos" 
                        checked={ingresoForm.irAPos} 
                        onChange={e => setIngresoForm({...ingresoForm, irAPos: e.target.checked})}
                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="irAPos" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                          Facturar en Punto de Venta
                          <p className="text-xs text-slate-400 font-normal">Genera factura formal e imprime ticket</p>
                      </label>
                  </div>

                  <div className="flex gap-2 mt-4">
                      <button onClick={() => setShowIngresoModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancelar</button>
                      <button onClick={handleCreateIngreso} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg">Continuar</button>
                  </div>
               </div>
            </div>
         </div>
      )}
      
      {/* EGRESO MODAL */}
      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-fade-in">
               <h3 className="font-bold text-lg mb-4">Registrar Gasto</h3>
               <div className="space-y-4">
                  <input className="w-full p-3 border rounded-xl" placeholder="Descripción del gasto" value={egresoForm.descripcion} onChange={e => setEgresoForm({...egresoForm, descripcion:e.target.value})} />
                  <input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600" placeholder="Monto" value={egresoForm.monto} onChange={e => setEgresoForm({...egresoForm, monto:e.target.value})} />
                  
                  <div className="flex gap-2 mt-4">
                      <button onClick={() => setShowEgresoModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancelar</button>
                      <button onClick={handleCreateEgreso} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg">Guardar</button>
                  </div>
               </div>
            </div>
         </div>
      )}

    </div>
  );
};

export default CashRegister;
