
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Zap, RefreshCw, List, LayoutGrid, UserPlus, X, Plus, Minus } from 'lucide-react';
import Swal from 'sweetalert2';
// Re-verified useNavigate and useLocation imports from react-router-dom v6
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import 'jspdf-autotable';

// Fix for Error in file pages/POS.tsx on line 14: Completed the function to return a string and added logic for currency format.
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
        
        // Centenas
        if (n >= 100) {
            output += centenas[Math.floor(n / 100)] + ' ';
            n %= 100;
        }

        // Decenas y Unidades
        if (n >= 10 && n <= 19) {
            output += diez_veinte[n - 10];
        } else if (n >= 20) {
            output += decenas[Math.floor(n / 10)];
            if (n % 10 > 0) output += ' Y ' + unidades[n % 10];
        } else if (n > 0) {
            output += unidades[n];
        }
        
        return output.trim();
    };

    if (num === 0) return 'CERO';
    let integerPart = Math.floor(num);
    let decimalPart = Math.round((num - integerPart) * 100);
    let result = '';

    if (integerPart >= 1000000) {
        let millions = Math.floor(integerPart / 1000000);
        result += millions === 1 ? 'UN MILLON ' : convertGroup(millions) + ' MILLONES ';
        integerPart %= 1000000;
    }
    if (integerPart >= 1000) {
        let thousands = Math.floor(integerPart / 1000);
        result += thousands === 1 ? 'MIL ' : convertGroup(thousands) + ' MIL ';
        integerPart %= 1000;
    }
    result += convertGroup(integerPart);
    
    return `${result.trim()} LEMPIRAS CON ${decimalPart.toString().padStart(2, '0')}/100 CENTAVOS`;
};

// Fix for Error in file App.tsx on line 9: Defined and exported POS as default to satisfy the import requirement.
const POS: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    
    const [products, setProducts] = useState<ProductoUnified[]>([]);
    const [clients, setClients] = useState<Cliente[]>([]);
    const [cart, setCart] = useState<DetalleVenta[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
    const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
    const [paymentType, setPaymentType] = useState<'Contado' | 'Credito'>('Contado');
    const [isvPercentage, setIsvPercentage] = useState(15);
    const [discount, setDiscount] = useState(0);

    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                const [prods, clis, cfg] = await Promise.all([
                    InventoryService.getUnifiedProducts(),
                    ClientService.getAll(),
                    ConfigService.get()
                ]);
                setProducts(prods);
                setClients(clis);
                if (cfg) {
                    setIsvPercentage(cfg.isv || 15);
                }

                // Handle custom item from CashRegister redirect if present
                const state = location.state as any;
                if (state?.customItem) {
                    const item = state.customItem;
                    setCart([{
                        idInventario: 'CUSTOM',
                        cantidad: 1,
                        precioVenta: item.precio,
                        descripcionProducto: item.descripcion,
                        tipoProducto: 'ACCESORIO'
                    }]);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        loadInitialData();
    }, [location.state]);

    const addToCart = (product: ProductoUnified) => {
        setCart(prev => {
            const existing = prev.find(item => 
                (product.tipo === 'TELEFONO' && item.idTelefono === product.id) ||
                (product.tipo === 'ACCESORIO' && item.idInventario === product.id)
            );

            if (existing) {
                if (product.tipo === 'TELEFONO') {
                    Swal.fire('Error', 'Un teléfono es único.', 'error');
                    return prev;
                }
                if (existing.cantidad >= product.stock) {
                    Swal.fire('Sin Stock', 'No hay más unidades.', 'warning');
                    return prev;
                }
                return prev.map(item => 
                    item === existing ? { ...item, cantidad: item.cantidad + 1 } : item
                );
            }

            return [...prev, {
                idTelefono: product.tipo === 'TELEFONO' ? product.id : undefined,
                idInventario: product.tipo === 'ACCESORIO' ? product.id : undefined,
                cantidad: 1,
                precioVenta: product.precioVenta,
                descripcionProducto: product.nombre,
                tipoProducto: product.tipo === 'TELEFONO' ? 'TELEFONO' : 'ACCESORIO'
            }];
        });
    };

    const subtotal = useMemo(() => cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0), [cart]);
    const total = useMemo(() => subtotal - discount, [subtotal, discount]);

    const handleCheckout = async () => {
        if (!selectedClient) return Swal.fire('Error', 'Seleccione un cliente.', 'error');
        if (cart.length === 0) return;

        const result = await Swal.fire({
            title: '¿Finalizar Venta?',
            text: `Total: L. ${total.toLocaleString()}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Procesar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                await SalesService.createVenta({
                    identidadCliente: selectedClient.identidad,
                    tipoCompra: paymentType,
                    total: total,
                    isv: subtotal * (isvPercentage / 100),
                    descuento: discount,
                    detalles: cart
                });
                Swal.fire('Venta Realizada', 'El registro se guardó correctamente.', 'success');
                setCart([]);
                setSelectedClient(null);
                const updatedProds = await InventoryService.getUnifiedProducts();
                setProducts(updatedProds);
            } catch (error: any) {
                Swal.fire('Error', error.message, 'error');
            }
        }
    };

    const filtered = products.filter(p => 
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.imei?.includes(searchTerm)
    );

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-140px)] gap-6">
            {/* Products View */}
            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-slate-50/50 flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20" 
                            placeholder="Buscar producto..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex border rounded-lg overflow-hidden bg-white">
                        <button onClick={() => setViewMode('GRID')} className={`p-2 ${viewMode === 'GRID' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><LayoutGrid size={18}/></button>
                        <button onClick={() => setViewMode('LIST')} className={`p-2 ${viewMode === 'LIST' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><List size={18}/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex h-full items-center justify-center text-slate-400">Cargando catálogo...</div>
                    ) : (
                        <div className={viewMode === 'GRID' ? 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'flex flex-col gap-2'}>
                            {filtered.map(p => (
                                <div key={p.id} onClick={() => addToCart(p)} className={`p-3 border rounded-xl hover:border-indigo-500 cursor-pointer transition-all bg-white flex ${viewMode === 'GRID' ? 'flex-col h-40' : 'items-center justify-between'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500">
                                            {p.tipo === 'TELEFONO' ? <Smartphone size={16}/> : <Zap size={16}/>}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-xs line-clamp-1">{p.nombre}</h4>
                                            <p className="text-[9px] text-slate-400">{p.codigo}</p>
                                        </div>
                                    </div>
                                    <div className={viewMode === 'GRID' ? 'mt-auto pt-2 flex justify-between items-center' : 'flex items-center gap-4'}>
                                        <span className="font-bold text-indigo-600 text-sm">L. {p.precioVenta.toLocaleString()}</span>
                                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">S: {p.stock}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Cart Panel */}
            <div className="w-full md:w-96 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                <div className="p-5 bg-slate-900 text-white flex items-center gap-3">
                    <ShoppingCart size={20}/>
                    <h3 className="font-bold">Carrito de Venta</h3>
                </div>
                
                <div className="p-4 border-b bg-slate-50">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Seleccionar Cliente</label>
                    <select 
                        className="w-full p-2.5 border rounded-xl text-sm font-bold bg-white outline-none"
                        value={selectedClient?.identidad || ''}
                        onChange={e => setSelectedClient(clients.find(c => c.identidad === e.target.value) || null)}
                    >
                        <option value="">Consumidor Final</option>
                        {clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>)}
                    </select>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-40">
                            <ShoppingCart size={48} className="mb-2"/>
                            <p className="font-bold text-sm">Carrito Vacío</p>
                        </div>
                    ) : cart.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-800 line-clamp-2">{item.descripcionProducto}</p>
                                <p className="text-[10px] text-indigo-600 font-bold">L. {item.precioVenta.toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-black px-2 py-0.5 bg-slate-100 rounded">x{item.cantidad}</span>
                                <button onClick={() => setCart(cart.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-5 bg-slate-50 border-t space-y-2">
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-bold">L. {subtotal.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm text-red-500"><span>Descuento</span><span className="font-bold">-L. {discount.toLocaleString()}</span></div>
                    <div className="pt-3 border-t flex justify-between items-center">
                        <span className="font-black text-lg">TOTAL</span>
                        <span className="font-black text-2xl text-indigo-600">L. {total.toLocaleString()}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => setPaymentType('Contado')} className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all border ${paymentType === 'Contado' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500'}`}>CONTADO</button>
                        <button onClick={() => setPaymentType('Credito')} className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all border ${paymentType === 'Credito' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500'}`}>CRÉDITO</button>
                    </div>
                    <button 
                        onClick={handleCheckout}
                        disabled={cart.length === 0}
                        className="w-full mt-4 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm"
                    >
                        <CreditCard size={18}/> Procesar Pago
                    </button>
                </div>
            </div>
        </div>
    );
};

export default POS;
