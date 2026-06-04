import React from 'react';

/* ── CSS tokens ──────────────────────────────────────────── */
export const inp         = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none transition';
export const inpSm       = 'px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition';
export const btnPrimary  = 'inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors shadow-sm';
export const btnSecondary= 'inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium transition-colors';
export const btnIcon     = 'p-1.5 rounded-lg transition-colors';

export const alertBadge: Record<string, string> = {
  VENCIDO:   'bg-red-100 text-red-700 border border-red-200',
  CRITICO:   'bg-orange-100 text-orange-700 border border-orange-200',
  ALERTA:    'bg-amber-100 text-amber-700 border border-amber-200',
  MONITOREO: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

export const VIAS        = ['Oral', 'Topica', 'Intravenosa', 'Intramuscular', 'Inhalada', 'Rectal', 'Sublingual'];
export const ALMACENAMIENTO = ['Temperatura ambiente', 'Refrigerado 2-8°C', 'Protegido de luz'];

/* ── Tab types ───────────────────────────────────────────── */
export type MainTab   = 'MEDICAMENTOS' | 'LOTES' | 'ALERTAS';
export type DetailTab = 'RESUMEN' | 'PRESENTACIONES' | 'LOTES' | 'FICHA' | 'IMAGENES';

/* ── Blank form factories ────────────────────────────────── */
export const blankMed = () => ({
  nombre_generico: '', nombre_comercial: '', concentracion: '', via_administracion: 'Oral',
  tipo_isv: 'exento' as const, condicion_almacenamiento: 'Temperatura ambiente',
  requiere_receta: false, es_controlado: false, pais_origen: 'Honduras',
  margen_ganancia: 30, stock_minimo: 10, punto_reorden: 20,
});

export const blankPres = () => ({
  nombre: '', factor_conversion: 1, precio_venta: 0, es_unidad_compra: false,
  es_unidad_venta: true, permite_fraccion: false, activo: true,
});

export const blankLote = () => ({
  numero_lote: '', mes_vencimiento: 1, anio_vencimiento: new Date().getFullYear() + 1,
  cantidad: 1, id_presentacion: 0, precio_compra_presentacion: 0, id_proveedor: '', id_sucursal: 0, notas: '',
});

export type LoteFormData = ReturnType<typeof blankLote>;

/* ── Micro-components ────────────────────────────────────── */
export function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="animate-spin rounded-full h-9 w-9 border-[3px] border-indigo-200 border-t-indigo-600" />
      <p className="text-sm text-slate-400">Cargando…</p>
    </div>
  );
}

export function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{children}</span>;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500 mb-1">{children}</label>;
}

export function isvBadge(v: string) {
  const map: Record<string, string> = { exento: 'bg-slate-100 text-slate-600', '15': 'bg-blue-100 text-blue-700', '18': 'bg-purple-100 text-purple-700' };
  return <Badge cls={map[v] || 'bg-slate-100 text-slate-600'}>{v === 'exento' ? 'Exento' : `${v}%`}</Badge>;
}

export function catalogStatusBadge(status?: string) {
  const map: Record<string, string> = {
    'Borrador': 'bg-slate-100 text-slate-600 border border-slate-200',
    'Sin stock': 'bg-amber-100 text-amber-700 border border-amber-200',
    'Listo para venta': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  };
  return <Badge cls={map[status || ''] || map.Borrador}>{status || 'Borrador'}</Badge>;
}
