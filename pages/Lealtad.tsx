import React, { useState, useEffect, useCallback } from 'react';
import {
  Star, BarChart2, Settings, Users, ScrollText, SlidersHorizontal,
  Search, RefreshCw, Save, ChevronLeft, ChevronRight,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LoyaltyService } from '../services/api';
import type {
  LoyaltyConfig, LoyaltyAccount, LoyaltyTransaction,
  LoyaltyStats, LoyaltyTier, LoyaltyTxTipo,
} from '../types';

type Tab = 'resumen' | 'configuracion' | 'cuentas' | 'historial' | 'ajustes';

const TIER_CLS: Record<LoyaltyTier, string> = {
  bronze: 'bg-amber-100 text-amber-700',
  silver: 'bg-slate-100 text-slate-500',
  gold:   'bg-yellow-100 text-yellow-700',
};
const TX_CLS: Partial<Record<LoyaltyTxTipo, string>> = {
  earn: 'bg-emerald-100 text-emerald-700', redeem: 'bg-indigo-100 text-indigo-700',
  expire: 'bg-slate-100 text-slate-500', adjust: 'bg-sky-100 text-sky-700',
  reversal: 'bg-orange-100 text-orange-700', bonus: 'bg-purple-100 text-purple-700',
};
const TX_LABELS: Partial<Record<LoyaltyTxTipo, string>> = {
  earn: 'Ganados', redeem: 'Canjeados', expire: 'Expirados',
  adjust: 'Ajuste', reversal: 'Reversal', bonus: 'Bonus',
};

function fdt(iso: string) {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
}

const INPUT_CLS = 'py-1.5 px-2.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-300 transition-all';

function Spinner() {
  return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-slate-300" /></div>;
}
function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${TIER_CLS[tier as LoyaltyTier] || 'bg-slate-100 text-slate-500'}`}>
      {tier.toUpperCase()}
    </span>
  );
}
function StatCard({ label, value, sub, cls }: { label: string; value: string; sub: string; cls: string }) {
  return (
    <div className={`rounded-2xl p-4 ${cls}`}>
      <p className="text-2xl font-black leading-none">{value}</p>
      <p className="text-[11px] font-bold text-slate-700 mt-1">{label}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">{title}</p>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-slate-600 flex-1">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-slate-200'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ── Tab: Resumen ──────────────────────────────────────────────────────────────

function ResumenTab() {
  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [cfg, setCfg]     = useState<LoyaltyConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([LoyaltyService.getStats(), LoyaltyService.getConfig()])
      .then(([s, c]) => { setStats(s); setCfg(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  const a = stats?.cuentas;
  if (!a) return <p className="text-sm text-slate-400 py-8 text-center">Sin datos disponibles</p>;

  return (
    <div className="space-y-5">
      {cfg && (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold border ${
          cfg.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'
        }`}>
          <Star size={13} className={cfg.activo ? 'fill-emerald-500 text-emerald-500' : ''} />
          {cfg.activo ? `${cfg.nombrePrograma} — Activo` : 'Programa de lealtad — Inactivo'}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total cuentas"   value={Number(a.total_cuentas).toLocaleString()}            sub="clientes inscritos"       cls="bg-indigo-50 text-indigo-600" />
        <StatCard label="Pts circulando"  value={Number(a.puntos_en_circulacion).toLocaleString()}    sub="puntos disponibles"       cls="bg-amber-50 text-amber-600"  />
        <StatCard label="Activos 30 días" value={Number(a.activos_30d).toLocaleString()}              sub="con movimiento reciente"  cls="bg-emerald-50 text-emerald-600" />
        <StatCard label="Gold + Silver"
          value={(Number(a.cuentas_gold) + Number(a.cuentas_silver)).toLocaleString()}
          sub={`${a.cuentas_gold} oro · ${a.cuentas_silver} plata`}
          cls="bg-yellow-50 text-yellow-600" />
      </div>

      {stats && stats.transacciones30d.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-2">Transacciones — últimos 30 días</p>
          <div className="rounded-2xl overflow-hidden border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                {['Tipo', 'Operaciones', 'Puntos totales'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {stats.transacciones30d.map(tx => (
                  <tr key={tx.tipo}>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TX_CLS[tx.tipo as LoyaltyTxTipo] || 'bg-slate-100 text-slate-500'}`}>
                        {TX_LABELS[tx.tipo as LoyaltyTxTipo] || tx.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold text-slate-600">{Number(tx.cantidad).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-slate-600">{Number(tx.puntos_total).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Configuración ────────────────────────────────────────────────────────

const EMPTY_CFG: LoyaltyConfig = {
  activo: false, nombrePrograma: 'Programa de Lealtad',
  earnRate: 1, earnMinPurchase: 0, redeemRate: 100, redeemMinPoints: 500, redeemMaxPct: 30,
  expiryMonths: 12, expiryType: 'rolling', tierEnabled: false,
  tierThresholds: { silver: 5000, gold: 15000 }, tierMultipliers: { bronze: 1.0, silver: 1.5, gold: 2.0 },
  bonusBirthdayPts: 0, bonusEnrollmentPts: 0, excludedCategories: [], excludeIhss: true,
};

function ConfiguracionTab() {
  const [draft, setDraft] = useState<LoyaltyConfig>(EMPTY_CFG);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    LoyaltyService.getConfig().then(c => setDraft(c)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof LoyaltyConfig>(k: K, v: LoyaltyConfig[K]) => setDraft(d => ({ ...d, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await LoyaltyService.saveConfig(draft);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Configuración guardada', showConfirmButton: false, timer: 2000 });
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo guardar', 'error');
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4 max-w-2xl">
      <Section title="General">
        <FieldRow label="Programa activo"><Toggle on={draft.activo} onChange={v => set('activo', v)} /></FieldRow>
        <FieldRow label="Nombre del programa">
          <input value={draft.nombrePrograma} onChange={e => set('nombrePrograma', e.target.value.slice(0, 100))} className={`${INPUT_CLS} w-56`} />
        </FieldRow>
        <FieldRow label="Puntos por L1 gastado">
          <input type="number" min={0} step={0.1} value={draft.earnRate} onChange={e => set('earnRate', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
        </FieldRow>
        <FieldRow label="Compra mínima para ganar (L)">
          <input type="number" min={0} value={draft.earnMinPurchase} onChange={e => set('earnMinPurchase', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
        </FieldRow>
      </Section>

      <Section title="Canje de puntos">
        <FieldRow label="Puntos necesarios por L1 de descuento">
          <input type="number" min={1} value={draft.redeemRate} onChange={e => set('redeemRate', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
        </FieldRow>
        <FieldRow label="Puntos mínimos para canjear">
          <input type="number" min={0} step={100} value={draft.redeemMinPoints} onChange={e => set('redeemMinPoints', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
        </FieldRow>
        <FieldRow label="Máximo % del total canjeable">
          <input type="number" min={1} max={100} value={draft.redeemMaxPct} onChange={e => set('redeemMaxPct', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
        </FieldRow>
      </Section>

      <Section title="Vencimiento de puntos">
        <FieldRow label="Tipo">
          <div className="flex gap-0.5 bg-slate-100 rounded-xl p-0.5">
            {(['rolling', 'anniversary', 'never'] as const).map(t => (
              <button key={t} onClick={() => set('expiryType', t)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                  draft.expiryType === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}>
                {t === 'rolling' ? 'Renovable' : t === 'anniversary' ? 'Aniversario' : 'Nunca'}
              </button>
            ))}
          </div>
        </FieldRow>
        {draft.expiryType !== 'never' && (
          <FieldRow label="Meses para vencer">
            <input type="number" min={1} max={60} value={draft.expiryMonths} onChange={e => set('expiryMonths', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
          </FieldRow>
        )}
      </Section>

      <Section title="Niveles (tiers)">
        <FieldRow label="Habilitar tiers"><Toggle on={draft.tierEnabled} onChange={v => set('tierEnabled', v)} /></FieldRow>
        {draft.tierEnabled && <>
          <FieldRow label="Umbral Silver (pts vitalicios)">
            <input type="number" min={0} step={500} value={draft.tierThresholds.silver}
              onChange={e => set('tierThresholds', { ...draft.tierThresholds, silver: Number(e.target.value) })} className={`${INPUT_CLS} w-28`} />
          </FieldRow>
          <FieldRow label="Umbral Gold (pts vitalicios)">
            <input type="number" min={0} step={500} value={draft.tierThresholds.gold}
              onChange={e => set('tierThresholds', { ...draft.tierThresholds, gold: Number(e.target.value) })} className={`${INPUT_CLS} w-28`} />
          </FieldRow>
          <FieldRow label="Multiplicadores B / S / G">
            <div className="flex gap-2">
              {(['bronze', 'silver', 'gold'] as const).map(t => (
                <div key={t} className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-bold capitalize">{t[0]}:</span>
                  <input type="number" min={1} max={5} step={0.1} value={draft.tierMultipliers[t]}
                    onChange={e => set('tierMultipliers', { ...draft.tierMultipliers, [t]: Number(e.target.value) })}
                    className={`${INPUT_CLS} w-16`} />
                </div>
              ))}
            </div>
          </FieldRow>
        </>}
      </Section>

      <Section title="Bonificaciones y exclusiones">
        <FieldRow label="Pts de bienvenida (inscripción)">
          <input type="number" min={0} step={50} value={draft.bonusEnrollmentPts} onChange={e => set('bonusEnrollmentPts', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
        </FieldRow>
        <FieldRow label="Pts de cumpleaños">
          <input type="number" min={0} step={50} value={draft.bonusBirthdayPts} onChange={e => set('bonusBirthdayPts', Number(e.target.value))} className={`${INPUT_CLS} w-28`} />
        </FieldRow>
        <FieldRow label="Excluir compras IHSS"><Toggle on={draft.excludeIhss} onChange={v => set('excludeIhss', v)} /></FieldRow>
      </Section>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl font-black text-sm transition-all">
        {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
        Guardar configuración
      </button>
    </div>
  );
}

// ── Tab: Cuentas ──────────────────────────────────────────────────────────────

function CuentasTab({ onSelect }: { onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [data, setData]     = useState<{ rows: LoyaltyAccount[]; total: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const LIMIT = 20;

  const load = useCallback(async (off = 0, q = '') => {
    setLoading(true);
    try {
      const r = await LoyaltyService.getAccounts({ limit: LIMIT, offset: off, search: q || undefined });
      setData(r); setOffset(off);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(0, search)}
            placeholder="Identidad o nombre…"
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400/30" />
        </div>
        <button onClick={() => load(0, search)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">Buscar</button>
      </div>

      {loading ? <Spinner /> : data && <>
        <div className="rounded-2xl overflow-hidden border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              {['Identidad', 'Cliente', 'Pts disponibles', 'Pts vitalicios', 'Tier', 'Inscripción'].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">Sin resultados</td></tr>
              )}
              {data.rows.map(row => (
                <tr key={row.id} onClick={() => onSelect(row.identidadCliente)}
                  className="hover:bg-indigo-50 cursor-pointer transition-colors">
                  <td className="px-3 py-2.5 font-mono text-indigo-600 font-bold text-xs">{row.identidadCliente}</td>
                  <td className="px-3 py-2.5 text-slate-700 text-xs truncate max-w-[140px]">{row.nombreCliente || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-black text-amber-600 text-sm">{(row.puntosDisponibles || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-400">{(row.puntosVitalicios || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5"><TierBadge tier={row.tierActual} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{fdt(row.fechaInscripcion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{data.total.toLocaleString()} cuentas</span>
          <div className="flex items-center gap-1">
            <button onClick={() => load(Math.max(0, offset - LIMIT), search)} disabled={offset === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
            <span className="px-2 font-bold">{Math.floor(offset / LIMIT) + 1} / {Math.max(1, Math.ceil(data.total / LIMIT))}</span>
            <button onClick={() => load(offset + LIMIT, search)} disabled={offset + LIMIT >= data.total}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      </>}
    </div>
  );
}

// ── Tab: Historial ────────────────────────────────────────────────────────────

function HistorialTab({ initialId = '' }: { initialId?: string }) {
  const [id, setId]       = useState(initialId);
  const [txs, setTxs]     = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const load = useCallback(async (val: string) => {
    if (!val.trim()) return;
    setLoading(true); setSearched(true);
    try { setTxs(await LoyaltyService.getTransactions(val.trim(), 100)); }
    catch { setTxs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (initialId) load(initialId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={id} onChange={e => setId(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(id)}
          placeholder="Identidad del cliente (DNI)…"
          className="flex-1 pl-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400/30" />
        <button onClick={() => load(id)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">Buscar</button>
      </div>

      {loading ? <Spinner /> : searched && (
        txs.length === 0
          ? <p className="text-center text-sm text-slate-400 py-8">Sin transacciones para este cliente</p>
          : <div className="rounded-2xl overflow-hidden border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr>
                  {['Tipo', 'Delta', 'Antes → Después', 'Factura', 'Fecha'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {txs.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TX_CLS[tx.tipo] || 'bg-slate-100 text-slate-500'}`}>
                          {TX_LABELS[tx.tipo] || tx.tipo}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 font-black text-sm ${tx.puntosDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {tx.puntosDelta >= 0 ? '+' : ''}{tx.puntosDelta}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{tx.puntosAntes} → {tx.puntosDespues}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-indigo-600">{tx.codVenta || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{fdt(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}
    </div>
  );
}

// ── Tab: Ajustes ──────────────────────────────────────────────────────────────

function AjustesTab() {
  const [identidad, setIdentidad] = useState('');
  const [account, setAccount]     = useState<LoyaltyAccount | null>(null);
  const [delta, setDelta]         = useState(0);
  const [desc, setDesc]           = useState('');
  const [loading, setLoading]     = useState(false);

  const buscar = async () => {
    if (!identidad.trim()) return;
    setLoading(true);
    try { setAccount((await LoyaltyService.getAccount(identidad.trim())) as any); }
    catch { setAccount(null); Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Cuenta no encontrada', showConfirmButton: false, timer: 2000 }); }
    finally { setLoading(false); }
  };

  const handleAjuste = async () => {
    if (!account || !delta) return;
    const { isConfirmed } = await Swal.fire({
      title: 'Confirmar ajuste',
      html: `<p class="text-sm text-slate-600">Identidad: <strong>${identidad}</strong></p>
             <p class="text-sm mt-1">Delta: <strong class="${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}">${delta >= 0 ? '+' : ''}${delta} pts</strong></p>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar', confirmButtonColor: '#4f46e5',
    });
    if (!isConfirmed) return;
    setLoading(true);
    try {
      await LoyaltyService.adjust(account.id, delta, desc || undefined);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Ajuste aplicado', showConfirmButton: false, timer: 2000 });
      setAccount((await LoyaltyService.getAccount(identidad)) as any);
      setDelta(0); setDesc('');
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo aplicar el ajuste', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-xs text-slate-400">Busca una cuenta por identidad para aplicar un ajuste manual de puntos.</p>
      <div className="flex gap-2">
        <input value={identidad} onChange={e => setIdentidad(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Identidad del cliente (DNI)…"
          className="flex-1 pl-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400/30" />
        <button onClick={buscar} disabled={loading}
          className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
          {loading ? '…' : 'Buscar'}
        </button>
      </div>

      {account && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Cuenta #{account.id}</p>
              <p className="text-2xl font-black text-amber-700 mt-0.5 leading-none">{(account.puntosDisponibles || 0).toLocaleString()} pts</p>
              <p className="text-[10px] text-amber-500 mt-0.5">{(account.puntosVitalicios || 0).toLocaleString()} vitalicios</p>
            </div>
            <TierBadge tier={account.tierActual || 'bronze'} />
          </div>

          <div className="space-y-2 pt-3 border-t border-amber-200">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Ajuste (positivo o negativo)</span>
              <input type="number" value={delta || ''} onChange={e => setDelta(parseInt(e.target.value) || 0)}
                onFocus={e => e.target.select()}
                className={`${INPUT_CLS} w-28 text-right font-black ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : ''}`} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Motivo</span>
              <input value={desc} onChange={e => setDesc(e.target.value.slice(0, 255))}
                placeholder="Ej: Corrección manual" className={`${INPUT_CLS} w-44`} />
            </div>
          </div>

          <button onClick={handleAjuste} disabled={loading || !delta}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-black text-sm transition-all">
            {loading ? 'Procesando…' : `Aplicar ${delta >= 0 ? '+' : ''}${delta || 0} pts`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'resumen',       label: 'Resumen',       icon: <BarChart2 size={14} /> },
  { id: 'configuracion', label: 'Configuración', icon: <Settings size={14} /> },
  { id: 'cuentas',       label: 'Cuentas',       icon: <Users size={14} /> },
  { id: 'historial',     label: 'Historial',     icon: <ScrollText size={14} /> },
  { id: 'ajustes',       label: 'Ajustes',       icon: <SlidersHorizontal size={14} /> },
];

export default function Lealtad() {
  const [tab, setTab]         = useState<Tab>('resumen');
  const [historialId, setHistorialId] = useState('');

  const goToHistorial = useCallback((id: string) => {
    setHistorialId(id);
    setTab('historial');
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center shrink-0">
          <Star size={18} className="text-white fill-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-800">Programa de Lealtad</h1>
          <p className="text-xs text-slate-400">Configuración, cuentas y seguimiento de puntos</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-black whitespace-nowrap transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'resumen'       && <ResumenTab />}
          {tab === 'configuracion' && <ConfiguracionTab />}
          {tab === 'cuentas'       && <CuentasTab onSelect={goToHistorial} />}
          {tab === 'historial'     && <HistorialTab key={historialId} initialId={historialId} />}
          {tab === 'ajustes'       && <AjustesTab />}
        </div>
      </div>
    </div>
  );
}
