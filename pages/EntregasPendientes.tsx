import React, { useState, useEffect, useCallback } from 'react';
import { Truck, CheckCircle2, XCircle, Clock, RefreshCw, Building2, User, Package } from 'lucide-react';
import Swal from 'sweetalert2';
import { EntregasService } from '../services/api';
import { EntregaSucursal, EstadoEntrega } from '../types';

type Tab = 'Pendiente' | 'Entregado' | 'TODAS';

const TAB_LABELS: Record<Tab, string> = {
  Pendiente: 'Pendientes',
  Entregado: 'Entregadas',
  TODAS: 'Historial',
};

function estadoBadge(estado: EstadoEntrega) {
  if (estado === 'Pendiente')  return 'bg-amber-100 text-amber-700 border-amber-200';
  if (estado === 'Entregado')  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function EntregasPendientes() {
  const [tab, setTab] = useState<Tab>('Pendiente');
  const [rows, setRows] = useState<EntregaSucursal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError('');
    try {
      const data = await EntregasService.getPendientes(t === 'TODAS' ? 'TODAS' : t);
      setRows(data);
    } catch (e: any) {
      setError(e.message || 'Error cargando entregas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  // Poll every 30 seconds when on Pendientes tab
  useEffect(() => {
    if (tab !== 'Pendiente') return;
    const id = setInterval(() => load('Pendiente'), 30_000);
    return () => clearInterval(id);
  }, [tab, load]);

  const handleMarcarEntregado = async (row: EntregaSucursal) => {
    const { value: notas, isConfirmed } = await Swal.fire({
      title: 'Confirmar entrega',
      html: `<p class="text-sm text-slate-600 mb-2">Medicamento: <strong>${row.nombreMedicamento}</strong></p>
             <p class="text-sm text-slate-600 mb-2">Cliente: <strong>${row.nombreCliente}</strong></p>`,
      input: 'textarea',
      inputPlaceholder: 'Notas de entrega (opcional)...',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: 'Marcar entregado',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    });
    if (!isConfirmed) return;
    try {
      await EntregasService.marcarEntregado(row.id, notas || undefined);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Entrega registrada', showConfirmButton: false, timer: 2500 });
      load(tab);
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  };

  const handleCancelar = async (row: EntregaSucursal) => {
    const { value: notas, isConfirmed } = await Swal.fire({
      title: 'Cancelar entrega',
      html: `<p class="text-sm text-slate-600 mb-2">Medicamento: <strong>${row.nombreMedicamento}</strong></p>`,
      input: 'textarea',
      inputPlaceholder: 'Motivo de cancelación (opcional)...',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: 'Cancelar entrega',
      cancelButtonText: 'Atrás',
      confirmButtonColor: '#dc2626',
    });
    if (!isConfirmed) return;
    try {
      await EntregasService.cancelar(row.id, notas || undefined);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Entrega cancelada', showConfirmButton: false, timer: 2500 });
      load(tab);
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  };

  const pendingCount = tab === 'Pendiente' ? rows.length : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-2xl flex items-center justify-center shadow-sm">
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
              Entregas Pendientes
              {pendingCount > 0 && (
                <span className="text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </h1>
            <p className="text-xs text-slate-400">Medicamentos facturados en otra sucursal pendientes de entrega</p>
          </div>
        </div>
        <button
          onClick={() => load(tab)}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4 w-fit">
        {(['Pendiente', 'Entregado', 'TODAS'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === t ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-red-500 text-sm">{error}</div>
        ) : loading && rows.length === 0 ? (
          <div className="p-8 flex items-center justify-center gap-2 text-slate-400">
            <RefreshCw size={18} className="animate-spin" /> Cargando...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={36} className="mx-auto text-slate-200 mb-3" strokeWidth={1.5} />
            <p className="text-sm font-bold text-slate-400">
              {tab === 'Pendiente' ? 'No hay entregas pendientes' : 'No hay registros'}
            </p>
            {tab === 'Pendiente' && <p className="text-xs text-slate-300 mt-1">Las entregas aparecerán aquí cuando se facture desde otra sucursal.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Factura</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Medicamento</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Cliente</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Facturado en</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Fecha</th>
                  <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Estado</th>
                  {tab === 'Pendiente' && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-bold text-indigo-600 text-xs">#{row.codVenta}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                          <Package size={13} className="text-orange-500" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-xs leading-tight">{row.nombreMedicamento}</p>
                          <p className="text-[10px] text-slate-400">Cant: {row.cantidad}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <User size={11} className="text-slate-400 shrink-0" />
                        <span>{row.nombreCliente}</span>
                      </div>
                      {row.identidadCliente && <p className="text-[10px] text-slate-400 ml-4">{row.identidadCliente}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Building2 size={11} className="text-slate-400 shrink-0" />
                        <span>{row.sucursalFacturacion}</span>
                      </div>
                      {row.ciudadFacturacion && <p className="text-[10px] text-slate-400 ml-4">{row.ciudadFacturacion}</p>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">
                      {formatDate(row.fechaCreacion)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${estadoBadge(row.estado)}`}>
                        {row.estado}
                      </span>
                    </td>
                    {tab === 'Pendiente' && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleMarcarEntregado(row)}
                            className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                            title="Marcar entregado"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                          <button
                            onClick={() => handleCancelar(row)}
                            className="p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                            title="Cancelar"
                          >
                            <XCircle size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tab === 'Pendiente' && rows.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-3 text-center">
          <Clock size={11} className="inline mr-1" />
          Se actualiza automáticamente cada 30 segundos
        </p>
      )}
    </div>
  );
}
