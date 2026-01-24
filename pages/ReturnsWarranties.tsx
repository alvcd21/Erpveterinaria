
import React, { useState, useEffect, useMemo } from 'react';
import { WarrantyService, SalesService, InventoryService, ClientService, ConfigService } from '../services/api';
import { Garantia, Venta, ProductoUnified, DetalleVenta, Cliente } from '../types';
import { 
  ShieldCheck, Search, PlusCircle, Clock, CheckCircle, RefreshCcw, X, Save, 
  AlertTriangle, ArrowRightLeft, Trash2, FileText, Smartphone, Printer, Info, History,
  TrendingUp, Check, Edit2, Calendar
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

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

const ReturnsWarranties: React.FC = () => {
  const { user } = useAuth();
  const [warranties, setWarranties] = useState<Garantia[]>([]);
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [companyConfig, setCompanyConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  
  // Selection
  const [selectedWarranty, setSelectedWarranty] = useState<Garantia | null>(null);
  const [editForm, setEditForm] = useState<Partial<Garantia>>({});
  
  // Creation Flow
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [foundInvoice, setFoundInvoice] = useState<Venta | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetalleVenta | null>(null);
  const [falla, setFalla] = useState('');
  const [obs, setObs] = useState('');

  // Exchange Form
  const [newProductSearch, setNewProductSearch] = useState('');
  const [selectedNewProduct, setSelectedNewProduct] = useState<ProductoUnified | null>(null);
  const [newProductPrice, setNewProductPrice] = useState<number>(0);

  useEffect(() => { loadData(); loadDependencies(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await WarrantyService.getAll();
      setWarranties(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadDependencies = async () => {
      try {
          const [p, c, cfg] = await Promise.all([
              InventoryService.getUnifiedProducts(),
              ClientService.getAll(),
              ConfigService.get()
          ]);
          setProducts(p || []);
          setClients(c || []);
          setCompanyConfig(cfg);
      } catch (e) { console.error(e); }
  };

  const handleSearchInvoice = async () => {
      if (!invoiceSearch) return;
      setFoundInvoice(null);
      setSelectedDetail(null);
      try {
          const v = await SalesService.getVenta(invoiceSearch);
          const d = await SalesService.getDetallesVenta(invoiceSearch);
          if (v) {
              setFoundInvoice({ ...v, detalles: d });
          } else {
              Swal.fire('No Encontrada', 'Verifique el número de factura.', 'warning');
          }
      } catch (e) { Swal.fire('Error', 'No se pudo localizar la factura.', 'error'); }
  };

  const handleCreateWarranty = async () => {
      if (!foundInvoice || !selectedDetail) return;
      try {
          const payload: Partial<Garantia> = {
              cod_venta: foundInvoice.codVenta,
              id_producto_original: selectedDetail.idTelefono || selectedDetail.idAccesorio,
              tipo_producto: (selectedDetail.tipoProducto as any) || 'TELEFONO',
              falla_reportada: falla,
              identidad_cliente: foundInvoice.identidadCliente,
              costo_original: Number((selectedDetail as any).precioCompra || 0), 
              precio_venta_original: Number(selectedDetail.precioVenta || 0),
              observaciones: obs
          };
          await WarrantyService.create(payload);
          setShowModal(false);
          setFalla('');
          setObs('');
          loadData();
          Swal.fire('Ingresado', 'Equipo en garantía registrado.', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleUpdateWarranty = async () => {
      if (!selectedWarranty) return;
      try {
          await WarrantyService.update(selectedWarranty.id_garantia, editForm);
          setShowEditModal(false);
          loadData();
          Swal.fire('Actualizado', 'Registro modificado.', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleDeleteWarranty = async (id: number) => {
      const result = await Swal.fire({
          title: '¿Eliminar Registro?',
          text: 'Esta acción no se puede deshacer.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444'
      });
      if (result.isConfirmed) {
          try {
              await WarrantyService.delete(id);
              loadData();
              Swal.fire('Eliminado', '', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const exchangeCalculations = useMemo(() => {
    if (!selectedWarranty || !selectedNewProduct) return null;
    
    // 1. Costo del teléfono que devuelve (de la base de datos de garantía)
    const costoAnterior = Number(selectedWarranty.costo_original || 0);
    
    // 2. Precio Anterior Cobrado (lo que el cliente pagó originalmente)
    const precioVentaAnterior = Number(selectedWarranty.precio_venta_original || 0);

    // 3. Precio Pactado Nuevo (lo que cobraremos por el nuevo)
    const precioNuevoPactado = Number(newProductPrice || 0);

    // 4. Costo Nuevo Producto (precio de compra del inventario actual)
    /* Fixed type error: Removed 'as any' as precioCompra is now in ProductoUnified interface */
    const costoNuevo = Number(selectedNewProduct.precioCompra || 0);

    // 5. Diferencia en Efectivo (lo que entra a caja hoy)
    const diferenciaEfectivo = precioNuevoPactado - precioVentaAnterior;

    // 6. FÓRMULA SOLICITADA:
    // Utilidad = (Costo Anterior + Diferencia Venta) - Costo Nuevo
    // Si da positivo es Ingreso, negativo es Egreso.
    const utilidadDiferencia = (costoAnterior + diferenciaEfectivo) - costoNuevo;

    return { 
        s1: precioVentaAnterior, 
        c1: costoAnterior, 
        s2: precioNuevoPactado, 
        c2: costoNuevo, 
        diferenciaEfectivo, 
        utilidadDiferencia 
    };
  }, [selectedWarranty, selectedNewProduct, newProductPrice]);

  const processExchange = async () => {
      if (!selectedWarranty || !selectedNewProduct || !exchangeCalculations) return;
      
      const result = await Swal.fire({
          title: '¿Confirmar Intercambio?',
          html: `
            <div class="text-left text-sm space-y-2">
                <p><b>Efectivo a recibir:</b> L. ${exchangeCalculations.diferenciaEfectivo.toFixed(2)}</p>
                <p><b>Impacto Contable:</b> ${exchangeCalculations.utilidadDiferencia >= 0 ? 'INGRESO (Utilidad)' : 'EGRESO (Pérdida)'} de L. ${Math.abs(exchangeCalculations.utilidadDiferencia).toFixed(2)}</p>
                <p class="text-[10px] text-slate-400 mt-2 italic">* El cálculo se basa en el costo del equipo devuelto más la diferencia cobrada menos el costo del equipo que lleva.</p>
            </div>
          `,
          icon: 'warning',
          showCancelButton: true
      });

      if (result.isConfirmed) {
          try {
              await WarrantyService.exchange(selectedWarranty.id_garantia, {
                  idNuevoProducto: selectedNewProduct.id,
                  tipoNuevo: selectedNewProduct.tipo,
                  diferenciaEfectivo: exchangeCalculations.diferenciaEfectivo,
                  utilidadDiferencia: exchangeCalculations.utilidadDiferencia,
                  descripcionGastoIngreso: `CAMBIO ${selectedWarranty.id_producto_original} POR ${selectedNewProduct.nombre}`
              });
              setShowExchangeModal(false);
              loadData();
              Swal.fire('Procesado', 'El inventario y caja han sido actualizados.', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const generateWarrantyPDF = (g: Garantia) => {
      try {
          const doc = new jsPDF();
          const LOGO_BASE64 = ""; 
          const cfg = companyConfig || {};
          const nombreEmpresa = (cfg.nombreempresa || cfg.nombreEmpresa || 'SMARTCLOUD ERP').toUpperCase();
          const rtnEmpresa = cfg.rtn || 'N/A';
          const direccionEmpresa = cfg.direccion || 'N/A';
          const telefonoEmpresa = cfg.telefono || 'N/A';
          const correoEmpresa = cfg.correo || 'N/A';

          const pageWidth = doc.internal.pageSize.width;
          const pageHeight = doc.internal.pageSize.height;
          
          const primaryColor = "#1e3a8a";   
          const accentColor = "#3b82f6";    
          const lightGray = "#f1f5f9";      

          doc.setFillColor(primaryColor);
          doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
          doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
          doc.setFillColor(accentColor);
          doc.triangle(0, 0, 100, 0, 0, 50, 'F');

          if (LOGO_BASE64) doc.addImage(LOGO_BASE64, 'PNG', 15, 12, 18, 18);

          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text(nombreEmpresa, 38, 18);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(direccionEmpresa, 38, 25);
          doc.text(`Tel: ${telefonoEmpresa}`, 38, 30);

          doc.setFontSize(22);
          doc.setFont("helvetica", "bold");
          doc.text("HOJA DE GARANTÍA", pageWidth - 15, 20, { align: "right" });
          doc.setFontSize(10);
          doc.text(`ID REGISTRO: GR-${String(g.id_garantia).padStart(5, '0')}`, pageWidth - 15, 29, { align: "right" });

          const topY = 60;
          doc.setFillColor(lightGray);
          doc.roundedRect(14, topY, 182, 35, 3, 3, 'F');
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("DATOS DEL CLIENTE:", 18, topY + 8);
          doc.setFont("helvetica", "normal");
          
          // CORRECCIÓN: Usar nombres de campo exactos del objeto Garantia (lowercase del backend)
          doc.text(`Nombre: ${(g.nombre_cliente || 'N/A').toUpperCase()}`, 18, topY + 16);
          doc.text(`Identidad: ${g.identidad_cliente || 'N/A'}`, 18, topY + 22);
          doc.text(`Fecha Ingreso: ${new Date(g.fecha_ingreso).toLocaleString()}`, 18, topY + 28);

          doc.text(`Factura Origen: ${g.cod_venta}`, 120, topY + 16);
          doc.text(`Estado Actual: ${g.estado_garantia.toUpperCase()}`, 120, topY + 22);

          // @ts-ignore
          doc.autoTable({
              startY: topY + 45,
              head: [['EQUIPO EN RECLAMO', 'FALLA REPORTADA']],
              body: [[`${g.tipo_producto}: ${g.id_producto_original}`.toUpperCase(), g.falla_reportada.toUpperCase()]],
              theme: 'grid',
              headStyles: { fillColor: [30, 58, 138] }
          });

          // @ts-ignore
          let finalY = doc.lastAutoTable.finalY + 15;
          doc.setFont("helvetica", "bold");
          doc.text("OBSERVACIONES TÉCNICAS / RECEPCIÓN:", 14, finalY);
          doc.setFont("helvetica", "normal");
          doc.text(g.observaciones || "SIN OBSERVACIONES ADICIONALES", 14, finalY + 8, { maxWidth: 180 });

          doc.save(`Garantia_GR-${g.id_garantia}.pdf`);
      } catch (e) {
          console.error(e);
          Swal.fire('Error PDF', 'No se pudo generar el documento.', 'error');
      }
  };

  const updateStatus = async (g: Garantia) => {
      const { value: status } = await Swal.fire({
          title: 'Actualizar Estado',
          input: 'select',
          inputOptions: { 'En Taller': 'En Taller', 'Proveedor': 'Proveedor', 'Listo': 'Listo' },
          inputValue: g.estado_garantia,
          showCancelButton: true
      });
      if (status) {
          try {
              await WarrantyService.update(g.id_garantia, { estado_garantia: status });
              loadData();
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const filtered = warranties.filter(g => 
    (g.cod_venta || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (g.id_producto_original || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.nombre_cliente || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in h-full flex flex-col pb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="text-emerald-600"/> Garantías y Devoluciones</h2>
                <p className="text-slate-500 text-sm">Soporte técnico, reclamos de fábrica e intercambio de equipos.</p>
            </div>
            <button onClick={() => { setFoundInvoice(null); setInvoiceSearch(''); setShowModal(true); }} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-emerald-600/20 transition-all active:scale-95">
                <PlusCircle size={20}/> Ingresar Garantía
            </button>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar por factura, IMEI o cliente..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left min-w-[800px]">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase sticky top-0 z-10 tracking-widest border-b">
                        <tr>
                            <th className="p-4">Factura / Fecha</th>
                            <th className="p-4">Producto en Reclamo</th>
                            <th className="p-4">Cliente</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic text-sm">No hay registros de garantía.</td></tr>
                        ) : filtered.map(g => (
                            <tr key={g.id_garantia} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4">
                                    <p className="font-bold text-slate-800 text-sm">{g.cod_venta}</p>
                                    <p className="text-[10px] text-slate-400 font-mono uppercase">{new Date(g.fecha_ingreso).toLocaleDateString()}</p>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-slate-100 p-2 rounded-xl text-slate-500"><Smartphone size={18}/></div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">{g.id_producto_original}</p>
                                            <p className="text-[9px] text-slate-400 uppercase font-black">{g.tipo_producto}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <p className="text-xs font-bold text-slate-600">{g.nombre_cliente || 'N/A'}</p>
                                    <p className="text-[10px] text-slate-400">{g.identidad_cliente}</p>
                                </td>
                                <td className="p-4">
                                    <button onClick={() => updateStatus(g)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 transition-all hover:scale-105 ${g.estado_garantia === 'Cambiado' ? 'bg-indigo-100 text-indigo-700' : g.estado_garantia === 'Listo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {g.estado_garantia === 'Listo' || g.estado_garantia === 'Cambiado' ? <CheckCircle size={12}/> : <Clock size={12}/>}
                                        {g.estado_garantia}
                                    </button>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-1.5 transition-opacity">
                                        {g.estado_garantia !== 'Cambiado' && (
                                            <button onClick={() => { setSelectedWarranty(g); setSelectedNewProduct(null); setNewProductPrice(0); setShowExchangeModal(true); }} className="p-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20" title="Cambio de Equipo"><ArrowRightLeft size={16}/></button>
                                        )}
                                        <button onClick={() => generateWarrantyPDF(g)} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-xl" title="Imprimir"><Printer size={16}/></button>
                                        <button onClick={() => { setSelectedWarranty(g); setEditForm(g); setShowEditModal(true); }} className="p-2 text-blue-400 hover:bg-blue-50 rounded-xl"><Edit2 size={16}/></button>
                                        <button onClick={() => handleDeleteWarranty(g.id_garantia)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* MODAL INGRESO GARANTIA */}
        {showModal && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
                <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col h-[90vh]">
                    <div className="p-5 md:p-6 border-b flex justify-between items-center bg-white shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-600 p-2 rounded-xl text-white"><ShieldCheck size={24}/></div>
                            <div>
                                <h3 className="text-lg md:text-xl font-bold">Ingreso a Garantía</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recepción de Equipo</p>
                            </div>
                        </div>
                        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full"><X/></button>
                    </div>
                    <div className="p-5 md:p-8 space-y-6 overflow-y-auto custom-scrollbar bg-slate-50/30 flex-1">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">1. Localizar Factura</label>
                            <div className="flex flex-col md:flex-row gap-2">
                                <input className="flex-1 p-3 border border-slate-200 rounded-2xl font-bold text-sm uppercase outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Número de Factura" value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} />
                                <button onClick={handleSearchInvoice} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"><Search size={18}/> Buscar</button>
                            </div>
                        </div>

                        {foundInvoice && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Cliente: {foundInvoice.nombreCliente || 'Consumidor'}</p>
                                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2">2. Seleccionar Producto</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {foundInvoice.detalles && foundInvoice.detalles.length > 0 ? foundInvoice.detalles.map(d => (
                                            <button key={d.codDetalleVenta} onClick={() => setSelectedDetail(d)} className={`w-full flex justify-between items-center p-3 rounded-xl border transition-all ${selectedDetail?.codDetalleVenta === d.codDetalleVenta ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-slate-50 border-slate-100 hover:bg-white'}`}>
                                                <div className="flex items-center gap-3 text-left">
                                                    <Smartphone size={16} className="text-slate-400"/>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800">{d.descripcionProducto || 'Producto'}</p>
                                                        <p className="text-[9px] text-slate-500 font-mono">{d.idTelefono || d.idAccesorio || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-black text-indigo-600">L. {Number(d.precioVenta || 0).toFixed(2)}</span>
                                            </button>
                                        )) : (
                                            <p className="text-xs text-slate-400 text-center py-4">No se encontraron productos en esta factura.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">3. Diagnóstico</label>
                                    <textarea className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" rows={2} placeholder="Describa el fallo reportado..." value={falla} onChange={e=>setFalla(e.target.value)}/>
                                    <textarea className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" rows={2} placeholder="Observaciones adicionales..." value={obs} onChange={e=>setObs(e.target.value)}/>
                                </div>

                                <button onClick={handleCreateWarranty} disabled={!selectedDetail || !falla.trim()} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm active:scale-95 disabled:opacity-50">
                                    <Save size={20}/> REGISTRAR INGRESO
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* MODAL EDITAR GARANTIA */}
        {showEditModal && selectedWarranty && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold">Editar Registro GR-{selectedWarranty.id_garantia}</h3>
                        <button onClick={()=>setShowEditModal(false)}><X className="text-slate-400"/></button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Falla Reportada</label>
                            <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none mt-1" value={editForm.falla_reportada} onChange={e=>setEditForm({...editForm, falla_reportada: e.target.value})}/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Observaciones</label>
                            <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none mt-1" value={editForm.observaciones} onChange={e=>setEditForm({...editForm, observaciones: e.target.value})}/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Fecha Resolución</label>
                            <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none mt-1" value={editForm.fecha_resolucion?.split('T')[0] || ''} onChange={e=>setEditForm({...editForm, fecha_resolucion: e.target.value})}/>
                        </div>
                        <button onClick={handleUpdateWarranty} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">GUARDAR CAMBIOS</button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL INTERCAMBIO FINANCIERO */}
        {showExchangeModal && selectedWarranty && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
                <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-fade-in flex flex-col h-[90vh]">
                    <div className="p-5 md:p-6 border-b flex justify-between items-center bg-indigo-600 text-white shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-xl"><ArrowRightLeft size={24}/></div>
                            <div>
                                <h3 className="text-lg md:text-xl font-bold">Intercambio de Equipo</h3>
                                <p className="text-[10px] text-indigo-100 font-bold uppercase tracking-widest">Ajuste de Garantía y Caja</p>
                            </div>
                        </div>
                        <button onClick={() => setShowExchangeModal(false)} className="text-indigo-200 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"><X/></button>
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                        <div className="w-full md:w-1/2 p-5 md:p-6 border-r border-slate-100 flex flex-col bg-slate-50/50 overflow-y-auto">
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Buscar nuevo equipo..." value={newProductSearch} onChange={e=>setNewProductSearch(e.target.value)} />
                            </div>
                            <div className="flex-1 space-y-2">
                                {products.filter(p => p.nombre.toLowerCase().includes(newProductSearch.toLowerCase()) && p.stock > 0).map(p => (
                                    <button key={p.id} onClick={() => { setSelectedNewProduct(p); setNewProductPrice(Number(p.precioVenta)); }} className={`w-full p-3 rounded-2xl border text-left transition-all ${selectedNewProduct?.id === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-100 hover:border-indigo-300'}`}>
                                        <p className="text-xs font-bold leading-tight">{p.nombre}</p>
                                        <div className="flex justify-between items-center mt-1">
                                            <p className={`text-[9px] font-black uppercase ${selectedNewProduct?.id === p.id ? 'text-indigo-200' : 'text-slate-400'}`}>P. Venta: L. {Number(p.precioVenta).toFixed(2)}</p>
                                            <p className={`text-[9px] font-black uppercase ${selectedNewProduct?.id === p.id ? 'text-indigo-200' : 'text-slate-300'}`}>Costo: L. {Number(p.precioCompra || 0).toFixed(2)}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="w-full md:w-1/2 p-5 md:p-6 bg-white flex flex-col justify-between overflow-y-auto">
                            <div className="space-y-6">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Resumen de Cambio</p>
                                    <div className="space-y-4">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Cobrado Anteriormente:</span>
                                            <span className="font-bold">L. {Number(selectedWarranty.precio_venta_original || 0).toFixed(2)}</span>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Precio Pactado Nuevo Equipo (Editable)</label>
                                            <input type="number" className="w-full p-3 border border-slate-200 rounded-xl font-black text-indigo-600" value={newProductPrice} onChange={e=>setNewProductPrice(Number(e.target.value))} />
                                        </div>
                                        <div className="pt-2 border-t flex justify-between items-center">
                                            <span className="text-xs font-black text-indigo-600 uppercase">Efectivo a Recibir:</span>
                                            <span className={`text-lg font-black ${exchangeCalculations?.diferenciaEfectivo && exchangeCalculations.diferenciaEfectivo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                L. {exchangeCalculations?.diferenciaEfectivo.toFixed(2) || '0.00'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {exchangeCalculations && (
                                    <div className={`p-4 rounded-2xl border flex items-start gap-3 ${exchangeCalculations.utilidadDiferencia >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                        {exchangeCalculations.utilidadDiferencia >= 0 ? <TrendingUp className="text-emerald-600"/> : <AlertTriangle className="text-red-600"/>}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ajuste de Utilidad</p>
                                            <p className={`text-sm font-bold ${exchangeCalculations.utilidadDiferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {exchangeCalculations.utilidadDiferencia >= 0 ? 'INGRESO POR CAMBIO' : 'EGRESO POR PÉRDIDA'}
                                            </p>
                                            <p className="text-xs font-medium text-slate-600 mt-1">Monto: L. {Math.abs(exchangeCalculations.utilidadDiferencia).toFixed(2)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button onClick={processExchange} disabled={!selectedNewProduct} className="w-full mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm disabled:opacity-50 active:scale-95">
                                <Check size={20}/> PROCESAR INTERCAMBIO
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default ReturnsWarranties;
