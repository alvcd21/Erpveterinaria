
import React, { useState, useEffect, useMemo } from 'react';
import { AccountingService, InventoryService } from '../services/api';
import { Socio, GastoContable, ReporteFinanciero, ProductoUnified, ComponenteCosto, CostoProducto, DailyTrackingRow, PnLRow } from '../types';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from 'recharts';
import { 
  Users, DollarSign, TrendingUp, Calculator, Plus, Edit2, Trash2, Calendar, FileText, ArrowRight, Wallet, Building2, User, Search, Package, Activity, Target, Layers, ChevronRight
} from 'lucide-react';
import Swal from 'sweetalert2';

const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'TRACKING' | 'COGS' | 'PNL' | 'GASTOS' | 'SOCIOS'>('TRACKING');
  const [loading, setLoading] = useState(false);
  
  // Basic Data
  const [socios, setSocios] = useState<Socio[]>([]);
  const [gastos, setGastos] = useState<GastoContable[]>([]);
  const [reporte, setReporte] = useState<ReporteFinanciero | null>(null);
  
  // Advanced Data
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductoUnified | null>(null);
  const [costComponents, setCostComponents] = useState<ComponenteCosto[]>([]);
  const [productCosts, setProductCosts] = useState<CostoProducto[]>([]);
  const [dailyTracking, setDailyTracking] = useState<DailyTrackingRow[]>([]);
  const [pnlData, setPnlData] = useState<PnLRow[]>([]);
  
  // Filters & Forms
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [productSearch, setProductSearch] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');
  
  const [socioForm, setSocioForm] = useState<Partial<Socio>>({ estado: 'Activo' });
  const [gastoForm, setGastoForm] = useState<Partial<GastoContable>>({ categoria: 'Operativo', origenFondo: 'Caja', fecha: new Date().toISOString().split('T')[0] });
  
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'SOCIO'|'GASTO'|'COST_COMPONENT'|'BUDGET'>('SOCIO');
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // New Forms
  const [costComponentForm, setCostComponentForm] = useState({ nombre: '', naturaleza: 'Fijo' });
  const [productCostForm, setProductCostForm] = useState({ idComponente: '', valor: '' });

  // Toggle for Partner view
  const [showPartnerProfit, setShowPartnerProfit] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab, month, year]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'SOCIOS') {
        const [sData, rep] = await Promise.all([
            AccountingService.getSocios(),
            AccountingService.getFinancialReport(month, year) // Cargamos reporte para mostrar ganancias
        ]);
        setSocios(sData);
        setReporte(rep);
      } else if (activeTab === 'GASTOS') {
        const start = `${year}-${String(month).padStart(2,'0')}-01`;
        const end = `${year}-${String(month).padStart(2,'0')}-31`;
        const [gData, sData] = await Promise.all([
            AccountingService.getGastosContables(start, end),
            AccountingService.getSocios()
        ]);
        setGastos(gData);
        setSocios(sData);
      } else if (activeTab === 'COGS') {
        const [prods, comps] = await Promise.all([
            InventoryService.getUnifiedProducts(),
            AccountingService.getCostComponents()
        ]);
        setProducts(prods || []);
        setCostComponents(comps || []);
      } else if (activeTab === 'TRACKING') {
        const start = `${year}-${String(month).padStart(2,'0')}-01`;
        const end = `${year}-${String(month).padStart(2,'0')}-31`;
        const track = await AccountingService.getDailyTracking(start, end);
        setDailyTracking(track);
      } else if (activeTab === 'PNL') {
        const pnl = await AccountingService.getPnLStatement(year);
        setPnlData(pnl);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleProductSelect = async (prod: ProductoUnified) => {
      setSelectedProduct(prod);
      const costs = await AccountingService.getProductDirectCosts(prod.id);
      setProductCosts(costs);
  };

  const filteredProducts = useMemo(() => {
      return products.filter(p => {
          const matchesTerm = p.nombre.toLowerCase().includes(productSearch.toLowerCase()) || 
                              p.codigo.toLowerCase().includes(productSearch.toLowerCase());
          const matchesType = productTypeFilter === 'ALL' || p.tipo === productTypeFilter;
          return matchesTerm && matchesType;
      });
  }, [products, productSearch, productTypeFilter]);

  // --- ACTIONS ---
  const handleAddProductCost = async () => {
      if (!selectedProduct || !productCostForm.idComponente || !productCostForm.valor) return;
      try {
          await AccountingService.addProductDirectCost({
              idProducto: selectedProduct.id,
              tipoProducto: selectedProduct.tipo,
              idComponente: Number(productCostForm.idComponente),
              valor: Number(productCostForm.valor)
          });
          const costs = await AccountingService.getProductDirectCosts(selectedProduct.id);
          setProductCosts(costs);
          setProductCostForm({ idComponente: '', valor: '' });
      } catch(e) { console.error(e); }
  };

  const handleDeleteProductCost = async (id: number) => {
      if(!selectedProduct) return;
      await AccountingService.deleteProductDirectCost(id);
      const costs = await AccountingService.getProductDirectCosts(selectedProduct.id);
      setProductCosts(costs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          if (modalType === 'SOCIO') {
              if (isEditing && editingId) await AccountingService.updateSocio(editingId, socioForm);
              else await AccountingService.createSocio(socioForm);
          } else if (modalType === 'GASTO') {
              const payload = { ...gastoForm, idSocioAsignado: gastoForm.idSocioAsignado ? Number(gastoForm.idSocioAsignado) : null };
              if (isEditing && editingId) await AccountingService.updateGastoContable(editingId, payload);
              else await AccountingService.createGastoContable(payload);
          } else if (modalType === 'COST_COMPONENT') {
              await AccountingService.createCostComponent(costComponentForm.nombre, costComponentForm.naturaleza);
          }
          setShowModal(false);
          loadData();
          Swal.fire('Guardado', 'Registro procesado', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  // Calculations for UI
  const totalUnitCost = selectedProduct ? (Number(selectedProduct.precioVenta) * 0.7) + productCosts.reduce((acc, c) => acc + Number(c.valor), 0) : 0; // Simulated Base Cost for visual if API doesn't return it yet.

  return (
    <div className="space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Calculator className="text-indigo-600"/> Contabilidad Avanzada
                </h2>
                <p className="text-slate-500 text-sm">Control financiero, costos y utilidades.</p>
            </div>
            
            {/* Global Filters */}
            <div className="flex gap-2 items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <Calendar size={18} className="text-slate-400 ml-2"/>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-700 outline-none p-1">
                    {Array.from({length:12}, (_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(0, m-1).toLocaleString('es',{month:'long'})}</option>)}
                </select>
                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-700 outline-none p-1">
                    {[2023,2024,2025].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {[
                { id: 'TRACKING', label: 'Sales Tracking', icon: <Activity size={18}/> },
                { id: 'COGS', label: 'Costos (COGS)', icon: <Package size={18}/> },
                { id: 'PNL', label: 'P&L (Resultados)', icon: <Target size={18}/> },
                { id: 'GASTOS', label: 'Gastos', icon: <Wallet size={18}/> },
                { id: 'SOCIOS', label: 'Socios y Reparto', icon: <Users size={18}/> },
            ].map(tab => (
                <button 
                    key={tab.id} 
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-white text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200'}`}
                >
                    {tab.icon} {tab.label}
                </button>
            ))}
        </div>

        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col p-0">
            
            {/* --- TRACKING TAB --- */}
            {activeTab === 'TRACKING' && (
                <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-800">Seguimiento Diario de Rentabilidad</h3>
                        <div className="text-xs text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">
                            Venta Neta - Costo Real (COGS) - Gastos Operativos = Utilidad Neta
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 bg-slate-50">Fecha</th>
                                    <th className="p-4 bg-slate-50 text-right">Venta Total</th>
                                    <th className="p-4 bg-slate-50 text-right text-red-400">(-) COGS Real</th>
                                    <th className="p-4 bg-slate-50 text-right text-orange-400">(-) OpEx</th>
                                    <th className="p-4 bg-slate-50 text-right font-bold text-slate-700">Ganancia Bruta</th>
                                    <th className="p-4 bg-slate-50 text-right font-bold text-emerald-600">Utilidad Neta</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dailyTracking.length > 0 ? dailyTracking.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-mono text-slate-700 font-medium">{row.fecha}</div>
                                            <div className="text-xs text-slate-400">{row.diaSemana}</div>
                                        </td>
                                        <td className="p-4 text-right font-bold text-slate-700">L. {Number(row.ventaTotal).toLocaleString()}</td>
                                        <td className="p-4 text-right text-red-500">L. {Number(row.costosDirectos).toLocaleString()}</td>
                                        <td className="p-4 text-right text-orange-500">L. {Number(row.gastosOperativos).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold text-slate-600 bg-slate-50/50">L. {Number(row.gananciaBruta).toLocaleString()}</td>
                                        <td className={`p-4 text-right font-bold ${Number(row.gananciaNeta) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            L. {Number(row.gananciaNeta).toLocaleString()}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay movimientos registrados en este período.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- COGS TAB (REDISEÑADO) --- */}
            {activeTab === 'COGS' && (
                <div className="flex h-full divide-x divide-slate-200">
                    {/* LEFT: Product List */}
                    <div className="w-1/3 flex flex-col bg-slate-50/50">
                        <div className="p-4 border-b border-slate-200 space-y-3 bg-white">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                    placeholder="Buscar por nombre o código..."
                                    value={productSearch}
                                    onChange={e => setProductSearch(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2">
                                {['ALL', 'TELEFONO', 'ACCESORIO'].map(t => (
                                    <button 
                                        key={t}
                                        onClick={() => setProductTypeFilter(t as any)}
                                        className={`flex-1 py-1.5 text-[10px] font-bold rounded uppercase border ${productTypeFilter === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                                    >
                                        {t === 'ALL' ? 'Todos' : t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {filteredProducts.slice(0, 100).map(p => (
                                <div 
                                    key={p.id} 
                                    onClick={() => handleProductSelect(p)}
                                    className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedProduct?.id === p.id ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <p className="font-bold text-sm text-slate-700 line-clamp-1">{p.nombre}</p>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${p.tipo === 'TELEFONO' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{p.tipo.substring(0,3)}</span>
                                    </div>
                                    <div className="flex justify-between mt-1 text-xs">
                                        <span className="text-slate-400 font-mono">{p.codigo}</span>
                                        <span className="font-bold text-indigo-600">L. {Number(p.precioVenta).toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT: Detail */}
                    <div className="flex-1 flex flex-col bg-white">
                        {selectedProduct ? (
                            <>
                                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/30">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800">{selectedProduct.nombre}</h3>
                                        <p className="text-sm text-slate-500 flex items-center gap-2">
                                            <Package size={14}/> {selectedProduct.tipo} 
                                            <span className="text-slate-300">|</span> 
                                            <span className="font-mono text-slate-400">{selectedProduct.codigo}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-slate-400 uppercase">Precio Venta</p>
                                        <p className="text-2xl font-bold text-indigo-600">L. {Number(selectedProduct.precioVenta).toFixed(2)}</p>
                                    </div>
                                </div>

                                <div className="p-6 flex-1 overflow-y-auto">
                                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                                        <Layers size={16} className="text-indigo-500"/> Estructura de Costos
                                    </h4>
                                    
                                    <div className="space-y-3 mb-8">
                                        {/* Costo Base Implícito */}
                                        <div className="flex justify-between items-center p-3 rounded-lg border border-slate-100 bg-slate-50 text-slate-400">
                                            <span className="font-medium text-sm flex items-center gap-2"><Building2 size={14}/> Costo de Compra Base (Proveedor)</span>
                                            <span className="font-bold text-sm">Gestionado en Inventario</span>
                                        </div>

                                        {productCosts.map(cost => (
                                            <div key={cost.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm animate-fade-in-up">
                                                <span className="font-medium text-slate-700 flex items-center gap-2"><ArrowRight size={14} className="text-red-400"/> {cost.nombreComponente}</span>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-bold text-red-500">- L. {Number(cost.valor).toFixed(2)}</span>
                                                    <button onClick={() => handleDeleteProductCost(cost.id)} className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors"><Trash2 size={16}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add Cost Form */}
                                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                                        <p className="text-xs font-bold text-indigo-800 mb-3 uppercase">Agregar Costo Adicional</p>
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Concepto</label>
                                                <select 
                                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                                    value={productCostForm.idComponente}
                                                    onChange={e => setProductCostForm({...productCostForm, idComponente: e.target.value})}
                                                >
                                                    <option value="">-- Seleccionar --</option>
                                                    {costComponents.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                                </select>
                                            </div>
                                            <div className="w-32">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Valor (L.)</label>
                                                <input 
                                                    type="number" 
                                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white font-bold text-red-500 focus:ring-2 focus:ring-indigo-500/20 outline-none" 
                                                    placeholder="0.00"
                                                    value={productCostForm.valor}
                                                    onChange={e => setProductCostForm({...productCostForm, valor: e.target.value})}
                                                />
                                            </div>
                                            <button onClick={handleAddProductCost} className="bg-indigo-600 text-white p-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm" title="Agregar Costo">
                                                <Plus size={20}/>
                                            </button>
                                        </div>
                                        <div className="mt-2 text-right">
                                            <button onClick={() => { setModalType('COST_COMPONENT'); setShowModal(true); }} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline">
                                                + Crear Nuevo Tipo de Costo
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <Package size={40} className="opacity-50"/>
                                </div>
                                <p className="font-medium">Selecciona un producto de la lista</p>
                                <p className="text-sm opacity-70">Para gestionar sus costos directos</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- TAB: SOCIOS Y REPARTO (COMBINADO) --- */}
            {activeTab === 'SOCIOS' && (
                <div className="flex flex-col h-full p-6 space-y-6">
                    {/* Header Controls */}
                    <div className="flex justify-between items-center">
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setShowPartnerProfit(false)} 
                                className={`text-sm font-bold pb-2 border-b-2 transition-colors ${!showPartnerProfit ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                            >
                                Gestión de Socios
                            </button>
                            <button 
                                onClick={() => setShowPartnerProfit(true)} 
                                className={`text-sm font-bold pb-2 border-b-2 transition-colors ${showPartnerProfit ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                            >
                                Reparto de Utilidades
                            </button>
                        </div>
                        {!showPartnerProfit && (
                            <button onClick={() => { setModalType('SOCIO'); setIsEditing(false); setSocioForm({ estado: 'Activo' }); setShowModal(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm hover:bg-indigo-700 shadow-sm"><Plus size={16}/> Agregar Socio</button>
                        )}
                    </div>

                    {showPartnerProfit ? (
                        <div className="flex-1 overflow-auto animate-fade-in space-y-6">
                            {reporte ? (
                                <>
                                    <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg flex justify-between items-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                                        <div>
                                            <p className="text-indigo-200 text-xs font-bold uppercase mb-1">Utilidad Neta a Repartir</p>
                                            <h3 className="text-4xl font-bold tracking-tight">L. {reporte.utilidadNeta.toLocaleString()}</h3>
                                            <p className="text-sm opacity-60 mt-1">Periodo: {reporte.periodo}</p>
                                        </div>
                                        <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                                            <DollarSign size={32} className="text-emerald-400"/>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {reporte.distribucion.map((d, idx) => (
                                            <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                                    <User size={64}/>
                                                </div>
                                                <div className="flex justify-between items-start mb-6 relative z-10">
                                                    <div>
                                                        <h4 className="font-bold text-xl text-slate-800">{d.socio}</h4>
                                                        <span className="text-xs font-medium text-slate-500">Socio Activo</span>
                                                    </div>
                                                    <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold text-xs border border-indigo-100">{d.porcentaje}% Part.</span>
                                                </div>
                                                <div className="space-y-3 text-sm relative z-10">
                                                    <div className="flex justify-between text-slate-600">
                                                        <span>Participación Bruta:</span>
                                                        <span className="font-bold">L. {d.utilidadCorrespondiente.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between text-red-500 bg-red-50 p-2 rounded-lg -mx-2">
                                                        <span>(-) Adelantos / Gastos:</span>
                                                        <span className="font-bold">- L. {d.gastosPersonalesDeducidos.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between border-t border-slate-100 pt-3 mt-2">
                                                        <span className="font-bold text-slate-800 text-base">PAGO NETO:</span>
                                                        <span className="font-bold text-xl text-emerald-600">L. {d.pagoFinal.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-8 text-slate-400">Cargando datos financieros...</div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto animate-fade-in">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase rounded-t-xl">
                                    <tr><th className="p-4 rounded-tl-xl">Nombre</th><th className="p-4">Participación</th><th className="p-4">Fecha Ingreso</th><th className="p-4">Estado</th><th className="p-4 rounded-tr-xl text-right">Acciones</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {socios.map(s => (
                                        <tr key={s.idSocio} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-bold text-slate-700">{s.nombre}</td>
                                            <td className="p-4">
                                                <div className="w-full bg-slate-100 rounded-full h-2.5 max-w-[100px] inline-block mr-2 align-middle">
                                                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{width: `${s.porcentajeParticipacion}%`}}></div>
                                                </div>
                                                <span className="text-xs font-bold">{s.porcentajeParticipacion}%</span>
                                            </td>
                                            <td className="p-4 text-sm text-slate-500">{new Date(s.fechaIngreso||'').toLocaleDateString()}</td>
                                            <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${s.estado==='Activo'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{s.estado}</span></td>
                                            <td className="p-4 text-right flex justify-end gap-2">
                                                <button onClick={() => { setModalType('SOCIO'); setSocioForm(s); setIsEditing(true); setEditingId(s.idSocio); setShowModal(true); }} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 size={16}/></button>
                                                <button onClick={async () => {
                                                    const r = await Swal.fire({ title: '¿Eliminar socio?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' });
                                                    if(r.isConfirmed) { await AccountingService.deleteSocio(s.idSocio); loadData(); }
                                                }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* --- OTHER TABS (PNL / GASTOS) --- */}
            {activeTab === 'PNL' && (
                <div className="p-6 h-full flex flex-col animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 text-lg">Estado de Resultados (P&L) - {year}</h3>
                        <div className="text-sm text-slate-500">Comparativa Real vs Presupuesto</div>
                    </div>
                    <div className="overflow-auto flex-1 rounded-xl border border-slate-200">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0">
                                <tr>
                                    <th className="p-4">Concepto</th>
                                    <th className="p-4 text-right">Real (Acum.)</th>
                                    <th className="p-4 text-right">Presupuesto</th>
                                    <th className="p-4 text-right">Variación</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pnlData.map((row, i) => (
                                    <tr key={i} className={`hover:bg-slate-50 transition-colors ${row.isTotal ? 'bg-slate-50/80 font-bold border-t-2 border-slate-200' : ''}`}>
                                        <td className="p-4 text-slate-700">{row.concepto}</td>
                                        <td className="p-4 text-right font-medium text-slate-800">L. {Number(row.real).toLocaleString()}</td>
                                        <td className="p-4 text-right text-slate-500">L. {Number(row.presupuesto).toLocaleString()}</td>
                                        <td className={`p-4 text-right font-bold ${row.diferencia >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {row.diferencia > 0 ? '+' : ''}L. {Number(row.diferencia).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'GASTOS' && (
                <div className="p-6 h-full flex flex-col animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-800 text-lg">Registro de Gastos</h3>
                        <button onClick={() => { 
                            setModalType('GASTO'); 
                            setGastoForm({ categoria: 'Operativo', origenFondo: 'Caja', fecha: new Date().toISOString().split('T')[0] });
                            setIsEditing(false);
                            setShowModal(true); 
                        }} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm hover:bg-slate-700 transition-colors"><Plus size={16}/> Registrar Gasto</button>
                    </div>
                    <div className="overflow-auto flex-1 rounded-xl border border-slate-200">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0">
                                <tr><th className="p-4">Fecha</th><th className="p-4">Descripción</th><th className="p-4">Categoría</th><th className="p-4 text-right">Monto</th><th className="p-4 text-center">Asignado</th><th className="p-4 text-right">Acciones</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {gastos.map(g => (
                                    <tr key={g.idGasto} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 text-slate-500 font-mono text-xs">{g.fecha}</td>
                                        <td className="p-4 font-bold text-slate-700">{g.descripcion}</td>
                                        <td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{g.categoria}</span></td>
                                        <td className="p-4 text-right font-bold text-red-500">L. {Number(g.monto).toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            {g.idSocioAsignado ? (
                                                <span className="flex items-center justify-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit mx-auto"><User size={12}/> {g.nombreSocio}</span>
                                            ) : (
                                                <span className="flex items-center justify-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded w-fit mx-auto"><Building2 size={12}/> Empresa</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <button onClick={async () => {
                                                const r = await Swal.fire({ title: '¿Eliminar gasto?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' });
                                                if(r.isConfirmed) { await AccountingService.deleteGastoContable(g.idGasto); loadData(); }
                                            }} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={16}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* UNIVERSAL MODAL */}
        {showModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-fade-in">
                    <h3 className="text-lg font-bold mb-4 text-slate-800">
                        {modalType === 'COST_COMPONENT' ? 'Nuevo Tipo de Costo' : 
                         modalType === 'SOCIO' ? (isEditing ? 'Editar Socio' : 'Nuevo Socio') : 'Registrar Gasto'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {modalType === 'COST_COMPONENT' && (
                            <>
                                <input required className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Nombre (Ej: Empaque)" value={costComponentForm.nombre} onChange={e=>setCostComponentForm({...costComponentForm, nombre: e.target.value})}/>
                                <select className="w-full p-3 border border-slate-200 rounded-xl outline-none" value={costComponentForm.naturaleza} onChange={e=>setCostComponentForm({...costComponentForm, naturaleza: e.target.value})}>
                                    <option value="Fijo">Fijo (Monto por unidad)</option>
                                    <option value="Porcentual">Porcentual (% del precio)</option>
                                </select>
                            </>
                        )}
                        {modalType === 'GASTO' && (
                             <>
                                <input required type="date" className="w-full p-3 border border-slate-200 rounded-xl" value={gastoForm.fecha} onChange={e=>setGastoForm({...gastoForm, fecha:e.target.value})}/>
                                <input required className="w-full p-3 border border-slate-200 rounded-xl" placeholder="Descripción" value={gastoForm.descripcion || ''} onChange={e=>setGastoForm({...gastoForm, descripcion:e.target.value})}/>
                                <input required type="number" className="w-full p-3 border border-slate-200 rounded-xl font-bold" placeholder="Monto" value={gastoForm.monto || ''} onChange={e=>setGastoForm({...gastoForm, monto: Number(e.target.value)})}/>
                                
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Categoría</label>
                                    <select className="w-full p-3 border border-slate-200 rounded-xl" value={gastoForm.categoria} onChange={e=>setGastoForm({...gastoForm, categoria: e.target.value as any})}>
                                        <option value="Operativo">Operativo (Alquiler, Luz)</option>
                                        <option value="Administrativo">Administrativo</option>
                                        <option value="Ventas">Ventas (Publicidad)</option>
                                        <option value="Personal">Personal (Adelanto Socio)</option>
                                    </select>
                                </div>

                                {gastoForm.categoria === 'Personal' && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Asignar a Socio</label>
                                        <select className="w-full p-3 border border-slate-200 rounded-xl" value={gastoForm.idSocioAsignado || ''} onChange={e=>setGastoForm({...gastoForm, idSocioAsignado: e.target.value ? Number(e.target.value) : null})}>
                                            <option value="">-- Seleccionar --</option>
                                            {socios.map(s => <option key={s.idSocio} value={s.idSocio}>{s.nombre}</option>)}
                                        </select>
                                    </div>
                                )}
                            </>
                        )}
                        
                        {modalType === 'SOCIO' && (
                            <>
                                <input required className="w-full p-3 border border-slate-200 rounded-xl" placeholder="Nombre Completo" value={socioForm.nombre || ''} onChange={e=>setSocioForm({...socioForm, nombre:e.target.value})}/>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Porcentaje Participación (%)</label>
                                    <input required type="number" step="0.01" className="w-full p-3 border border-slate-200 rounded-xl" placeholder="0 - 100" value={socioForm.porcentajeParticipacion || ''} onChange={e=>setSocioForm({...socioForm, porcentajeParticipacion: Number(e.target.value)})}/>
                                </div>
                                <select className="w-full p-3 border border-slate-200 rounded-xl" value={socioForm.estado} onChange={e=>setSocioForm({...socioForm, estado: e.target.value as any})}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select>
                            </>
                        )}
                        
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-slate-100 p-3 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button type="submit" className="flex-1 bg-indigo-600 p-3 rounded-xl text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">Guardar</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default Accounting;
