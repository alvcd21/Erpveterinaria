
import React, { useState, useEffect } from 'react';
import { AccountingService, SalesService } from '../services/api';
import { Socio, DetalleVenta } from '../types';
import { 
  Calculator, Users, FileText, Search, Edit2, Trash2, X, Check, ArrowUpRight, ArrowDownRight, 
  DollarSign, PieChart, Activity, ShoppingBag, Calendar, Eye, RefreshCw, LayoutGrid, List
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
    categoria?: string;
}

interface ProfitReport {
    ingresos: number;
    costoMercancia: number;
    utilidadBruta: number;
    gastosOperativos: number;
    comprasInventario: number;
    utilidadNeta: number;
    distribucion: { socio: string; porcentaje: number; monto: number; }[];
}

const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'AUDIT' | 'PROFIT' | 'PARTNERS'>('PROFIT');
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [transactions, setTransactions] = useState<AuditTransaction[]>([]);
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [partners, setPartners] = useState<Socio[]>([]);
  
  // Filters
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');

  // Detailed Sale Modal
  const [selectedSaleDetails, setSelectedSaleDetails] = useState<DetalleVenta[] | null>(null);
  const [showSaleDetails, setShowSaleDetails] = useState(false);

  // Edit Modal
  const [editingTx, setEditingTx] = useState<AuditTransaction | null>(null);
  const [editForm, setEditForm] = useState({ descripcion: '', monto: '', costo: '', categoria: '' });

  useEffect(() => {
    loadTabContent();
  }, [activeTab, selectedDate]);

  const loadTabContent = async () => {
    setLoading(true);
    try {
        if (activeTab === 'AUDIT') {
            const data = await AccountingService.getAuditTransactions();
            setTransactions(data);
        } else if (activeTab === 'PROFIT') {
            const data = await AccountingService.getProfitabilityReport(selectedDate);
            setReport(data);
        } else if (activeTab === 'PARTNERS') {
            const data = await AccountingService.getSocios();
            setPartners(data);
        }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleShowSaleDetails = async (tx: AuditTransaction) => {
      // Extraer ID de factura de la descripción "Venta Factura #FACT-0001"
      const match = tx.descripcion.match(/FACT-\d+/);
      if (match) {
          try {
              const details = await SalesService.getDetallesVenta(match[0]);
              setSelectedSaleDetails(details);
              setShowSaleDetails(true);
          } catch (e) { Swal.fire('Error', 'No se pudieron cargar los detalles de la venta', 'error'); }
      } else {
          Swal.fire('Info', 'Este ingreso no tiene una factura asociada detallada.', 'info');
      }
  };

  const handleEditTx = (tx: AuditTransaction) => {
      setEditingTx(tx);
      setEditForm({ 
          descripcion: tx.descripcion, 
          monto: String(tx.monto), 
          costo: String(tx.costo || 0),
          categoria: tx.categoria || 'Gasto Operativo'
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
          loadTabContent();
          Swal.fire('Éxito', 'Movimiento actualizado y balance de caja recalculado', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deleteTx = async (tx: AuditTransaction) => {
      const res = await Swal.fire({
          title: '¿Eliminar movimiento?',
          text: 'Esta acción actualizará el arqueo de caja automáticamente.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Sí, eliminar'
      });
      if (res.isConfirmed) {
          try {
              await AccountingService.deleteAuditTransaction(tx.tipo, tx.id);
              loadTabContent();
              Swal.fire('Eliminado', 'Movimiento borrado con éxito', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const filteredTx = transactions.filter(t => 
      t.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.idCaja.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 h-full flex flex-col">
        {/* Header con KPIs */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Calculator className="text-indigo-600"/> Gestión Contable y Auditoría
                </h2>
                <p className="text-slate-500 text-sm mt-1">Control financiero 360°: Costos, P&L y Seguimiento Diario.</p>
            </div>
            
            <div className="flex gap-2 items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <Calendar size={18} className="text-slate-400 ml-2"/>
                <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-700 outline-none p-1"
                />
                <button onClick={loadTabContent} className="p-1.5 hover:bg-white rounded-lg text-slate-400 transition-colors">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
                </button>
            </div>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
                { id: 'PROFIT', label: 'Dashboard Ganancias', icon: <PieChart size={18}/> },
                { id: 'AUDIT', label: 'Auditoría de Caja', icon: <Activity size={18}/> },
                { id: 'PARTNERS', label: 'Socios y Reparto', icon: <Users size={18}/> },
            ].map(tab => (
                <button 
                    key={tab.id} 
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'}`}
                >
                    {tab.icon} {tab.label}
                </button>
            ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            
            {/* --- DASHBOARD TAB --- */}
            {activeTab === 'PROFIT' && report && (
                <div className="p-6 space-y-8 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl">
                            <p className="text-indigo-600 text-xs font-bold uppercase mb-1">Ingresos Totales</p>
                            <h3 className="text-2xl font-bold text-slate-800">L. {report.ingresos.toLocaleString()}</h3>
                            <p className="text-[10px] text-slate-400 mt-2">Ventas POS y Manuales</p>
                        </div>
                        <div className="bg-red-50 border border-red-100 p-5 rounded-2xl">
                            <p className="text-red-600 text-xs font-bold uppercase mb-1">Costo Mercancía</p>
                            <h3 className="text-2xl font-bold text-slate-800">L. {report.costoMercancia.toLocaleString()}</h3>
                            <p className="text-[10px] text-slate-400 mt-2">Costo Base de Productos</p>
                        </div>
                        <div className="bg-orange-50 border border-orange-100 p-5 rounded-2xl">
                            <p className="text-orange-600 text-xs font-bold uppercase mb-1">Gastos Operativos</p>
                            <h3 className="text-2xl font-bold text-slate-800">L. {report.gastosOperativos.toLocaleString()}</h3>
                            <p className="text-[10px] text-slate-400 mt-2">Alquiler, Luz, otros</p>
                        </div>
                        <div className="bg-emerald-600 p-5 rounded-2xl shadow-lg shadow-emerald-600/20 text-white">
                            <p className="text-emerald-100 text-xs font-bold uppercase mb-1">Utilidad Neta</p>
                            <h3 className="text-3xl font-bold">L. {report.utilidadNeta.toLocaleString()}</h3>
                            <div className="h-1 bg-white/20 w-full mt-3 rounded-full overflow-hidden">
                                <div className="h-full bg-white" style={{width: '60%'}}></div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Distribución a Socios */}
                        <div className="lg:col-span-2 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Users size={20} className="text-indigo-600"/> Reparto de Utilidades Finales
                            </h4>
                            <div className="space-y-3">
                                {report.distribucion.map((d, i) => (
                                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center hover:shadow-sm transition-all">
                                        <div>
                                            <p className="font-bold text-slate-700">{d.socio}</p>
                                            <p className="text-xs text-slate-400">Participación: {d.porcentaje}%</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-bold text-emerald-600">L. {d.monto.toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-400">Pago Correspondiente</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Balance Rápido */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200">
                             <h4 className="font-bold text-slate-800 mb-4">Balance General</h4>
                             <div className="space-y-4">
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-slate-500">Ingresos</span>
                                    <span className="font-bold text-emerald-600">+ L. {report.ingresos.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-slate-500">Inversión Stock (Día)</span>
                                    <span className="font-bold text-blue-600">L. {report.comprasInventario.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-slate-500">Gasto Op. Acumulado</span>
                                    <span className="font-bold text-red-500">- L. {report.gastosOperativos.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 font-black text-lg">
                                    <span className="text-slate-800 uppercase tracking-tighter">UTILIDAD</span>
                                    <span className="text-indigo-600">L. {report.utilidadNeta.toFixed(2)}</span>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- AUDIT TAB --- */}
            {activeTab === 'AUDIT' && (
                <div className="flex flex-col h-full animate-fade-in">
                    <div className="p-4 border-b bg-slate-50 flex flex-col md:flex-row gap-4 justify-between items-center">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                            <input 
                                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                placeholder="Buscar por descripción o caja..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-slate-500 italic">Audita movimientos registrados en puntos de venta.</p>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4">Fecha/Hora</th>
                                    <th className="p-4">Caja</th>
                                    <th className="p-4">Tipo</th>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4 text-right">Monto</th>
                                    <th className="p-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTx.map(tx => (
                                    <tr key={`${tx.tipo}-${tx.id}`} className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-4 font-mono text-xs text-slate-400">{tx.fecha}</td>
                                        <td className="p-4 font-bold text-slate-600">{tx.idCaja}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tx.tipo === 'INGRESO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                {tx.tipo}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-700">{tx.descripcion}</span>
                                                {tx.descripcion.includes('FACT-') && (
                                                    <button onClick={() => handleShowSaleDetails(tx)} className="p-1 text-indigo-500 hover:bg-indigo-50 rounded" title="Ver Detalle de Venta">
                                                        <Eye size={14}/>
                                                    </button>
                                                )}
                                            </div>
                                            {tx.categoria && <p className="text-[10px] text-indigo-500 font-bold uppercase">{tx.categoria}</p>}
                                        </td>
                                        <td className={`p-4 text-right font-bold ${tx.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {tx.tipo === 'INGRESO' ? '+' : '-'} L. {tx.monto.toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEditTx(tx)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button>
                                                <button onClick={() => deleteTx(tx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
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
            {activeTab === 'PARTNERS' && (
                <div className="p-6 animate-fade-in space-y-6">
                    <div className="flex justify-between items-center">
                         <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Users className="text-indigo-600"/> Gestión de Socios</h3>
                         <button onClick={() => { /* Modal Nuevo Socio */ }} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold">+ Nuevo Socio</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {partners.map(p => (
                            <div key={p.idSocio} className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm hover:border-indigo-300 transition-all group relative">
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><Edit2 size={14}/></button>
                                    <button className="p-1.5 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
                                </div>
                                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-4">
                                    <Users size={24}/>
                                </div>
                                <h4 className="font-bold text-slate-800 text-lg leading-tight">{p.nombre}</h4>
                                <p className="text-xs text-slate-400 mt-1">Activo desde {new Date(p.fechaIngreso||'').toLocaleDateString()}</p>
                                <div className="mt-6 flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Participación</p>
                                        <p className="text-3xl font-black text-indigo-600">{p.porcentajeParticipacion}%</p>
                                    </div>
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-[10px] font-bold">Activo</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* --- MODAL DETALLE VENTA --- */}
        {showSaleDetails && selectedSaleDetails && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in">
                    <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><ShoppingBag className="text-indigo-600"/> Detalle de Productos</h3>
                            <p className="text-xs text-slate-500">Desglose de items en esta factura.</p>
                        </div>
                        <button onClick={() => setShowSaleDetails(false)} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                    </div>
                    <div className="p-0 overflow-y-auto max-h-[60vh]">
                        <table className="w-full text-left">
                            <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase">
                                <tr>
                                    <th className="p-4">Producto</th>
                                    <th className="p-4 text-center">Cant.</th>
                                    <th className="p-4 text-right">Precio Venta</th>
                                    <th className="p-4 text-right">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {selectedSaleDetails.map((item, i) => (
                                    <tr key={i} className="text-sm">
                                        <td className="p-4 font-medium">{item.descripcionProducto}</td>
                                        <td className="p-4 text-center">{item.cantidad}</td>
                                        <td className="p-4 text-right">L. {Number(item.precioVenta).toFixed(2)}</td>
                                        <td className="p-4 text-right font-bold text-indigo-600">L. {(item.cantidad * item.precioVenta).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-6 bg-slate-50 border-t flex justify-end">
                        <button onClick={() => setShowSaleDetails(false)} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">Entendido</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL EDICIÓN TRANSACCIÓN --- */}
        {editingTx && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
                    <div className="p-6 border-b flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800">Editar {editingTx.tipo}</h3>
                        <button onClick={() => setEditingTx(null)}><X size={20} className="text-slate-400"/></button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Descripción</label>
                            <input 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={editForm.descripcion}
                                onChange={e => setEditForm({...editForm, descripcion: e.target.value})}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Monto (Venta)</label>
                                <input 
                                    type="number"
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-bold text-emerald-600 outline-none"
                                    value={editForm.monto}
                                    onChange={e => setEditForm({...editForm, monto: e.target.value})}
                                />
                            </div>
                            {editingTx.tipo === 'INGRESO' ? (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Costo (Inversión)</label>
                                    <input 
                                        type="number"
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 outline-none"
                                        value={editForm.costo}
                                        onChange={e => setEditForm({...editForm, costo: e.target.value})}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Categoría</label>
                                    <select 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 outline-none text-xs font-bold"
                                        value={editForm.categoria}
                                        onChange={e => setEditForm({...editForm, categoria: e.target.value})}
                                    >
                                        <option value="Gasto Operativo">Gasto Operativo</option>
                                        <option value="Compra de Producto">Compra de Producto</option>
                                        <option value="Otros">Otros</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="p-6 pt-0 flex gap-3">
                        <button onClick={() => setEditingTx(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">Cancelar</button>
                        <button onClick={saveEditTx} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Accounting;
