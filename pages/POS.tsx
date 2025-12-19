
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save, User, X, Check, FileText, Plus, Minus, UserPlus, Grid, Filter, ChevronRight } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import 'jspdf-autotable';

// Helper robusto para números a letras (Soporta miles y millones)
const numeroALetras = (num: number): string => {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
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
    else if (integerPart >= 1000000) {
        const millions = Math.floor(integerPart / 1000000);
        const remainder = integerPart % 1000000;
        text += (millions === 1 ? 'UN MILLON' : convertGroup(millions) + ' MILLONES');
        if (remainder > 0) text += ' ' + convertGroup(Math.floor(remainder / 100)) + ' MIL ' + convertGroup(remainder % 1000);
    } 
    else if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        const remainder = integerPart % 1000;
        text += (thousands === 1 ? 'MIL' : convertGroup(thousands) + ' MIL');
        if (remainder > 0) text += ' ' + convertGroup(remainder);
    } 
    else { text = convertGroup(integerPart); }
    return `${text} CON ${decimalPart}/100 LEMPIRAS`;
};

const POS: React.FC = () => {
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  // Mobile View State
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  const [clients, setClients] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  
  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkRegisterStatus();
    loadInitialData();
  }, []);

  useEffect(() => {
      const state = location.state as any;
      if (state && state.customItem) {
          const { descripcion, precio } = state.customItem;
          const newItem: DetalleVenta = {
              codDetalleVenta: `MANUAL-${Date.now()}`,
              cantidad: 1,
              precioVenta: Number(precio),
              descripcionProducto: descripcion,
              tipoProducto: 'SERVICIO'
          };
          setCart(prev => [...prev, newItem]);
          navigate(location.pathname, { replace: true, state: {} });
          setMobileTab('CART');
      }

      if (state && state.editSaleId) {
          loadSaleToEdit(state.editSaleId);
      }
  }, [location]);

  const checkRegisterStatus = async () => {
     try {
       const activeArqueo = await CashService.getActiveArqueo();
       if (!activeArqueo) {
         await Swal.fire({ title: 'Caja Cerrada', text: 'Debes aperturar la caja antes de facturar.', icon: 'warning', confirmButtonText: 'Ir a Caja' });
         navigate('/cash');
       }
     } catch (error) { console.error("Error checking register", error); }
  };

  const loadInitialData = () => {
    setIsLoading(true);
    Promise.all([
      InventoryService.getUnifiedProducts(),
      ClientService.getAll(),
      ConfigService.get()
    ]).then(([prodData, clientData, configData]) => {
      setProducts(prodData || []);
      setClients(clientData || []);
      setCompanyConfig(configData);
    }).catch(err => console.error(err))
      .finally(() => setIsLoading(false));
  };

  const loadSaleToEdit = async (saleId: string) => {
      try {
          setIsLoading(true);
          setIsEditing(true);
          setEditingSaleId(saleId);
          
          const details = await SalesService.getDetallesVenta(saleId);
          setCart(details.map(d => ({ ...d, cantidad: Number(d.cantidad), precioVenta: Number(d.precioVenta) })));

          const header = await SalesService.getVenta(saleId);
          if (header) {
              setSelectedClientId(header.identidadCliente);
              // CRITICAL FIX: Ensure payment type is normalized to match button state
              const pType = header.tipoCompra === 'Credito' ? 'Credito' : 'Contado';
              setPaymentType(pType);
              setDiscount(Number(header.descuento) || 0);
          }
          
          Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: `Editando Venta #${saleId}`, showConfirmButton: false, timer: 2000 });
      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudo cargar la venta para edición', 'error');
          setIsEditing(false);
          setEditingSaleId(null);
      } finally { setIsLoading(false); }
  };

  const addToCart = (product: ProductoUnified) => {
    setCart(prev => {
      const existing = prev.find(item => (item.idTelefono === product.id) || (item.idInventario === product.id));

      if (existing) {
        if(product.tipo === 'TELEFONO') {
           Swal.fire('Error', 'Los teléfonos son únicos y no se pueden incrementar cantidades.', 'error');
           return prev;
        }
        if (existing.cantidad + 1 > product.stock) {
           Swal.fire('Sin Stock', 'No hay más unidades disponibles.', 'warning');
           return prev;
        }
        return prev.map(item => ((item.idTelefono === product.id) || (item.idInventario === product.id)) ? { ...item, cantidad: item.cantidad + 1 } : item);
      }

      return [...prev, {
        codDetalleVenta: `TEMP-${Date.now()}`,
        idTelefono: product.tipo === 'TELEFONO' ? product.id : undefined,
        idInventario: product.tipo === 'ACCESORIO' ? product.id : undefined,
        cantidad: 1,
        precioVenta: Number(product.precioVenta),
        descripcionProducto: product.nombre,
        tipoProducto: product.tipo
      }];
    });
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Agregado', showConfirmButton: false, timer: 800 });
  };

  // Added missing removeFromCart function to resolve error on line 389
  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(item => item.codDetalleVenta !== tempId));
  };

  const updateQuantity = (tempId: string, delta: number) => {
      setCart(prev => prev.map(item => {
          if (item.codDetalleVenta === tempId) {
              if (item.tipoProducto === 'TELEFONO') return item; 
              const newQty = item.cantidad + delta;
              if (delta > 0) {
                  const productInStock = products.find(p => p.id === item.idInventario);
                  if (productInStock && newQty > productInStock.stock) return item;
              }
              return newQty > 0 ? { ...item, cantidad: newQty } : item;
          }
          return item;
      }));
  };

  const calculateTotal = () => {
    const baseTotal = cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0);
    const finalTotal = Math.max(0, baseTotal - discount);
    const isvRate = (companyConfig?.isv || 15) / 100;
    const netSubtotal = finalTotal / (1 + isvRate);
    const isvAmount = finalTotal - netSubtotal;
    return { subtotal: netSubtotal, tax: isvAmount, total: finalTotal, baseTotal };
  };

  const { subtotal, tax, total, baseTotal } = calculateTotal();

  const handleProcessSale = async () => {
      if (cart.length === 0) return Swal.fire('Carrito Vacío', 'Agrega productos.', 'warning');
      try {
          setIsLoading(true);
          const payload: VentaPayload = {
              identidadCliente: selectedClientId || '9999999999999', 
              tipoCompra: paymentType,
              total: total,
              isv: tax,
              descuento: discount,
              detalles: cart.map(item => ({
                  idTelefono: item.idTelefono,
                  idInventario: item.idInventario,
                  cantidad: item.cantidad,
                  precioVenta: item.precioVenta,
                  tipoProducto: item.tipoProducto
              }))
          };

          if (isEditing && editingSaleId) {
               await SalesService.updateVenta(editingSaleId, payload);
               Swal.fire('Éxito', `Venta #${editingSaleId} actualizada`, 'success');
          } else {
               const res = await SalesService.createVenta(payload);
               Swal.fire({ title: 'Venta Procesada', text: `Factura #${res.codVenta}`, icon: 'success' });
          }
          handleCancel();
          loadInitialData();
      } catch (error: any) { Swal.fire('Error', error.message, 'error'); } finally { setIsLoading(false); }
  };

  const handleCancel = () => {
      setCart([]);
      setSelectedClientId('');
      setDiscount(0);
      setPaymentType('Contado');
      setIsEditing(false);
      setEditingSaleId(null);
      navigate(location.pathname, { replace: true, state: {} });
  };

  // --- FILTERS DATA ---
  const brands = useMemo(() => {
      const b = products.filter(p => p.tipo === 'TELEFONO' && p.marca).map(p => p.marca!);
      return ['ALL', ...Array.from(new Set(b))].sort();
  }, [products]);

  const categories = useMemo(() => {
      const c = products.filter(p => p.tipo === 'ACCESORIO' && p.categoria).map(p => p.categoria!);
      return ['ALL', ...Array.from(new Set(c))].sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
      return products.filter(p => {
          const matchesTerm = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (p.imei && p.imei.includes(searchTerm)) || 
                              p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesType = selectedType === 'ALL' || p.tipo === selectedType;
          const matchesBrand = selectedBrand === 'ALL' || p.marca === selectedBrand;
          const matchesCat = selectedCategory === 'ALL' || p.categoria === selectedCategory;
          return matchesTerm && matchesType && matchesBrand && matchesCat;
      });
  }, [products, searchTerm, selectedType, selectedBrand, selectedCategory]);

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-theme(spacing.24))] gap-4 animate-fade-in">
      {/* CATALOG PANEL */}
      <div className={`flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden ${mobileTab === 'CART' ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-slate-100 space-y-4 bg-slate-50/30">
              <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                  <input 
                      type="text" 
                      placeholder="Buscar por Nombre, IMEI o Código..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all shadow-sm"
                  />
              </div>
              
              <div className="flex flex-col gap-3">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      <button onClick={() => { setSelectedType('ALL'); setSelectedBrand('ALL'); setSelectedCategory('ALL'); }} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${selectedType === 'ALL' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border text-slate-500'}`}>Todos</button>
                      <button onClick={() => { setSelectedType('TELEFONO'); setSelectedCategory('ALL'); }} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${selectedType === 'TELEFONO' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border text-slate-500'}`}>Teléfonos</button>
                      <button onClick={() => { setSelectedType('ACCESORIO'); setSelectedBrand('ALL'); }} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${selectedType === 'ACCESORIO' ? 'bg-orange-600 text-white shadow-lg shadow-orange-200' : 'bg-white border text-slate-500'}`}>Accesorios</button>
                  </div>

                  {selectedType === 'TELEFONO' && (
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                          <Filter size={14} className="text-slate-400 shrink-0"/>
                          {brands.map(b => (
                              <button key={b} onClick={() => setSelectedBrand(b)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${selectedBrand === b ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white text-slate-400 border-slate-200'}`}>{b === 'ALL' ? 'Todas las Marcas' : b}</button>
                          ))}
                      </div>
                  )}

                  {selectedType === 'ACCESORIO' && (
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                          <Filter size={14} className="text-slate-400 shrink-0"/>
                          {categories.map(c => (
                              <button key={c} onClick={() => setSelectedCategory(c)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${selectedCategory === c ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-white text-slate-400 border-slate-200'}`}>{c === 'ALL' ? 'Todas las Categorías' : c}</button>
                          ))}
                      </div>
                  )}
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {isLoading ? (
                  <div className="flex h-full items-center justify-center text-slate-400">Refrescando catálogo...</div>
              ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 md:pb-4">
                      {filteredProducts.map(product => (
                          <button 
                              key={product.id} 
                              onClick={() => addToCart(product)}
                              className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all flex flex-col items-start text-left group active:scale-95 border-b-4 hover:translate-y-[-2px]"
                          >
                              <div className={`w-10 h-10 rounded-2xl mb-3 flex items-center justify-center ${product.tipo === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                  {product.tipo === 'TELEFONO' ? <Smartphone size={22}/> : <Zap size={22}/>}
                              </div>
                              <h3 className="font-bold text-slate-800 text-xs line-clamp-2 min-h-[2.5em] leading-tight mb-1">{product.nombre}</h3>
                              <p className="text-[9px] text-slate-400 font-bold uppercase mb-2">{product.marca || product.categoria || 'Genérico'}</p>
                              <div className="mt-auto w-full pt-3 border-t border-slate-100 flex justify-between items-center">
                                  <span className="font-black text-indigo-600 text-sm">L. {Number(product.precioVenta).toLocaleString()}</span>
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg ${product.stock < 3 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>STK: {product.stock}</span>
                              </div>
                          </button>
                      ))}
                      {filteredProducts.length === 0 && (
                          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
                              <Search size={64} strokeWidth={1} className="mb-4 opacity-20"/>
                              <p className="font-bold uppercase tracking-widest text-sm">Sin resultados</p>
                          </div>
                      )}
                  </div>
              )}
          </div>
      </div>

      {/* CART PANEL */}
      <div className={`w-full md:w-[420px] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden ${mobileTab === 'CATALOG' ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-5 bg-slate-900 text-white shrink-0">
              <div className="flex justify-between items-center mb-5">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-xl"><ShoppingCart size={22}/></div>
                      <h2 className="font-black text-lg tracking-tight">{isEditing ? 'AUDITORÍA VENTA' : 'NUEVA VENTA'}</h2>
                  </div>
                  <button onClick={handleCancel} className="p-2 hover:bg-white/10 rounded-full text-slate-400 transition-colors"><Trash2 size={20}/></button>
              </div>
              <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <select 
                      className="w-full pl-10 pr-12 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
                      value={selectedClientId}
                      onChange={e => setSelectedClientId(e.target.value)}
                  >
                      <option value="">CONSUMIDOR FINAL</option>
                      {clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>)}
                  </select>
                  <button onClick={() => navigate('/clients')} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white transition-all"><UserPlus size={16}/></button>
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 custom-scrollbar">
              {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center animate-pulse">
                      <ShoppingCart size={80} strokeWidth={1} className="mb-4 opacity-10"/>
                      <p className="font-black uppercase tracking-widest text-sm">Esperando Productos</p>
                  </div>
              ) : cart.map(item => (
                  <div key={item.codDetalleVenta} className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-3 group hover:border-indigo-200 transition-all">
                      <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0 pr-2">
                              <p className="font-black text-slate-800 text-sm leading-tight line-clamp-2">{item.descripcionProducto}</p>
                              <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${item.tipoProducto==='TELEFONO'?'bg-blue-100 text-blue-700':'bg-orange-100 text-orange-700'}`}>{item.tipoProducto}</span>
                                  {item.idTelefono && <span className="text-[10px] font-mono text-slate-400">IMEI: ...{item.idTelefono.slice(-6)}</span>}
                              </div>
                          </div>
                          <button onClick={() => removeFromCart(item.codDetalleVenta!)} className="text-slate-300 hover:text-red-500 transition-colors p-1"><X size={20}/></button>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                          <div className="flex items-center gap-1 bg-slate-100 rounded-2xl p-1">
                              <button onClick={() => updateQuantity(item.codDetalleVenta!, -1)} disabled={item.tipoProducto === 'TELEFONO'} className="w-8 h-8 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-600 hover:text-indigo-600 disabled:opacity-30"><Minus size={14}/></button>
                              <span className="font-black text-sm w-8 text-center">{item.cantidad}</span>
                              <button onClick={() => updateQuantity(item.codDetalleVenta!, 1)} disabled={item.tipoProducto === 'TELEFONO'} className="w-8 h-8 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-600 hover:text-indigo-600 disabled:opacity-30"><Plus size={14}/></button>
                          </div>
                          <p className="font-black text-indigo-600">L. {(item.cantidad * item.precioVenta).toLocaleString()}</p>
                      </div>
                  </div>
              ))}
          </div>

          <div className="bg-white p-6 border-t border-slate-200 shadow-2xl z-20">
              <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest"><span>SUBTOTAL BRUTO</span><span>L. {baseTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center py-2 border-y border-slate-50">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/><span className="text-xs font-bold text-red-500 uppercase tracking-widest">APLICAR DESCUENTO</span></div>
                      <div className="relative w-32 group">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">L.</span>
                          <input type="number" className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-right font-black text-slate-800 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all" value={discount} onChange={e => setDiscount(Number(e.target.value))} onFocus={e => e.target.select()}/>
                      </div>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest"><span>ISV ({companyConfig?.isv || 15}%)</span><span>L. {tax.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center pt-4 mt-2">
                      <span className="font-black text-xl text-slate-800 tracking-tighter">TOTAL NETO</span>
                      <span className="font-black text-3xl text-indigo-600 tracking-tighter">L. {total.toFixed(2)}</span>
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                  <button onClick={() => setPaymentType('Contado')} className={`py-4 rounded-2xl text-xs font-black uppercase tracking-widest border-2 transition-all ${paymentType === 'Contado' ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-lg shadow-indigo-100' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>Contado</button>
                  <button onClick={() => setPaymentType('Credito')} className={`py-4 rounded-2xl text-xs font-black uppercase tracking-widest border-2 transition-all ${paymentType === 'Credito' ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-lg shadow-blue-100' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>Crédito</button>
              </div>

              <button 
                  onClick={handleProcessSale}
                  disabled={isLoading || cart.length === 0}
                  className={`w-full py-5 rounded-[2rem] font-black text-white shadow-2xl flex justify-center items-center gap-3 uppercase tracking-[0.2em] text-sm transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:shadow-none ${isEditing ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                  {isLoading ? <RefreshCw className="animate-spin" size={24}/> : <Check size={24} strokeWidth={3}/>}
                  {isEditing ? 'Guardar Cambios' : 'Procesar Pago'}
              </button>
          </div>
      </div>

      {/* MOBILE TAB NAVIGATION */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 flex bg-slate-900/90 backdrop-blur-md rounded-full shadow-2xl p-1 z-[60] border border-white/10">
          <button onClick={() => setMobileTab('CATALOG')} className={`flex-1 py-4 rounded-full flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all ${mobileTab === 'CATALOG' ? 'bg-white text-slate-900' : 'text-white/60'}`}><Grid size={18}/> Catálogo</button>
          <button onClick={() => setMobileTab('CART')} className={`flex-1 py-4 rounded-full flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all ${mobileTab === 'CART' ? 'bg-white text-slate-900' : 'text-white/60'}`}>
              <ShoppingCart size={18}/> {cart.length > 0 && <span className="bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]">{cart.reduce((a,b)=>a+b.cantidad,0)}</span>} Carrito
          </button>
      </div>
    </div>
  );
}; 

export default POS;
