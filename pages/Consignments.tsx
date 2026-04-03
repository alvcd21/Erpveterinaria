
import React, { useState, useEffect, useMemo } from 'react';
import { ConsignService, InventoryService } from '../services/api';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Consignacion, ProductoUnified } from '../types';
import { 
  Hand, PlusCircle, Search, Store, ShoppingCart, RefreshCcw, X, Save, RefreshCw, AlertTriangle, ArrowRightCircle, Trash2, Edit2, Filter, Package, Smartphone, Layers, Check, Minus, Plus, LayoutGrid
} from 'lucide-react';
import Swal from 'sweetalert2';
import * as ReactRouterDOM from 'react-router-dom';
const { useLocation } = ReactRouterDOM as any;

const Consignments: React.FC = () => {
  const location = useLocation();
  const [consignments, setConsignments] = useState<Consignacion[]>([]);
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal & Flow State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  
  // Selection / Cart State
  const [cart, setCart] = useState<{product: ProductoUnified, qty: number, specialPrice: number}[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Mobile Modal Tabs
  const [modalTab, setModalTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  // Catalog Filtering
  const [catSearch, setCatSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');

  useOfflineSync(loadData);
  useEffect(() => {
    loadData();
    loadProducts();
    // Handle redirect from Inventory
    if (location.state?.consignItem) {
        const item = location.state.consignItem;
        addToCart(item);
        setShowModal(true);
        setModalTab('CART');
    }
  }, [location.state]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await ConsignService.getAll();
      setConsignments(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadProducts = async () => {
      try {
          const data = await InventoryService.getUnifiedProducts();
          setProducts(data || []);
      } catch (e) { console.error(e); }
  };

  const addToCart = (p: ProductoUnified) => {
      const exists = cart.find(c => c.product.id === p.id);
      if (exists) {
          if (p.tipo === 'TELEFONO') return;
          if (exists.qty + 1 > p.stock) return Swal.fire('Stock Insuficiente', '', 'warning');
          setCart(cart.map(c => c.product.id === p.id ? {...c, qty: c.qty + 1} : c));
      } else {
          setCart([...cart, { product: p, qty: 1, specialPrice: p.precioVenta }]);
      }
      
      // Feedback visual para móvil: Si es teléfono, solemos querer ver el resumen rápido
      if (window.innerWidth < 768 && p.tipo === 'TELEFONO') {
          setModalTab('CART');
      }
  };

  const removeFromCart = (id: string) => setCart(cart.filter(c => c.product.id !== id));
  
  const updateCartItem = (id: string, updates: any) => {
      setCart(cart.map(c => c.product.id === id ? {...c, ...updates} : c));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return Swal.fire('Error', 'Agregue productos al préstamo', 'warning');
    if (!businessName) return Swal.fire('Error', 'Ingrese el negocio de destino', 'warning');

    try {
        const payload = cart.map(item => ({
            id_producto: item.product.id,
            tipo_producto: item.product.tipo as 'TELEFONO' | 'ACCESORIO',
            negocio_destino: businessName,
            cantidad_prestada: item.qty,
            precio_especial_pago: item.specialPrice,
            fecha_limite: dueDate || null
        }));
        
        await ConsignService.create(payload);
        setShowModal(false);
        setCart([]);
        setBusinessName('');
        setDueDate('');
        loadData();
        loadProducts();
        Swal.fire('Éxito', 'Préstamo registrado correctamente', 'success');
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleUpdate = async () => {
      if(!editId || !businessName) return;
      try {
          const item = cart[0]; 
          await ConsignService.update(editId, {
              negocio_destino: businessName,
              precio_especial_pago: item.specialPrice,
              fecha_limite: dueDate
          });
          setShowModal(false); loadData();
          Swal.fire('Actualizado', 'Registro modificado', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleEdit = (c: Consignacion) => {
      setIsEditing(true);
      setEditId(c.id_consignacion);
      setBusinessName(c.negocio_destino);
      setDueDate(c.fecha_limite ? c.fecha_limite.split('T')[0] : '');
      const prod = products.find(p => p.id === c.id_producto) || { id: c.id_producto, nombre: c.nombre_producto, tipo: c.tipo_producto, stock: 0, precioVenta: c.precio_especial_pago, codigo: '' } as ProductoUnified;
      setCart([{ product: prod, qty: c.cantidad_prestada, specialPrice: Number(c.precio_especial_pago) }]);
      setModalTab('CART');
      setShowModal(true);
  };

  const handleDelete = async (id: number) => {
      const result = await Swal.fire({ title: '¿Eliminar registro?', text: 'El stock será devuelto al inventario.', icon: 'warning', showCancelButton: true });
      if(result.isConfirmed) { try { await ConsignService.delete(id); loadData(); loadProducts(); } catch(e:any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const handleLiquidate = async (id: number) => {
      const result = await Swal.fire({
          title: '¿Confirmar Pago?',
          text: 'Se registrará el ingreso por el precio especial detallando marca y modelo.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, Liquidar'
      });
      if (result.isConfirmed) {
          try { await ConsignService.liquidate(id); loadData(); Swal.fire('Vendido', 'Ingreso registrado en caja.', 'success'); } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const handleReturn = async (id: number) => {
      const result = await Swal.fire({ title: '¿Retornar a Stock?', text: 'El producto volverá a estar disponible.', icon: 'warning', showCancelButton: true });
      if (result.isConfirmed) {
          try { await ConsignService.returnToStock(id); loadData(); loadProducts(); Swal.fire('Retornado', 'Producto reingresado.', 'success'); } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const categories = useMemo(() => ['ALL', ...new Set(products.map(p => p.categoria).filter(Boolean))], [products]);
  
  const filteredCatalog = products.filter(p => {
      const matchSearch = p.nombre.toLowerCase().includes(catSearch.toLowerCase()) || p.imei?.includes(catSearch) || p.codigo.toLowerCase().includes(catSearch.toLowerCase());
      const matchCat = selectedCat === 'ALL' || p.categoria === selectedCat;
      const matchType = selectedType === 'ALL' || p.tipo === selectedType;
      return matchSearch && matchCat && matchType && p.stock > 0;
  });

  const filteredConsignments = consignments.filter(c => 
      c.negocio_destino.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.nombre_producto?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in h-full flex flex-col overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-1">
            <div className="w-full md:w-auto">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Hand className="text-orange-600" size={24}/> Consignaciones
                </h2>
                <p className="text-slate-500 text-xs md:text-sm">Gestiona préstamos a otros negocios y liquidaciones externas.</p>
            </div>
            <button onClick={() => { setIsEditing(false); setCart([]); setBusinessName(''); setDueDate(''); setModalTab('CATALOG'); setShowModal(true); }} className="w-full md:w-auto bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 md:py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-orange-600/20 transition-all active:scale-95">
                <PlusCircle size={20}/> Nuevo Préstamo
            </button>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
            <div className="p-3 md:p-4 border-b bg-slate-50 flex gap-2 md:gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar negocio o producto..." className="w-full pl-10 pr-4 py-2.5 md:py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={loadData} className="p-2.5 text-slate-500 hover:bg-slate-200 rounded-xl border border-slate-200 bg-white active:bg-slate-100 transition-colors">
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left min-w-[600px] md:min-w-0">
                    <thead className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase sticky top-0 z-10 tracking-widest border-b">
                        <tr>
                            <th className="p-4">Negocio Destino</th>
                            <th className="p-4">Producto / Código</th>
                            <th className="p-4">Precio Pactado</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredConsignments.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-10 text-center text-slate-400 italic text-sm">
                                    No se encontraron registros de consignación.
                                </td>
                            </tr>
                        ) : filteredConsignments.map(c => (
                            <tr key={c.id_consignacion} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-orange-100 p-2 rounded-xl text-orange-600 group-hover:scale-110 transition-transform"><Store size={18}/></div>
                                        <span className="font-bold text-slate-800 text-sm">{c.negocio_destino}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <p className="text-xs md:text-sm font-bold text-slate-700 leading-tight">{c.nombre_producto}</p>
                                    <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase tracking-tighter">{c.tipo_producto}: {c.codigo_referencia || c.id_producto} {c.cantidad_prestada > 1 && `(x${c.cantidad_prestada})`}</p>
                                </td>
                                <td className="p-4 font-black text-emerald-600 text-sm">L. {Number(c.precio_especial_pago).toFixed(2)}</td>
                                <td className="p-4">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${c.estado_consignacion === 'Vendido_Pagado' ? 'bg-emerald-100 text-emerald-700' : c.estado_consignacion === 'Devuelto' ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-700 animate-pulse-slow'}`}>
                                        {c.estado_consignacion.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        {c.estado_consignacion === 'Prestado' ? (
                                            <>
                                                <button onClick={() => handleLiquidate(c.id_consignacion)} className="bg-emerald-600 text-white p-2.5 rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-600/20 active:scale-90 transition-all" title="Cobrar"><ShoppingCart size={16}/></button>
                                                <button onClick={() => handleEdit(c)} className="bg-blue-100 text-blue-600 p-2.5 rounded-xl hover:bg-blue-200 active:scale-90 transition-all" title="Editar"><Edit2 size={16}/></button>
                                                <button onClick={() => handleReturn(c.id_consignacion)} className="bg-slate-100 text-slate-600 p-2.5 rounded-xl hover:bg-slate-200 active:scale-90 transition-all" title="Retornar"><RefreshCcw size={16}/></button>
                                                <button onClick={() => handleDelete(c.id_consignacion)} className="bg-red-50 text-red-400 p-2.5 rounded-xl hover:bg-red-100 active:scale-90 transition-all" title="Eliminar"><Trash2 size={16}/></button>
                                            </>
                                        ) : (
                                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded">CERRADO</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* MODAL MAESTRO DE CONSIGNACIÓN */}
        {showModal && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center md:p-4 overflow-hidden">
                <div className="bg-white rounded-t-3xl md:rounded-3xl w-full h-full md:h-auto md:max-w-5xl shadow-2xl flex flex-col max-h-[100vh] md:max-h-[95vh] animate-slide-up md:animate-fade-in">
                    
                    {/* Header Modal */}
                    <div className="p-4 md:p-6 border-b flex justify-between items-center bg-white shrink-0">
                        <div className="flex items-center gap-3">
                           <div className="bg-orange-100 p-2 rounded-xl text-orange-600"><Hand size={24}/></div>
                           <div>
                                <h3 className="text-lg md:text-xl font-bold text-slate-800 leading-none">
                                    {isEditing ? 'Editar Registro' : 'Nuevo Préstamo'}
                                </h3>
                                <p className="text-[10px] md:text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">Módulo de Consignación</p>
                           </div>
                        </div>
                        <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><X size={24}/></button>
                    </div>

                    {/* Tabs Móviles */}
                    {!isEditing && (
                        <div className="flex md:hidden border-b bg-slate-50/50 p-1 mx-4 my-2 rounded-xl shrink-0">
                            <button onClick={() => setModalTab('CATALOG')} className={`flex-1 py-2 text-xs font-black rounded-lg flex items-center justify-center gap-2 transition-all ${modalTab === 'CATALOG' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400'}`}>
                                <LayoutGrid size={16}/> CATÁLOGO
                            </button>
                            <button onClick={() => setModalTab('CART')} className={`flex-1 py-2 text-xs font-black rounded-lg flex items-center justify-center gap-2 transition-all ${modalTab === 'CART' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400'}`}>
                                <ShoppingCart size={16}/> LOTE ({cart.length})
                            </button>
                        </div>
                    )}
                    
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                        {/* Panel de Selección (Buscador Avanzado) */}
                        {!isEditing && (
                            <div className={`${modalTab === 'CATALOG' ? 'flex' : 'hidden'} md:flex w-full md:w-1/2 border-r flex flex-col bg-slate-50/30 overflow-hidden`}>
                                <div className="p-4 space-y-3 border-b bg-white shrink-0 shadow-sm">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                        <input className="w-full pl-9 pr-4 py-2.5 md:py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none" placeholder="Buscar por nombre o IMEI..." value={catSearch} onChange={e=>setCatSearch(e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex flex-col">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Categoría</label>
                                            <select className="w-full p-2 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 outline-none" value={selectedCat} onChange={e=>setSelectedCat(e.target.value)}>
                                                <option value="ALL">Todas</option>
                                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Tipo</label>
                                            <div className="flex p-1 bg-slate-100 rounded-xl h-full">
                                                <button onClick={()=>setSelectedType('ALL')} className={`flex-1 rounded-lg text-[9px] font-black tracking-tighter ${selectedType==='ALL'?'bg-white text-slate-800 shadow-sm':'text-slate-400'}`}>TODOS</button>
                                                <button onClick={()=>setSelectedType('TELEFONO')} className={`flex-1 rounded-lg text-[9px] font-black tracking-tighter ${selectedType==='TELEFONO'?'bg-white text-blue-600 shadow-sm':'text-slate-400'}`}>TEL</button>
                                                <button onClick={()=>setSelectedType('ACCESORIO')} className={`flex-1 rounded-lg text-[9px] font-black tracking-tighter ${selectedType==='ACCESORIO'?'bg-white text-orange-600 shadow-sm':'text-slate-400'}`}>ACC</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white/50">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2">
                                        {filteredCatalog.length === 0 ? (
                                            <div className="text-center py-10 text-slate-300">
                                                <Search size={40} className="mx-auto mb-2 opacity-20"/>
                                                <p className="text-xs font-bold uppercase tracking-widest">Sin resultados</p>
                                            </div>
                                        ) : filteredCatalog.map(p => (
                                            <button key={p.id} onClick={() => addToCart(p)} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl hover:border-orange-500/50 hover:bg-orange-50/30 transition-all text-left shadow-sm group active:scale-[0.98]">
                                                <div className={`p-2.5 rounded-xl shrink-0 ${p.tipo === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    {p.tipo === 'TELEFONO' ? <Smartphone size={18}/> : <Package size={18}/>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-slate-800 text-xs md:text-sm truncate">{p.nombre}</p>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-500">{p.codigo || p.id}</span>
                                                        <span className={`text-[10px] font-black ${p.stock < 5 ? 'text-red-500' : 'text-emerald-600'}`}>Stock: {p.stock}</span>
                                                    </div>
                                                </div>
                                                <div className="md:opacity-0 group-hover:opacity-100 bg-orange-600 text-white p-1.5 rounded-xl shadow-lg shadow-orange-600/30 transition-all"><Plus size={14} strokeWidth={3}/></div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Panel de Resumen / Carrito */}
                        <div className={`${(modalTab === 'CART' || isEditing) ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-hidden min-h-0`}>
                            <div className="p-4 md:p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar bg-white">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Negocio de Destino</label>
                                        <div className="relative">
                                            <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16}/>
                                            <input required className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Ej: Celulares Express" />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Límite Retorno</label>
                                        <input type="date" className="w-full p-3 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Layers size={14}/> {isEditing ? 'Producto Seleccionado' : 'Productos en el Lote'}
                                        </p>
                                        <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-full font-black text-slate-500 uppercase tracking-tighter">Total Items: {cart.length}</span>
                                    </div>
                                    
                                    {cart.length === 0 ? (
                                        <div className="p-16 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center text-slate-300 bg-slate-50/30">
                                            <Package size={56} className="mb-4 opacity-10"/>
                                            <p className="text-xs font-black uppercase tracking-widest">Carrito de Préstamo Vacío</p>
                                            <p className="text-[10px] mt-1">Selecciona productos del catálogo</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {cart.map(item => (
                                                <div key={item.product.id} className="bg-white border border-slate-100 rounded-[1.5rem] p-4 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                                                    <div className={`absolute top-0 left-0 bottom-0 w-1 ${item.product.tipo === 'TELEFONO' ? 'bg-blue-500' : 'bg-orange-500'}`}/>
                                                    <div className="flex justify-between items-start mb-3 pl-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-slate-800 text-sm md:text-base leading-tight truncate">{item.product.nombre}</p>
                                                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter mt-0.5">{item.product.tipo} • COD: {item.product.codigo || item.product.id}</p>
                                                        </div>
                                                        {!isEditing && (
                                                            <button onClick={() => removeFromCart(item.product.id)} className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded-full transition-all"><X size={18}/></button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                                                        <div>
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Cantidad</label>
                                                            <div className="flex items-center gap-3 bg-white p-1 rounded-xl w-fit border border-slate-100 shadow-sm">
                                                                <button disabled={isEditing || item.product.tipo==='TELEFONO'} onClick={()=>updateCartItem(item.product.id, {qty: Math.max(1, item.qty-1)})} className="p-1 text-slate-400 hover:text-orange-600 disabled:opacity-20 transition-colors"><Minus size={16}/></button>
                                                                <span className="text-xs md:text-sm font-black w-6 text-center text-slate-800">{item.qty}</span>
                                                                <button disabled={isEditing || item.product.tipo==='TELEFONO'} onClick={()=>updateCartItem(item.product.id, {qty: Math.min(item.product.stock, item.qty+1)})} className="p-1 text-slate-400 hover:text-orange-600 disabled:opacity-20 transition-colors"><Plus size={16}/></button>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Precio Especial (L.)</label>
                                                            <div className="relative">
                                                                <input type="number" className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm" value={item.specialPrice} onChange={e=>updateCartItem(item.product.id, {specialPrice: Number(e.target.value)})} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {cart.length > 0 && !isEditing && (
                                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-3xl flex items-start gap-3">
                                        <AlertTriangle size={24} className="text-orange-500 shrink-0 mt-0.5"/>
                                        <div className="space-y-1">
                                            <p className="text-[10px] md:text-xs text-orange-800 font-bold uppercase tracking-wider">Aviso de Inventario</p>
                                            <p className="text-[10px] md:text-xs text-orange-700 font-medium leading-relaxed">Los productos seleccionados se marcarán como "Consignados" y se descontarán del stock actual inmediatamente.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 md:p-6 bg-slate-50 border-t shrink-0">
                                {isEditing ? (
                                    <button onClick={handleUpdate} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs active:scale-95"><Save size={20}/> ACTUALIZAR REGISTRO</button>
                                ) : (
                                    <button onClick={handleCreate} disabled={cart.length === 0} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg shadow-orange-600/30 hover:bg-orange-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs disabled:opacity-50 disabled:grayscale active:scale-95"><ArrowRightCircle size={20}/> FINALIZAR Y ENTREGAR</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Consignments;
