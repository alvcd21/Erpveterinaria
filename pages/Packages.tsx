
import React, { useState, useEffect } from 'react';
import { PackagesService } from '../services/api';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Paquete } from '../types';
import { Search, PlusCircle, Smartphone, Edit2, Trash2, X, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';

const Packages: React.FC = () => {
  const [packages, setPackages] = useState<Paquete[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Partial<Paquete>>({ red: 'TIGO', estado: 'Activo' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await PackagesService.getAll();
      setPackages(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useOfflineSync(loadData);

  const openNewModal = () => {
    setIsEditing(false);
    setForm({ red: 'TIGO', estado: 'Activo' });
    setShowModal(true);
  };

  const openEditModal = (pkg: Paquete) => {
    setIsEditing(true);
    setForm(pkg);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await PackagesService.update(form.idPaquete!, form);
      } else {
        await PackagesService.create(form);
      }
      setShowModal(false);
      Swal.fire({
        icon: 'success',
        title: isEditing ? 'Paquete Actualizado' : 'Paquete Creado',
        timer: 1500,
        showConfirmButton: false
      });
      loadData();
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar Paquete?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
    });

    if (result.isConfirmed) {
      try {
        await PackagesService.delete(id);
        Swal.fire('Eliminado', 'El paquete ha sido eliminado.', 'success');
        loadData();
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  const filtered = packages.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-end mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Smartphone className="text-indigo-600" /> Paquetes de Recarga
          </h2>
          <p className="text-slate-500 text-sm">Gestiona el catálogo de paquetes Tigo y Claro</p>
        </div>
        <button 
           onClick={openNewModal}
           className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all"
        >
          <PlusCircle size={20} />
          <span>Nuevo Paquete</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50">
           <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar paquete..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white">
            <RefreshCw size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10">
              <tr>
                <th className="p-4">Red</th>
                <th className="p-4">Nombre</th>
                <th className="p-4 text-right">Precio Venta</th>
                <th className="p-4 text-right">Costo</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={6} className="p-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filtered.map(p => (
                <tr key={p.idPaquete} className="hover:bg-slate-50">
                  <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold text-white ${p.red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'}`}>{p.red}</span>
                  </td>
                  <td className="p-4 font-bold text-slate-800">{p.nombre}</td>
                  <td className="p-4 text-right font-bold text-emerald-600">L. {Number(p.precio).toFixed(2)}</td>
                  <td className="p-4 text-right text-slate-500">L. {Number(p.costo).toFixed(2)}</td>
                  <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${p.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.estado}</span>
                  </td>
                  <td className="p-4 text-center flex justify-center gap-2">
                    <button onClick={() => openEditModal(p)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(p.idPaquete)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Editar Paquete' : 'Nuevo Paquete'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase">Red</label>
                 <select className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={form.red} onChange={e => setForm({...form, red: e.target.value as any})}>
                     <option value="TIGO">TIGO</option>
                     <option value="CLARO">CLARO</option>
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase">Nombre Paquete</label>
                 <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={form.nombre || ''} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Ej: SUPER 1 DIA" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase">Precio Venta</label>
                   <input required type="number" className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1 font-bold text-emerald-600" value={form.precio || ''} onChange={e => setForm({...form, precio: Number(e.target.value)})} />
                </div>
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase">Costo (Proveedor)</label>
                   <input required type="number" className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={form.costo || ''} onChange={e => setForm({...form, costo: Number(e.target.value)})} />
                </div>
              </div>
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                 <select className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={form.estado} onChange={e => setForm({...form, estado: e.target.value as any})}>
                     <option value="Activo">Activo</option>
                     <option value="Inactivo">Inactivo</option>
                 </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">{isEditing ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Packages;
