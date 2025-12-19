
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save, UserPlus, X, Check, Smartphone as PhoneIcon, Headphones as GearIcon } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

// Helper robusto para números a letras (Reutilizado del sistema para facturación legal)
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
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // --- DATA STATES ---
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
  // --- UI STATES ---
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  // --- FORM STATES ---
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  
  // --- EDIT MODE ---
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  useEffect(() => {
    checkRegisterStatus();
    loadInitialData();
  }, []);

  useEffect(() => {
    const state = location.state as any;
    if (state?.editSaleId) {
      loadSaleToEdit(state.editSaleId);
    } else if (state?.customItem) {
      const { descripcion, precio } = state.customItem;
      setCart(prev => [...prev, {
        codDetalleVenta: `MAN-${Date.now()}`,
        cantidad: 1,
        precioVenta: Number(precio),
        descripcionProducto: descripcion,
        tipoProducto: 'SERVICIO'
      }]);
      // Limpiar estado de navegación
      navigate(location.pathname, { replace: true, state: {} });
      setMobileTab('CART');
    }
  }, [location.state]);

  const checkRegisterStatus = async () => {
     try {
       const activeArqueo = await CashService.getActiveArqueo();
       if (!activeArqueo) {
         await Swal.fire({ title: 'Caja Cerrada', text: 'Debes aperturar la caja antes de facturar.', icon: 'warning', confirmButtonText: 'Ir a Caja' });
         navigate('/cash');
       }
     } catch (error) { console.error("Error checking register", error); }
  };

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [prodData, clientData, configData] = await Promise.all([
        InventoryService.getUnifiedProducts(),
        ClientService.getAll(),
        ConfigService.get()
      ]);
      setProducts(prodData || []);
      setClients(clientData || []);
      setCompanyConfig(configData);
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const loadSaleToEdit = async (saleId: string) => {
    try {
      setIsLoading(true);
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
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: `Editando Venta #${saleId}`, showConfirmButton: false, timer: 2000 });
      }
    } catch (e) {
      Swal.fire('Error', 'No se pudo cargar la factura para editar', 'error');
    } finally { setIsLoading(false); }
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

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.codDetalleVenta !== id));
  };

  const totals = useMemo(() => {
    const bruto = cart.reduce((acc, i) => acc + (i.cantidad * i.precioVenta), 0);
    const conDescuento = Math.max(0, bruto - discount);
    const isvRate = (companyConfig?.isv || 15) / 100;
    const subtotal = conDescuento / (1 + isvRate);
    const isv = conDescuento - subtotal;
    return { bruto, subtotal, isv, total: conDescuento };
  }, [cart, discount, companyConfig]);

  const generateInvoicePDF = (codVenta: string, saleHeader: any, saleDetails: any[]) => {
      try {
          const doc = new jsPDF();
          const config = companyConfig || { nombreEmpresa: 'SMARTCLOUD', rtn: '', direccion: '', isv: 15, cai: '', rangoInicial: '', rangoFinal: '', fechaLimite: '', mensajeFinal: '' } as any;
          const pageWidth = doc.internal.pageSize.width;
          const pageHeight = doc.internal.pageSize.height;
          const primaryColor = "#1e3a8a";   
          const accentColor = "#3b82f6";    
          const grayColor = "#64748b";      
          const lightGray = "#f1f5f9";      

          // Header geométrico
          doc.setFillColor(primaryColor);
          doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
          doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
          doc.setFillColor(accentColor);
          doc.triangle(0, 0, 100, 0, 0, 50, 'F');

          // Info Empresa
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text(config.nombreEmpresa.toUpperCase(), 35, 18);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(config.direccion || '', 35, 24);
          doc.text(`Tel: ${config.telefono} | ${config.correo || ''}`, 35, 29);

          // Título
          doc.setFontSize(24);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURA", pageWidth - 15, 20, { align: "right" });
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.text(`NO. ${codVenta}`, pageWidth - 15, 28, { align: "right" });

          const topInfoY = 60;
          doc.setFillColor(lightGray);
          doc.roundedRect(14, topInfoY, 90, 35, 3, 3, 'F');
          
          // INFO CLIENTE
          const client = clients.find(c => c.identidad === saleHeader.identidadCliente);
          doc.setTextColor(primaryColor);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURAR A:", 18, topInfoY + 6);
          
          doc.setTextColor(0, 0, 0);
          doc.text(client ? `${client.nombre} ${client.apellido}`.toUpperCase() : "CONSUMIDOR FINAL", 18, topInfoY + 12);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(grayColor);
          doc.text(`RTN/DNI: ${saleHeader.identidadCliente || "N/A"}`, 18, topInfoY + 17);
          doc.text(`${client?.direccion || "N/A"}`, 18, topInfoY + 22);

          const rightColX = 115;
          doc.setFont("helvetica", "bold"); doc.setTextColor(grayColor);
          doc.text("FECHA EMISIÓN:", rightColX, topInfoY + 5);
          doc.setTextColor(0,0,0);
          doc.text(new Date().toLocaleDateString(), rightColX + 45, topInfoY + 5);
          
          doc.setTextColor(grayColor);
          doc.text("CAI:", rightColX, topInfoY + 10);
          doc.setTextColor(0,0,0);
          doc.text(config.cai || 'N/A', rightColX + 45, topInfoY + 10);

          doc.setTextColor(grayColor);
          doc.text("VENDEDOR:", rightColX, topInfoY + 15);
          doc.setTextColor(0,0,0);
          doc.text(user?.nombreEmpleado || "Cajero", rightColX + 45, topInfoY + 15);

          // Tabla
          // @ts-ignore
          doc.autoTable({
              startY: topInfoY + 40,
              head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
              body: saleDetails.map(item => [
                  item.cantidad,
                  item.descripcionProducto,
                  `L. ${Number(item.precioVenta).toFixed(2)}`,
                  `L. ${(Number(item.cantidad) * Number(item.precioVenta)).toFixed(2)}`
              ]),
              theme: 'striped',
              styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
              headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
              columnStyles: { 
                  0: { halign: 'center' },
                  1: { halign: 'left' },
                  2: { halign: 'right' }, 
                  3: { halign: 'right', fontStyle: 'bold' } 
              },
              margin: { left: 14, right: 14 }
          });

          // @ts-ignore
          let finalY = doc.lastAutoTable.finalY + 5;
          const totalsX = 130;

          doc.text("Subtotal:", totalsX, finalY);
          doc.text(`L. ${totals.subtotal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 6;
          if(discount > 0) {
              doc.text("Descuentos:", totalsX, finalY);
              doc.text(`L. ${discount.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
              finalY += 6;
          }
          doc.text(`ISV (${config.isv}%):`, totalsX, finalY);
          doc.text(`L. ${totals.isv.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 2;
          
          doc.setDrawColor(primaryColor);
          doc.setLineWidth(0.5);
          doc.line(totalsX, finalY, pageWidth - 14, finalY);
          finalY += 5;

          doc.setFont("helvetica", "bold");
          doc.setTextColor(primaryColor);
          doc.text("TOTAL A PAGAR:", totalsX, finalY);
          doc.text(`L. ${totals.total.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});

          doc.setTextColor(grayColor);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.text("SON: " + numeroALetras(totals.total), 14, finalY);

          doc.save(`Factura_${codVenta}.pdf`);
      } catch (e: any) {
          console.error(e);
          Swal.fire('Error PDF', 'No se pudo generar la factura', 'error');
      }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!selectedClientId) return Swal.fire('Cliente Requerido', 'Seleccione un cliente.', 'warning');
    
    const actionText = isEditing ? 'Actualizar' : 'Facturar';
    const result = await Swal.fire({
      title: `¿${actionText} Venta?`,
      text: `Total: L. ${totals.total.toFixed(2)}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Sí, ${actionText}`,
      confirmButtonColor: '#4f46e5'
    });

    if (!result.isConfirmed) return;

    try {
      setIsLoading(true);
      const payload: VentaPayload = {
        identidadCliente: selectedClientId,
        tipoCompra: paymentType,
        total: totals.total,
        isv: totals.isv,
        descuento: discount,
        detalles: cart
      };

      let response;
      if (isEditing && editingSaleId) {
        response = await SalesService.updateVenta(editingSaleId, payload);
        Swal.fire('Éxito', 'Factura actualizada', 'success');
      } else {
        response = await SalesService.createVenta(payload);
        Swal.fire({
          title: 'Venta Exitosa',
          text: `Factura #${response.codVenta} generada`,
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'Imprimir',
          cancelButtonText: 'Cerrar'
        }).then((res) => {
          if (res.isConfirmed) generateInvoicePDF(response.codVenta, payload, cart);
        });
      }
      resetPOS();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally { setIsLoading(false); }
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

  const filteredProducts = products.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.imei?.includes(searchTerm) || p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = selectedCategory === 'ALL' || p.tipo === selectedCategory;
    return matchSearch && matchCategory;
  });

  const clientInfo = clients.find(c => c.identidad === selectedClientId);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-140px)] relative animate-fade-in">
      
      {/* Mobile Tab Switcher (AT TOP AS REQUESTED) */}
      <div className="lg:hidden flex bg-white rounded-xl mb-4 p-1 border border-slate-200 shadow-sm shrink-0">
         <button 
           onClick={() => setMobileTab('CATALOG')}
           className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
         >
           <LayoutGrid size={18} /> Catálogo
         </button>
         <button 
           onClick={() => setMobileTab('CART')}
           className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${mobileTab === 'CART' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
         >
           <ShoppingCart size={18} /> Carrito ({cart.reduce((a,b) => a + b.cantidad, 0)})
         </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        
        {/* LEFT: Product Selector (Catalog) */}
        <div className={`flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 ${mobileTab === 'CATALOG' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-slate-100 flex flex-col gap-4 shrink-0">
            <div className="flex gap-3">
               <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar (Nombre, Código, IMEI)..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm md:text-base font-medium placeholder:text-slate-400"
                />
              </div>
              <button onClick={loadInitialData} className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-xl transition-colors active:scale-95">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''}/>
              </button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
               <button onClick={() => setSelectedCategory('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap transition-all ${selectedCategory === 'ALL' ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Todos</button>
               <button onClick={() => setSelectedCategory('TELEFONO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap flex gap-2 transition-all ${selectedCategory === 'TELEFONO' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><PhoneIcon size={14}/> Teléfonos</button>
               <button onClick={() => setSelectedCategory('ACCESORIO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap flex gap-2 transition-all ${selectedCategory === 'ACCESORIO' ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><GearIcon size={14}/> Accesorios</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
            {isLoading && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                <RefreshCw className="animate-spin" size={32}/>
                <p className="font-medium">Cargando inventario...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map(product => (
                  <button 
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={product.stock === 0}
                    className={`flex flex-col items-start p-4 bg-white rounded-xl border transition-all text-left relative overflow-hidden group active:scale-95
                      ${product.stock === 0 ? 'opacity-60 border-slate-100 grayscale' : 'border-slate-200/60 hover:border-indigo-500 hover:shadow-lg'}`}
                  >
                    <div className="w-full flex justify-between items-start mb-2">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-500 tracking-wider uppercase`}>
                        {product.tipo.substring(0,3)}
                      </span>
                      <span className={`text-[10px] font-bold ${product.stock > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'} px-2 py-1 rounded-md`}>
                        Stock: {product.stock}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm line-clamp-2 mb-auto leading-snug min-h-[2.8rem]">{product.nombre}</h4>
                    <div className="mt-4 w-full pt-3 border-t border-slate-50">
                      <span className="block text-lg font-bold text-indigo-600">L. {Number(product.precioVenta).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      <span className="text-[10px] text-slate-400 block mt-1 truncate">Ubic: {product.ubicacion}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {filteredProducts.length === 0 && !isLoading && (
               <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10">
                 <Search size={64} strokeWidth={1} className="opacity-20 mb-4" />
                 <p className="font-bold uppercase tracking-widest text-sm">Sin coincidencias</p>
               </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart & Checkout (Sidebar) */}
        <div className={`w-full lg:w-[380px] xl:w-[420px] flex-col bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 h-full ${mobileTab === 'CART' ? 'flex' : 'hidden lg:flex'}`}>
          
          {/* Cart Header */}
          <div className={`p-4 border-b border-slate-100 space-y-3 shrink-0 ${isEditing ? 'bg-amber-50' : 'bg-slate-50/50'}`}>
            <h3 className="font-bold text-slate-800 flex items-center justify-between gap-2">
               <span className="flex items-center gap-2">
                   <Zap className={isEditing ? 'text-amber-500 fill-amber-500' : 'text-yellow-500 fill-yellow-500'} size={18} /> 
                   {isEditing ? `EDITANDO #${editingSaleId}` : 'VENTA'}
               </span>
               {isEditing && (
                   <button onClick={resetPOS} className="text-[10px] font-black uppercase bg-white border border-amber-200 text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">Cancelar</button>
               )}
            </h3>

            <div className="flex gap-2">
               <button 
                 onClick={() => setPaymentType('Contado')}
                 className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all border-2 ${paymentType === 'Contado' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-500'}`}
               >
                 Contado
               </button>
               <button 
                 onClick={() => setPaymentType('Credito')}
                 className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all border-2 ${paymentType === 'Credito' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-500'}`}
               >
                 Crédito
               </button>
            </div>

            <div className="relative group">
                <select 
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full pl-3 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                >
                    <option value="">-- Cliente --</option>
                    {clients.map(c => (
                        <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>
                    ))}
                </select>
                <button onClick={() => navigate('/clients')} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <UserPlus size={18}/>
                </button>
            </div>

            {clientInfo && (
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-[11px] animate-fade-in">
                 <p className="font-black text-indigo-900 uppercase">{clientInfo.nombre} {clientInfo.apellido}</p>
                 <p className="text-indigo-600 truncate mt-1">{clientInfo.direccion || 'Sin dirección registrada'}</p>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-50/20">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10 opacity-50">
                <ShoppingCart size={48} strokeWidth={1} className="mb-2" />
                <p className="font-bold text-xs uppercase tracking-widest">Carrito vacío</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.codDetalleVenta} className="flex gap-3 items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-100 transition-colors animate-fade-in">
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-bold text-slate-800 truncate">{item.descripcionProducto}</h5>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{item.cantidad} x L. {Number(item.precioVenta).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end min-w-[80px]">
                    <span className="font-black text-slate-800 text-xs">L. {(item.cantidad * item.precioVenta).toFixed(2)}</span>
                    <button 
                      onClick={() => removeFromCart(item.codDetalleVenta!)}
                      className="text-red-300 hover:text-red-500 mt-1 p-1 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals Section */}
          <div className="p-5 bg-white border-t border-slate-200 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                <span>Subtotal</span>
                <span>L. {totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                <span>ISV ({companyConfig?.isv || 15}%)</span>
                <span>L. {totals.isv.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-y border-slate-50">
                <span className="text-red-500 text-[11px] font-black uppercase tracking-wider">Descuento</span>
                <div className="relative">
                   <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">L.</span>
                   <input 
                      type="number" 
                      value={discount} 
                      onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                      className="w-24 text-right pl-6 pr-2 py-1 border border-slate-200 rounded-lg bg-slate-50 text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                      onFocus={e => e.target.select()}
                   />
                </div>
              </div>
              <div className="flex justify-between items-end pt-3">
                <span className="font-black text-xs text-slate-800 uppercase tracking-widest">Total</span>
                <span className="font-black text-2xl text-indigo-600 tracking-tighter">L. {totals.total.toFixed(2)}</span>
              </div>
            </div>

            <button 
              className={`w-full flex items-center justify-center gap-3 px-4 py-4 rounded-2xl text-white font-black transition-all shadow-xl disabled:opacity-50 disabled:shadow-none text-xs tracking-[0.1em] active:scale-95 ${isEditing ? 'bg-amber-600 shadow-amber-600/20' : 'bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-700'}`}
              disabled={cart.length === 0 || !selectedClientId || isLoading}
              onClick={handleCheckout}
            >
              {isLoading ? <RefreshCw className="animate-spin" size={18}/> : (isEditing ? <Save size={18}/> : <CreditCard size={18} />)} 
              {isEditing ? 'ACTUALIZAR VENTA' : 'FACTURAR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;
