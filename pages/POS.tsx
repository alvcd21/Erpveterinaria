import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, VentaPayload } from '../types';
import { Search, ShoppingCart, RefreshCw, User, X, Check, Plus, Minus, UserPlus, Zap, LayoutGrid, Tag, Save, Wallet, Smartphone, Package, Layers } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const numeroALetras = (num: number): string => {
    const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const diez_veinte = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const convertGroup = (n: number): string => {
        if (n === 0) return '';
        if (n === 100) return 'CIEN';
        let output = '';
        if (n >= 100) { output += centenas[Math.floor(n / 100)] + ' '; n %= 100; }
        if (n >= 10 && n <= 19) { output += diez_veinte[n - 10]; } 
        else if (n >= 20) { 
            output += decenas[Math.floor(n / 10)]; 
            if (n % 10 > 0) output += ' Y ' + unidades[n % 10]; 
        } 
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
        if (remainder > 0) {
            if (remainder >= 1000) {
                text += ' ' + convertGroup(Math.floor(remainder / 1000)) + ' MIL ' + convertGroup(remainder % 1000);
            } else {
                text += ' ' + convertGroup(remainder);
            }
        }
    } 
    else if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        const remainder = integerPart % 1000;
        text += (thousands === 1 ? 'MIL' : convertGroup(thousands) + ' MIL');
        if (remainder > 0) text += ' ' + convertGroup(remainder);
    } 
    else { text = convertGroup(integerPart); }

    return `${text} CON ${decimalPart.toString().padStart(2, '0')}/100 LEMPIRAS`.toUpperCase();
};

// Fix: Declared type ReactElement requires a return value. Added return and export default.
const POS: React.FC = (): React.ReactElement => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [companyConfig, setCompanyConfig] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito' | 'KrediYa'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  const [primaAmount, setPrimaAmount] = useState<number>(0);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  useEffect(() => { loadInitialData(); }, []);

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
      navigate(location.pathname, { replace: true, state: {} });
      setMobileTab('CART');
    }
  }, [location.state]);

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
        setPaymentType(header.tipoCompra);
        setDiscount(Number(header.descuento) || 0);
        setPrimaAmount(Number(header.montoPrima) || 0);
        setCart(details.map(d => ({
          ...d,
          cantidad: Number(d.cantidad),
          precioVenta: Number(d.precioVenta)
        })));
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
    setCart(prev => prev.filter(item => item.codDetalleVenta !== id));
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.codDetalleVenta === id) {
        if (item.tipoProducto === 'TELEFONO') return item;
        const newQty = item.cantidad + delta;
        const product = products.find(p => p.id === item.idInventario);
        if (delta > 0 && product && newQty > product.stock) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Límite de stock', showConfirmButton: false, timer: 1000 });
            return item;
        }
        return newQty > 0 ? { ...item, cantidad: newQty } : item;
      }
      return item;
    }));
  };

  const updatePrice = (id: string, newPrice: number) => {
    setCart(prev => prev.map(item => 
      item.codDetalleVenta === id ? { ...item, precioVenta: Math.max(0, newPrice) } : item
    ));
  };

  const totals = useMemo(() => {
    const bruto = cart.reduce((acc, i) => acc + (i.cantidad * i.precioVenta), 0);
    const conDescuento = Math.max(0, bruto - discount);
    const isvRate = (companyConfig?.isv || 15) / 100;
    const subtotal = conDescuento / (1 + isvRate);
    const isv = conDescuento - subtotal;
    const financiado = paymentType === 'KrediYa' ? Math.max(0, conDescuento - primaAmount) : 0;
    return { bruto, subtotal, isv, total: conDescuento, financiado };
  }, [cart, discount, companyConfig, paymentType, primaAmount]);

  // Fix: Completed generateInvoicePDF implementation
  const generateInvoicePDF = async (saleId: string) => {
      try {
          const [sale, details, cfg] = await Promise.all([
              SalesService.getVenta(saleId),
              SalesService.getDetallesVenta(saleId),
              ConfigService.get()
          ]);
          if (!sale) return;

          const doc = new jsPDF();
          const nombreEmpresa = (cfg.nombreEmpresa || 'SMARTCLOUD ERP').toUpperCase();
          const rtnEmpresa = cfg.rtn || 'N/A';
          const direccionEmpresa = cfg.direccion || 'N/A';
          const telefonoEmpresa = cfg.telefono || 'N/A';
          const correoEmpresa = cfg.correo || 'N/A';
          const caiEmpresa = cfg.cai || 'N/A';
          const rangoInic = cfg.rangoInicial || 'N/A';
          const rangoFin = cfg.rangoFinal || 'N/A';
          const fechaLim = cfg.fechaLimite ? new Date(cfg.fechaLimite).toLocaleDateString('es-HN') : 'N/A';
          const isvConfig = cfg.isv || 15;
          const mensajeFinal = cfg.mensajeFinal || "LA FACTURA ES BENEFICIO DE TODOS, EXIJALA";

          const pageWidth = doc.internal.pageSize.width;
          const pageHeight = doc.internal.pageSize.height;
          const primaryColor = "#1e3a8a";   
          const accentColor = "#3b82f6";    
          const grayColor = "#64748b";      
          const lightGray = "#f1f5f9";      

          doc.setFillColor(primaryColor);
          doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
          doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
          doc.setFillColor(accentColor);
          doc.triangle(0, 0, 100, 0, 0, 50, 'F');

          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text(nombreEmpresa, 38, 18);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(direccionEmpresa, 38, 25);
          doc.text(`Tel: ${telefonoEmpresa} | ${correoEmpresa}`, 38, 30);

          doc.setFontSize(26);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURA", pageWidth - 15, 20, { align: "right" });
          doc.setFontSize(10);
          doc.text(`NO. ${sale.codVenta}`, pageWidth - 15, 29, { align: "right" });

          const topInfoY = 60;
          doc.setFillColor(lightGray);
          doc.roundedRect(14, topInfoY, 95, 38, 3, 3, 'F');
          doc.setTextColor(primaryColor);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURAR A:", 18, topInfoY + 8);
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(13);
          doc.text((sale.nombreCliente || "CONSUMIDOR FINAL").toUpperCase(), 18, topInfoY + 18);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(grayColor);
          doc.text(`RTN/DNI: ${sale.identidadCliente || "99999999999999"}`, 18, topInfoY + 26);
          doc.text(`${sale.direccionCliente || "CHOLUTECA, HONDURAS"}`, 18, topInfoY + 32);

          const rightColX = 120;
          const metaY = topInfoY + 5;
          const spacing = 6;
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(grayColor);
          const labels = ["FECHA EMISIÓN:", "FECHA VENCIMIENTO:", "R.T.N. EMISOR:", "CAI:", "VENDEDOR:"];
          const values = [new Date(sale.fecha).toLocaleDateString('es-HN'), fechaLim, rtnEmpresa, caiEmpresa, sale.nombreVendedor?.toUpperCase() || "ADMINISTRADOR"];
          labels.forEach((label, i) => {
              doc.text(label, rightColX, metaY + (i * spacing));
              doc.setTextColor(0, 0, 0);
              doc.text(String(values[i]), rightColX + 45, metaY + (i * spacing));
              doc.setTextColor(grayColor);
          });

          // @ts-ignore
          doc.autoTable({
              startY: topInfoY + 45,
              head: [['COD.', 'CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
              body: details.map(item => [item.idTelefono || item.idInventario || 'N/A', item.cantidad, item.descripcionProducto?.toUpperCase() || 'PRODUCTO', `L. ${Number(item.precioVenta).toFixed(2)}`, `L. ${(Number(item.cantidad) * Number(item.precioVenta)).toFixed(2)}`]),
              theme: 'striped',
              styles: { fontSize: 9, cellPadding: 3, textColor: [0, 0, 0], halign: 'center' },
              headStyles: { fillColor: [30, 58, 138], fontStyle: 'bold', halign: 'center', textColor: [255, 255, 255] },
              columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 15 }, 2: { halign: 'left' }, 3: { cellWidth: 30 }, 4: { cellWidth: 30, fontStyle: 'bold' } },
              margin: { left: 14, right: 14 }
          });

          // @ts-ignore
          let finalY = doc.lastAutoTable.finalY + 10;
          const totalsX = 135;
          const isvRateNum = isvConfig / 100;
          const totalVal = Number(sale.total);
          const subtotalVal = totalVal / (1 + isvRateNum);
          const isvVal = totalVal - subtotalVal;
          const descuentVal = Number(sale.descuento || 0);

          doc.setFontSize(10);
          doc.setTextColor(grayColor);
          doc.setFont("helvetica", "normal");
          doc.text("Subtotal:", totalsX, finalY); doc.text(`L. ${subtotalVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 7;
          doc.text("Descuentos:", totalsX, finalY); doc.text(`L. ${descuentVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 7;
          doc.text(`ISV (${isvConfig}%):`, totalsX, finalY); doc.text(`L. ${isvVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 3;
          doc.setDrawColor(primaryColor); doc.setLineWidth(0.5); doc.line(totalsX, finalY, pageWidth - 14, finalY);
          finalY += 6;
          doc.setFont("helvetica", "bold"); doc.setTextColor(primaryColor); doc.setFontSize(13); doc.text("TOTAL A PAGAR:", totalsX, finalY); doc.text(`L. ${totalVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          doc.setTextColor(grayColor); doc.setFontSize(9); doc.text("SON: " + numeroALetras(totalVal), 14, finalY + 12);

          let footerY = pageHeight - 40;
          doc.setFontSize(8); doc.setTextColor(grayColor); doc.setFont("helvetica", "normal");
          doc.text(`Rango Autorizado: ${rangoInic} al ${rangoFin}`, 14, footerY);
          doc.text(`Fecha Límite de Emisión: ${fechaLim}`, 14, footerY + 5);
          doc.text(`Original: Cliente | Copia: Emisor`, 14, footerY + 10);
          doc.setFillColor(lightGray); doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
          doc.setTextColor(primaryColor); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(mensajeFinal, pageWidth / 2, pageHeight - 6, { align: "center" });
          doc.save(`Factura_${sale.codVenta}.pdf`);
      } catch (err) {
          console.error(err);
          Swal.fire('Error PDF', 'No se pudo generar la factura legal. Verifique configuración de empresa.', 'error');
      }
  };

  const handleSaveSale = async () => {
    if (cart.length === 0) return Swal.fire('Error', 'El carrito está vacío', 'warning');
    if (!selectedClientId) return Swal.fire('Error', 'Seleccione un cliente para facturar', 'warning');

    try {
      setIsLoading(true);
      const payload: VentaPayload = {
        identidadCliente: selectedClientId,
        tipoCompra: paymentType,
        total: totals.total,
        isv: totals.isv,
        descuento: discount,
        montoPrima: paymentType === 'KrediYa' ? primaAmount : 0,
        montoFinanciado: totals.financiado,
        detalles: cart.map(item => ({
          idTelefono: item.idTelefono,
          idInventario: item.idInventario,
          cantidad: item.cantidad,
          precioVenta: item.precioVenta,
          tipoProducto: item.tipoProducto
        }))
      };

      let response;
      if (isEditing && editingSaleId) {
          await SalesService.updateVenta(editingSaleId, payload);
          response = { codVenta: editingSaleId };
          Swal.fire('Venta Actualizada', `Factura ${editingSaleId} modificada correctamente`, 'success');
      } else {
          response = await SalesService.createVenta(payload);
          Swal.fire('Venta Completada', `Factura ${response.codVenta} generada con éxito`, 'success');
      }
      
      setCart([]);
      setSelectedClientId('');
      setDiscount(0);
      setPrimaAmount(0);
      setIsEditing(false);
      setEditingSaleId(null);
      loadInitialData();
      
      const printPrompt = await Swal.fire({
          title: '¿Desea imprimir el comprobante?',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Imprimir',
          cancelButtonText: 'Ahora no'
      });
      if (printPrompt.isConfirmed) generateInvoicePDF(response.codVenta);

    } catch (e: any) {
      Swal.fire('Error al Procesar', e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = p.nombre.toLowerCase().includes(term) || 
                           p.imei?.includes(term) || 
                           p.codigo.toLowerCase().includes(term);
      const matchesType = selectedType === 'ALL' || p.tipo === selectedType;
      const matchesCat = selectedCategory === 'ALL' || p.categoria === selectedCategory;
      return matchesSearch && matchesType && matchesCat && p.stock > 0;
    });
  }, [products, searchTerm, selectedType, selectedCategory]);

  const categories = useMemo(() => ['ALL', ...new Set(products.map(p => p.categoria).filter(Boolean))], [products]);

  // Fix: Added return statement with the UI layout
  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full animate-fade-in pb-10">
      
      {/* SECCIÓN IZQUIERDA: CATÁLOGO */}
      <div className={`flex-1 flex flex-col min-w-0 ${mobileTab === 'CART' ? 'hidden lg:flex' : 'flex'}`}>
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 mb-6 space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar por nombre, IMEI o código..." 
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex flex-wrap gap-2">
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={()=>setSelectedType('ALL')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${selectedType==='ALL'?'bg-white text-slate-800 shadow-sm':'text-slate-400'}`}>TODOS</button>
                    <button onClick={()=>setSelectedType('TELEFONO')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${selectedType==='TELEFONO'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>TELÉFONOS</button>
                    <button onClick={()=>setSelectedType('ACCESORIO')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${selectedType==='ACCESORIO'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>ACCESORIOS</button>
                </div>
                <select className="bg-slate-100 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 border-none outline-none" value={selectedCategory} onChange={e=>setSelectedCategory(e.target.value)}>
                    <option value="ALL">Categoría: Todas</option>
                    {categories.filter(c => c !== 'ALL').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={loadInitialData} className="p-2 bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-xl ml-auto transition-colors">
                    <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''}/>
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <Package size={64} strokeWidth={1} className="mb-4 opacity-20"/>
                    <p className="font-bold text-lg">No se encontraron productos</p>
                    <p className="text-sm">Intente con otra búsqueda o filtro</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredProducts.map(p => (
                        <div key={p.id} onClick={() => addToCart(p)} className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group active:scale-[0.98]">
                            <div className="flex justify-between items-start mb-3">
                                <div className={`p-2.5 rounded-2xl ${p.tipo === 'TELEFONO' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {p.tipo === 'TELEFONO' ? <Smartphone size={20}/> : <Layers size={20}/>}
                                </div>
                                <span className="bg-slate-100 text-[10px] font-black text-slate-500 px-2 py-0.5 rounded-lg uppercase">{p.tipo}</span>
                            </div>
                            <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-indigo-600 transition-colors line-clamp-2 h-10">{p.nombre}</h3>
                            <p className="text-[10px] text-slate-400 font-mono mb-4 uppercase">{p.imei || p.codigo || p.id}</p>
                            <div className="flex justify-between items-end border-t border-slate-50 pt-3">
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Precio</p>
                                    <p className="text-lg font-black text-indigo-600">L. {Number(p.precioVenta).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Stock</p>
                                    <p className={`text-xs font-black ${p.stock <= 2 ? 'text-red-500' : 'text-emerald-600'}`}>{p.stock} uni.</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>

      {/* SECCIÓN DERECHA: CARRITO Y PAGO */}
      <div className={`w-full lg:w-[400px] flex flex-col bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden shrink-0 ${mobileTab === 'CATALOG' ? 'hidden lg:flex' : 'flex h-full'}`}>
        <div className="p-6 bg-slate-900 text-white shrink-0">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingCart size={24}/> {isEditing ? 'Editando Factura' : 'Punto de Venta'}</h2>
                <button onClick={() => setMobileTab('CATALOG')} className="lg:hidden p-2 hover:bg-white/10 rounded-full"><X/></button>
            </div>
            <div className="space-y-4">
                <div>
                    <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block mb-1.5 ml-1">Cliente Receptor</label>
                    <select className="w-full bg-white/10 border border-white/20 rounded-2xl p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white" value={selectedClientId} onChange={e=>setSelectedClientId(e.target.value)}>
                        <option value="" className="text-slate-800">-- Consumidor Final --</option>
                        {clients.map(c => <option key={c.identidad} value={c.identidad} className="text-slate-800">{c.nombre} {c.apellido} ({c.identidad})</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block mb-1.5 ml-1">Pago</label>
                        <select className="w-full bg-white/10 border border-white/20 rounded-2xl p-3 text-xs font-bold outline-none" value={paymentType} onChange={e=>setPaymentType(e.target.value as any)}>
                            <option value="Contado" className="text-slate-800">Contado</option>
                            <option value="KrediYa" className="text-slate-800">KrediYa</option>
                            <option value="Credito" className="text-slate-800">Crédito Dir.</option>
                        </select>
                    </div>
                    {paymentType === 'KrediYa' && (
                        <div className="animate-fade-in">
                            <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block mb-1.5 ml-1">Prima</label>
                            <input type="number" className="w-full bg-white/10 border border-white/20 rounded-2xl p-3 text-xs font-bold outline-none" value={primaAmount} onChange={e=>setPrimaAmount(Number(e.target.value))} />
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
            {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                    <ShoppingCart size={48} strokeWidth={1} className="mb-2 opacity-10"/>
                    <p className="text-xs font-bold uppercase tracking-widest">Carrito Vacío</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {cart.map(item => (
                        <div key={item.codDetalleVenta} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0 pr-6">
                                    <p className="text-xs font-black text-slate-800 leading-none truncate">{item.descripcionProducto}</p>
                                    <p className="text-[9px] text-slate-400 mt-1 uppercase font-mono">{item.idTelefono || item.idInventario || 'Manual'}</p>
                                </div>
                                <button onClick={() => removeFromCart(item.codDetalleVenta!)} className="text-slate-300 hover:text-red-500 transition-colors p-1"><X size={16}/></button>
                            </div>
                            <div className="flex justify-between items-center gap-4 mt-4">
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                                    <button disabled={item.tipoProducto === 'TELEFONO'} onClick={() => updateQty(item.codDetalleVenta!, -1)} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-white hover:text-indigo-600 rounded-lg transition-all disabled:opacity-30"><Minus size={14}/></button>
                                    <span className="text-xs font-black w-4 text-center">{item.cantidad}</span>
                                    <button disabled={item.tipoProducto === 'TELEFONO'} onClick={() => updateQty(item.codDetalleVenta!, 1)} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-white hover:text-indigo-600 rounded-lg transition-all disabled:opacity-30"><Plus size={14}/></button>
                                </div>
                                <div className="flex-1">
                                    <input type="number" className="w-full text-right bg-transparent border-none text-sm font-black text-indigo-600 outline-none p-0" value={item.precioVenta} onChange={e=>updatePrice(item.codDetalleVenta!, Number(e.target.value))} />
                                    <p className="text-[9px] text-slate-400 text-right font-bold">L. Unitario</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] shrink-0">
            <div className="space-y-2 mb-6">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                    <span>Subtotal</span>
                    <span>L. {totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500 font-medium items-center gap-2">
                    <span className="flex items-center gap-1"><Tag size={12} className="text-amber-500"/> Descuento</span>
                    <input type="number" className="w-20 text-right border-b border-dashed outline-none font-bold text-amber-600 p-0" value={discount} onChange={e=>setDiscount(Number(e.target.value))} />
                </div>
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                    <span>ISV (15%)</span>
                    <span>L. {totals.isv.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-100">
                    <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Total a Pagar</span>
                    <span className="text-xl font-black text-indigo-600">L. {totals.total.toFixed(2)}</span>
                </div>
            </div>
            
            <button 
                onClick={handleSaveSale}
                disabled={isLoading || cart.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale uppercase text-xs tracking-[0.2em]"
            >
                {isLoading ? <RefreshCw className="animate-spin" size={20}/> : <><Zap size={20}/> Procesar Venta</>}
            </button>
        </div>
      </div>

      {/* BOTÓN FLOTANTE MÓVIL */}
      <button 
        onClick={() => setMobileTab(mobileTab === 'CATALOG' ? 'CART' : 'CATALOG')}
        className="lg:hidden fixed bottom-6 right-6 w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 animate-bounce-slow"
      >
        {mobileTab === 'CATALOG' ? (
            <div className="relative"><ShoppingCart size={28}/>{cart.length > 0 && <span className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full border-2 border-white flex items-center justify-center">{cart.length}</span>}</div>
        ) : <LayoutGrid size={28}/>}
      </button>

    </div>
  );
};

export default POS;
