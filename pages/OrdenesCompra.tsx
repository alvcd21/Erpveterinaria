import React, { useState, useEffect, useRef } from 'react';
import { OrdenesCompraService, SucursalesService, InventoryService, MedicamentosService } from '../services/api';
import { Sucursal, Proveedor, Medicamento } from '../types';
import { ShoppingBag, Plus, X, Search, Send, Check, Ban, ChevronDown } from 'lucide-react';
import Swal from 'sweetalert2';

interface OrdenCompra {
  codigo: string;
  fecha_creacion: string;
  nombreProveedor?: string;
  nombreSucursal?: string;
  fecha_entrega_esperada?: string;
  estado: string;
  totalItems: number;
}

interface ItemDraft {
  id_medicamento: string;
  nombreMedicamento: string;
  cantidad_ordenada: number;
  precio_unitario: number;
}

const ESTADO_BADGE: Record<string, string> = {
  'Pendiente': 'bg-yellow-100 text-yellow-700',
  'Enviada': 'bg-blue-100 text-blue-700',
  'Parcialmente recibida': 'bg-orange-100 text-orange-700',
  'Recibida': 'bg-green-100 text-green-700',
  'Cancelada': 'bg-red-100 text-red-700',
};

const card = 'bg-white rounded-2xl shadow-sm border border-slate-100';
const btnPrimary = 'bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors';
const btnSuccess = 'bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors';
const btnBlue = 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors';
const inputCls = 'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

const emptyForm = { id_proveedor: '', id_sucursal: '', fecha_entrega_esperada: '', notas: '' };
const newItem = (): ItemDraft => ({ id_medicamento: '', nombreMedicamento: '', cantidad_ordenada: 1, precio_unitario: 0 });
const fmtDate = (d?: string) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('es-HN'); } catch { return d; } };

export default function OrdenesCompra() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [saving, setSaving] = useState(false);
  const [medSearches, setMedSearches] = useState<string[]>(['']);
  const [medDropdowns, setMedDropdowns] = useState<boolean[]>([false]);
  const [catalogError, setCatalogError] = useState('');
  const dropRefs = useRef<(HTMLDivElement | null)[]>([]);

  const loadOrdenes = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filtroEstado) params.estado = filtroEstado;
      setOrdenes(await OrdenesCompraService.getAll(params));
    } catch { /* keep empty */ } finally { setLoading(false); }
  };

  useEffect(() => { loadOrdenes(); }, [filtroEstado]);

  useEffect(() => {
    Promise.all([InventoryService.getProveedores(), SucursalesService.getAll(), MedicamentosService.getAll()])
      .then(([p, s, m]) => {
        setProveedores(p);
        setSucursales(s.filter(x => x.estado === 'Activa'));
        setMedicamentos(m.filter(x => x.activo));
        setCatalogError('');
      }).catch((err) => {
        setCatalogError(err?.message || 'No se pudo cargar el catalogo de medicamentos.');
      });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) =>
      dropRefs.current.forEach((ref, i) => {
        if (ref && !ref.contains(e.target as Node))
          setMedDropdowns(prev => { const n = [...prev]; n[i] = false; return n; });
      });
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openModal = () => {
    setForm(emptyForm); setItems([newItem()]); setMedSearches(['']); setMedDropdowns([false]); setShowModal(true);
  };

  const addItem = () => {
    setItems(p => [...p, newItem()]); setMedSearches(p => [...p, '']); setMedDropdowns(p => [...p, false]);
  };

  const removeItem = (i: number) => {
    setItems(p => p.filter((_, j) => j !== i));
    setMedSearches(p => p.filter((_, j) => j !== i));
    setMedDropdowns(p => p.filter((_, j) => j !== i));
  };

  const updateItem = (i: number, field: keyof ItemDraft, val: string | number) =>
    setItems(p => p.map((it, j) => j === i ? { ...it, [field]: val } : it));

  const selectMed = (i: number, med: Medicamento) => {
    updateItem(i, 'id_medicamento', med.codigo);
    updateItem(i, 'nombreMedicamento', med.nombre_generico);
    setMedSearches(p => { const n = [...p]; n[i] = med.nombre_generico; return n; });
    setMedDropdowns(p => { const n = [...p]; n[i] = false; return n; });
  };

  const filteredMeds = (q: string) => {
    if (!q.trim()) return medicamentos.slice(0, 8);
    const lq = q.toLowerCase();
    return medicamentos.filter(m =>
      m.nombre_generico.toLowerCase().includes(lq) ||
      (m.nombre_comercial?.toLowerCase().includes(lq))
    ).slice(0, 8);
  };

  const handleSubmit = async () => {
    if (!form.id_proveedor) { Swal.fire('Requerido', 'Selecciona un proveedor.', 'warning'); return; }
    const valid = items.filter(it => it.id_medicamento && it.cantidad_ordenada > 0);
    if (!valid.length) { Swal.fire('Requerido', 'Agrega al menos un medicamento con cantidad > 0.', 'warning'); return; }
    setSaving(true);
    try {
      const payload: any = {
        id_proveedor: form.id_proveedor,
        detalle: valid.map(it => ({
          id_medicamento: it.id_medicamento,
          cantidad_ordenada: it.cantidad_ordenada,
          ...(it.precio_unitario ? { precio_unitario: it.precio_unitario } : {}),
        })),
      };
      if (form.id_sucursal) payload.id_sucursal = Number(form.id_sucursal);
      if (form.fecha_entrega_esperada) payload.fecha_entrega_esperada = form.fecha_entrega_esperada;
      if (form.notas) payload.notas = form.notas;
      const res = await OrdenesCompraService.create(payload);
      setShowModal(false);
      await loadOrdenes();
      Swal.fire({ icon: 'success', title: 'Orden creada', text: `Código: ${res.codigo}`, timer: 2500, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo crear la orden.', 'error');
    } finally { setSaving(false); }
  };

  const cambiarEstado = async (orden: OrdenCompra, nuevoEstado: string, label: string) => {
    const { isConfirmed } = await Swal.fire({
      title: `¿${label}?`, text: `Orden ${orden.codigo} → ${nuevoEstado}`, icon: 'question',
      showCancelButton: true, confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar',
      confirmButtonColor: nuevoEstado === 'Cancelada' ? '#dc2626' : '#4f46e5',
    });
    if (!isConfirmed) return;
    try {
      await OrdenesCompraService.updateEstado(orden.codigo, nuevoEstado);
      await loadOrdenes();
      Swal.fire({ icon: 'success', title: 'Estado actualizado', timer: 1800, showConfirmButton: false });
    } catch (err: any) { Swal.fire('Error', err.message || 'Error al actualizar.', 'error'); }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Órdenes de Compra</h1>
            <p className="text-sm text-slate-500">Gestión de pedidos a proveedores</p>
          </div>
        </div>
        <button onClick={openModal} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="w-4 h-4" /> Nueva Orden de Compra
        </button>
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex flex-wrap gap-3 items-center`}>
        <ChevronDown className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-500">Estado:</span>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos</option>
          {['Pendiente','Enviada','Parcialmente recibida','Recibida','Cancelada'].map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{ordenes.length} orden(es)</span>
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Código OC','Fecha','Proveedor','Sucursal','Entrega Esperada','Ítems','Estado','Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Cargando...</td></tr>
              ) : ordenes.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No hay órdenes de compra.</td></tr>
              ) : ordenes.map(o => (
                <tr key={o.codigo} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono font-medium text-indigo-600">{o.codigo}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(o.fecha_creacion)}</td>
                  <td className="px-4 py-3 text-slate-700">{o.nombreProveedor || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{o.nombreSucursal || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(o.fecha_entrega_esperada)}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{o.totalItems}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[o.estado] ?? 'bg-slate-100 text-slate-600'}`}>
                      {o.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {o.estado === 'Pendiente' && <>
                        <button onClick={() => cambiarEstado(o, 'Enviada', 'Enviar orden')} className={btnBlue}>
                          <span className="flex items-center gap-1"><Send className="w-3 h-3" />Enviar</span>
                        </button>
                        <button onClick={() => cambiarEstado(o, 'Cancelada', 'Cancelar orden')} className={btnDanger}>
                          <span className="flex items-center gap-1"><Ban className="w-3 h-3" />Cancelar</span>
                        </button>
                      </>}
                      {o.estado === 'Enviada' && <>
                        <button onClick={() => cambiarEstado(o, 'Recibida', 'Marcar como recibida')} className={btnSuccess}>
                          <span className="flex items-center gap-1"><Check className="w-3 h-3" />Recibida</span>
                        </button>
                        <button onClick={() => cambiarEstado(o, 'Parcialmente recibida', 'Marcar recepción parcial')}
                          className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors">
                          Parcial
                        </button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-600" /> Nueva Orden de Compra
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Proveedor <span className="text-red-500">*</span></label>
                <select value={form.id_proveedor} onChange={e => setForm(f => ({ ...f, id_proveedor: e.target.value }))} className={inputCls}>
                  <option value="">Selecciona un proveedor…</option>
                  {proveedores.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sucursal (opcional)</label>
                <select value={form.id_sucursal} onChange={e => setForm(f => ({ ...f, id_sucursal: e.target.value }))} className={inputCls}>
                  <option value="">Sin asignar</option>
                  {sucursales.map(s => <option key={s.id_sucursal} value={String(s.id_sucursal)}>{s.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha Entrega Esperada (opcional)</label>
                <input type="date" value={form.fecha_entrega_esperada}
                  onChange={e => setForm(f => ({ ...f, fecha_entrega_esperada: e.target.value }))} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas (opcional)</label>
                <textarea rows={2} value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className={inputCls} placeholder="Observaciones para esta orden…" />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-600">Medicamentos <span className="text-red-500">*</span></label>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Agregar ítem
                  </button>
                </div>
                {catalogError && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {catalogError}
                  </div>
                )}
                <div className="border border-slate-200 rounded-xl overflow-visible">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Medicamento</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold w-24">Cantidad</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold w-28">Precio Unit.</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <div className="relative" ref={el => { dropRefs.current[idx] = el; }}>
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                <input type="text" value={medSearches[idx] ?? ''}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setMedSearches(p => { const n = [...p]; n[idx] = v; return n; });
                                    if (!v) updateItem(idx, 'id_medicamento', '');
                                    setMedDropdowns(p => { const n = [...p]; n[idx] = v.length > 0; return n; });
                                  }}
                                  onFocus={() => {
                                    setMedDropdowns(p => { const n = [...p]; n[idx] = true; return n; });
                                  }}
                                  placeholder="Buscar medicamento…"
                                  className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 text-xs"
                                />
                              </div>
                              {medDropdowns[idx] && (
                                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                  {filteredMeds(medSearches[idx] ?? '').length > 0 ? filteredMeds(medSearches[idx] ?? '').map(med => (
                                    <button key={med.codigo} type="button"
                                      onMouseDown={e => { e.preventDefault(); selectMed(idx, med); }}
                                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-xs text-slate-700 transition-colors">
                                      <span className="font-medium">{med.nombre_generico}</span>
                                      {med.nombre_comercial && <span className="text-slate-400 ml-1">({med.nombre_comercial})</span>}
                                    </button>
                                  )) : (
                                    <div className="px-3 py-2 text-xs text-slate-400">
                                      No se encontraron medicamentos.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={1} value={item.cantidad_ordenada}
                              onChange={e => updateItem(idx, 'cantidad_ordenada', Math.max(1, Number(e.target.value)))}
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 text-xs text-center" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step="0.01" value={item.precio_unitario}
                              onChange={e => updateItem(idx, 'precio_unitario', Number(e.target.value))}
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 text-xs text-right" />
                          </td>
                          <td className="px-2 py-2">
                            {items.length > 1 && (
                              <button onClick={() => removeItem(idx)}
                                className="p-1 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className={`${btnPrimary} flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}>
                {saving ? 'Guardando…' : <><ShoppingBag className="w-4 h-4" />Crear Orden</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
