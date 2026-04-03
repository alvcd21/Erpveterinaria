
import React, { useState, useEffect } from 'react';
import { CostsService } from '../services/api';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Costo, TipoCosto } from '../types';
import { PlusCircle, Search, Edit2, Trash2, X, RefreshCw, Calculator, TrendingDown, Layers } from 'lucide-react';
import Swal from 'sweetalert2';

const Costs: React.FC = () => {
  const [costs, setCosts] = useState<Costo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TipoCosto>('Costo Directo');
  
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Partial<Costo>>({ tipo: 'Costo Directo', estado: 'Activo' });

  useEffect(() => {
    loadCosts();
  }, []);

  const loadCosts = async () => {
    setLoading(true);
    try {
      const data = await CostsService.getAll();
      setCosts(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useOfflineSync(loadCosts);

  const openNewModal = () => {
    setIsEditing(false);
    setForm({ tipo: activeTab, estado: 'Activo' });
    setShowModal(true);
  };

  const openEditModal = (costo: Costo) => {
    setIsEditing(true);
    setForm(costo);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing && form.codCostos) {
        await CostsService.update(form.codCostos, form);
      } else {
        await CostsService.create(form);
      }
      setShowModal(false);
      Swal.fire({
        icon: 'success',
        title: isEditing ? 'Costo Actualizado' : 'Costo Registrado',
        timer: 1500,
        showConfirmButton: false
      });
      loadCosts();
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar?',
      text: "Esta acción no se puede deshacer.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await CostsService.delete(id);
        Swal.fire('Eliminado', 'El costo ha sido eliminado.', 'success');
        loadCosts();
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  const filteredCosts = costs.filter(c => 
    c.tipo === activeTab &&
    c.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCosts = filteredCosts.reduce((acc, curr) => acc + Number(curr.monto), 0);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
         <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
               <Calculator className="text-indigo-600"/> Gestión de Costos
            </h2>
            <p className="text-slate-500 text-sm">Administra costos directos e indirectos de la empresa.</p>
         </div>
         <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
             <div className="bg-indigo-100 p-2 rounded-lg text-indigo-700"><TrendingDown size={20}/></div>
             <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Total {activeTab === 'Costo Directo' ? 'Directo' : 'Indirecto'}</p>
                <p className="text-xl font-bold text-slate-800">L. {totalCosts.toFixed(2)}</p>
             </div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
         <button 
           onClick={() => setActiveTab('Costo Directo')}
           className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'Costo Directo' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
         >
           <Layers size={16}/> Costos Directos
         </button>
         <button 
           onClick={() => setActiveTab('Costo Indirecto')}
           className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'Costo Indirecto' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
         >
           <Layers size={16}/> Costos Indirectos
         </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 bg-slate-50/50 justify-between items-center">
           <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por descripción..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button 
             onClick={openNewModal}
             className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all whitespace-nowrap"
          >
            <PlusCircle size={18} />
            <span>Registrar Costo</span>
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10">
              <tr>
                <th className="p-4">Código</th>
                <th className="p-4">Descripción</th>
                <th className="p-4 text-right">Monto</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={5} className="p-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filteredCosts.length > 0 ? filteredCosts.map(c => (
                <tr key={c.codCostos} className="hover:bg-slate-50">
                  <td className="p-4 font-mono text-slate-500 text-xs">{c.codCostos}</td>
                  <td className="p-4 font-bold text-slate-700">{c.descripcion}</td>
                  <td className="p-4 text-right font-bold text-slate-800">L. {Number(c.monto).toFixed(2)}</td>
                  <td className="p-4 text-xs"><span className="bg-green-100 text-green-700 px-2 py-1 rounded">{c.estado}</span></td>
                  <td className="p-4 text-center flex justify-center gap-2">
                    <button onClick={() => openEditModal(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(c.codCostos)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No hay costos registrados en esta categoría.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Editar Costo' : 'Registro de Costos'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
                 <select 
                    className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" 
                    value={form.tipo} 
                    onChange={e => setForm({...form, tipo: e.target.value as TipoCosto})}
                 >
                    <option value="Costo Directo">Costo Directo (Variable)</option>
                    <option value="Costo Indirecto">Costo Indirecto (Fijo/Mensual)</option>
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase">Monto</label>
                 <input required type="number" className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1 font-bold" value={form.monto || ''} onChange={e => setForm({...form, monto: Number(e.target.value)})} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
                <textarea required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" rows={3} value={form.descripcion || ''} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="Detalle del costo..." />
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

export default Costs;
