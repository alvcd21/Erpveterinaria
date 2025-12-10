import React, { useState, useEffect } from 'react';
import { InventoryService, ClientService, SalesService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente } from '../types';
import { Search, ShoppingCart, Trash2, UserPlus, CreditCard, Smartphone, Headphones, Zap, RefreshCw, Printer } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';

const POS: React.FC = () => {
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  const [clients, setClients] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = () => {
    setIsLoading(true);
    Promise.all([
      InventoryService.getUnifiedProducts(),
      ClientService.getAll()
    ]).then(([prodData, clientData]) => {
      setProducts(prodData);
      setClients(clientData);
    }).catch(err => console.error(err))
      .finally(() => setIsLoading(false));
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
  };

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(item => item.codDetalleVenta !== tempId));
  };

  // --- UPDATED CALCULATION LOGIC ---
  // Matches Legacy: Impuesto = total * 0.15; Subtotal = total - Impuesto;
  const calculateTotal = () => {
    const grossTotal = cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0);
    const totalBeforeDiscount = grossTotal;
    const finalTotal = totalBeforeDiscount - discount;
    
    // ISV Calculation based on final total (Inclusive)
    const isv = finalTotal * 0.15;
    const subtotal = finalTotal - isv;

    return { 
      subtotal: subtotal > 0 ? subtotal : 0, 
      tax: isv > 0 ? isv : 0, 
      total: finalTotal > 0 ? finalTotal : 0 
    };
  };

  const { subtotal, tax, total } = calculateTotal();

  // --- PDF GENERATION ---
  const generateInvoicePDF = (codVenta: string, date: Date) => {
    try {
      const doc = new jsPDF();
      const client = getClientDetails();

      // Config
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFont("helvetica", "normal");
      
      // Header Box
      doc.setDrawColor(0);
      doc.rect(10, 10, 90, 30); // Left Box (Company)
      doc.rect(110, 10, 90, 30); // Right Box (Invoice Info)

      // Company Info
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("SMARTCLOUD", 55, 18, { align: "center" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Mercado Nuevo-Avenida Valle", 55, 23, { align: "center" });
      doc.text("Frente a Tiendas Me lo Llevo", 55, 27, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.text("Venta de Telefonos y Accesorios", 55, 32, { align: "center" });
      doc.text("Telefono:+504-96676374", 55, 36, { align: "center" });

      // Invoice Info (Right)
      doc.setFontSize(12);
      doc.text("FACTURA", 155, 18, { align: "center" });
      doc.setFontSize(10);
      doc.text(codVenta, 155, 23, { align: "center" });
      
      doc.setFontSize(8);
      doc.text(`FECHA: ${date.toLocaleDateString()}`, 115, 30);
      doc.text(`R.T.N:`, 115, 35);
      
      // Client Info Row
      doc.rect(10, 45, 190, 20);
      doc.line(10, 55, 200, 55); // Horizontal divider
      doc.line(110, 45, 110, 65); // Vertical divider

      doc.setFont("helvetica", "bold");
      doc.text("FECHA EMISION:", 12, 50);
      doc.setFont("helvetica", "normal");
      doc.text(date.toLocaleDateString(), 40, 50);

      doc.setFont("helvetica", "bold");
      doc.text("CONDICIONES:", 112, 50);
      doc.setFont("helvetica", "normal");
      doc.text(paymentType.toUpperCase(), 140, 50);

      doc.setFont("helvetica", "bold");
      doc.text("CLIENTE:", 12, 60);
      doc.setFont("helvetica", "normal");
      doc.text(client ? `${client.nombre} ${client.apellido}`.toUpperCase() : "CONSUMIDOR FINAL", 40, 60);

      doc.setFont("helvetica", "bold");
      doc.text("VENDEDOR:", 112, 60);
      doc.setFont("helvetica", "normal");
      doc.text(user?.nombreEmpleado || "ADMIN", 140, 60);

      // Table Header
      let y = 70;
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y, 190, 8, 'F');
      doc.rect(10, y, 190, 8, 'S'); // Stroke
      
      doc.setFont("helvetica", "bold");
      doc.text("DESCRIPCION", 15, y+5);
      doc.text("CANT", 130, y+5, { align: "center" });
      doc.text("PREC.", 160, y+5, { align: "center" });
      doc.text("TOTAL", 190, y+5, { align: "center" });

      // Table Content
      y += 8;
      doc.setFont("helvetica", "normal");
      cart.forEach(item => {
        const itemTotal = item.cantidad * item.precioVenta;
        doc.text(item.descripcionProducto?.substring(0, 40) || "", 15, y+5);
        doc.text(item.cantidad.toString(), 130, y+5, { align: "center" });
        doc.text(item.precioVenta.toFixed(2), 160, y+5, { align: "center" });
        doc.text(itemTotal.toFixed(2), 190, y+5, { align: "center" });
        y += 6;
      });

      // Totals Box
      const totalY = 160; // Fixed position for totals at bottom
      doc.rect(120, totalY, 80, 30);
      
      doc.text("Sub-Total", 125, totalY + 6);
      doc.text(subtotal.toFixed(2), 195, totalY + 6, { align: "right" });
      
      doc.text("Descuento", 125, totalY + 12);
      doc.text(discount.toFixed(2), 195, totalY + 12, { align: "right" });
      
      doc.text("ISV (15%)", 125, totalY + 18);
      doc.text(tax.toFixed(2), 195, totalY + 18, { align: "right" });
      
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL", 125, totalY + 26);
      doc.text(total.toFixed(2), 195, totalY + 26, { align: "right" });

      doc.setFontSize(7);
      doc.text("LA FACTURA ES BENEFICIO DE TODOS, EXIJALA", 105, 280, { align: "center" });

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
      title: '¿Procesar Venta?',
      text: `Total a cobrar: L. ${total.toFixed(2)} (${paymentType})`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Facturar',
      confirmButtonColor: '#4f46e5'
    });

    if (result.isConfirmed) {
      try {
        const response = await SalesService.createVenta({
          identidadCliente: selectedClientId,
          tipoCompra: paymentType,
          total: total,
          isv: tax,
          descuento: discount,
          detalles: cart
        });
        
        Swal.fire({
          title: 'Éxito',
          text: 'Venta registrada correctamente',
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'Imprimir Factura',
          cancelButtonText: 'Cerrar'
        }).then((res) => {
          if (res.isConfirmed) {
            generateInvoicePDF(response.codVenta || 'NEW', new Date());
          }
        });

        setCart([]);
        setDiscount(0);
        setPaymentType('Contado');
        setSelectedClientId('');
        loadInitialData(); // Refresh stock
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.imei && p.imei.includes(searchTerm));
    const matchesCategory = selectedCategory === 'ALL' || p.tipo === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const clientInfo = getClientDetails();

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-6">
      
      {/* LEFT: Product Selector */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex gap-3">
             <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="Buscar por Nombre, Código o IMEI..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-base font-medium placeholder:text-slate-400"
                autoFocus
              />
            </div>
            <button onClick={loadInitialData} className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-xl transition-colors">
              <RefreshCw size={20}/>
            </button>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-1">
             <button onClick={() => setSelectedCategory('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${selectedCategory === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>Todos</button>
             <button onClick={() => setSelectedCategory('TELEFONO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase flex gap-2 ${selectedCategory === 'TELEFONO' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Smartphone size={14}/> Teléfonos</button>
             <button onClick={() => setSelectedCategory('ACCESORIO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase flex gap-2 ${selectedCategory === 'ACCESORIO' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Headphones size={14}/> Accesorios</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-400">Cargando inventario...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map(product => (
                <button 
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock === 0}
                  className={`flex flex-col items-start p-4 bg-white rounded-xl border transition-all text-left relative overflow-hidden group
                    ${product.stock === 0 ? 'opacity-60 border-slate-100 grayscale' : 'border-slate-200/60 hover:border-indigo-500 hover:shadow-lg'}`}
                >
                  <div className="w-full flex justify-between items-start mb-3">
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
                    <span className="text-[10px] text-slate-400 block mt-1">Ubic: {product.ubicacion}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Cart & Checkout */}
      <div className="w-full lg:w-[420px] flex flex-col bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 h-full">
        
        {/* Header: Sales Config */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <Zap className="text-yellow-500 fill-yellow-500" size={18} /> REGISTRO VENTAS
          </h3>

          <div className="flex gap-4 items-center bg-white p-1 rounded-lg border border-slate-200">
             <button 
               onClick={() => setPaymentType('Contado')}
               className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${paymentType === 'Contado' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}
             >
               ◉ Contado
             </button>
             <button 
               onClick={() => setPaymentType('Credito')}
               className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${paymentType === 'Credito' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}
             >
               ○ Crédito
             </button>
          </div>

          <div>
             <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Seleccionar Cliente</label>
             <select 
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Seleccione Cliente --</option>
              {clients.map(c => (
                <option key={c.identidad} value={c.identidad}>{c.identidad} - {c.nombre} {c.apellido}</option>
              ))}
            </select>
          </div>

          {/* Auto-filled Info */}
          <div className="grid grid-cols-1 gap-2 p-3 bg-slate-100 rounded-lg text-xs">
             <div className="flex justify-between">
                <span className="text-slate-500">Nombre:</span>
                <span className="font-bold text-slate-700">{clientInfo ? `${clientInfo.nombre} ${clientInfo.apellido}` : '-'}</span>
             </div>
             <div className="flex justify-between">
                <span className="text-slate-500">Dirección:</span>
                <span className="font-bold text-slate-700 truncate max-w-[200px]">{clientInfo?.direccion || '-'}</span>
             </div>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/30">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart size={32} className="opacity-30 mb-4" />
              <p className="font-medium">Carrito vacío</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.codDetalleVenta} className="flex gap-4 items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-bold text-slate-800 truncate">{item.descripcionProducto}</h5>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-slate-500 font-medium">{item.cantidad} x L. {Number(item.precioVenta).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end min-w-[60px]">
                  <span className="font-bold text-slate-800 text-sm">L. {(item.cantidad * item.precioVenta).toFixed(2)}</span>
                  <button 
                    onClick={() => removeFromCart(item.codDetalleVenta!)}
                    className="text-red-400 hover:text-red-600 mt-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Action */}
        <div className="p-6 bg-white border-t border-slate-200">
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-slate-600 text-sm">
              <span className="font-medium">Subtotal</span>
              <span className="font-mono">L. {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-sm">
              <span className="font-medium">ISV (15%)</span>
              <span className="font-mono">L. {tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600 text-sm">
              <span className="font-medium">Descuento</span>
              <input 
                 type="number" 
                 value={discount} 
                 onChange={(e) => setDiscount(Number(e.target.value))}
                 className="w-24 text-right p-1 border rounded bg-slate-50 font-mono text-sm focus:outline-indigo-500"
              />
            </div>
            <div className="flex justify-between items-end pt-3 border-t border-slate-200 mt-2">
              <span className="font-bold text-lg text-slate-800">Total</span>
              <span className="font-bold text-2xl text-indigo-600 font-mono">L. {total.toFixed(2)}</span>
            </div>
          </div>

          <button 
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={cart.length === 0 || !selectedClientId}
            onClick={handleProcessSale}
          >
            <CreditCard size={18} /> FACTURAR
          </button>
        </div>
      </div>
    </div>
  );
};

export default POS;