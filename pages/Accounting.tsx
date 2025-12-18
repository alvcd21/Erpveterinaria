
import React, { useState, useEffect } from 'react';
import { AccountingService, SalesService } from '../services/api';
import { Socio, DetalleVenta } from '../types';
import { 
  Calculator, Users, Search, Edit2, Trash2, X, Check, ArrowUpRight, ArrowDownRight, 
  DollarSign, PieChart, Activity, ShoppingBag, Calendar, Eye, RefreshCw, Layers, TrendingUp, Wallet, ArrowRightLeft, TrendingDown
} from 'lucide-react';
import Swal from 'sweetalert2';

interface AuditTransaction {
    tipo: 'INGRESO' | 'EGRESO';
    id: string;
    idCaja: string;
    descripcion: string;
    monto: number;
    costo: number;
    fecha: string;
    estado: string;
    categoria: string;
}

interface ProfitMetrics {
    ingresos: number;
    costos: number;
    utilidadBruta: number;
    opex: number;
    inversion: number;
    utilidadNeta: number;
}

interface ProfitReportExtended {
    daily: ProfitMetrics;
    monthly: ProfitMetrics;
    yearly: ProfitMetrics;
    distribucion: { socio: string; porcentaje: number; gananciaDia: number; gananciaMes: number; gananciaAnio: number; }[];
}

const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'TRANSACTIONS' | 'PARTNERS'>('SUMMARY');
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [transactions, setTransactions] = useState<AuditTransaction[]>([]);
  const [report, setReport] = useState<ProfitReportExtended | null>(null);
  
  // Filters
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [txFilter, setTxFilter] = useState<'ALL' | 'INGRESO' | 'GASTO' | 'INVERSION'>('ALL');

  // Modals
  const [selectedSaleDetails, setSelectedSaleDetails] = useState<DetalleVenta[] | null>(null);
  const [editingTx, setEditingTx] = useState<AuditTransaction | null>(null);
  const [editForm, setEditForm] = useState({ descripcion: '', monto: '', costo: '', categoria: '' });

  useEffect(() => {
    loadData();
  }, [selectedDate, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
        if (activeTab === 'SUMMARY' || activeTab === 'PARTNERS') {
            const profitData = await AccountingService.getProfitabilityReport(selectedDate);
            setReport(profitData);
        }
        if (activeTab === 'TRANSACTIONS') {
            const auditData = await AccountingService.getAuditTransactions(selectedDate);
            setTransactions(auditData);
        }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleShowSaleDetails = async (tx: AuditTransaction) => {
      const match = tx.descripcion.match(/FACT-\d+/);
      if (match) {
          try {
              const details = await SalesService.getDetallesVenta(match[0]);
              setSelectedSaleDetails(details);
          } catch (e) { Swal.fire('Error', 'No se pudieron cargar los detalles', 'error'); }
      }
  };

  const handleEditTx = (tx: AuditTransaction) => {
      setEditingTx(tx);
      setEditForm({ 
          descripcion: tx.descripcion, 
          monto: String(tx.monto), 
          costo: String(tx.costo || 0),
          categoria: tx.categoria || (tx.tipo === 'EGRESO' ? 'Gasto Operativo' : 'Venta/Servicio')
      });
  };

  const saveEditTx = async () => {
      if (!editingTx) return;
      try {
          await AccountingService.updateAuditTransaction(editingTx.tipo, editingTx.id, {
              ...editForm,
              monto: Number(editForm.monto),
              costo: Number(editForm.costo)
          });
          setEditingTx(null);
          loadData();
          Swal.fire('Éxito', 'Movimiento actualizado. La caja se sincronizó automáticamente.', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const filteredTx = transactions.filter(t => {
      const matchesSearch = t.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) || t.idCaja.toLowerCase().includes(searchTerm.toLowerCase());
      if (txFilter === 'ALL') return matchesSearch;
      if (txFilter === 'INGRESO') return t.tipo === 'INGRESO' && matchesSearch;
      if (txFilter === 'GASTO') return t.categoria === 'Gasto Operativo' && matchesSearch;
      if (txFilter === 'INVERSION') return t.categoria === 'Compra de Producto' && matchesSearch;
      return matchesSearch;
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
        {/* TOP BAR: DATE & TABS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-600/20">
                    <Calculator size={24}/>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Contabilidad Gerencial</h2>
                    <p className="text-xs text-slate-500 font-medium">Análisis de rentabilidad e impacto contable</p>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
                {[
                    { id: 'SUMMARY', label: 'Resumen Ganancias', icon: <TrendingUp size={16}/> },
                    { id: 'TRANSACTIONS', label: 'Auditoría Diaria', icon: <Activity size={16}/> },
                    { id: 'PARTNERS', label: 'Reparto Socios', icon: <Users size={16}/> },
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>
            
            <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-xl border border-indigo-100">
                <Calendar size={18} className="text-indigo-600 ml-1"/>
                <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="bg-transparent text-sm font-bold text-indigo-700 outline-none p-1"
                />
            </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* --- SUMMARY TAB --- */}
            {activeTab === 'SUMMARY' && report && (
                <div className="animate-fade-in space-y-6 overflow-y-auto pr-1">
                    {/* Main Stats Card */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3 bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
                             <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                             <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div>
                                    <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">Ingresos Operativos</p>
                                    <h3 className="text-4xl font-black">L. {report.daily.ingresos.toLocaleString()}</h3>
                                    <div className="flex items-center gap-2 mt-2 text-indigo-200 text-xs">
                                        <ArrowUpRight size={14} className="text-emerald-400"/> Ventas del día seleccionando
                                    </div>
                                </div>
                                <div className="border-l border-white/10 pl-8">
                                    <p className="text-red-300 text-xs font-bold uppercase tracking-widest mb-1">Gasto Operativo (OpEx)</p>
                                    <h3 className="text-3xl font-bold text-red-200">L. {report.daily.opex.toLocaleString()}</h3>
                                    <p className="text-[10px] text-slate-400 mt-2">Deducciones directas de ganancia</p>
                                </div>
                                <div className="border-l border-white/10 pl-8 bg-emerald-500/10 rounded-2xl p-4">
                                    <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">Ganancia Neta Real</p>
                                    <h3 className="text-4xl font-black text-emerald-400">L. {report.daily.utilidadNeta.toLocaleString()}</h3>
                                    <p className="text-[10px] text-emerald-200/50 mt-1">Listo para repartir a socios</p>
                                </div>
                             </div>
                        </div>
                        
                        <div className="bg-white border-2 border-indigo-100 rounded-3xl p-6 flex flex-col justify-center items-center text-center shadow-sm">
                            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                                <ArrowRightLeft size={24}/>
                            </div>
                            <p className="text-xs font-bold text-slate-400 uppercase">Reinversión / Stock</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">L. {report.daily.inversion.toLocaleString()}</h3>
                            <p className="text-[10px] text-slate-400 mt-2 px-4 leading-tight">Dinero usado para comprar productos. No afecta ganancia neta.</p>
                        </div>
                    </div>

                    {/* Comparison Periods */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Layers size={18} className="text-indigo-600"/> Resumen Mensual (Acumulado)</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                                    <span className="text-sm font-medium text-slate-600">Utilidad Bruta Mes</span>
                                    <span className="font-bold text-slate-800">L. {report.monthly.utilidadBruta.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl">
                                    <span className="text-sm font-medium text-red-600">(-) Gastos Operativos</span>
                                    <span className="font-bold text-red-600">L. {report.monthly.opex.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center p-4 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20">
                                    <span className="font-bold uppercase tracking-tighter">Utilidad Neta Mes</span>
                                    <span className="text-xl font-black">L. {report.monthly.utilidadNeta.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600"/> Rendimiento Anual</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                                    <span className="text-sm font-medium text-slate-600">Ventas Totales Año</span>
                                    <span className="font-bold text-slate-800">L. {report.yearly.ingresos.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                                    <span className="text-sm font-medium text-slate-600">Inversión en Mercancía</span>
                                    <span className="font-bold text-blue-600">L. {report.yearly.inversion.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center p-4 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-600/20">
                                    <span className="font-bold uppercase tracking-tighter">Cierre de Ganancia Anual</span>
                                    <span className="text-xl font-black">L. {report.yearly.utilidadNeta.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- TRANSACTIONS AUDIT TAB --- */}
            {activeTab === 'TRANSACTIONS' && (
                <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                    <div className="p-4 bg-slate-50 border-b flex flex-col md:flex-row gap-4 justify-between items-center">
                        <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setTxFilter('ALL')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${txFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'}`}>Todos</button>
                            <button onClick={() => setTxFilter('INGRESO')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${txFilter === 'INGRESO' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'}`}>Ingresos</button>
                            <button onClick={() => setTxFilter('GASTO')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${txFilter === 'GASTO' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'}`}>Gastos Op.</button>
                            <button onClick={() => setTxFilter('INVERSION')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${txFilter === 'INVERSION' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'}`}>Inversiones</button>
                        </div>
                        <div className="relative w-full md:w-64">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Buscar..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0 z-10 border-b">
                                <tr>
                                    <th className="p-4">Caja / Hora</th>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4">Impacto Contable</th>
                                    <th className="p-4 text-right">Monto</th>
                                    <th className="p-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTx.map(tx => (
                                    <tr key={`${tx.tipo}-${tx.id}`} className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-4">
                                            <p className="font-bold text-slate-700">{tx.idCaja}</p>
                                            <p className="text-[10px] text-slate-400 font-mono">{tx.fecha.split(' ')[1]}</p>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-600">{tx.descripcion}</span>
                                                {tx.descripcion.includes('FACT-') && (
                                                    <button onClick={() => handleShowSaleDetails(tx)} className="p-1 text-indigo-500 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors">
                                                        <Eye size={12}/>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                tx.categoria === 'Gasto Operativo' ? 'bg-red-100 text-red-700' : 
                                                tx.categoria === 'Compra de Producto' ? 'bg-blue-100 text-blue-700' : 
                                                'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                {tx.categoria}
                                            </span>
                                        </td>
                                        <td className={`p-4 text-right font-bold text-sm ${tx.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-slate-800'}`}>
                                            {tx.tipo === 'INGRESO' ? '+' : '-'} L. {tx.monto.toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEditTx(tx)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={14}/></button>
                                                <button className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- PARTNERS TAB --- */}
            {activeTab === 'PARTNERS' && report && (
                <div className="animate-fade-in space-y-6">
                    <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                        <div className="flex justify-between items-end mb-8 border-b border-slate-100 pb-6">
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Reparto de Utilidades Finales</h3>
                                <p className="text-slate-500 text-sm">Distribución basada en Utilidad Neta (Ingresos - COGS - OpEx)</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Cierre Mensual Proyectado</p>
                                <p className="text-4xl font-black text-indigo-600">L. {report.monthly.utilidadNeta.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {report.distribucion.map((d, i) => (
                                <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 hover:shadow-md transition-shadow relative group">
                                    <div className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-black">{d.porcentaje}%</div>
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
                                        <Users size={24}/>
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-800 mb-6">{d.socio}</h4>
                                    
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500 font-bold uppercase">Hoy:</span>
                                            <span className="font-bold text-slate-700">L. {d.gananciaDia.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-3">
                                            <span className="text-slate-500 font-bold uppercase">Este Mes:</span>
                                            <span className="font-black text-emerald-600">L. {d.gananciaMes.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs opacity-60">
                                            <span className="font-bold uppercase">Acum. Anual:</span>
                                            <span className="font-bold">L. {d.gananciaAnio.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* --- MODALS --- */}
        
        {/* SALE DETAILS */}
        {selectedSaleDetails && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-fade-in">
                    <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800">Detalle de Factura</h3>
                        <button onClick={() => setSelectedSaleDetails(null)} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                    </div>
                    <div className="p-4 max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-400 font-bold uppercase text-[10px] border-b">
                                <tr><th className="pb-2">Producto</th><th className="pb-2 text-center">Cant.</th><th className="pb-2 text-right">Precio</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {selectedSaleDetails.map((item, i) => (
                                    <tr key={i}><td className="py-3 font-medium text-slate-700">{item.descripcionProducto}</td><td className="py-3 text-center">{item.cantidad}</td><td className="py-3 text-right font-bold text-indigo-600">L. {Number(item.precioVenta).toFixed(2)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* EDIT TRANSACTION */}
        {editingTx && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit2 className="text-indigo-600" size={20}/> Editar Movimiento</h3>
                        <button onClick={() => setEditingTx(null)}><X className="text-slate-400"/></button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">Descripción / Concepto</label>
                            <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">Monto L.</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800" value={editForm.monto} onChange={e => setEditForm({...editForm, monto: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">Costo L. (ROI)</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={editForm.costo} onChange={e => setEditForm({...editForm, costo: e.target.value})} />
                            </div>
                        </div>
                        {editingTx.tipo === 'EGRESO' && (
                            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                                <label className="text-[10px] font-bold text-indigo-400 uppercase mb-2 block tracking-widest">Impacto Contable</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setEditForm({...editForm, categoria: 'Gasto Operativo'})}
                                        className={`p-2 rounded-xl text-[10px] font-black transition-all ${editForm.categoria === 'Gasto Operativo' ? 'bg-red-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200'}`}
                                    >GASTO OPERATIVO</button>
                                    <button 
                                        onClick={() => setEditForm({...editForm, categoria: 'Compra de Producto'})}
                                        className={`p-2 rounded-xl text-[10px] font-black transition-all ${editForm.categoria === 'Compra de Producto' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200'}`}
                                    >COMPRA STOCK</button>
                                </div>
                                <p className="text-[9px] text-indigo-400 mt-2 text-center italic">Los gastos restan ganancia neta. Las compras son reinversión.</p>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 mt-8">
                        <button onClick={() => setEditingTx(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                        <button onClick={saveEditTx} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Accounting;
