import React, { useState, useEffect, useRef } from 'react';
import { TransferenciasService, SucursalesService, MedicamentosService } from '../services/api';
import { Sucursal, Medicamento } from '../types';
import { ArrowLeftRight, Plus, X, Check, Ban, Search, Filter } from 'lucide-react';
import Swal from 'sweetalert2';

interface Transferencia {
  codigo: string;
  fecha_solicitud: string;
  fecha_resolucion?: string;
  sucursalOrigen: string;
  sucursalDestino: string;
  id_medicamento: string;
  nombreMedicamento: string;
  cantidad_base: number;
  motivo?: string;
  estado: 'Pendiente' | 'Aceptada' | 'Rechazada';
}

const ESTADO_BADGE: Record<string, string> = {
  Pendiente: 'bg-yellow-100 text-yellow-700',
  Aceptada:  'bg-green-100 text-green-700',
  Rechazada: 'bg-red-100 text-red-700',
};

const card = 'bg-white rounded-2xl shadow-sm border border-slate-100';
const btnPrimary = 'bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors';
const inputCls = 'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

const emptyForm = {
  id_sucursal_origen: '' as string | number,
  id_sucursal_destino: '' as string | number,
  id_medicamento: '',
  cantidad_base: 1,
  motivo: '',
};

export default function Transferencias() {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [medSearch, setMedSearch] = useState('');
  const [medDropOpen, setMedDropOpen] = useState(false);
  const medRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAll();
    loadSucursales();
    loadMedicamentos();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (medRef.current && !medRef.current.contains(e.target as Node)) {
        setMedDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const params: { estado?: string; id_sucursal?: number } = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroSucursal) params.id_sucursal = Number(filtroSucursal);
      const data = await TransferenciasService.getAll(Object.keys(params).length ? params : undefined);
      setTransferencias(data as Transferencia[]);
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo cargar las transferencias', 'error');
    }
    setLoading(false);
  }

  async function loadSucursales() {
    try { setSucursales(await SucursalesService.getAll()); } catch { }
  }

  async function loadMedicamentos() {
    try { setMedicamentos(await MedicamentosService.getAll()); } catch { }
  }

  const medFiltered = medicamentos.filter(m =>
    m.activo &&
    (m.nombre_generico.toLowerCase().includes(medSearch.toLowerCase()) ||
      (m.nombre_comercial || '').toLowerCase().includes(medSearch.toLowerCase()))
  ).slice(0, 8);

  function selectMedicamento(med: Medicamento) {
    setForm(p => ({ ...p, id_medicamento: med.codigo }));
    setMedSearch(med.nombre_generico + (med.nombre_comercial ? ` (${med.nombre_comercial})` : ''));
    setMedDropOpen(false);
  }

  async function handleCreate() {
    if (!form.id_sucursal_origen) {
      Swal.fire('Error', 'Seleccione la sucursal origen', 'error'); return;
    }
    if (!form.id_sucursal_destino) {
      Swal.fire('Error', 'Seleccione la sucursal destino', 'error'); return;
    }
    if (form.id_sucursal_origen === form.id_sucursal_destino) {
      Swal.fire('Error', 'La sucursal origen y destino deben ser diferentes', 'error'); return;
    }
    if (!form.id_medicamento) {
      Swal.fire('Error', 'Seleccione un medicamento', 'error'); return;
    }
    if (!form.cantidad_base || form.cantidad_base < 1) {
      Swal.fire('Error', 'La cantidad debe ser al menos 1', 'error'); return;
    }
    try {
      await TransferenciasService.create({
        id_sucursal_origen: Number(form.id_sucursal_origen),
        id_sucursal_destino: Number(form.id_sucursal_destino),
        id_medicamento: form.id_medicamento,
        cantidad_base: form.cantidad_base,
        ...(form.motivo ? { motivo: form.motivo } : {}),
      });
      Swal.fire({ icon: 'success', title: 'Transferencia creada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
      setShowModal(false);
      setForm(emptyForm);
      setMedSearch('');
      loadAll();
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo crear la transferencia', 'error');
    }
  }

  async function handleUpdateEstado(codigo: string, estado: 'Aceptada' | 'Rechazada') {
    const isAceptar = estado === 'Aceptada';
    const result = await Swal.fire({
      title: isAceptar ? '¿Aceptar transferencia?' : '¿Rechazar transferencia?',
      text: `Se marcará la transferencia ${codigo} como ${estado}.`,
      icon: isAceptar ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: isAceptar ? 'Aceptar' : 'Rechazar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: isAceptar ? '#16a34a' : '#dc2626',
    });
    if (!result.isConfirmed) return;
    try {
      await TransferenciasService.updateEstado(codigo, estado);
      Swal.fire({ icon: 'success', title: `Transferencia ${estado.toLowerCase()}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
      loadAll();
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo actualizar el estado', 'error');
    }
  }

  const filtered = transferencias.filter(t => {
    const matchEstado = !filtroEstado || t.estado === filtroEstado;
    const matchSuc = !filtroSucursal || String(t.sucursalOrigen).includes(filtroSucursal) || String(t.sucursalDestino).includes(filtroSucursal);
    return matchEstado && matchSuc;
  });

  return (
    <div className="p-6 space-y-4 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="text-indigo-600" size={26} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Transferencias</h1>
            <p className="text-sm text-slate-500">Traslado de stock entre sucursales</p>
          </div>
        </div>
        <button onClick={() => { setShowModal(true); setForm(emptyForm); setMedSearch(''); }} className={btnPrimary}>
          <Plus size={15} className="inline mr-1.5" />Nueva Transferencia
        </button>
      </div>

      {/* Filters */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Filter size={15} />
            <span className="font-medium">Filtros:</span>
          </div>
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Aceptada">Aceptada</option>
            <option value="Rechazada">Rechazada</option>
          </select>
          <select
            value={filtroSucursal}
            onChange={e => setFiltroSucursal(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map(s => (
              <option key={s.id_sucursal} value={String(s.id_sucursal)}>{s.nombre}</option>
            ))}
          </select>
          <button onClick={loadAll} className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm hover:bg-slate-50 transition-colors">
            <Search size={14} className="inline mr-1.5" />Aplicar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {['Código', 'Fecha', 'Origen → Destino', 'Medicamento', 'Cantidad', 'Motivo', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="inline-flex flex-col items-center gap-2 text-slate-400">
                      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                      <span className="text-sm">Cargando transferencias...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400">
                    <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No hay transferencias registradas</p>
                  </td>
                </tr>
              ) : filtered.map(t => (
                <tr key={t.codigo} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.codigo}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {new Date(t.fecha_solicitud).toLocaleDateString('es-HN')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-700 font-medium">{t.sucursalOrigen}</span>
                    <span className="mx-2 text-slate-400">→</span>
                    <span className="text-slate-700 font-medium">{t.sucursalDestino}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t.nombreMedicamento}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium">{t.cantidad_base}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{t.motivo || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_BADGE[t.estado] || ''}`}>
                      {t.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.estado === 'Pendiente' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateEstado(t.codigo, 'Aceptada')}
                          className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <Check size={12} />Aceptar
                        </button>
                        <button
                          onClick={() => handleUpdateEstado(t.codigo, 'Rechazada')}
                          className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <Ban size={12} />Rechazar
                        </button>
                      </div>
                    )}
                    {t.estado !== 'Pendiente' && (
                      <span className="text-xs text-slate-400">
                        {t.fecha_resolucion ? new Date(t.fecha_resolucion).toLocaleDateString('es-HN') : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ArrowLeftRight size={20} className="text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-lg">Nueva Transferencia</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Sucursal Origen */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sucursal Origen <span className="text-red-500">*</span></label>
                <select
                  value={form.id_sucursal_origen}
                  onChange={e => setForm(p => ({ ...p, id_sucursal_origen: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Seleccionar sucursal origen...</option>
                  {sucursales.filter(s => s.estado === 'Activa').map(s => (
                    <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Sucursal Destino */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sucursal Destino <span className="text-red-500">*</span></label>
                <select
                  value={form.id_sucursal_destino}
                  onChange={e => setForm(p => ({ ...p, id_sucursal_destino: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Seleccionar sucursal destino...</option>
                  {sucursales
                    .filter(s => s.estado === 'Activa' && String(s.id_sucursal) !== String(form.id_sucursal_origen))
                    .map(s => (
                      <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>
                    ))}
                </select>
              </div>

              {/* Medicamento */}
              <div ref={medRef}>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Medicamento <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    value={medSearch}
                    onChange={e => {
                      setMedSearch(e.target.value);
                      setForm(p => ({ ...p, id_medicamento: '' }));
                      setMedDropOpen(true);
                    }}
                    onFocus={() => setMedDropOpen(true)}
                    placeholder="Buscar por nombre genérico o comercial..."
                    className="w-full pl-9 pr-3 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                  {medDropOpen && medSearch && medFiltered.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      {medFiltered.map(m => (
                        <button
                          key={m.codigo}
                          type="button"
                          onMouseDown={() => selectMedicamento(m)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors"
                        >
                          <span className="font-medium text-slate-800">{m.nombre_generico}</span>
                          {m.nombre_comercial && (
                            <span className="text-slate-500 ml-1.5">({m.nombre_comercial})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {medDropOpen && medSearch && medFiltered.length === 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-400">
                      Sin resultados
                    </div>
                  )}
                </div>
                {form.id_medicamento && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Check size={12} />Medicamento seleccionado: <span className="font-mono">{form.id_medicamento}</span>
                  </p>
                )}
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cantidad <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={1}
                  value={form.cantidad_base}
                  onChange={e => setForm(p => ({ ...p, cantidad_base: Math.max(1, Number(e.target.value)) }))}
                  className={inputCls}
                />
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Motivo <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input
                  value={form.motivo}
                  onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))}
                  placeholder="Ej: Reabastecimiento, urgencia, etc."
                  className={inputCls}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button onClick={handleCreate} className={btnPrimary}>
                  <Plus size={15} className="inline mr-1.5" />Crear Transferencia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
