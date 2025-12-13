
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

    // Lógica simplificada para el ejemplo. Para producción robusta, usar librería 'numeros_a_letras'
    // Esta es una implementación básica para cumplir el requerimiento visual
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
  // Remove separate taxAmount state, calculate on the fly based on config
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
          // Clean state
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
    // Total Bruto (Suma de precios venta)
    const totalVenta = cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0);
    
    // Aplicar Descuento global
    const totalConDescuento = Math.max(0, totalVenta - discount);
    
    // ISV incluido o calculado aparte?
    // Asumiendo que el precio de venta YA incluye ISV para el total a pagar,
    // y lo desglosamos para la factura.
    // Base Imponible = Total / (1 + tasa)
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

  // --- NUEVA GENERACIÓN PDF FACTURA SAR ---
  const generateInvoicePDF = (codVenta: string, date: Date) => {
    try {
      const doc = new jsPDF();
      const client = getClientDetails();
      const config = companyConfig || { nombreEmpresa: 'SMARTCLOUD', rtn: '', direccion: '', isv: 15 } as any;

      const pageWidth = doc.internal.pageSize.width;
      const margin = 10;
      
      doc.setFont("helvetica", "normal");
      
      // 1. ENCABEZADO IZQUIERDO (EMPRESA) - RECUADRO REDONDEADO
      doc.setDrawColor(0);
      doc.roundedRect(margin, margin, 85, 35, 3, 3, 'S');
      
      // Logo Placeholder (Circles graphic in example)
      // doc.addImage(...) here if logo available
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(config.nombreEmpresa.toUpperCase(), margin + 25, margin + 8);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const splitAddr = doc.splitTextToSize(config.direccion || '', 55);
      doc.text(splitAddr, margin + 25, margin + 14);
      doc.text("Venta de Teléfonos y Accesorios", margin + 25, margin + 24);
      doc.text("por mayor y menor", margin + 25, margin + 28);
      doc.setFont("helvetica", "bold italic");
      doc.text(`Teléfono:${config.telefono || ''}`, margin + 25, margin + 32);

      // 2. ENCABEZADO DERECHO (FACTURA)
      doc.roundedRect(115, margin, 85, 35, 3, 3, 'S');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("FACTURA", 157.5, margin + 8, { align: "center" });
      doc.setFontSize(10);
      doc.text(codVenta, 157.5, margin + 14, { align: "center" });
      
      doc.setFontSize(8);
      const startYInfo = margin + 18;
      const rowHeight = 4.5;
      
      // Grid interno
      doc.line(115, startYInfo, 200, startYInfo);
      doc.line(115, startYInfo + rowHeight, 200, startYInfo + rowHeight);
      doc.line(115, startYInfo + rowHeight*2, 200, startYInfo + rowHeight*2);
      doc.line(115, startYInfo + rowHeight*3, 200, startYInfo + rowHeight*3);
      doc.line(145, startYInfo, 145, margin + 35); // Divisor vertical

      // Labels
      doc.text("R.T.N.:", 118, startYInfo + 3);
      doc.text("C.A.I.:", 118, startYInfo + rowHeight + 3);
      doc.text("FECHA:", 118, startYInfo + rowHeight*2 + 3);
      doc.text("VENCIMIENTO:", 118, startYInfo + rowHeight*3 + 3);

      // Values
      doc.setFont("helvetica", "normal");
      doc.text(config.rtn || '', 148, startYInfo + 3);
      doc.text(config.cai || '', 148, startYInfo + rowHeight + 3);
      // Fecha Emisión (Solo dia/mes/año) en cabecera derecha si se requiere, pero el diseño lo tiene abajo
      // Se deja en blanco según imagen o se repite.
      doc.text(config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : '', 148, startYInfo + rowHeight*3 + 3);

      // 3. DATOS GENERALES (Cuadro central)
      const sectionY = 50;
      doc.rect(margin, sectionY, 190, 20); // Caja principal
      
      // Líneas divisorias
      doc.line(margin, sectionY + 10, margin + 190, sectionY + 10); // Horizontal medio
      doc.line(margin + 40, sectionY, margin + 40, sectionY + 10); // Vert fecha
      doc.line(margin + 90, sectionY, margin + 90, sectionY + 10); // Vert condiciones
      doc.line(margin + 120, sectionY, margin + 120, sectionY + 20); // Vert identidad/vendedor label
      doc.line(margin + 150, sectionY, margin + 150, sectionY + 20); // Vert identidad/vendedor value

      doc.setFontSize(8);
      // Fila 1
      doc.text("FECHA EMISION:", margin + 2, sectionY + 6);
      doc.text(date.toLocaleDateString(), margin + 42, sectionY + 6);
      
      doc.text("CONDICIONES DE", margin + 92, sectionY + 3);
      doc.text("VENTA:", margin + 100, sectionY + 7);
      
      doc.text("CONTADO:", margin + 125, sectionY + 6);
      doc.rect(margin + 140, sectionY + 4, 3, 3); // Checkbox
      if(paymentType === 'Contado') doc.text("X", margin + 140.5, sectionY + 6.5);
      
      doc.text("CREDITO:", margin + 155, sectionY + 6);
      doc.rect(margin + 168, sectionY + 4, 3, 3); // Checkbox
      if(paymentType === 'Credito') doc.text("X", margin + 168.5, sectionY + 6.5);

      // Fila 2
      doc.text("NOMBRE CLIENTE:", margin + 2, sectionY + 16);
      doc.text(client ? `${client.nombre} ${client.apellido}` : "CONSUMIDOR FINAL", margin + 42, sectionY + 16);
      
      doc.text("IDENTIDAD:", margin + 122, sectionY + 16);
      doc.text(client?.identidad || "N/A", margin + 152, sectionY + 16);

      // Fila 3 (Dirección y Vendedor - Custom, ajustando a imagen)
      doc.line(margin, sectionY + 20, margin + 190, sectionY + 20); // Cierre arriba
      doc.rect(margin, sectionY + 20, 190, 10); // Caja extra fila 3
      
      doc.line(margin + 40, sectionY + 20, margin + 40, sectionY + 30);
      doc.line(margin + 120, sectionY + 20, margin + 120, sectionY + 30);
      doc.line(margin + 150, sectionY + 20, margin + 150, sectionY + 30);

      doc.text("DIRECCION:", margin + 2, sectionY + 26);
      const address = doc.splitTextToSize(client?.direccion || "N/A", 75);
      doc.text(address, margin + 42, sectionY + 24);

      doc.text("VENDEDOR:", margin + 122, sectionY + 26);
      doc.text(user?.nombreEmpleado || "Cajero", margin + 152, sectionY + 26);

      // 4. TABLA PRODUCTOS
      // @ts-ignore
      doc.autoTable({
          startY: sectionY + 35,
          head: [['CODIGO', 'DESCRIPCION', 'CANT', 'PREC.', 'DESC.', 'TOTAL']],
          body: cart.map(item => [
              item.idTelefono || item.idInventario || 'SERV',
              item.descripcionProducto,
              item.cantidad,
              item.precioVenta.toFixed(2),
              '0.00', // Descuento por item si hubiera
              (item.cantidad * item.precioVenta).toFixed(2)
          ]),
          theme: 'plain',
          styles: { fontSize: 8, cellPadding: 2, lineColor: 0, lineWidth: 0.1 },
          headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', halign: 'center', lineWidth: 0.1, lineColor: 0 },
          columnStyles: {
              0: { halign: 'center' }, // Codigo
              2: { halign: 'center' }, // Cant
              3: { halign: 'right' }, // Prec
              4: { halign: 'right' }, // Desc
              5: { halign: 'right' }  // Total
          },
          margin: { left: margin, right: margin }
      });

      // @ts-ignore
      const finalY = doc.lastAutoTable.finalY;

      // Draw box around table manually or trust autotable border
      // To match design exactly, let's draw the footer box connected
      
      const footerY = Math.max(finalY, 220); // Push footer to bottom if short invoice, or flow
      
      // 5. PIE DE PAGINA (TOTALES Y LEGAL)
      // Cuadro Totales (Derecha)
      const totalsX = 120;
      const totalsWidth = 80;
      doc.rect(totalsX, finalY, totalsWidth, 35);
      
      const summaryData = [
          ['Sub-Total', subtotal.toFixed(2)],
          ['Descuento y Rebajas', discount.toFixed(2)],
          [`Importe ISV ${config.isv}%`, subtotal.toFixed(2)], // Taxable Base
          [`ISV ${config.isv}%`, tax.toFixed(2)],
          ['TOTAL', total.toFixed(2)]
      ];

      let currentY = finalY + 5;
      summaryData.forEach((row, i) => {
          doc.setFont("helvetica", i === 4 ? "bold" : "normal");
          doc.text(row[0], totalsX + 2, currentY);
          doc.text(row[1], totalsX + totalsWidth - 2, currentY, { align: "right" });
          currentY += 6;
      });

      // Cuadro Información Legal (Izquierda)
      doc.rect(margin, finalY, 110, 35);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      
      let legalY = finalY + 5;
      doc.text(`RANGO EMISION AUTORIZADO:`, margin + 2, legalY);
      doc.setFont("helvetica", "normal");
      doc.text(`${config.rangoInicial || ''} al ${config.rangoFinal || ''}`, margin + 45, legalY);
      
      legalY += 6;
      doc.setFont("helvetica", "bold");
      doc.text(`FECHA LIMITE EMISION:`, margin + 2, legalY);
      doc.setFont("helvetica", "normal");
      doc.text(config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : '', margin + 45, legalY);

      legalY += 6;
      doc.setFont("helvetica", "bold");
      doc.text(`Original:`, margin + 2, legalY);
      doc.setFont("helvetica", "normal");
      doc.text(`Cliente`, margin + 15, legalY);
      
      doc.setFont("helvetica", "bold");
      doc.text(`Copia:`, margin + 40, legalY);
      doc.setFont("helvetica", "normal");
      doc.text(`Tributario Emisor`, margin + 50, legalY);

      // SON: (Monto en letras)
      doc.rect(130, finalY + 35, 70, 7); // Box for "SON"
      doc.setFontSize(8);
      doc.text("SON:", 125, finalY + 40, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(numeroALetras(total), 132, finalY + 40);

      // MENSAJE FINAL
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(config.mensajeFinal || "LA FACTURA ES BENEFICIO DE TODOS, EXIJALA", pageWidth / 2, finalY + 55, { align: "center" });

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
