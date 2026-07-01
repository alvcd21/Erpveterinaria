import React, { useState, useEffect, useCallback } from 'react';
import { CatalogoService } from '../services/api';
import { FormaFarmaceutica, CategoriaTerapeutica } from '../types';
import { FlaskConical, Tags, Plus, Edit2, Trash2, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';

const Catalogos: React.FC = () => {
  const [formas, setFormas] = useState<FormaFarmaceutica[]>([]);
  const [categorias, setCategorias] = useState<CategoriaTerapeutica[]>([]);
  const [loading, setLoading] = useState(false);

  const [nuevaForma, setNuevaForma] = useState({ nombre: '', unidad_base: '' });
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [f, c] = await Promise.all([CatalogoService.getFormas(), CatalogoService.getCategorias()]);
      setFormas(f); setCategorias(c);
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'No se pudieron cargar los catálogos', 'error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crearForma = async () => {
    if (!nuevaForma.nombre.trim() || !nuevaForma.unidad_base.trim()) {
      Swal.fire('Faltan datos', 'La forma necesita nombre y unidad base (ej. ml, g, tableta).', 'warning');
      return;
    }
    setSaving(true);
    try {
      await CatalogoService.createForma({ nombre: nuevaForma.nombre.trim(), unidad_base: nuevaForma.unidad_base.trim() });
      setNuevaForma({ nombre: '', unidad_base: '' });
      await cargar();
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'No se pudo crear la forma', 'error');
    } finally { setSaving(false); }
  };

  const crearCategoria = async () => {
    if (!nuevaCategoria.trim()) { Swal.fire('Faltan datos', 'La categoría necesita un nombre.', 'warning'); return; }
    setSaving(true);
    try {
      await CatalogoService.createCategoria({ nombre: nuevaCategoria.trim() });
      setNuevaCategoria('');
      await cargar();
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'No se pudo crear la categoría', 'error');
    } finally { setSaving(false); }
  };

  const editarForma = async (f: FormaFarmaceutica) => {
    const { value } = await Swal.fire({
      title: 'Editar forma farmacéutica',
      html:
        `<input id="sw-nombre" class="swal2-input" placeholder="Nombre" value="${f.nombre.replace(/"/g, '&quot;')}">` +
        `<input id="sw-unidad" class="swal2-input" placeholder="Unidad base" value="${(f.unidad_base || '').replace(/"/g, '&quot;')}">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const nombre = (document.getElementById('sw-nombre') as HTMLInputElement)?.value.trim();
        const unidad_base = (document.getElementById('sw-unidad') as HTMLInputElement)?.value.trim();
        if (!nombre || !unidad_base) { Swal.showValidationMessage('Nombre y unidad base son requeridos'); return false; }
        return { nombre, unidad_base };
      },
    });
    if (!value) return;
    try {
      await CatalogoService.updateForma(f.id_forma, { ...value, activo: true });
      await cargar();
    } catch (e: any) { Swal.fire('Error', e?.message || 'No se pudo actualizar', 'error'); }
  };

  const editarCategoria = async (c: CategoriaTerapeutica) => {
    const { value } = await Swal.fire({
      title: 'Editar categoría terapéutica',
      input: 'text', inputValue: c.nombre,
      showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v.trim() ? 'El nombre es requerido' : undefined),
    });
    if (!value) return;
    try {
      await CatalogoService.updateCategoria(c.id_categoria, { nombre: value.trim(), activo: true });
      await cargar();
    } catch (e: any) { Swal.fire('Error', e?.message || 'No se pudo actualizar', 'error'); }
  };

  const desactivar = async (tipo: 'forma' | 'categoria', item: any) => {
    const nombre = item.nombre;
    const r = await Swal.fire({
      title: `¿Desactivar "${nombre}"?`,
      text: 'Dejará de aparecer en los desplegables al registrar medicamentos. No afecta a los medicamentos ya clasificados.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Desactivar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!r.isConfirmed) return;
    try {
      if (tipo === 'forma') await CatalogoService.updateForma(item.id_forma, { nombre: item.nombre, unidad_base: item.unidad_base, activo: false });
      else await CatalogoService.updateCategoria(item.id_categoria, { nombre: item.nombre, activo: false });
      await cargar();
    } catch (e: any) { Swal.fire('Error', e?.message || 'No se pudo desactivar', 'error'); }
  };

  const inp = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Catálogos de Inventario</h1>
          <p className="text-sm text-slate-500">Formas farmacéuticas y categorías terapéuticas usadas al registrar medicamentos.</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-indigo-600">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formas farmacéuticas */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
            <FlaskConical size={18} className="text-indigo-600" />
            <h2 className="font-semibold text-slate-700">Formas farmacéuticas</h2>
            <span className="ml-auto text-xs text-slate-400">{formas.length}</span>
          </div>
          <div className="p-4 flex flex-col sm:flex-row gap-2 border-b border-slate-100">
            <input className={inp} placeholder="Nombre (ej. Tableta)" value={nuevaForma.nombre}
              onChange={e => setNuevaForma(s => ({ ...s, nombre: e.target.value }))} />
            <input className={`${inp} sm:max-w-[130px]`} placeholder="Unidad (ml, g…)" value={nuevaForma.unidad_base}
              onChange={e => setNuevaForma(s => ({ ...s, unidad_base: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && crearForma()} />
            <button onClick={crearForma} disabled={saving}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 shrink-0">
              <Plus size={16} /> Agregar
            </button>
          </div>
          <ul className="divide-y divide-slate-100 max-h-[420px] overflow-auto">
            {formas.map(f => (
              <li key={f.id_forma} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
                <span className="flex-1 text-sm text-slate-700">{f.nombre}
                  <span className="ml-2 text-xs text-slate-400">/ {f.unidad_base}</span>
                </span>
                <button onClick={() => editarForma(f)} className="p-1.5 text-slate-400 hover:text-indigo-600" title="Editar"><Edit2 size={15} /></button>
                <button onClick={() => desactivar('forma', f)} className="p-1.5 text-slate-400 hover:text-red-600" title="Desactivar"><Trash2 size={15} /></button>
              </li>
            ))}
            {formas.length === 0 && !loading && <li className="px-4 py-6 text-center text-sm text-slate-400">No hay formas registradas.</li>}
          </ul>
        </section>

        {/* Categorías terapéuticas */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
            <Tags size={18} className="text-indigo-600" />
            <h2 className="font-semibold text-slate-700">Categorías terapéuticas</h2>
            <span className="ml-auto text-xs text-slate-400">{categorias.length}</span>
          </div>
          <div className="p-4 flex gap-2 border-b border-slate-100">
            <input className={inp} placeholder="Nombre (ej. Antibióticos)" value={nuevaCategoria}
              onChange={e => setNuevaCategoria(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && crearCategoria()} />
            <button onClick={crearCategoria} disabled={saving}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 shrink-0">
              <Plus size={16} /> Agregar
            </button>
          </div>
          <ul className="divide-y divide-slate-100 max-h-[420px] overflow-auto">
            {categorias.map(c => (
              <li key={c.id_categoria} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
                <span className="flex-1 text-sm text-slate-700">{c.nombre}</span>
                <button onClick={() => editarCategoria(c)} className="p-1.5 text-slate-400 hover:text-indigo-600" title="Editar"><Edit2 size={15} /></button>
                <button onClick={() => desactivar('categoria', c)} className="p-1.5 text-slate-400 hover:text-red-600" title="Desactivar"><Trash2 size={15} /></button>
              </li>
            ))}
            {categorias.length === 0 && !loading && <li className="px-4 py-6 text-center text-sm text-slate-400">No hay categorías registradas.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Catalogos;
