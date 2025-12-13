
import React, { useState, useEffect } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import 'jspdf-autotable';

// Helper básico para números a letras (Simplificado para Lempiras)
const numeroALetras = (num: number): string => {
    const unidades = ['CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);
    
    let text = '';
    if (integerPart === 100) text = 'CIEN';
    else if (integerPart > 100 && integerPart < 1000) {
        text = centenas[Math.floor(integerPart / 100)];
        const rest = integerPart % 100;
        if (rest > 0) text += ' ' + convertTwoDigits(rest);
    } else {
        text = convertTwoDigits(integerPart);
    }

    return `${text} CON ${decimalPart}/100 LEMPIRAS`;

    function convertTwoDigits(n: number) {
        if (n < 10) return unidades[n];
        if (n < 20) return ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'][n-10];
        const dec = Math.floor(n/10);
        const uni = n % 10;
        return decenas[dec] + (uni > 0 ? ' Y ' + unidades[uni] : '');
    }
};

const POS: React.FC = () => {
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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

  // Obtener fecha local en formato YYYY-MM-DD
  const getLocalDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  useEffect(() => {
    checkRegisterStatus();
    loadInitialData();
  }, []);

  // Handle Custom Item passed from Cash Register OR Edit Mode
  useEffect(() => {
      const state = location.state as any;
      
      // 1. Ingreso Manual desde Caja (Custom Item)
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
      }

      // 2. Modo Edición (Edit Sale)
      if (state && state.editSaleId) {
          loadSaleToEdit(state.editSaleId);
      }

  }, [location]);

  const checkRegisterStatus = async () => {
     try {
       const activeArqueo = await CashService.getActiveArqueo();
       if (!activeArqueo) {
         await Swal.fire({
           title: 'Caja Cerrada',
           text: 'Debes aperturar la caja antes de facturar.',
           icon: 'warning',
           confirmButtonText: 'Ir a Caja'
         });
         navigate('/cash');
       }
     } catch (error) {
       console.error("Error checking register", error);
     }
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
          const cleanDetails = details.map(d => ({
              ...d,
              cantidad: Number(d.cantidad),
              precioVenta: Number(d.precioVenta)
          }));
          setCart(cleanDetails);

          const header = await SalesService.getVenta(saleId);
          if (header) {
              setSelectedClientId(header.identidadCliente);
              setPaymentType(header.tipoCompra as any || 'Contado');
              setDiscount(Number(header.descuento) || 0);
          }
          
          Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: `Editando Venta #${saleId}`, showConfirmButton: false, timer: 2000 });

      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudo cargar la venta para edición', 'error');
          setIsEditing(false);
          setEditingSaleId(null);
      } finally {
          setIsLoading(false);
      }
  };

  const getClientDetails = () => {
    return clients.find(c => c.identidad === selectedClientId);
  };

  const addToCart = (product: ProductoUnified) => {
    setCart(prev => {
      const existing = prev.find(item => 
        (item.idTelefono === product.id) || (item.idInventario === product.id)
      );

      if (existing) {
        if(product.tipo === 'TELEFONO') {
           Swal.fire('Error', 'Los teléfonos son únicos (por IMEI) y no se pueden sumar.', 'error');
           return prev;
        }
        if (existing.cantidad + 1 > product.stock) {
           Swal.fire('Stock Insuficiente', 'No hay más unidades disponibles.', 'warning');
           return prev;
        }
        return prev.map(item => {
           const isMatch = (item.idTelefono === product.id) || (item.idInventario === product.id);
           return isMatch ? { ...item, cantidad: item.cantidad + 1 } : item;
        });
      }

      const newItem: DetalleVenta = {
        codDetalleVenta: `TEMP-${Date.now()}`,
        idTelefono: product.tipo === 'TELEFONO' ? product.id : undefined,
        idInventario: product.tipo === 'ACCESORIO' ? product.id : undefined,
        cantidad: 1,
        precioVenta: Number(product.precioVenta),
        descripcionProducto: product.nombre,
        tipoProducto: product.tipo
      };
      return [...prev, newItem];
    });
    
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Agregado', showConfirmButton: false, timer: 1000 });
  };

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(item => item.codDetalleVenta !== tempId));
  };

  // Cálculo Monetario
  const calculateTotal = () => {
    const totalVenta = cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0);
    const totalConDescuento = Math.max(0, totalVenta - discount);
    
    const isvRate = (companyConfig?.isv || 15) / 100;
    const subtotal = totalConDescuento / (1 + isvRate);
    const tax = totalConDescuento - subtotal;

    return { 
      subtotal, 
      tax, 
      total: totalConDescuento 
    };
  };

  const { subtotal, tax, total } = calculateTotal();

  // --- GENERACIÓN PDF FACTURA MODERNA (Estilo Azul/Corporativo) ---
  const generateInvoicePDF = (codVenta: string, date: Date) => {
    try {
      const doc = new jsPDF();
      const client = getClientDetails();
      const config = companyConfig || { nombreEmpresa: 'SMARTCLOUD', rtn: '', direccion: '', isv: 15 } as any;
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      // --- LOGO PLACEHOLDER (Reemplazar con tu Base64 real) ---
      // Para poner tu logo: Convierte tu imagen a Base64 en https://www.base64-image.de/
      // y pega el string completo dentro de las comillas.
      const logoBase64 = "data:image/png;base64,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";    
      // Colores Corporativos
      const primaryColor = "#1e3a8a";   // Azul oscuro corporativo
      const accentColor = "#3b82f6";    // Azul brillante
      const grayColor = "#64748b";      // Gris texto
      const lightGray = "#f1f5f9";      // Gris fondo

      // --- ENCABEZADO ---
      
      // Fondo superior geométrico
      doc.setFillColor(primaryColor);
      // Replace polygon with triangles for compatibility
      // doc.polygon([0, 0, pageWidth, 0, pageWidth, 35, 0, 50], 'F');
      doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
      doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
      
      doc.setFillColor(accentColor);
      // doc.polygon([0, 0, 100, 0, 0, 50], 'F');
      doc.triangle(0, 0, 100, 0, 0, 50, 'F');

      // Logo (Lado Izquierdo)
      try {
          doc.addImage(logoBase64, 'PNG', 10, 10, 20, 20); // Ajusta X, Y, W, H según tu logo
      } catch (e) {
          // Fallback si no hay logo
          doc.setFillColor(255, 255, 255);
          doc.circle(20, 20, 10, 'F');
          doc.setFontSize(8);
          doc.setTextColor(primaryColor);
          doc.text("LOGO", 16, 21);
      }

      // Información Empresa (Lado Izquierdo, sobre fondo oscuro => Texto blanco)
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(config.nombreEmpresa.toUpperCase(), 35, 18);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(config.direccion || '', 35, 24);
      doc.text(`Tel: ${config.telefono} | ${config.correo || ''}`, 35, 29);

      // Título FACTURA (Lado Derecho)
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("FACTURA", pageWidth - 15, 20, { align: "right" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`NO. ${codVenta}`, pageWidth - 15, 28, { align: "right" });

      // --- DETALLES DE FACTURACIÓN (Debajo del header) ---
      const topInfoY = 60;
      
      // Columna Izquierda: Cliente (Caja Gris Estilizada)
      doc.setFillColor(lightGray);
      doc.roundedRect(14, topInfoY, 90, 35, 3, 3, 'F');
      
      doc.setTextColor(primaryColor);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("FACTURAR A:", 18, topInfoY + 6);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(client ? `${client.nombre} ${client.apellido}` : "CONSUMIDOR FINAL", 18, topInfoY + 12);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(grayColor);
      doc.text(`RTN/DNI: ${client?.identidad || "N/A"}`, 18, topInfoY + 17);
      
      const direccion = doc.splitTextToSize(client?.direccion || "Ciudad", 80);
      doc.text(direccion, 18, topInfoY + 22);

      // Columna Derecha: Datos Fiscales & Fechas
      const rightColX = 115;
      
      const addDetailRow = (label: string, value: string, y: number, isBold: boolean = false) => {
          doc.setFontSize(9);
          doc.setTextColor(grayColor);
          doc.setFont("helvetica", "bold");
          doc.text(label, rightColX, y);
          
          doc.setTextColor(0,0,0);
          doc.setFont("helvetica", isBold ? "bold" : "normal");
          doc.text(value, rightColX + 40, y); // Offset value
      };

      const currentDateStr = new Date().toLocaleDateString(); // FECHA ACTUAL AUTOMÁTICA

      addDetailRow("FECHA EMISIÓN:", currentDateStr, topInfoY + 5, true);
      addDetailRow("FECHA VENCIMIENTO:", config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : 'N/A', topInfoY + 10);
      addDetailRow("R.T.N. EMISOR:", config.rtn || '', topInfoY + 15);
      addDetailRow("CAI:", config.cai || '', topInfoY + 20);
      addDetailRow("ORDEN DE COMPRA:", "N/A", topInfoY + 25);
      addDetailRow("VENDEDOR:", user?.nombreEmpleado || "Cajero", topInfoY + 30);

      // --- TABLA DE PRODUCTOS ---
      // @ts-ignore
      doc.autoTable({
          startY: topInfoY + 40,
          head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
          body: cart.map(item => [
              item.cantidad,
              item.descripcionProducto,
              `L. ${Number(item.precioVenta).toFixed(2)}`,
              `L. ${(item.cantidad * item.precioVenta).toFixed(2)}`
          ]),
          theme: 'striped',
          styles: { 
              fontSize: 9, 
              cellPadding: 3,
              textColor: [50, 50, 50] 
          },
          headStyles: { 
              fillColor: primaryColor, // Azul corporativo
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              halign: 'left'
          },
          columnStyles: {
              0: { halign: 'center', fontStyle: 'bold' }, // Cant
              2: { halign: 'right' }, // Precio
              3: { halign: 'right', fontStyle: 'bold' }  // Total
          },
          margin: { left: 14, right: 14 },
          alternateRowStyles: {
              fillColor: [248, 250, 252] // Very light gray blue
          }
      });

      // @ts-ignore
      const finalY = doc.lastAutoTable.finalY + 5;

      // --- TOTALES (Derecha) ---
      const totalsX = 130;
      let currentY = finalY;

      const addTotalRow = (label: string, value: string, isTotal: boolean = false) => {
          doc.setFontSize(isTotal ? 11 : 9);
          doc.setTextColor(isTotal ? primaryColor : grayColor);
          doc.setFont("helvetica", isTotal ? "bold" : "normal");
          doc.text(label, totalsX, currentY);
          
          doc.setTextColor(isTotal ? primaryColor : "#000000");
          doc.text(value, pageWidth - 14, currentY, { align: "right" });
          currentY += 6;
      };

      addTotalRow("Subtotal:", `L. ${subtotal.toFixed(2)}`);
      addTotalRow("Descuentos:", `L. ${discount.toFixed(2)}`);
      addTotalRow(`ISV (${config.isv}%):`, `L. ${tax.toFixed(2)}`);
      currentY += 2; // Spacer
      
      // Línea separadora total
      doc.setDrawColor(primaryColor);
      doc.setLineWidth(0.5);
      doc.line(totalsX, currentY - 4, pageWidth - 14, currentY - 4);
      
      addTotalRow("TOTAL A PAGAR:", `L. ${total.toFixed(2)}`, true);

      // --- INFORMACIÓN LEGAL Y MONTO EN LETRAS (Izquierda) ---
      const legalY = finalY;
      const legalWidth = 100;

      doc.setFontSize(8);
      doc.setTextColor(grayColor);
      doc.setFont("helvetica", "bold");
      doc.text("SON:", 14, legalY + 30); // Bajamos un poco para no chocar con tabla si es larga
      doc.setFont("helvetica", "normal");
      doc.text(numeroALetras(total), 22, legalY + 30);

      // Bloque Legal SAR
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      let legalTextY = legalY + 40;
      
      const legalLines = [
          `Rango Autorizado: ${config.rangoInicial || ''} al ${config.rangoFinal || ''}`,
          `Fecha Límite de Emisión: ${config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : ''}`,
          `Original: Cliente | Copia: Emisor`
      ];

      legalLines.forEach(line => {
          doc.text(line, 14, legalTextY);
          legalTextY += 4;
      });

      // --- PIE DE PÁGINA ---
      // Barra inferior
      doc.setFillColor(lightGray);
      doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
      
      doc.setTextColor(primaryColor);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(config.mensajeFinal || "LA FACTURA ES BENEFICIO DE TODOS, EXIJALA", pageWidth / 2, pageHeight - 6, { align: "center" });

      doc.save(`Factura_${codVenta}.pdf`);
    } catch (err) {
      console.error(err);
      Swal.fire("Error PDF", "No se pudo generar el PDF", "error");
    }
  };

  const handleProcessSale = async () => {
    if (cart.length === 0) return Swal.fire('Carrito Vacío', 'Agrega productos para facturar.', 'warning');
    if (!selectedClientId) return Swal.fire('Cliente Requerido', 'Selecciona un cliente para la factura.', 'warning');

    const result = await Swal.fire({
      title: isEditing ? '¿Actualizar Venta?' : '¿Procesar Venta?',
      text: `Total: L. ${total.toFixed(2)}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: isEditing ? 'Sí, Actualizar' : 'Sí, Facturar',
      confirmButtonColor: '#4f46e5'
    });

    if (result.isConfirmed) {
      try {
        const payload = {
            identidadCliente: selectedClientId,
            tipoCompra: paymentType,
            total: total,
            isv: tax,
            descuento: discount,
            detalles: cart,
            fecha: getLocalDate() 
        };

        let response;
        if (isEditing && editingSaleId) {
            response = await SalesService.updateVenta(editingSaleId, payload);
        } else {
            response = await SalesService.createVenta(payload);
        }
        
        Swal.fire({
          title: 'Éxito',
          text: isEditing ? 'Venta actualizada correctamente' : 'Venta registrada',
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'Imprimir',
          cancelButtonText: 'Cerrar'
        }).then((res) => {
          if (res.isConfirmed) {
            generateInvoicePDF(response.codVenta || 'NEW', new Date());
          }
        });

        // Reset
        setCart([]);
        setDiscount(0);
        setSelectedClientId('');
        setIsEditing(false);
        setEditingSaleId(null);
        navigate(location.pathname, { replace: true, state: {} });
        
        loadInitialData();
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  const cancelEdit = () => {
      setIsEditing(false);
      setEditingSaleId(null);
      setCart([]);
      setSelectedClientId('');
      setDiscount(0);
      navigate(location.pathname, { replace: true, state: {} });
      Swal.fire('Edición Cancelada', 'Se ha limpiado el punto de venta.', 'info');
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = p.nombre.toLowerCase().includes(term) || 
                          p.codigo.toLowerCase().includes(term) ||
                          p.id.toLowerCase().includes(term) || 
                          (p.imei && p.imei.toLowerCase().includes(term));
    const matchesCategory = selectedCategory === 'ALL' || p.tipo === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const clientInfo = getClientDetails();

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-140px)] relative">
      
      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex bg-white rounded-xl mb-4 p-1 border border-slate-200 shadow-sm shrink-0">
         <button 
           onClick={() => setMobileTab('CATALOG')}
           className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
         >
           <LayoutGrid size={18} /> Catálogo
         </button>
         <button 
           onClick={() => setMobileTab('CART')}
           className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 ${mobileTab === 'CART' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
         >
           <ShoppingCart size={18} /> Carrito ({cart.reduce((a,b) => a + b.cantidad, 0)})
         </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        
        {/* LEFT: Product Selector (Visible if Tab is CATALOG or screen is LG) */}
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
              <button onClick={loadInitialData} className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-xl transition-colors">
                <RefreshCw size={20}/>
              </button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
               <button onClick={() => setSelectedCategory('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap ${selectedCategory === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>Todos</button>
               <button onClick={() => setSelectedCategory('TELEFONO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap flex gap-2 ${selectedCategory === 'TELEFONO' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Smartphone size={14}/> Teléfonos</button>
               <button onClick={() => setSelectedCategory('ACCESORIO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap flex gap-2 ${selectedCategory === 'ACCESORIO' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Headphones size={14}/> Accesorios</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400">Cargando inventario...</div>
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
                    <h4 className="font-bold text-slate-800 text-sm line-clamp-2 mb-auto leading-snug">{product.nombre}</h4>
                    <div className="mt-4 w-full pt-3 border-t border-slate-50">
                      <span className="block text-lg font-bold text-indigo-600">L. {Number(product.precioVenta).toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 block mt-1 truncate">Ubic: {product.ubicacion}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart & Checkout (Visible if Tab is CART or screen is LG) */}
        <div className={`w-full lg:w-[380px] xl:w-[420px] flex-col bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 h-full ${mobileTab === 'CART' ? 'flex' : 'hidden lg:flex'}`}>
          
          {/* Header: Sales Config */}
          <div className={`p-4 border-b border-slate-100 space-y-3 shrink-0 ${isEditing ? 'bg-amber-50' : 'bg-slate-50/50'}`}>
            <h3 className="font-bold text-slate-800 flex items-center justify-between gap-2">
               <span className="flex items-center gap-2">
                   <Zap className={isEditing ? 'text-amber-500' : 'text-yellow-500'} size={18} /> 
                   {isEditing ? `EDITANDO #${editingSaleId}` : 'VENTA'}
               </span>
               {isEditing && (
                   <button onClick={cancelEdit} className="text-xs bg-white border border-amber-200 text-amber-600 px-2 py-1 rounded">Cancelar</button>
               )}
            </h3>

            <div className="flex gap-2">
               <button 
                 onClick={() => setPaymentType('Contado')}
                 className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${paymentType === 'Contado' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white border text-slate-500'}`}
               >
                 Contado
               </button>
               <button 
                 onClick={() => setPaymentType('Credito')}
                 className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${paymentType === 'Credito' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white border text-slate-500'}`}
               >
                 Crédito
               </button>
            </div>

            <select 
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Cliente --</option>
                {clients.map(c => (
                  <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>
                ))}
            </select>

            {clientInfo && (
              <div className="p-2 bg-indigo-50 rounded border border-indigo-100 text-xs">
                 <p className="font-bold text-indigo-900">{clientInfo.nombre} {clientInfo.apellido}</p>
                 <p className="text-indigo-600 truncate">{clientInfo.direccion}</p>
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-50/30">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                <ShoppingCart size={32} className="opacity-30 mb-2" />
                <p className="font-medium text-sm">Carrito vacío</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.codDetalleVenta} className="flex gap-3 items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-bold text-slate-800 truncate">{item.descripcionProducto}</h5>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-500 font-medium">{item.cantidad} x L. {Number(item.precioVenta).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end min-w-[60px]">
                    <span className="font-bold text-slate-800 text-xs">L. {(item.cantidad * item.precioVenta).toFixed(2)}</span>
                    <button 
                      onClick={() => removeFromCart(item.codDetalleVenta!)}
                      className="text-red-400 hover:text-red-600 mt-1 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals & Action */}
          <div className="p-5 bg-white border-t border-slate-200 shrink-0">
            <div className="space-y-1 mb-4">
              <div className="flex justify-between text-slate-500 text-xs">
                <span>Subtotal</span>
                <span>L. {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-xs">
                <span>ISV ({companyConfig?.isv || 15}%)</span>
                <span>L. {tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 text-xs py-1">
                <span>Desc.</span>
                <input 
                   type="number" 
                   value={discount} 
                   onChange={(e) => setDiscount(Number(e.target.value))}
                   className="w-16 text-right p-0.5 border rounded bg-slate-50 text-xs"
                />
              </div>
              <div className="flex justify-between items-end pt-2 border-t border-slate-100 mt-1">
                <span className="font-bold text-base text-slate-800">Total</span>
                <span className="font-bold text-xl text-indigo-600 font-mono">L. {total.toFixed(2)}</span>
              </div>
            </div>

            <button 
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-bold hover:opacity-90 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm active:scale-95 ${isEditing ? 'bg-amber-600 shadow-amber-600/30' : 'bg-indigo-600 shadow-indigo-600/30'}`}
              disabled={cart.length === 0 || !selectedClientId}
              onClick={handleProcessSale}
            >
              {isEditing ? <Save size={18}/> : <CreditCard size={18} />} 
              {isEditing ? 'ACTUALIZAR VENTA' : 'FACTURAR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;
