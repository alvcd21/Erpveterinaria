
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save, User, X, Check, FileText, Plus, Minus, UserPlus, Grid, Filter, ChevronRight, Tag } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const POS: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Data States
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  // Form States
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  
  // Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const state = location.state as any;
    if (state?.editSaleId) {
      loadSaleToEdit(state.editSaleId);
    } else if (state?.customItem) {
      const { descripcion, precio } = state.customItem;
      setCart(prev => [...prev, {
        codDetalleVenta: `MAN-1`,
        cantidad: 1,
        precioVenta: Number(precio),
        descripcionProducto: descripcion,
        tipoProducto: 'SERVICIO'
      }]);
    }
  }, [location.state]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [prods, clis, config] = await Promise.all([
        InventoryService.getUnifiedProducts(),
        ClientService.getAll(),
        ConfigService.get()
      ]);
      setProducts(prods || []);
      setClients(clis || []);
      setCompanyConfig(config);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSaleToEdit = async (saleId: string) => {
    try {
      setLoading(true);
      const [details, header] = await Promise.all([
        SalesService.getDetallesVenta(saleId),
        SalesService.getVenta(saleId)
      ]);

      if (header) {
        setIsEditing(true);
        setEditingSaleId(saleId);
        setSelectedClientId(header.identidadCliente);
        setPaymentType(header.tipoCompra === 'Credito' ? 'Credito' : 'Contado');
        setDiscount(Number(header.descuento) || 0);
        setCart(details.map(d => ({
          ...d,
          cantidad: Number(d.cantidad),
          precioVenta: Number(d.precioVenta)
        })));
      }
    } catch (e) {
      Swal.fire('Error', 'No se pudo cargar la factura para editar', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: ProductoUnified) => {
    setCart(prev => {
      const existing = prev.find(item => 
        (product.tipo === 'TELEFONO' && item.idTelefono === product.id) ||
        (product.tipo === 'ACCESORIO' && item.idInventario === product.id)
      );

      if (existing) {
        if (product.tipo === 'TELEFONO') {
          Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'IMEI ya en carrito', showConfirmButton: false, timer: 1500 });
          return prev;
        }
        if (existing.cantidad + 1 > product.stock) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Sin más stock', showConfirmButton: false, timer: 1500 });
          return prev;
        }
        return prev.map(item => item === existing ? { ...item, cantidad: item.cantidad + 1 } : item);
      }

      return [...prev, {
        codDetalleVenta: `T-${Date.now()}`,
        idTelefono: product.tipo === 'TELEFONO' ? product.id : undefined,
        idInventario: product.tipo === 'ACCESORIO' ? product.id : undefined,
        cantidad: 1,
        precioVenta: Number(product.precioVenta),
        descripcionProducto: product.nombre,
        tipoProducto: product.tipo
      }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.codDetalleVenta === id) {
        if (item.tipoProducto === 'TELEFONO') return item;
        const newQty = item.cantidad + delta;
        
        // Validar stock real del producto
        const product = products.find(p => p.id === item.idInventario);
        if (delta > 0 && product && newQty > product.stock) return item;

        return newQty > 0 ? { ...item, cantidad: newQty } : item;
      }
      return item;
    }));
  };

  const totals = useMemo(() => {
    const bruto = cart.reduce((acc, i) => acc + (i.cantidad * i.precioVenta), 0);
    const conDescuento = Math.max(0, bruto - discount);
    const isvRate = (companyConfig?.isv || 15) / 100;
    const subtotal = conDescuento / (1 + isvRate);
    const isv = conDescuento - subtotal;
    return { bruto, subtotal, isv, total: conDescuento };
  }, [cart, discount, companyConfig]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    try {
      setLoading(true);
      const payload: VentaPayload = {
        identidadCliente: selectedClientId || '9999999999999',
        tipoCompra: paymentType,
        total: totals.total,
        isv: totals.isv,
        descuento: discount,
        detalles: cart
      };

      if (isEditing && editingSaleId) {
        await SalesService.updateVenta(editingSaleId, payload);
        Swal.fire('Éxito', 'Factura actualizada', 'success');
      } else {
        const res = await SalesService.createVenta(payload);
        Swal.fire('Venta Exitosa', `Factura #${res.codVenta} generada`, 'success');
      }
      resetPOS();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetPOS = () => {
    setCart([]);
    setDiscount(0);
    setSelectedClientId('');
    setIsEditing(false);
    setEditingSaleId(null);
    setPaymentType('Contado');
    navigate('/pos', { state: {} });
    loadInitialData();
  };

  const brands = useMemo(() => ['ALL', ...new Set(products.filter(p => p.tipo === 'TELEFONO').map(p => p.marca!))].sort(), [products]);
  const categories = useMemo(() => ['ALL', ...new Set(products.filter(p => p.tipo === 'ACCESORIO').map(p => p.categoria!))].sort(), [products]);

  const filteredProducts = products.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.imei?.includes(searchTerm) || p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = selectedType === 'ALL' || p.tipo === selectedType;
    const matchBrand = selectedType !== 'TELEFONO' || selectedBrand === 'ALL' || p.marca === selectedBrand;
    const matchCat = selectedType !== 'ACCESORIO' || selectedCategory === 'ALL' || p.categoria === selectedCategory;
    return matchSearch && matchType && matchBrand && matchCat;
  });

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-80px)] md:h-[calc(100vh-100px)] gap-4 overflow-hidden">
      
      {/* CATALOGO (Izquierda) */}
      <div className={`flex-1 flex flex-col min-w-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden ${mobileTab === 'CART' ? 'hidden md:flex' : 'flex'}`}>
        {/* Barra de Búsqueda y Filtros Compacta */}
        <div className="p-3 border-b bg-slate-50/50 space-y-3">
          <div className="flex gap-2">
             <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                <input 
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" 
                  placeholder="Producto, IMEI o Código..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             <button onClick={loadInitialData} className="p-2 text-slate-400 hover:text-indigo-600 bg-white border rounded-xl shadow-sm"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {['ALL', 'TELEFONO', 'ACCESORIO'].map(t => (
                <button key={t} onClick={() => setSelectedType(t as any)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all whitespace-nowrap ${selectedType === t ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border text-slate-500 hover:bg-slate-100'}`}>
                  {t === 'ALL' ? 'Todos' : t === 'TELEFONO' ? 'Teléfonos' : 'Accesorios'}
                </button>
              ))}
            </div>

            {selectedType === 'TELEFONO' && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 border-t border-slate-100 pt-2">
                {brands.map(b => (
                  <button key={b} onClick={() => setSelectedBrand(b)} className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase border transition-all ${selectedBrand === b ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white text-slate-400 border-slate-200'}`}>
                    {b === 'ALL' ? 'Todas las Marcas' : b}
                  </button>
                ))}
              </div>
            )}

            {selectedType === 'ACCESORIO' && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 border-t border-slate-100 pt-2">
                {categories.map(c => (
                  <button key={c} onClick={() => setSelectedCategory(c)} className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase border transition-all ${selectedCategory === c ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white text-slate-400 border-slate-200'}`}>
                    {c === 'ALL' ? 'Todas las Categorías' : c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Grid de Productos Compacto */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-slate-50/30">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredProducts.map(p => (
              <button 
                key={p.id} 
                onClick={() => addToCart(p)}
                className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col text-left group relative active:scale-95"
              >
                <div className={`w-8 h-8 rounded-lg mb-2 flex items-center justify-center ${p.tipo === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                   {p.tipo === 'TELEFONO' ? <Smartphone size={16}/> : <Zap size={16}/>}
                </div>
                <h4 className="text-[11px] font-bold text-slate-800 line-clamp-2 leading-tight mb-1">{p.nombre}</h4>
                <div className="mt-auto">
                  <p className="text-[10px] font-black text-indigo-600">L. {Number(p.precioVenta).toLocaleString()}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">{p.marca || p.categoria || 'Genérico'}</span>
                    <span className={`text-[9px] font-black px-1 rounded ${p.stock < 3 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>S:{p.stock}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CARRITO (Derecha) */}
      <div className={`w-full md:w-[400px] flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden ${mobileTab === 'CATALOG' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 bg-slate-900 text-white shrink-0">
          <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-indigo-400"/>
                <h3 className="font-black text-sm uppercase tracking-wider">{isEditing ? `Editando #${editingSaleId}` : 'Carrito de Venta'}</h3>
             </div>
             <button onClick={() => cart.length > 0 && Swal.fire({title:'¿Vaciar?', icon:'warning', showCancelButton:true, confirmButtonText:'Sí'}).then(r => r.isConfirmed && resetPOS())} className="text-slate-500 hover:text-white transition-colors"><Trash2 size={18}/></button>
          </div>
          
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <select 
              className="w-full pl-9 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
            >
              <option value="">CONSUMIDOR FINAL</option>
              {clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>)}
            </select>
            <button onClick={() => navigate('/clients')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 rounded-lg"><UserPlus size={14}/></button>
          </div>
        </div>

        {/* Lista de Items (Compacta) */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-slate-50/50 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-20">
              <ShoppingCart size={64} strokeWidth={1}/>
              <p className="font-black text-xs uppercase mt-2">Carrito Vacío</p>
            </div>
          ) : cart.map(item => (
            <div key={item.codDetalleVenta} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 animate-fade-in group">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.tipoProducto === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                {item.tipoProducto === 'TELEFONO' ? <Smartphone size={14}/> : <Zap size={14}/>}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-800 truncate">{item.descripcionProducto}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-indigo-600">L. {Number(item.precioVenta).toLocaleString()}</span>
                  {item.idTelefono && <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1 rounded">IMEI:...{item.idTelefono.slice(-4)}</span>}
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => updateQty(item.codDetalleVenta!, -1)}
                  disabled={item.tipoProducto === 'TELEFONO'}
                  className="w-5 h-5 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-indigo-600 disabled:opacity-30 shadow-sm"
                ><Minus size={10}/></button>
                <span className="text-[11px] font-black w-4 text-center">{item.cantidad}</span>
                <button 
                  onClick={() => updateQty(item.codDetalleVenta!, 1)}
                  disabled={item.tipoProducto === 'TELEFONO'}
                  className="w-5 h-5 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-indigo-600 disabled:opacity-30 shadow-sm"
                ><Plus size={10}/></button>
              </div>

              <button onClick={() => setCart(cart.filter(i => i.codDetalleVenta !== item.codDetalleVenta))} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><X size={16}/></button>
            </div>
          ))}
        </div>

        {/* Totales y Pago (Compacto) */}
        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
           <div className="space-y-1.5 mb-4">
              <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Subtotal Bruto</span>
                <span>L. {totals.bruto.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-center py-1 border-y border-slate-50">
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-red-500"/>
                  <span className="text-[10px] font-black text-red-500 uppercase">Aplicar Descuento</span>
                </div>
                <div className="relative w-24 group">
                   <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">L.</span>
                   <input 
                    type="number" 
                    className="w-full pl-6 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-right text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                    value={discount}
                    onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                    onFocus={e => e.target.select()}
                   />
                </div>
              </div>

              <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>ISV ({companyConfig?.isv || 15}%)</span>
                <span>L. {totals.isv.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-end pt-2">
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Total Neto</span>
                <span className="text-2xl font-black text-indigo-600 tracking-tighter">L. {totals.total.toFixed(2)}</span>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-2 mb-3">
              <button 
                onClick={() => setPaymentType('Contado')}
                className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${paymentType === 'Contado' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
              >Contado</button>
              <button 
                onClick={() => setPaymentType('Credito')}
                className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${paymentType === 'Credito' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
              >Crédito</button>
           </div>

           <button 
            onClick={handleCheckout}
            disabled={loading || cart.length === 0}
            className={`w-full py-4 rounded-2xl font-black text-white shadow-lg flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:shadow-none ${isEditing ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
           >
             {loading ? <RefreshCw className="animate-spin" size={20}/> : <Check size={20} strokeWidth={3}/>}
             {isEditing ? 'Guardar Cambios' : 'Procesar Pago'}
           </button>
        </div>
      </div>

      {/* Navegación Móvil */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 flex bg-slate-900/90 backdrop-blur-md rounded-full shadow-2xl p-1 z-50 border border-white/10">
          <button 
            onClick={() => setMobileTab('CATALOG')}
            className={`flex-1 py-3 rounded-full flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${mobileTab === 'CATALOG' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60'}`}
          ><Grid size={16}/> Catálogo</button>
          <button 
            onClick={() => setMobileTab('CART')}
            className={`flex-1 py-3 rounded-full flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${mobileTab === 'CART' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60'}`}
          >
            <ShoppingCart size={16}/> Carrito 
            {cart.length > 0 && <span className="bg-indigo-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px]">{cart.reduce((a,b)=>a+b.cantidad,0)}</span>}
          </button>
      </div>

    </div>
  );
};

export default POS;
