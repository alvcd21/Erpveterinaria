import React, { memo, useState, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { RotateCw, Lock } from 'lucide-react';
import { LabelElement, InvoiceColumn, SummaryRow, EmpresaConfig } from '../../types';

export const defaultCols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}', widthPct: 45, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cant.',       field: '{{item.cantidad}}',    widthPct: 10, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'P. Unit.',    field: '{{item.precioVenta}}', widthPct: 15, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'ISV',         field: '{{item.isv}}',         widthPct: 10, align: 'right',  format: 'CURRENCY' },
  { id: 'c5', header: 'Total',       field: '{{item.total}}',       widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

const DATE_KEYS_RE = /^(fechaLimite|fechaVenta|fechaIngreso|fechaCreacion|fechaSalida)$/i;

function formatSpanishDatePreview(val: string): string {
    if (!val) return val;
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const isDateOnly = /^\d{4}-\d{2}-\d{2}(T00:00:00)?/.test(val);
    const day   = String(isDateOnly ? d.getUTCDate()      : d.getDate()).padStart(2, '0');
    const month = String(isDateOnly ? d.getUTCMonth() + 1 : d.getMonth() + 1).padStart(2, '0');
    const year  =        isDateOnly ? d.getUTCFullYear()   : d.getFullYear();
    return `${day}/${month}/${year}`;
}

export function resolveEmpresaTokens(content: string, emp: Partial<EmpresaConfig>): string {
    return content.replace(/\{\{empresa\.(\w+)\}\}/g, (_, key) => {
        const val = (emp as any)[key];
        if (val === undefined || val === null) return `{{empresa.${key}}}`;
        const str = String(val);
        return DATE_KEYS_RE.test(key) ? formatSpanishDatePreview(str) || str : str;
    });
}

function renderBarcode(el: LabelElement): string {
    const canvas = document.createElement('canvas');
    try {
        const hasVariable = /{{.*?}}/.test(el.content);
        const content = hasVariable ? '123456' : el.content;
        JsBarcode(canvas, content, {
            format: (el.barcodeFormat as any) || 'CODE128',
            displayValue: el.displayValue, margin: 0, width: 2, height: 50, fontSize: 20,
            lineColor: el.barcodeFgColor || '#000000', background: el.barcodeBgColor || '#ffffff',
        });
        return canvas.toDataURL('image/png');
    } catch { return ''; }
}

const CLIP_PATHS: Record<string, string> = {
    TRIANGLE_TL: 'polygon(0 0, 100% 0, 0 100%)',
    TRIANGLE_TR: 'polygon(0 0, 100% 0, 100% 100%)',
    TRIANGLE_BL: 'polygon(0 0, 0 100%, 100% 100%)',
    TRIANGLE_BR: 'polygon(100% 0, 100% 100%, 0 100%)',
    RHOMBUS:     'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
};

interface Props {
    el: LabelElement;
    isSelected: boolean;
    isMultiSelected: boolean;
    scale: number;
    onPointerDown: (e: any, id: string | null, mode: any, handle?: string) => void;
    onSelect: (id: string, e: React.MouseEvent) => void;
    tool: 'SELECT' | 'HAND';
    isEditing: boolean;
    onStartEdit?: (id: string) => void;
    onCommitEdit?: (id: string, value: string) => void;
    onContextMenu?: (e: React.MouseEvent, id: string) => void;
    empresaConfig?: Partial<EmpresaConfig>;
}

const CanvasElement = memo(({
    el, isSelected, isMultiSelected, scale, onPointerDown, onSelect,
    tool, isEditing, onStartEdit, onCommitEdit, onContextMenu, empresaConfig,
}: Props) => {
    const emp: Partial<EmpresaConfig> = empresaConfig || {};
    const [qrSrc, setQrSrc] = useState('');
    useEffect(() => {
        if (el.type === 'QR') {
            const hasVariable = /{{.*?}}/.test(el.content);
            const content = hasVariable ? 'DEMO-QR' : (el.content || 'QR');
            QRCode.toDataURL(content, { margin: 0, color: { dark: el.qrFgColor || '#000000', light: el.qrBgColor || '#ffffff' } })
                .then((url: string) => setQrSrc(url)).catch(() => setQrSrc(''));
        }
    }, [el.type, el.content, el.qrFgColor, el.qrBgColor]);

    const isHollow = el.type === 'SHAPE' && (el.fill === 'transparent' || !el.fill) && !CLIP_PATHS[el.shapeType || ''];
    const isLocked = el.locked === true;
    const hasCondition = !!el.visibilityCondition;
    const pointerEventsClass = tool === 'HAND' ? 'pointer-events-none' : (isHollow && !isEditing ? 'pointer-events-none' : '');
    const showHandles = isSelected && tool === 'SELECT' && !isEditing && !isLocked;
    const shadowStyle = el.shadowEnabled
        ? `drop-shadow(${el.shadowOffsetX ?? 2}px ${el.shadowOffsetY ?? 2}px ${el.shadowBlur ?? 4}px ${el.shadowColor ?? 'rgba(0,0,0,0.3)'})`
        : undefined;

    return (
        <div
            onMouseDown={(e) => { if (isEditing || isLocked) return; tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE'); }}
            onTouchStart={(e) => { if (isEditing || isLocked) return; tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE'); }}
            onDoubleClick={(e) => { if (tool === 'SELECT' && el.type === 'TEXT' && !isLocked) { e.stopPropagation(); onStartEdit?.(el.id); } }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, el.id); }}
            className={`absolute group select-none ${isEditing ? 'cursor-text' : isLocked ? 'cursor-default' : 'cursor-move'}
                ${isSelected ? 'z-50 outline outline-2 outline-indigo-500' : isMultiSelected ? 'z-40 outline outline-2 outline-blue-400 outline-dashed' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}
                ${pointerEventsClass}`}
            style={{ left: `${el.x * scale}px`, top: `${el.y * scale}px`, width: `${el.width * scale}px`, height: `${el.height * scale}px`, transform: `rotate(${el.rotation}deg)`, opacity: el.opacity ?? 1, filter: shadowStyle }}
            onClick={(e) => { if (isEditing) return; e.stopPropagation(); if (tool === 'SELECT') onSelect(el.id, e); }}
        >
            <div className={`w-full h-full overflow-hidden flex items-center justify-center relative ${tool === 'HAND' ? '' : (isHollow ? 'pointer-events-none' : '')}`} style={{
                borderRadius: el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0'),
                background: el.type === 'SHAPE'
                    ? (el.gradientEnabled && el.gradientColor1 && el.gradientColor2
                        ? (el.gradientType === 'radial'
                            ? `radial-gradient(circle, ${el.gradientColor1}, ${el.gradientColor2})`
                            : `linear-gradient(${el.gradientAngle ?? 135}deg, ${el.gradientColor1}, ${el.gradientColor2})`)
                        : (el.fill || 'transparent'))
                    : 'transparent',
                clipPath: el.type === 'SHAPE' ? (CLIP_PATHS[el.shapeType || ''] ?? undefined) : undefined,
            }}>
                {el.type === 'SHAPE' && !CLIP_PATHS[el.shapeType || ''] && el.shapeType !== 'LINE' && (
                    <div className={tool === 'SELECT' && isHollow ? 'pointer-events-auto' : ''} style={{ position: 'absolute', inset: 0, border: `${(el.strokeWidth||1)}px solid ${el.stroke}`, borderRadius: el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0') }}/>
                )}

                {el.type === 'TEXT' && isEditing ? (
                    <textarea autoFocus defaultValue={el.content} style={{ width: '100%', height: '100%', fontSize: `${(el.fontSize||10)}pt`, fontFamily: el.fontFamily, fontWeight: el.fontWeight, fontStyle: el.italic ? 'italic' : 'normal', color: el.color, textAlign: el.textAlign, lineHeight: String(el.lineHeight || 1.2), letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal', background: el.backgroundColor || 'transparent', border: 'none', outline: '2px solid #6366f1', resize: 'none', padding: '0 2px', boxSizing: 'border-box' }}
                        onBlur={e => onCommitEdit?.(el.id, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { onCommitEdit?.(el.id, el.content); } if (e.key === 'Enter' && !el.isMultiline) { e.preventDefault(); e.currentTarget.blur(); } }}
                        onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                    />
                ) : el.type === 'TEXT' ? (
                    <div className={tool === 'SELECT' ? 'pointer-events-auto' : ''} style={{ fontSize: `${(el.fontSize||10)}pt`, fontFamily: el.fontFamily, fontWeight: el.fontWeight, fontStyle: el.italic ? 'italic' : 'normal', textDecoration: el.underline ? 'underline' : 'none', color: el.color, textAlign: el.textAlign, whiteSpace: el.isMultiline ? 'pre-wrap' : 'nowrap', width: '100%', height: '100%', lineHeight: el.lineHeight || 1.2, letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal', backgroundColor: el.backgroundColor || 'transparent', display: 'flex', alignItems: 'center', justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start', padding: '0 2px' }}>
                        {resolveEmpresaTokens(el.content || '', emp)}
                    </div>
                ) : null}

                {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                {el.type === 'QR' && qrSrc && <img src={qrSrc} className="w-full h-full object-contain pointer-events-none"/>}
                {el.type === 'IMAGE' && (
                    el.content === '{{empresa.logoBase64}}' && emp.logoBase64 ? (
                        <img src={emp.logoBase64} className="w-full h-full pointer-events-none" style={{ objectFit: (el.imageObjectFit || 'contain') as any }}/>
                    ) : /^\{\{/.test(el.content || '') ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 border border-dashed border-slate-300 pointer-events-none gap-1">
                            <span className="text-[9px] font-mono text-slate-400 text-center px-1 leading-tight">{el.elementLabel || el.content}</span>
                            <span className="text-[8px] text-slate-300">Logo cargado al imprimir</span>
                        </div>
                    ) : (
                        <img src={el.content} className="w-full h-full pointer-events-none" style={{ objectFit: (el.imageObjectFit || 'contain') as any }}/>
                    )
                )}
                {el.type === 'SHAPE' && el.shapeType === 'LINE' && <div className={tool === 'SELECT' && isHollow ? 'pointer-events-auto' : ''} style={{ width: '100%', height: `${(el.strokeWidth||1)}px`, backgroundColor: el.stroke }}/>}

                {el.type === 'COMPANY_HEADER' && el.companyStyle === 'GEOMETRIC' && (
                    <div className={`w-full h-full overflow-hidden relative ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`}>
                        <div style={{ position: 'absolute', inset: 0, background: '#1e3a8a' }}/>
                        <div style={{ position: 'absolute', inset: 0, background: '#3b82f6', clipPath: 'polygon(0 0, 48% 0, 0 100%)' }}/>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 'bold', fontSize: `${(el.fontSize || 9) + 3}pt`, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.nombreEmpresa || 'NOMBRE DE LA EMPRESA'}</div>
                                {el.companyShowRTN !== false && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: `${el.fontSize || 9}pt` }}>RTN: {emp.rtn || '0000-0000-000000'}</div>}
                                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: `${el.fontSize || 9}pt` }}>{emp.direccion || 'Dirección'}{emp.telefono ? ` · Tel: ${emp.telefono}` : ''}</div>
                            </div>
                            {el.companyDocTitle && <div style={{ color: '#fff', fontWeight: 900, fontSize: `${(el.fontSize || 9) + 10}pt`, letterSpacing: 2, flexShrink: 0 }}>{el.companyDocTitle}</div>}
                        </div>
                    </div>
                )}

                {el.type === 'COMPANY_HEADER' && el.companyStyle !== 'GEOMETRIC' && (
                    <div className={`w-full h-full p-1 overflow-hidden ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`} style={{ textAlign: el.companyAlign || 'center', fontSize: `${el.fontSize || 9}pt`, lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 'bold', fontSize: `${(el.fontSize || 9) + 2}pt`, color: el.color || '#000' }}>{emp.nombreEmpresa || 'NOMBRE DE LA EMPRESA'}</div>
                        {el.companyShowRTN !== false && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>RTN: {emp.rtn || '0000-0000-000000'}</div>}
                        <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>{emp.direccion || 'Dirección de la Empresa'}</div>
                        {el.companyShowPhone !== false && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>Tel: {emp.telefono || '0000-0000'}</div>}
                        {el.companyShowEmail && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>{emp.correo || 'empresa@correo.com'}</div>}
                    </div>
                )}

                {el.type === 'SUMMARY_BOX' && (
                    <div className={`w-full h-full overflow-hidden ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`} style={{ backgroundColor: el.summaryBg || 'transparent', fontSize: `${el.summaryFontSize || 9}pt` }}>
                        {(el.summaryRows || []).map((row: SummaryRow) => (
                            <div key={row.id}>
                                {row.separator && <div style={{ borderTop: '1px solid #cbd5e1', margin: '2px 0' }}/>}
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 4px', fontWeight: row.bold ? 'bold' : 'normal', color: el.summaryLabelColor || '#000' }}>
                                    <span>{row.label}</span>
                                    <span style={{ color: el.summaryValueColor || '#000', fontFamily: 'monospace' }}>{row.field}</span>
                                </div>
                            </div>
                        ))}
                        {(!el.summaryRows || el.summaryRows.length === 0) && <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">RESUMEN TOTALES</div>}
                    </div>
                )}

                {el.type === 'INVOICE_TABLE' && (
                    <div className={`w-full h-full overflow-hidden text-[8px] border border-slate-300 ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`}>
                        <div className="flex" style={{ backgroundColor: el.tableHeaderBg || '#1e293b', color: el.tableHeaderColor || '#ffffff' }}>
                            {(el.tableColumns || defaultCols).map((col: InvoiceColumn, ci: number) => (
                                <div key={ci} className="font-bold px-1 flex items-center overflow-hidden truncate" style={{ width: `${col.widthPct}%`, justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start', fontSize: `${el.tableFontSize || 8}px` }}>{col.header}</div>
                            ))}
                        </div>
                        {[1,2,3].map((_, ri) => (
                            <div key={ri} className="flex border-t border-slate-200" style={{ backgroundColor: (el.tableAlternateRows && ri % 2 === 1) ? (el.tableAlternateBg || '#f8fafc') : 'white' }}>
                                {(el.tableColumns || defaultCols).map((col: InvoiceColumn, ci: number) => (
                                    <div key={ci} className="px-1 flex items-center text-slate-400 overflow-hidden truncate" style={{ width: `${col.widthPct}%`, justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start', fontSize: `${el.tableFontSize || 8}px` }}>
                                        {col.format === 'CURRENCY' ? 'L. 0.00' : col.format === 'NUMBER' ? '0' : '···'}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
                {el.type === 'RECEIPT_ITEMS' && (
                    <div
                        className={`w-full h-full overflow-hidden ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`}
                        style={{
                            fontFamily: el.fontFamily || '"Courier New", monospace',
                            fontSize: `${el.fontSize || el.tableFontSize || 7}pt`,
                            fontWeight: el.fontWeight || 'normal',
                            fontStyle: el.italic ? 'italic' : 'normal',
                            textDecoration: el.underline ? 'underline' : 'none',
                            textAlign: el.textAlign || 'left',
                            letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal',
                            lineHeight: el.lineHeight || 1.25,
                            color: el.color || '#000',
                            backgroundColor: el.backgroundColor || 'transparent',
                        }}
                    >
                        <pre className="whitespace-pre-wrap m-0" style={{ font: 'inherit', color: 'inherit', textAlign: 'inherit', letterSpacing: 'inherit' }}>{'CODIGO    DESCRIPCION                 TOTAL\n------------------------------------------\nMED-0001  Producto de ejemplo          0.00\n  1 x 0.00   EXE\nMED-0002  Otro producto                0.00\n  1 x 0.00   ISV 15%\n------------------------------------------'}</pre>
                    </div>
                )}
            </div>

            {el.canGrow && (
                <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-40" style={{ borderBottom: '2px dashed #3b82f6' }}>
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white rounded px-1 py-0 text-[8px] font-bold leading-4 whitespace-nowrap">↕ Crece</div>
                </div>
            )}
            {isLocked && isSelected && (
                <div className="absolute -top-5 -right-1 bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-sm z-50 pointer-events-none"><Lock size={8}/></div>
            )}
            {hasCondition && !isLocked && <div className="absolute top-0 right-0 w-3 h-3 bg-orange-400 rounded-full z-50 pointer-events-none" title="Visibilidad condicional"/>}

            {showHandles && (
                <>
                    {[
                        { handle: 'n',  style: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } as React.CSSProperties },
                        { handle: 's',  style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } as React.CSSProperties },
                        { handle: 'e',  style: { right: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' } as React.CSSProperties },
                        { handle: 'w',  style: { left: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' } as React.CSSProperties },
                        { handle: 'ne', style: { top: -4, right: -4, cursor: 'ne-resize' } as React.CSSProperties },
                        { handle: 'nw', style: { top: -4, left: -4, cursor: 'nw-resize' } as React.CSSProperties },
                        { handle: 'se', style: { bottom: -4, right: -4, cursor: 'se-resize' } as React.CSSProperties },
                        { handle: 'sw', style: { bottom: -4, left: -4, cursor: 'sw-resize' } as React.CSSProperties },
                    ].map(({ handle, style }) => (
                        <div key={handle} className="absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm shadow-sm pointer-events-auto" style={{ position: 'absolute', ...style }}
                            onMouseDown={(e) => { e.stopPropagation(); onPointerDown(e, el.id, 'RESIZE', handle); }}
                            onTouchStart={(e) => { e.stopPropagation(); onPointerDown(e, el.id, 'RESIZE', handle); }}/>
                    ))}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center cursor-grab shadow-sm text-slate-500 pointer-events-auto"
                        onMouseDown={(e) => onPointerDown(e, el.id, 'ROTATE')} onTouchStart={(e) => onPointerDown(e, el.id, 'ROTATE')}>
                        <RotateCw size={12}/>
                    </div>
                </>
            )}
        </div>
    );
});

export default CanvasElement;
