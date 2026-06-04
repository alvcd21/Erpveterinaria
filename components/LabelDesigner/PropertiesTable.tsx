import React from 'react';
import { Trash2 } from 'lucide-react';
import { InvoiceColumn, SummaryRow } from '../../types';
import PropertyInput from './PropertyInput';

const defaultCols: InvoiceColumn[] = [
    { id: 'c1', header: 'Medicamento',  field: '{{item.descripcion}}', widthPct: 45, align: 'left',   format: 'TEXT'     },
    { id: 'c2', header: 'Cantidad',     field: '{{item.cantidad}}',    widthPct: 10, align: 'center', format: 'NUMBER'   },
    { id: 'c3', header: 'P. Unitario',  field: '{{item.precioVenta}}', widthPct: 15, align: 'right',  format: 'CURRENCY' },
    { id: 'c4', header: 'ISV (15%)',    field: '{{item.isv}}',         widthPct: 10, align: 'right',  format: 'CURRENCY' },
    { id: 'c5', header: 'Total',        field: '{{item.total}}',       widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

interface Props {
    sel: any;
    updateElement: (id: string, updates: any) => void;
}

export default function PropertiesTable({ sel, updateElement }: Props) {
    const upd = (u: any) => updateElement(sel.id, u);

    return (
        <>
            {/* SHAPE */}
            {sel.type === 'SHAPE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Estilo</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Relleno</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={sel.fill === 'transparent' ? '#ffffff' : (sel.fill || '#ffffff')} onChange={e => upd({ fill: e.target.value })} className="h-8 w-8 rounded cursor-pointer border-0"/>
                                <button onClick={() => upd({ fill: 'transparent' })} className="text-[10px] px-2 py-1 bg-slate-100 rounded border">None</button>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Borde</label>
                            <input type="color" value={sel.stroke || '#000000'} onChange={e => upd({ stroke: e.target.value })} className="h-8 w-full rounded cursor-pointer border-0"/>
                        </div>
                    </div>
                    <PropertyInput label="Grosor Borde" value={sel.strokeWidth || 0.5} onChange={(v: any) => upd({ strokeWidth: v })} type="number" step={0.5}/>
                    <PropertyInput label="Radio Esquinas (px)" value={sel.borderRadius || 0} onChange={(v: any) => upd({ borderRadius: v })} type="number"/>
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={sel.gradientEnabled || false} onChange={e => upd({ gradientEnabled: e.target.checked })} className="rounded text-indigo-600"/>
                            <label className="text-xs font-medium text-slate-600">Usar degradado</label>
                        </div>
                        {sel.gradientEnabled && (
                            <>
                                <div className="flex gap-1">
                                    {(['linear', 'radial'] as const).map(t => (
                                        <button key={t} onClick={() => upd({ gradientType: t })}
                                            className={`flex-1 py-1 text-[11px] rounded-lg border font-bold transition-all ${(sel.gradientType || 'linear') === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                                            {t === 'linear' ? 'Lineal' : 'Radial'}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color 1</label>
                                        <input type="color" value={sel.gradientColor1 || '#4f46e5'} onChange={e => upd({ gradientColor1: e.target.value })} className="h-8 w-full rounded cursor-pointer border-0"/>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color 2</label>
                                        <input type="color" value={sel.gradientColor2 || '#818cf8'} onChange={e => upd({ gradientColor2: e.target.value })} className="h-8 w-full rounded cursor-pointer border-0"/>
                                    </div>
                                </div>
                                {(sel.gradientType || 'linear') === 'linear' && (
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ángulo ({sel.gradientAngle ?? 135}°)</label>
                                        <input type="range" min={0} max={360} value={sel.gradientAngle ?? 135} onChange={e => upd({ gradientAngle: parseInt(e.target.value) })} className="w-full accent-indigo-600"/>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* SUMMARY_BOX */}
            {sel.type === 'SUMMARY_BOX' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Caja de Totales</h4>
                    <PropertyInput label="Tamaño Fuente (pt)" value={sel.summaryFontSize || 9} onChange={(v: any) => upd({ summaryFontSize: v })} type="number" step={0.5}/>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Etiqueta</label>
                            <input type="color" value={sel.summaryLabelColor || '#000000'} onChange={e => upd({ summaryLabelColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Valor</label>
                            <input type="color" value={sel.summaryValueColor || '#000000'} onChange={e => upd({ summaryValueColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label>
                        <div className="flex gap-2">
                            <input type="color" value={sel.summaryBg === 'transparent' ? '#ffffff' : (sel.summaryBg || '#ffffff')} onChange={e => upd({ summaryBg: e.target.value })} className="h-8 w-12 rounded cursor-pointer border border-slate-200"/>
                            <button onClick={() => upd({ summaryBg: 'transparent' })} className="text-xs px-2 py-1 bg-slate-100 rounded border">Ninguno</button>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h5 className="font-bold text-xs text-slate-700">Filas</h5>
                            <button onClick={() => {
                                const rows = sel.summaryRows || [];
                                const newRow: SummaryRow = { id: `sr${Date.now()}`, label: 'Fila:', field: '', format: 'CURRENCY', bold: false };
                                upd({ summaryRows: [...rows, newRow] });
                            }} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100">+ Fila</button>
                        </div>
                        {(sel.summaryRows || []).map((row: SummaryRow, ri: number) => (
                            <div key={row.id} className="bg-slate-50 rounded-lg p-2 mb-2 space-y-1 border border-slate-100">
                                <div className="flex gap-1">
                                    <input value={row.label} onChange={e => {
                                        const rows = [...(sel.summaryRows || [])];
                                        rows[ri] = { ...rows[ri], label: e.target.value };
                                        upd({ summaryRows: rows });
                                    }} className="text-xs bg-white border rounded px-2 py-1 flex-1" placeholder="Etiqueta"/>
                                    <button onClick={() => {
                                        const rows = (sel.summaryRows || []).filter((_: any, i: number) => i !== ri);
                                        upd({ summaryRows: rows });
                                    }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12}/></button>
                                </div>
                                <input value={row.field} onChange={e => {
                                    const rows = [...(sel.summaryRows || [])];
                                    rows[ri] = { ...rows[ri], field: e.target.value };
                                    upd({ summaryRows: rows });
                                }} className="text-xs bg-white border rounded px-2 py-1 w-full font-mono" placeholder="{{venta.total}}"/>
                                <div className="flex gap-2 items-center">
                                    <select value={row.format} onChange={e => {
                                        const rows = [...(sel.summaryRows || [])];
                                        rows[ri] = { ...rows[ri], format: e.target.value as any };
                                        upd({ summaryRows: rows });
                                    }} className="text-xs bg-white border rounded px-1 py-1 flex-1">
                                        <option value="TEXT">Texto</option>
                                        <option value="CURRENCY">Moneda</option>
                                        <option value="NUMBER">Número</option>
                                    </select>
                                    <label className="flex items-center gap-1 text-xs text-slate-600">
                                        <input type="checkbox" checked={row.bold || false} onChange={e => {
                                            const rows = [...(sel.summaryRows || [])];
                                            rows[ri] = { ...rows[ri], bold: e.target.checked };
                                            upd({ summaryRows: rows });
                                        }} className="rounded text-indigo-600"/> Negrita
                                    </label>
                                    <label className="flex items-center gap-1 text-xs text-slate-600">
                                        <input type="checkbox" checked={row.separator || false} onChange={e => {
                                            const rows = [...(sel.summaryRows || [])];
                                            rows[ri] = { ...rows[ri], separator: e.target.checked };
                                            upd({ summaryRows: rows });
                                        }} className="rounded text-indigo-600"/> Línea
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <input type="checkbox" id="canGrowSummary" checked={sel.canGrow ?? false} onChange={e => upd({ canGrow: e.target.checked })} className="rounded accent-blue-600"/>
                        <div>
                            <label htmlFor="canGrowSummary" className="text-xs font-bold text-blue-700 block cursor-pointer">Puede Crecer (Can Grow)</label>
                            <span className="text-[10px] text-blue-500">Expande y desplaza elementos debajo al imprimir</span>
                        </div>
                    </div>
                </div>
            )}

            {/* INVOICE_TABLE */}
            {sel.type === 'INVOICE_TABLE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Configuración de Tabla</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo Encabezado</label>
                            <input type="color" value={sel.tableHeaderBg || '#1e293b'} onChange={e => upd({ tableHeaderBg: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Texto Enc.</label>
                            <input type="color" value={sel.tableHeaderColor || '#ffffff'} onChange={e => upd({ tableHeaderColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    </div>
                    <PropertyInput label="Alto de Fila" value={sel.tableRowHeight || 8} onChange={(v: any) => upd({ tableRowHeight: v })} type="number"/>
                    <PropertyInput label="Tamaño Fuente Tabla" value={sel.tableFontSize || 9} onChange={(v: any) => upd({ tableFontSize: v })} type="number"/>
                    <div className="flex items-center gap-2 py-1">
                        <input type="checkbox" id="altrows" checked={sel.tableAlternateRows ?? true} onChange={e => upd({ tableAlternateRows: e.target.checked })} className="rounded text-indigo-600"/>
                        <label htmlFor="altrows" className="text-xs font-medium text-slate-600">Filas alternadas</label>
                    </div>
                    <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <input type="checkbox" id="canGrow" checked={sel.canGrow ?? false} onChange={e => upd({ canGrow: e.target.checked })} className="rounded accent-blue-600"/>
                        <div>
                            <label htmlFor="canGrow" className="text-xs font-bold text-blue-700 block cursor-pointer">Puede Crecer (Can Grow)</label>
                            <span className="text-[10px] text-blue-500">Expande y desplaza elementos debajo al imprimir</span>
                        </div>
                    </div>
                    {(sel.tableAlternateRows ?? true) && (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Fila Alterna</label>
                            <input type="color" value={sel.tableAlternateBg || '#f8fafc'} onChange={e => upd({ tableAlternateBg: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    )}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h5 className="font-bold text-xs text-slate-700">Columnas</h5>
                            <div className="flex items-center gap-1">
                                {(() => {
                                    const total = (sel.tableColumns || defaultCols).reduce((s: number, c: InvoiceColumn) => s + c.widthPct, 0);
                                    return (
                                        <button title="Normalizar anchos al 100%" onClick={() => {
                                            const cols = sel.tableColumns || defaultCols;
                                            const even = Math.floor(100 / cols.length);
                                            const rem = 100 - even * (cols.length - 1);
                                            upd({ tableColumns: cols.map((c: InvoiceColumn, i: number) => ({ ...c, widthPct: i === cols.length - 1 ? rem : even })) });
                                        }} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${Math.abs(total - 100) > 1 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                                            {total}%
                                        </button>
                                    );
                                })()}
                                <button onClick={() => {
                                    const cols = sel.tableColumns || defaultCols;
                                    const newCol: InvoiceColumn = { id: `c${Date.now()}`, header: 'Columna', field: '', widthPct: 10, align: 'left', format: 'TEXT' };
                                    upd({ tableColumns: [...cols, newCol] });
                                }} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100">+ Col</button>
                            </div>
                        </div>
                        {(sel.tableColumns || defaultCols).map((col: InvoiceColumn, ci: number) => (
                            <div key={col.id} className="bg-slate-50 rounded-lg p-2 mb-2 space-y-1 border border-slate-100">
                                <div className="flex gap-1">
                                    <input value={col.header} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], header: e.target.value };
                                        upd({ tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-2 py-1 flex-1" placeholder="Encabezado"/>
                                    <button onClick={() => {
                                        const cols = (sel.tableColumns || defaultCols).filter((_: any, i: number) => i !== ci);
                                        upd({ tableColumns: cols });
                                    }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12}/></button>
                                </div>
                                <input value={col.field} onChange={e => {
                                    const cols = [...(sel.tableColumns || defaultCols)];
                                    cols[ci] = { ...cols[ci], field: e.target.value };
                                    upd({ tableColumns: cols });
                                }} className="text-xs bg-white border rounded px-2 py-1 w-full font-mono" placeholder="{{item.campo}}"/>
                                <div className="flex gap-1 items-center">
                                    <input type="number" value={col.widthPct} min={5} max={100} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], widthPct: Number(e.target.value) };
                                        upd({ tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-2 py-1 w-14"/>
                                    <span className="text-xs text-slate-400">%</span>
                                    <select value={col.align} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], align: e.target.value as 'left' | 'center' | 'right' };
                                        upd({ tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-1 py-1 flex-1">
                                        <option value="left">Izq</option>
                                        <option value="center">Centro</option>
                                        <option value="right">Der</option>
                                    </select>
                                    <select value={col.format} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], format: e.target.value as 'TEXT' | 'CURRENCY' | 'NUMBER' };
                                        upd({ tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-1 py-1 flex-1">
                                        <option value="TEXT">Texto</option>
                                        <option value="CURRENCY">Moneda</option>
                                        <option value="NUMBER">Número</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
