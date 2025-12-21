
import React, { useState, useEffect } from 'react';
import { CashService, SalesService, PackagesService, ConfigService, AccountingService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete, EmpresaConfig, SubtipoIngreso, SubtipoEgreso, Socio } from '../types';
import { 
  Lock, PlusCircle, Smartphone, Ban, ShoppingCart, ArrowDownCircle, ArrowUpCircle, Wallet, Edit2, Trash2, X, CloudLightning, FileText, Printer, UserCheck, RefreshCw, Package
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'INGRESOS' | 'EGRESO' | 'VENTAS' | 'RECARGAS';

// Helper robusto para números a letras (Facturación SAR)
const numeroALetras = (num: number): string => {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CUARENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const diez_veinte = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const convertGroup = (n: number): string => {
        if (n === 0) return '';
        if (n === 100) return 'CIEN';
        let output = '';
        if (n >= 100) { output += centenas[Math.floor(n / 100)] + ' '; n %= 100; }
        if (n >= 10 && n <= 19) { output += diez_veinte[n - 10]; } 
        else if (n >= 20) { output += decenas[Math.floor(n / 10)]; if (n % 10 > 0) output += ' Y ' + unidades[n % 10]; } 
        else if (n > 0) { output += unidades[n]; }
        return output.trim();
    };

    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);
    let text = '';
    if (integerPart === 0) text = 'CERO';
    else if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        const remainder = integerPart % 1000;
        text += (thousands === 1 ? 'MIL' : convertGroup(thousands) + ' MIL');
        if (remainder > 0) text += ' ' + convertGroup(remainder);
    } 
    else { text = convertGroup(integerPart); }
    return `${text} CON ${decimalPart}/100 LEMPIRAS`;
};

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [partners, setPartners] = useState<Socio[]>([]);
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);

  const [existingBalances, setExistingBalances] = useState({ tigo: false, claro: false });
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  // Modal Forms
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [ingresoForm, setIngresoForm] = useState({ 
    id: '', descripcion: '', monto: '', costo: '', subtipo: 'Venta Inventario' as SubtipoIngreso, irAPos: true 
  });
  
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ 
    id: '', descripcion: '', monto: '', subtipo: 'Gasto Operativo' as SubtipoEgreso, idSocio: '' 
  });

  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ red: 'TIGO', montoPagado: '', montoRecibido: '' });

  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);
  const [recargaForm, setRecargaForm] = useState({ tipo: 'RECARGA', monto: '', precio: '', paqueteId: '' });

  const getHndDateOnly = () => {
    const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  };

  const getFullHndTimestamp = () => {
    const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  };

  useEffect(() => { if (user) { loadData(); loadCatalogos(); loadConfig(); } }, [user]);

  const loadConfig = async () => { try { const cfg = await ConfigService.get(); setCompanyConfig(cfg); } catch (e) { console.error(e); } };
  const loadCatalogos = async () => { try { const [p, s] = await Promise.all([PackagesService.getAll(), AccountingService.getSocios()]); setPaquetes(p || []); setPartners(s || []); } catch(e) { console.error(e); } };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const hndDate = getHndDateOnly();
      const active = await CashService.getActiveArqueo();
      const status = await CashService.getSaldosStatus(hndDate);
      setExistingBalances(status);

      if (active) {
        setArqueo(active);
        const [ing, egr, vts, slds] = await Promise.all([
           CashService.getIngresos(user!.idCaja, hndDate),
           CashService.getEgresos(user!.idCaja, hndDate),
           SalesService.getVentasDiDaily(hndDate),
           CashService.getSaldosToday(hndDate)
        ]);
        setIngresos(ing || []);
        setEgresos(egr || []);
        setVentas(vts || []);
        setSaldos(slds || []);
      } else { setArqueo(null); }
    } catch (error) { console.error(error); } finally { setIsLoading(false); }
  };

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial', 'error');
     try {
       await CashService.openCaja({ montoInicial: Number(openForm.monto), saldoTigoInicial: existingBalances.tigo ? 0 : Number(openForm.tigo || 0), saldoClaroInicial: existingBalances.claro ? 0 : Number(openForm.claro || 0) });
       Swal.fire('Éxito', 'Caja Aperturada', 'success');
       loadData();
     } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const result = await Swal.fire({ title: '¿Cerrar Turno?', text: 'Se guardará el saldo final.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Cerrar', confirmButtonColor: '#ef4444' });
     if(result.isConfirmed) {
       try {
         const res = await CashService.closeCaja(arqueo.idArqueo);
         Swal.fire({ title: 'Cierre Exitoso', icon: 'success', showCancelButton: true, confirmButtonText: 'Ver Reporte' })
            .then(r => { if(r.isConfirmed) generateClosingReportPDF(res.resumen, ingresos, egresos, user); });
         loadData(); 
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const generateClosingReportPDF = (resumen: any, ingresosList: Ingreso[], egresosList: Egreso[], user: any) => {
      const doc = new jsPDF();
      doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255); doc.setFontSize(18); doc.text("REPORTE DE CIERRE", 105, 15, { align: 'center' });
      // ... Lógica abreviada de reporte para el ejemplo ...
      // @ts-ignore
      doc.autoTable({ startY: 40, head: [['Concepto', 'Monto']], body: [['Monto Inicial', `L. ${resumen.montoInicial}`], ['Ingresos', `L. ${resumen.totalVentas}`], ['Efectivo Final', `L. ${resumen.montoFinal}`]] });
      doc.save(`Cierre_${user.idCaja}.pdf`);
  };

  const handleReprintInvoice = async (id: string) => {
      try {
          const sale = await SalesService.getVenta(id);
          const details = await SalesService.getDetallesVenta(id);
          const doc = new jsPDF();
          doc.text(`Factura #${sale.codVenta}`, 10, 10);
          // @ts-ignore
          doc.autoTable({ startY: 20, head:[['Cant', 'Desc', 'Total']], body: details.map(d => [d.cantidad, d.descripcionProducto, (d.cantidad * d.precioVenta).toFixed(2)]) });
          doc.save(`Factura_${id}.pdf`);
      } catch(e) { Swal.fire('Error', 'No se pudo reimprimir', 'error'); }
  };

  const handleIngresoAction = async () => {
    try {
        if (ingresoForm.irAPos) {
            navigate('/pos', { state: { customItem: { descripcion: `[${ingresoForm.subtipo}] ${ingresoForm.descripcion}`, precio: Number(ingresoForm.monto) } } });
            return;
        }
        await CashService.createIngreso({ descripcion: ingresoForm.descripcion, monto: Number(ingresoForm.monto), costo: Number(ingresoForm.costo), subtipo_movimiento: ingresoForm.subtipo, fechaCreacion: getFullHndTimestamp() });
        setShowIngresoModal(false);
        loadData();
        Swal.fire('Guardado', 'Ingreso registrado', 'success');
    } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEgresoAction = async () => {
     try {
         await CashService.createEgreso({ descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto), subtipo_egreso: egresoForm.subtipo, id_socio_asignado: egresoForm.idSocio || null, fechaCreacion: getFullHndTimestamp() });
         setShowEgresoModal(false);
         loadData();
         Swal.fire('Guardado', 'Egreso registrado', 'success');
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleDeleteItem = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' });
      if(result.isConfirmed) { try { if(type === 'INGRESO') await CashService.deleteIngreso(id); else await CashService.deleteEgreso(id); loadData(); } catch(e:any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const handleAnularVenta = async (id: string) => {
      const result = await Swal.fire({ title: '¿Anular Venta?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' });
      if(result.isConfirmed) { try { await SalesService.anularVenta(id); loadData(); Swal.fire('Anulada', 'Venta anulada', 'success'); } catch(e:any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const handleBuySaldo = async () => {
      try { await CashService.buySaldo({ red: saldoForm.red, montoPagado: Number(saldoForm.montoPagado), montoRecibido: Number(saldoForm.montoRecibido), fechaLocal: getHndDateOnly() }); setShowSaldoModal(false); loadData(); Swal.fire('Éxito', 'Saldo Comprado', 'success'); } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleRecargaSubmit = async () => {
    if (!arqueo || !showRecargaModal) return;
    let montoCobrado = 0, montoPagado = 0, desc = '';
    if (showRecargaModal.tipo === 'PAQUETE') {
       const pq = paquetes.find(p => p.idPaquete === recargaForm.paqueteId);
       if(!pq) return; montoCobrado = Number(pq.precio); montoPagado = Number(pq.costo); desc = pq.nombre;
    } else {
       montoCobrado = Number(recargaForm.precio); montoPagado = Number(recargaForm.monto); desc = `SALDO ${montoPagado}`;
    }
    try { await CashService.createRecarga({ red: showRecargaModal.red, tipo: showRecargaModal.tipo, descripcion: desc, precioCobrado: montoCobrado, precioPagado: montoPagado, fechaLocal: getHndDateOnly() }); setShowRecargaModal(null); loadData(); Swal.fire('Éxito', 'Recarga realizada', 'success'); } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const totalIngresos = ingresos.reduce((a,b) => a + Number(b.monto), 0);
  const totalGastos = egresos.reduce((a,b) => a + Number(b.monto), 0);
  const cashInBoxCalculated = arqueo ? (Number(arqueo.montoInicial) + totalIngresos) - totalGastos : 0;
  const getSaldoRed = (red: string) => saldos.find(x => x.red === red)?.saldoFinal || 0;

  if (isLoading) return <div className="flex flex-col justify-center items-center h-full text-slate-400 gap-4"><RefreshCw className="animate-spin" size={32}/><span>Cargando Turno...</span></div>;

  if (!arqueo) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6">
              <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl p-8 border border-slate-100">
                  <div className="flex flex-col items-center mb-8">
                      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4"><CloudLightning className="text-white" size={32} /></div>
                      <h2 className="text-3xl font-bold text-slate-800">Apertura</h2>
                  </div>
                  <div className="space-y-6">
                      <div><label className="text-xs font-bold text-slate-500 uppercase block mb-2">Efectivo Inicial</label><input type="number" className="w-full p-4 text-2xl font-bold text-center border-2 border-slate-200 rounded-2xl" placeholder="0.00" value={openForm.monto} onChange={e => setOpenForm({...openForm, monto: e.target.value})} autoFocus/></div>
                      <div className="grid grid-cols-2 gap-4">
                          {!existingBalances.tigo && (<div><label className="text-xs font-bold text-blue-500 uppercase mb-2 block">Saldo Tigo</label><input type="number" className="w-full p-3 border-2 border-blue-100 rounded-xl" value={openForm.tigo} onChange={e => setOpenForm({...openForm, tigo: e.target.value})} /></div>)}
                          {!existingBalances.claro && (<div><label className="text-xs font-bold text-red-500 uppercase mb-2 block">Saldo Claro</label><input type="number" className="w-full p-3 border-2 border-red-100 rounded-xl" value={openForm.claro} onChange={e => setOpenForm({...openForm, claro: e.target.value})} /></div>)}
                      </div>
                      <button onClick={handleOpenBox} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl flex items-center justify-center gap-3 text-lg"><Lock size={20}/> APERTURAR TURNO</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 min-h-[80vh] flex flex-col pb-10 animate-fade-in">
      {/* Header Info */}
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div><h2 className="text-xl font-bold uppercase tracking-wider">Caja: {user?.idCaja}</h2><p className="text-slate-400 text-xs">Abierto: {new Date(arqueo.fechaApertura).toLocaleString()}</p></div>
             <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 border border-red-500"><Lock size={16}/> CERRAR CAJA</button>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="bg-white/10 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-slate-400 font-bold uppercase">Efectivo</p><h3 className="text-2xl font-bold">L. {Number(cashInBoxCalculated).toLocaleString()}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-emerald-400 font-bold uppercase">Ingresos</p><h3 className="text-lg font-bold">L. {Number(totalIngresos).toLocaleString()}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-red-300 font-bold uppercase">Gastos</p><h3 className="text-lg font-bold">L. {Number(totalGastos).toLocaleString()}</h3></div>
              <div className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-xl"><p className="text-[10px] text-blue-200 font-bold uppercase">Tigo</p><h3 className="text-lg font-bold">L. {Number(getSaldoRed('TIGO')).toLocaleString()}</h3></div>
              <div className="bg-red-600/20 border border-red-500/30 p-4 rounded-xl"><p className="text-[10px] text-red-200 font-bold uppercase">Claro</p><h3 className="text-lg font-bold">L. {Number(getSaldoRed('CLARO')).toLocaleString()}</h3></div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
         {[{ id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={18}/> }, { id: 'EGRESO', label: 'Gastos/Compras', icon: <ArrowDownCircle size={18}/> }, { id: 'RECARGAS', label: 'Recargas', icon: <Smartphone size={18}/> }, { id: 'VENTAS', label: 'Historial Ventas', icon: <ShoppingCart size={18}/> }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500'}`}>{tab.icon} {tab.label}</button>
         ))}
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
         {activeTab === 'INGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                 <div><h3 className="font-bold text-emerald-800">Registrar Nuevo Ingreso</h3><p className="text-xs text-emerald-600">Ventas manuales, reparaciones o préstamos.</p></div>
                 <button onClick={() => setShowIngresoModal(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 shadow-md flex items-center gap-2 font-bold text-sm"><PlusCircle size={18}/> Nuevo</button>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-bold"><tr><th className="p-3">Categoría</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{ingresos.map(i => (<tr key={i.idIngreso} className="border-b hover:bg-slate-50"><td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">{i.subtipo_movimiento || 'Venta'}</span></td><td className="p-3 font-medium text-slate-700">{i.descripcion}</td><td className="p-3 font-bold text-emerald-600">L. {Number(i.monto).toFixed(2)}</td><td className="p-3 text-right"><button onClick={() => handleDeleteItem(i.idIngreso, 'INGRESO')} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
           </div>
         )}

         {activeTab === 'EGRESO' && (
           <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between items-center bg-red-50 p-4 rounded-xl border border-red-100"><div><h3 className="font-bold text-red-800 text-sm">Gasto General / Socio</h3></div><button onClick={() => setShowEgresoModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-md font-bold text-xs">Nuevo Gasto</button></div>
                  <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100"><div><h3 className="font-bold text-blue-800 text-sm">Compra Saldo de Recargas</h3></div><button onClick={() => setShowSaldoModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-md font-bold text-xs"><Wallet size={16}/> Comprar</button></div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-bold"><tr><th className="p-3">Categoría</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{egresos.map(e => (<tr key={e.idegresos} className="border-b hover:bg-slate-50"><td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">{e.subtipo_egreso || 'Gasto'}</span></td><td className="p-3 font-medium text-slate-700">{e.descripcion}{e.id_socio_asignado && <span className="block text-[10px] text-indigo-500 font-bold">Socio ID: {e.id_socio_asignado}</span>}</td><td className="p-3 font-bold text-red-600">L. {Number(e.monto).toFixed(2)}</td><td className="p-3 text-right"><button onClick={() => handleDeleteItem(e.idegresos, 'EGRESO')} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
           </div>
         )}

         {activeTab === 'RECARGAS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
               {['TIGO', 'CLARO'].map(red => (
                  <div key={red} className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col ${red === 'TIGO' ? 'border-blue-100' : 'border-red-100'}`}>
                    <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} text-white p-4 flex justify-between items-center`}><h3 className="font-bold text-lg">{red}</h3><span className="text-xs bg-white/20 px-3 py-1 rounded-full font-bold">L. {Number(getSaldoRed(red)).toFixed(2)}</span></div>
                    <div className="p-6 grid grid-cols-1 gap-4">
                        <button onClick={() => { setShowRecargaModal({ red: red as any, tipo: 'RECARGA' }); setRecargaForm({tipo:'RECARGA', monto:'', precio:'', paqueteId:''}); }} className={`w-full py-4 bg-slate-50 font-black rounded-2xl border-2 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest ${red==='TIGO'?'text-blue-700 border-blue-50 hover:bg-blue-50':'text-red-700 border-red-50 hover:bg-red-50'}`}><Smartphone size={20}/> Recarga Saldo</button>
                        <button onClick={() => { setShowRecargaModal({ red: red as any, tipo: 'PAQUETE' }); setRecargaForm({tipo:'PAQUETE', monto:'', precio:'', paqueteId:''}); }} className={`w-full py-4 bg-slate-50 font-black rounded-2xl border-2 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest ${red==='TIGO'?'text-blue-700 border-blue-50 hover:bg-blue-50':'text-red-700 border-red-50 hover:bg-red-50'}`}><Package size={20}/> Comprar Paquete</button>
                    </div>
                  </div>
               ))}
            </div>
         )}

         {activeTab === 'VENTAS' && (
           <div className="space-y-4 animate-fade-in">
              <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-bold"><tr><th className="p-3">Factura</th><th className="p-3">Cliente</th><th className="p-3">Total</th><th className="p-3">Estado</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>
                  {ventas.length === 0 ? (<tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">No hay ventas registradas hoy.</td></tr>) : ventas.map(v => (
                  <tr key={v.codVenta} className={`border-b hover:bg-slate-50 ${v.estado === 'Anulada' ? 'opacity-40 bg-slate-50' : ''}`}><td className="p-3 font-mono text-xs">{v.codVenta}</td><td className="p-3">{v.nombreCliente}</td><td className={`p-3 font-bold ${v.estado === 'Anulada' ? 'line-through text-slate-400' : ''}`}>L. {Number(v.total).toFixed(2)}</td><td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.estado === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{v.estado}</span></td>
                  <td className="p-3 text-right flex justify-end gap-1">
                      <button onClick={() => handleReprintInvoice(v.codVenta)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors" title="Reimprimir"><Printer size={16}/></button>
                      {v.estado !== 'Anulada' && (<><button onClick={() => navigate('/pos', { state: { editSaleId: v.codVenta } })} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Editar"><Edit2 size={16}/></button><button onClick={() => handleAnularVenta(v.codVenta)} className="p-1.5 text-red-400 hover:text-red-600" title="Anular"><Ban size={16}/></button></>)}
                  </td></tr>))}</tbody></table></div>
           </div>
         )}
      </div>

      {/* --- MODALES --- */}
      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in">
               <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-slate-800">Registrar Ingreso</h3><button onClick={() => setShowIngresoModal(false)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Clasificación</label>
                    <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={ingresoForm.subtipo} onChange={e => setIngresoForm({...ingresoForm, subtipo: e.target.value as any})}>
                      <option value="Venta Inventario">Venta de Inventario</option><option value="Venta Prestado">Venta Producto Prestado</option><option value="Reparacion">Servicio de Reparación</option><option value="KrediYa_Prima">KrediYa (Pago de Prima)</option><option value="Cobro Consignacion">Cobro a Otros Negocios</option><option value="Ajuste">Ajuste de Caja</option>
                    </select>
                  </div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl" placeholder="Ej: Reparación Pantalla S20" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion:e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Precio Cobrado</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-emerald-600" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto:e.target.value})} /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Costo Base</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-slate-400" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo:e.target.value})} /></div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <input type="checkbox" id="irAPosIn" checked={ingresoForm.irAPos} onChange={e => setIngresoForm({...ingresoForm, irAPos: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded"/><label htmlFor="irAPosIn" className="text-xs font-bold text-indigo-700 cursor-pointer">Facturar en POS (Generar Ticket)</label>
                  </div>
                  <button onClick={handleIngresoAction} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg hover:bg-emerald-700 transition-all text-sm tracking-widest mt-4 uppercase">GUARDAR INGRESO</button>
               </div>
            </div>
         </div>
      )}

      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in">
               <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-slate-800">Registrar Salida</h3><button onClick={() => setShowEgresoModal(false)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Tipo de Salida</label>
                    <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={egresoForm.subtipo} onChange={e => setEgresoForm({...egresoForm, subtipo: e.target.value as any})}>
                      <option value="Gasto Operativo">Gasto Operativo</option><option value="Pago a Tecnico">Pago a Técnico Amigo</option><option value="Pago a Tienda Externa">Pago por Producto Prestado</option><option value="Gasto Personal Socio">Retiro Personal de Socio</option><option value="Nomina">Pago de Empleado</option><option value="Compra Inventario">Compra de Mercadería</option>
                    </select>
                  </div>
                  {(egresoForm.subtipo === 'Gasto Personal Socio' || egresoForm.subtipo === 'Nomina') && (
                      <div className="animate-fade-in"><label className="text-[10px] font-black text-indigo-500 uppercase mb-1 block">Vincular a Socio</label>
                        <select className="w-full p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-700" value={egresoForm.idSocio} onChange={e => setEgresoForm({...egresoForm, idSocio: e.target.value})}>
                          <option value="">-- Seleccionar Socio --</option>
                          {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                        </select>
                      </div>
                  )}
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl" placeholder="Ej: Pago de almuerzo" value={egresoForm.descripcion} onChange={e => setEgresoForm({...egresoForm, descripcion:e.target.value})} /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto a Retirar</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600" value={egresoForm.monto} onChange={e => setEgresoForm({...egresoForm, monto:e.target.value})} /></div>
                  <button onClick={handleEgresoAction} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg hover:bg-red-700 transition-all text-sm tracking-widest mt-4 uppercase">REGISTRAR SALIDA</button>
               </div>
            </div>
         </div>
      )}

      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in">
               <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-slate-800">{showRecargaModal.tipo} {showRecargaModal.red}</h3><button onClick={() => setShowRecargaModal(null)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  {showRecargaModal.tipo === 'PAQUETE' ? (
                      <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Seleccionar Paquete</label>
                        <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}>
                          <option value="">-- Paquetes {showRecargaModal.red} --</option>
                          {paquetes.filter(p=>p.red===showRecargaModal.red).map(p=>(<option key={p.idPaquete} value={p.idPaquete}>{p.nombre} - L.{p.precio}</option>))}
                        </select>
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 gap-4">
                        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto Saldo (Costo)</label><input type="number" className="w-full p-3 border rounded-xl font-mono text-xl" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto:e.target.value})} autoFocus/></div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Precio Cobrado (Venta)</label><input type="number" className="w-full p-3 border rounded-xl font-black text-emerald-600 text-xl" value={recargaForm.precio} onChange={e => setRecargaForm({...recargaForm, precio:e.target.value})} /></div>
                      </div>
                  )}
                  <button onClick={handleRecargaSubmit} className={`w-full py-4 ${showRecargaModal.red==='TIGO'?'bg-blue-600':'bg-red-600'} text-white rounded-2xl font-black shadow-lg hover:brightness-110 transition-all text-sm tracking-widest mt-4 uppercase`}>PROCESAR RECARGA</button>
               </div>
            </div>
         </div>
      )}

      {showSaldoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in">
                <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-slate-800">Comprar Saldo</h3><button onClick={() => setShowSaldoModal(false)}><X size={20} className="text-slate-400"/></button></div>
                <div className="space-y-4">
                    <select className="w-full p-3 border rounded-xl bg-slate-50 font-bold" value={saldoForm.red} onChange={e => setSaldoForm({...saldoForm, red: e.target.value as any})}><option value="TIGO">TIGO</option><option value="CLARO">CLARO</option></select>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Efectivo Pagado (Retiro de Caja)</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600" value={saldoForm.montoPagado} onChange={e => setSaldoForm({...saldoForm, montoPagado: e.target.value})} /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Saldo Recibido en App</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-blue-600" value={saldoForm.montoRecibido} onChange={e => setSaldoForm({...saldoForm, montoRecibido: e.target.value})} /></div>
                    <button onClick={handleBuySaldo} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-all text-sm tracking-widest mt-4 uppercase">REGISTRAR COMPRA</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
