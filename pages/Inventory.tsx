import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, LabelService } from '../services/api';
import { 
  Telefono, 
  Inventario, 
  Accesorio, 
  Categoria, 
  Ubicacion, 
  Proveedor,
  LabelTemplate 
} from '../types';
import { 
  Search, PlusCircle, Package, Smartphone, Layers, MapPin, Tag, Edit2, Trash2, X, RefreshCw, Box, Filter, Printer
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

type InventoryTab = 'TELEPHONES' | 'STOCK' | 'MASTER' | 'CATEGORIES' | 'LOCATIONS';

const Inventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('TELEPHONES');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [phones, setPhones] = useState<Telefono[]>([]);
  const [stock, setStock] = useState<Inventario[]>([]);
  const [master, setMaster] = useState<Accesorio[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [locations, setLocations] = useState<Ubicacion[]>([]);
  const [providers, setProviders] = useState<Proveedor[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [phoneForm, setPhoneForm] = useState<Partial<Telefono>>({ estado: 'Disponible' });
  const [stockForm, setStockForm] = useState<Partial<Inventario>>({ estado: 'Activo' });
  const [masterForm, setMasterForm] = useState<Partial<Accesorio>>({});
  const [catForm, setCatForm] = useState<Partial<Categoria>>({});
  const [locForm, setLocForm] = useState<Partial<Ubicacion>>({ estado: 'Activo' });

  useEffect(() => {
    loadData();
    loadDependencies();
  }, [activeTab]);

  const uniqueBrands = useMemo(() => {
      const brands = phones.map(p => p.marca).filter(Boolean);
      return Array.from(new Set(brands)).sort();
  }, [phones]);

  const availableModels = useMemo(() => {
      if (!phoneForm.marca) return [];
      const models = phones
          .filter(p => p.marca.toLowerCase() === phoneForm.marca?.toLowerCase())
          .map(p => p.modelo)
          .filter(Boolean);
      return Array.from(new Set(models)).sort();
  }, [phones, phoneForm.marca]);

  const loadDependencies = async () => {
      try {
          const [provs, cats, locs] = await Promise.all([
              InventoryService.getProveedores(),
              InventoryService.getCategorias(),
              InventoryService.getUbicaciones()
          ]);
          setProviders(provs || []);
          setCategories(cats || []);
          setLocations(locs || []);
      } catch (error) { console.error(error); }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'TELEPHONES') setPhones(await InventoryService.getTelefonos());
      else if (activeTab === 'STOCK') setStock(await InventoryService.getStockAccesorios());
      else if (activeTab === 'MASTER') setMaster(await InventoryService.getAccesoriosMaster());
      else if (activeTab === 'CATEGORIES') setCategories(await InventoryService.getCategorias());
      else if (activeTab === 'LOCATIONS') setLocations(await InventoryService.getUbicaciones());
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const handlePrintLabel = async (item: any, type: 'TELEFONO' | 'STOCK') => {
      try {
          const codigo = type === 'TELEFONO' ? item.imei1 : item.codInventario;
          const extraText = type === 'TELEFONO' ? `${item.marca} ${item.modelo}` : (item.descripcionAccesorio || '');

          // MIGRACIÓN LÓGICA JAVA: 25mm x 40mm
          const mmToPt = 72.0 / 25.4;
          const widthPt = 25 * mmToPt;
          const heightPt = 40 * mmToPt;

          const doc = new jsPDF({
              orientation: 'portrait',
              unit: 'pt',
              format: [widthPt, heightPt]
          });

          // TÍTULO VERTICAL ARRIBA (Mismo algoritmo que Java BarcodePdfUtil)
          if (extraText) {
              doc.setFontSize(8);
              doc.setFont('helvetica', 'normal');
              const textWidth = doc.getTextWidth(extraText);
              // xCenter en Java es widthPt / 6f para alinear con el código rotado
              const xCenter = widthPt / 6;
              const yCenter = textWidth / 2 + 5; // Margen superior
              doc.text(extraText, xCenter, yCenter, { angle: 90, align: 'center' });
          }

          // CÓDIGO DE BARRAS (Rotado 90)
          const canvas = document.createElement('canvas');
          JsBarcode(canvas, codigo, { format: "CODE128", displayValue: true, fontSize: 20, margin: 0 });
          const imgData = canvas.toDataURL("image/png");
          
          // Image properties like in Java: rotation 90, alignment top
          doc.addImage(imgData, 'PNG', 2, 2, heightPt - 4, widthPt - 4, undefined, 'FAST', 90);

          doc.save(`Etiqueta_${codigo}.pdf`);
      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudo generar la etiqueta.', 'error');
      }
  };

  const openModal = (item?: any) => {
      setIsEditing(!!item);
      setCurrentId(item ? (item.codigo || item.codInventario || item.codAccesorio || item.codCategoria || item.idUbicacion) : null);
      if (activeTab === 'TELEPHONES') setPhoneForm(item || { estado: 'Disponible', fecha: new Date().toISOString().split('T')[0] });
      else if (activeTab === 'STOCK') setStockForm(item || { estado: 'Activo', fecha: new Date().toISOString().split('T')[0] });
      else if (activeTab === 'MASTER') setMasterForm(item || {});
      else if (activeTab === 'CATEGORIES') setCatForm(item || {});
      else if (activeTab === 'LOCATIONS') setLocForm(item || { estado: 'Activo' });
      setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === 'TELEPHONES') {
        if(isEditing) await InventoryService.updateTelefono(currentId!, phoneForm);
        else await InventoryService.createTelefono(phoneForm);
      } else if (activeTab === 'STOCK') {
        if(isEditing) await InventoryService.updateStock(currentId!, stockForm);
        else await InventoryService.createStock(stockForm);
      } else if (activeTab === 'MASTER') {
        if(isEditing) await InventoryService.updateAccesorioMaster(currentId!, masterForm);
        else await InventoryService.createAccesorioMaster(masterForm);
      } else if (activeTab === 'CATEGORIES') {
        if(isEditing) await InventoryService.updateCategoria(currentId!, catForm);
        else await InventoryService.createCategoria(catForm);
      } else if (activeTab === 'LOCATIONS') {
        if(isEditing) await InventoryService.updateUbicacion(currentId!, locForm);
        else await InventoryService.createUbicacion(locForm);
      }
      setShowModal(false);
      Swal.fire({ title: 'Éxito', icon: 'success', timer: 1500, showConfirmButton: false });
      loadData();
    } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
      const result = await Swal.fire({ title: '¿Eliminar registro?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar' });
      if (result.isConfirmed) {
          try {
            if (activeTab === 'TELEPHONES') await InventoryService.deleteTelefono(id);
            else if (activeTab === 'STOCK') await InventoryService.deleteStock(id);
            else if (activeTab === 'MASTER') await InventoryService.deleteAccesorioMaster(id);
            else if (activeTab === 'CATEGORIES') await InventoryService.deleteCategoria(id);
            else if (activeTab === 'LOCATIONS') await InventoryService.deleteUbicacion(id);
            Swal.fire('Eliminado', '', 'success');
            loadData();
          } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
      }
  };

  const renderContent = () => {
      if (loading) return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;

      if (activeTab === 'TELEPHONES') {
          const filtered = phones.filter(p => {
              const term = searchTerm.toLowerCase();
              return (p.marca.toLowerCase().includes(term) || p.modelo.toLowerCase().includes(term) || p.imei1.toLowerCase().includes(term)) && (statusFilter === 'ALL' || p.estado === statusFilter);
          });
          return (
              <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="p-3">Código</th><th className="p-3">Marca/Modelo</th><th className="p-3">IMEI</th><th className="p-3">Precio Venta</th><th className="p-3">Ubicación</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                      {filtered.map(p => (
                          <tr key={p.codigo} className="hover:bg-slate-50 text-sm">
                              <td className="p-3 font-mono text-slate-500">{p.codigo}</td><td className="p-3 font-bold text-slate-700">{p.marca} {p.modelo}</td><td className="p-3 font-mono">{p.imei1}</td><td className="p-3 font-bold text-emerald-600">L. {Number(p.precioVenta).toFixed(2)}</td><td className="p-3 text-xs">{p.nombreUbicacion || p.idubicacion}</td><td><span className={`px-2 py-1 rounded-full text-xs font-bold ${p.estado === 'Disponible' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{p.estado}</span></td><td className="p-3 text-right">
                                  <button onClick={() => handlePrintLabel(p, 'TELEFONO')} className="text-slate-400 hover:text-slate-600 p-1.5 rounded mr-1"><Printer size={16}/></button><button onClick={() => openModal(p)} className="text-blue-500 p-1.5 rounded mr-1"><Edit2 size={16}/></button><button onClick={() => handleDelete(p.codigo)} className="text-red-500 p-1.5 rounded"><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          );
      }

      if (activeTab === 'STOCK') {
        const filtered = stock.filter(s => s.descripcionAccesorio?.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="p-3">SKU</th><th className="p-3">Descripción</th><th className="p-3">Categoría</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">P. Venta</th><th className="p-3">Ubicación</th><th className="p-3 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {filtered.map(s => (
                        <tr key={s.codInventario} className="hover:bg-slate-50 text-sm">
                            <td className="p-3 font-mono text-slate-500 text-xs">{s.codInventario}</td><td className="p-3 font-bold text-slate-700">{s.descripcionAccesorio}</td><td className="p-3 text-xs">{s.categoriaAccesorio}</td><td className="p-3 text-center"><span className={`px-2 py-1 rounded-md font-bold text-xs ${s.cantidad > 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s.cantidad}</span></td><td className="p-3 text-right font-bold text-emerald-600">L. {Number(s.precioVenta).toFixed(2)}</td><td className="p-3 text-xs">{s.nombreUbicacion || s.idubicacion}</td><td className="p-3 text-right">
                                <button onClick={() => handlePrintLabel(s, 'STOCK')} className="text-slate-400 hover:text-slate-600 p-1.5 rounded mr-1"><Printer size={16}/></button><button onClick={() => openModal(s)} className="text-blue-500 p-1.5 rounded mr-1"><Edit2 size={16}/></button><button onClick={() => handleDelete(s.codInventario)} className="text-red-500 p-1.5 rounded"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
      }

      if (activeTab === 'MASTER') {
          return (
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="p-3">ID</th><th className="p-3">Descripción</th><th className="p-3">Categoría</th><th className="p-3 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {master.filter(m => m.descripcion.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                        <tr key={m.codAccesorio} className="hover:bg-slate-50 text-sm">
                            <td className="p-3 font-mono text-slate-500 text-xs">{m.codAccesorio}</td><td className="p-3 font-bold text-slate-700">{m.descripcion}</td><td className="p-3">{m.nombreCategoria || m.codCategoria}</td><td className="p-3 text-right">
                                <button onClick={() => openModal(m)} className="text-blue-500 p-1.5 rounded mr-1"><Edit2 size={16}/></button><button onClick={() => handleDelete(m.codAccesorio)} className="text-red-500 p-1.5 rounded"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
          );
      }
      return <div className="p-4 text-center text-slate-400">Seleccione una pestaña.</div>;
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Package className="text-indigo-600"/> Gestión de Inventario</h2><p className="text-slate-500 text-sm">Control de teléfonos, accesorios y configuraciones.</p></div>
          <button onClick={() => openModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all"><PlusCircle size={20}/><span>Nuevo Registro</span></button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {[{ id: 'TELEPHONES', label: 'Teléfonos', icon: <Smartphone size={18}/> }, { id: 'STOCK', label: 'Stock Accesorios', icon: <Box size={18}/> }, { id: 'MASTER', label: 'Accesorios', icon: <Layers size={18}/> }, { id: 'CATEGORIES', label: 'Categorías', icon: <Tag size={18}/> }, { id: 'LOCATIONS', label: 'Ubicaciones', icon: <MapPin size={18}/> }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as InventoryTab)} className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700'}`}>{tab.icon} {tab.label}</button>
          ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
          <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none"/>
                </div>
                {activeTab === 'TELEPHONES' && (
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none"><option value="ALL">Todos</option><option value="Disponible">Disponibles</option><option value="Vendido">Vendidos</option></select>
                )}
                <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white"><RefreshCw size={20} /></button>
          </div>
          <div className="flex-1 overflow-auto">{renderContent()}</div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl w-full ${activeTab === 'TELEPHONES' || activeTab === 'STOCK' ? 'max-w-4xl' : 'max-w-md'} shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]`}>
             <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div><h3 className="text-2xl font-bold text-slate-800">{isEditing ? 'Editar' : 'Nuevo'} {activeTab}</h3></div>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-slate-100 rounded-full"><X size={24}/></button>
             </div>
             <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
             <form onSubmit={handleSubmit} className="space-y-6">
                {activeTab === 'TELEPHONES' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">IMEI 1</label><input required className="w-full p-3 bg-white border border-slate-200 rounded-xl" value={phoneForm.imei1 || ''} onChange={e => setPhoneForm({...phoneForm, imei1: e.target.value})}/></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Marca</label><input required className="w-full p-3 bg-white border border-slate-200 rounded-xl" value={phoneForm.marca || ''} onChange={e => setPhoneForm({...phoneForm, marca: e.target.value})}/></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Modelo</label><input required className="w-full p-3 bg-white border border-slate-200 rounded-xl" value={phoneForm.modelo || ''} onChange={e => setPhoneForm({...phoneForm, modelo: e.target.value})}/></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Precio Venta</label><input required type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl" value={phoneForm.precioVenta || ''} onChange={e => setPhoneForm({...phoneForm, precioVenta: Number(e.target.value)})}/></div>
                    </div>
                )}
                {activeTab === 'STOCK' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Accesorio</label><select required className="w-full p-3 bg-white border border-slate-200 rounded-xl" value={stockForm.codAccesorio || ''} onChange={e => setStockForm({...stockForm, codAccesorio: e.target.value})}><option value="">Seleccione...</option>{master.map(m => (<option key={m.codAccesorio} value={m.codAccesorio}>{m.descripcion}</option>))}</select></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cantidad</label><input required type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl" value={stockForm.cantidad || ''} onChange={e => setStockForm({...stockForm, cantidad: Number(e.target.value)})}/></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Precio Venta</label><input required type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl" value={stockForm.precioVenta || ''} onChange={e => setStockForm({...stockForm, precioVenta: Number(e.target.value)})}/></div>
                    </div>
                )}
                <div className="pt-6 flex gap-4 border-t border-slate-100">
                    <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl">Cancelar</button>
                    <button type="submit" className="flex-1 px-4 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20">{isEditing ? 'Actualizar' : 'Guardar'}</button>
                </div>
             </form>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;