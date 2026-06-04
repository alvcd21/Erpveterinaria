
import React, { useState, useEffect } from 'react';
import { MedicamentosService, SucursalesService } from '../services/api';
import { AlertaVencimiento, StockCritico, Sucursal } from '../types';
import { AlertTriangle, Package, Calendar, Filter, RefreshCw } from 'lucide-react';

type Tab = 'VENCIMIENTOS' | 'STOCK';

const ALERT_BADGE: Record<string, string> = {
  VENCIDO:   'bg-red-100 text-red-800',
  CRITICO:   'bg-orange-100 text-orange-800',
  ALERTA:    'bg-yellow-100 text-yellow-800',
  MONITOREO: 'bg-green-100 text-green-800',
};

const ALERT_ROW: Record<string, string> = {
  VENCIDO:   'bg-red-50/60',
  CRITICO:   'bg-orange-50/60',
  ALERTA:    'bg-yellow-50/40',
  MONITOREO: '',
};

const DIAS_OPTIONS = [30, 60, 90, 180];

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-slate-400 gap-3">
      <div className="text-slate-300">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col gap-1 min-w-[110px]">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-slate-500 font-medium">{label}</span>
    </div>
  );
}

export default function Vencimientos() {
  const [tab, setTab] = useState<Tab>('VENCIMIENTOS');

  const [alertas, setAlertas] = useState<AlertaVencimiento[]>([]);
  const [stock, setStock] = useState<StockCritico[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  const [loadingAlertas, setLoadingAlertas] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingSuc, setLoadingSuc] = useState(false);

  const [dias, setDias] = useState(90);
  const [idSucursal, setIdSucursal] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Track which tabs have been loaded
  const [alertasLoaded, setAlertasLoaded] = useState(false);
  const [stockLoaded, setStockLoaded] = useState(false);

  useEffect(() => {
    setLoadingSuc(true);
    SucursalesService.getAll()
      .then(setSucursales)
      .catch(() => {})
      .finally(() => setLoadingSuc(false));
  }, []);

  const fetchAlertas = async () => {
    setLoadingAlertas(true);
    try {
      const data = await MedicamentosService.getAlertasVencimiento(dias, idSucursal);
      setAlertas(data);
      setAlertasLoaded(true);
    } catch {
      setAlertas([]);
    } finally {
      setLoadingAlertas(false);
    }
  };

  const fetchStock = async () => {
    setLoadingStock(true);
    try {
      const data = await MedicamentosService.getStockCritico(idSucursal);
      setStock(data);
      setStockLoaded(true);
    } catch {
      setStock([]);
    } finally {
      setLoadingStock(false);
    }
  };

  // Initial load and when dias/sucursal changes
  useEffect(() => {
    if (tab === 'VENCIMIENTOS') {
      fetchAlertas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, idSucursal]);

  // Load stock on first visit to that tab
  useEffect(() => {
    if (tab === 'STOCK' && !stockLoaded) {
      fetchStock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleRefresh = () => {
    if (tab === 'VENCIMIENTOS') fetchAlertas();
    else fetchStock();
  };

  const handleTabSwitch = (next: Tab) => {
    setTab(next);
    if (next === 'STOCK' && !stockLoaded) {
      fetchStock();
    }
    if (next === 'VENCIMIENTOS' && !alertasLoaded) {
      fetchAlertas();
    }
  };

  // Counts for summary cards
  const counts = {
    VENCIDO:   alertas.filter(a => a.nivel_alerta === 'VENCIDO').length,
    CRITICO:   alertas.filter(a => a.nivel_alerta === 'CRITICO').length,
    ALERTA:    alertas.filter(a => a.nivel_alerta === 'ALERTA').length,
    MONITOREO: alertas.filter(a => a.nivel_alerta === 'MONITOREO').length,
  };

  const filteredAlertas = alertas.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.nombreGenerico.toLowerCase().includes(q) ||
      (a.nombreComercial ?? '').toLowerCase().includes(q) ||
      a.numeroLote.toLowerCase().includes(q)
    );
  });

  const filteredStock = stock.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.nombreGenerico.toLowerCase().includes(q) ||
      (s.categoria ?? '').toLowerCase().includes(q)
    );
  });

  const tabActive = 'bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium';
  const tabInactive = 'bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl px-4 py-2 text-sm font-medium transition-colors';
  const inputCls = 'p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm';
  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider';

  return (
    <div className="p-6 space-y-5 bg-[#f8fafc] min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Control de Vencimientos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monitoreo de fechas de vencimiento y stock crítico</p>
        </div>
        <button onClick={handleRefresh} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl px-4 py-2 text-sm font-medium transition-colors">
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button className={tab === 'VENCIMIENTOS' ? tabActive : tabInactive} onClick={() => handleTabSwitch('VENCIMIENTOS')}>
          <span className="flex items-center gap-2"><Calendar size={14} />Alertas de Vencimiento</span>
        </button>
        <button className={tab === 'STOCK' ? tabActive : tabInactive} onClick={() => handleTabSwitch('STOCK')}>
          <span className="flex items-center gap-2"><Package size={14} />Stock Crítico</span>
        </button>
      </div>

      {/* ── VENCIMIENTOS TAB ── */}
      {tab === 'VENCIMIENTOS' && (
        <>
          {/* Summary Cards */}
          <div className="flex flex-wrap gap-3">
            <StatCard label="Vencidos"   value={counts.VENCIDO}   color="text-red-600" />
            <StatCard label="Críticos"   value={counts.CRITICO}   color="text-orange-600" />
            <StatCard label="En Alerta"  value={counts.ALERTA}    color="text-yellow-600" />
            <StatCard label="Monitoreo"  value={counts.MONITOREO} color="text-green-600" />
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-wrap gap-3 items-center">
            <Filter size={14} className="text-slate-400" />
            <select
              value={dias}
              onChange={e => setDias(Number(e.target.value))}
              className={inputCls}
            >
              {DIAS_OPTIONS.map(d => (
                <option key={d} value={d}>Próximos {d} días</option>
              ))}
            </select>
            <select
              value={idSucursal ?? ''}
              onChange={e => setIdSucursal(e.target.value === '' ? undefined : Number(e.target.value))}
              className={inputCls}
              disabled={loadingSuc}
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => (
                <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Buscar medicamento o lote..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputCls} min-w-[220px] flex-1`}
            />
            <span className="ml-auto text-xs text-slate-400">{filteredAlertas.length} resultado(s)</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 overflow-x-auto">
            {loadingAlertas ? (
              <Spinner />
            ) : filteredAlertas.length === 0 ? (
              <EmptyState icon={<Calendar size={40} />} message="No se encontraron alertas de vencimiento para los filtros seleccionados." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={thCls}>Medicamento</th>
                    <th className={thCls}>Lote</th>
                    <th className={thCls}>Fecha Vencimiento</th>
                    <th className={thCls}>Cantidad Actual</th>
                    <th className={thCls}>Días para Vencer</th>
                    <th className={thCls}>Nivel Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlertas.map(a => (
                    <tr
                      key={`${a.codigo}-${a.idLote}`}
                      className={`border-t border-slate-50 hover:bg-slate-50/50 transition-colors ${ALERT_ROW[a.nivel_alerta] ?? ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{a.nombreGenerico}</span>
                        {a.nombreComercial && (
                          <span className="block text-xs text-slate-400">{a.nombreComercial}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.numeroLote}</td>
                      <td className="px-4 py-3 text-slate-600">{a.fechaVencimientoDisplay}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{a.cantidadActual}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.dias_para_vencer < 0
                          ? `${Math.abs(a.dias_para_vencer)} días vencido`
                          : `${a.dias_para_vencer} días`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ALERT_BADGE[a.nivel_alerta] ?? 'bg-slate-100 text-slate-600'}`}>
                          {a.nivel_alerta}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── STOCK CRITICO TAB ── */}
      {tab === 'STOCK' && (
        <>
          {/* Summary Card */}
          <div className="flex flex-wrap gap-3">
            <StatCard label="Productos en stock crítico" value={stock.filter(s => s.stockActual <= s.stockMinimo).length} color="text-red-600" />
            <StatCard label="En punto de reorden"        value={stock.filter(s => s.stockActual > s.stockMinimo && s.stockActual <= s.puntoReorden).length} color="text-yellow-600" />
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-wrap gap-3 items-center">
            <Filter size={14} className="text-slate-400" />
            <select
              value={idSucursal ?? ''}
              onChange={e => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                setIdSucursal(val);
                setStockLoaded(false);
                fetchStock();
              }}
              className={inputCls}
              disabled={loadingSuc}
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => (
                <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Buscar medicamento o categoría..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputCls} min-w-[220px] flex-1`}
            />
            <span className="ml-auto text-xs text-slate-400">{filteredStock.length} resultado(s)</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 overflow-x-auto">
            {loadingStock ? (
              <Spinner />
            ) : filteredStock.length === 0 ? (
              <EmptyState icon={<Package size={40} />} message="No se encontraron productos con stock crítico." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={thCls}>Medicamento</th>
                    <th className={thCls}>Categoría</th>
                    <th className={thCls}>Stock Actual</th>
                    <th className={thCls}>Stock Mínimo</th>
                    <th className={thCls}>Punto Reorden</th>
                    <th className={thCls}>Déficit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map(s => {
                    const isCritical = s.stockActual <= s.stockMinimo;
                    const isReorden  = !isCritical && s.stockActual <= s.puntoReorden;
                    const rowCls = isCritical ? 'bg-red-50/60' : isReorden ? 'bg-yellow-50/40' : '';
                    const deficit = s.stockMinimo - s.stockActual;
                    return (
                      <tr key={s.codigo} className={`border-t border-slate-50 hover:bg-slate-50/50 transition-colors ${rowCls}`}>
                        <td className="px-4 py-3 font-medium text-slate-800">{s.nombreGenerico}</td>
                        <td className="px-4 py-3 text-slate-500">{s.categoria ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${isCritical ? 'text-red-600' : isReorden ? 'text-yellow-600' : 'text-slate-700'}`}>
                            {s.stockActual}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.stockMinimo}</td>
                        <td className="px-4 py-3 text-slate-600">{s.puntoReorden}</td>
                        <td className="px-4 py-3">
                          {deficit > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                              <AlertTriangle size={12} />
                              {deficit}
                            </span>
                          ) : (
                            <span className="text-green-600 font-medium">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
