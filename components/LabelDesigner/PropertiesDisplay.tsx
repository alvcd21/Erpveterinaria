import React from 'react';
import { AlignLeft, AlignCenter, AlignRight, Database, ArrowDownToLine, Check } from 'lucide-react';
import PropertyInput from './PropertyInput';

const FONTS = [
    { name: 'Predeterminada', value: 'helvetica' },
    { name: 'Roboto', value: "'Roboto', sans-serif" },
    { name: 'Open Sans', value: "'Open Sans', sans-serif" },
    { name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { name: 'Poppins', value: "'Poppins', sans-serif" },
    { name: 'Playfair Display', value: "'Playfair Display', serif" },
    { name: 'Raleway', value: "'Raleway', sans-serif" },
    { name: 'Oswald', value: "'Oswald', sans-serif" },
    { name: 'Courier (Code)', value: "'Courier Prime', monospace" },
];

interface Props {
    sel: any;
    updateElement: (id: string, updates: any) => void;
    setShowVarModal: (v: boolean) => void;
}

export default function PropertiesDisplay({ sel, updateElement, setShowVarModal }: Props) {
    const upd = (u: any) => updateElement(sel.id, u);

    return (
        <>
            {/* IMAGE */}
            {sel.type === 'IMAGE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Ajuste de Imagen</h4>
                    <div className="grid grid-cols-2 gap-1">
                        {([{ value: 'contain', label: 'Contener' }, { value: 'cover', label: 'Cubrir' }, { value: 'fill', label: 'Estirar' }, { value: 'none', label: 'Original' }] as const).map(opt => (
                            <button key={opt.value} onClick={() => upd({ imageObjectFit: opt.value })}
                                className={`py-2 text-xs rounded-lg border font-bold transition-all ${(sel.imageObjectFit || 'contain') === opt.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Content for TEXT/BARCODE/QR */}
            {(sel.type === 'TEXT' || sel.type === 'BARCODE' || sel.type === 'QR') && (
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Contenido / Datos</label>
                        <button onClick={() => setShowVarModal(true)} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 flex items-center gap-1">
                            <Database size={10}/> + Variable
                        </button>
                    </div>
                    <textarea className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors font-mono" rows={3}
                        value={sel.content} onChange={e => upd({ content: e.target.value })} placeholder="Texto estático o {{VARIABLE}}"/>
                    <p className="text-[10px] text-slate-400 mt-1">Usa {"{{VARIABLE}}"} para datos dinámicos.</p>
                </div>
            )}

            {/* BARCODE */}
            {sel.type === 'BARCODE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Código de Barras</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Líneas</label><input type="color" value={sel.barcodeFgColor || '#000000'} onChange={e => upd({ barcodeFgColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label><input type="color" value={sel.barcodeBgColor || '#ffffff'} onChange={e => upd({ barcodeBgColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/></div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Formato</label>
                        <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={sel.barcodeFormat || 'CODE128'} onChange={e => upd({ barcodeFormat: e.target.value })}>
                            {['CODE128','CODE39','EAN13','EAN8','UPC','ITF14','MSI','pharmacode'].map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="dispval" checked={sel.displayValue ?? true} onChange={e => upd({ displayValue: e.target.checked })} className="rounded text-indigo-600"/>
                        <label htmlFor="dispval" className="text-xs font-medium text-slate-600">Mostrar número</label>
                    </div>
                </div>
            )}

            {/* QR */}
            {sel.type === 'QR' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Código QR</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color</label><input type="color" value={sel.qrFgColor || '#000000'} onChange={e => upd({ qrFgColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label><input type="color" value={sel.qrBgColor || '#ffffff'} onChange={e => upd({ qrBgColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border border-slate-200"/></div>
                    </div>
                </div>
            )}

            {/* TEXT */}
            {(sel.type === 'TEXT' || sel.type === 'RECEIPT_ITEMS') && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Tipografía</h4>
                    <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={sel.fontFamily} onChange={e => upd({ fontFamily: e.target.value })}>
                        {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <PropertyInput value={sel.fontSize} onChange={(v:any) => upd({ fontSize: v })} type="number" className="flex-1"/>
                        <button onClick={() => upd({ fontWeight: sel.fontWeight === 'bold' ? 'normal' : 'bold' })} className={`px-3 border rounded-lg font-bold ${sel.fontWeight === 'bold' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>B</button>
                        <button onClick={() => upd({ italic: !sel.italic })} className={`px-3 border rounded-lg italic ${sel.italic ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>I</button>
                        <button onClick={() => upd({ underline: !sel.underline })} className={`px-3 border rounded-lg underline ${sel.underline ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>U</button>
                    </div>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                        {(['left','center','right'] as const).map((a) => (
                            <button key={a} onClick={() => upd({ textAlign: a })} className={`flex-1 py-1 rounded flex justify-center ${sel.textAlign===a ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                                {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Texto</label><input type="color" value={sel.color || '#000000'} onChange={e => upd({ color: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label>
                            <div className="flex gap-1"><input type="color" value={sel.backgroundColor || '#ffffff'} onChange={e => upd({ backgroundColor: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/>
                            <button onClick={() => upd({ backgroundColor: 'transparent' })} className="text-[10px] px-1.5 bg-slate-100 rounded border border-slate-200 whitespace-nowrap">None</button></div>
                        </div>
                    </div>
                    <PropertyInput label="Interlineado" value={sel.lineHeight || 1.2} onChange={(v:any) => upd({ lineHeight: v })} type="number" step={0.1}/>
                    <PropertyInput label="Espaciado Letras (px)" value={sel.letterSpacing || 0} onChange={(v:any) => upd({ letterSpacing: v })} type="number" step={0.5}/>
                    {sel.type === 'RECEIPT_ITEMS' && (
                        <div className="space-y-2">
                            <PropertyInput label="Caracteres por linea" value={sel.receiptLineChars || 42} onChange={(v:any) => upd({ receiptLineChars: v })} type="number" step={1}/>
                            <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100 cursor-pointer" onClick={() => upd({ canGrow: sel.canGrow === false })}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${sel.canGrow !== false ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>{sel.canGrow !== false && <Check size={12} className="text-white"/>}</div>
                                <div className="flex items-center gap-1.5"><ArrowDownToLine size={14} className="text-indigo-600"/><span className="text-xs font-medium text-slate-600">Estirar con Desbordamiento</span></div>
                            </div>
                        </div>
                    )}
                    {sel.type === 'TEXT' && <div className="flex flex-col gap-2 mt-2">
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={sel.isMultiline} onChange={e => upd({ isMultiline: e.target.checked })} className="rounded text-indigo-600"/>
                            <label className="text-xs font-medium text-slate-600">Multilínea (Ajuste)</label>
                        </div>
                        {sel.isMultiline && (
                            <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100 cursor-pointer" onClick={() => upd({ isStretchWithOverflow: !sel.isStretchWithOverflow })}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${sel.isStretchWithOverflow ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>{sel.isStretchWithOverflow && <Check size={12} className="text-white"/>}</div>
                                <div className="flex items-center gap-1.5"><ArrowDownToLine size={14} className="text-indigo-600"/><span className="text-xs font-medium text-slate-600">Estirar con Desbordamiento</span></div>
                            </div>
                        )}
                    </div>}
                </div>
            )}

            {/* Shadow */}
            {(sel.type === 'TEXT' || sel.type === 'SHAPE' || sel.type === 'RECEIPT_ITEMS') && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={sel.shadowEnabled || false} onChange={e => upd({ shadowEnabled: e.target.checked })} className="rounded text-indigo-600"/>
                        <label className="text-xs font-medium text-slate-600">Sombra</label>
                    </div>
                    {sel.shadowEnabled && (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color</label><input type="color" value={sel.shadowColor || '#000000'} onChange={e => upd({ shadowColor: e.target.value })} className="h-8 w-full rounded cursor-pointer border-0"/></div>
                                <PropertyInput label="Desenfoque (px)" value={sel.shadowBlur ?? 4} onChange={(v:any) => upd({ shadowBlur: v })} type="number" step={1}/>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <PropertyInput label="Offset X (px)" value={sel.shadowOffsetX ?? 2} onChange={(v:any) => upd({ shadowOffsetX: v })} type="number" step={1}/>
                                <PropertyInput label="Offset Y (px)" value={sel.shadowOffsetY ?? 2} onChange={(v:any) => upd({ shadowOffsetY: v })} type="number" step={1}/>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* COMPANY_HEADER */}
            {sel.type === 'COMPANY_HEADER' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Encabezado Empresa</h4>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estilo</label>
                        <div className="flex gap-2">
                            {(['PLAIN', 'GEOMETRIC'] as const).map(s => (
                                <button key={s} onClick={() => upd({ companyStyle: s })} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${(sel.companyStyle || 'PLAIN') === s ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                                    {s === 'PLAIN' ? 'Simple' : '🎨 Geométrico'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {sel.companyStyle === 'GEOMETRIC' && (
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Título del Documento</label>
                            <input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500" value={sel.companyDocTitle || ''} onChange={e => upd({ companyDocTitle: e.target.value })} placeholder="ej. FACTURA"/>
                        </div>
                    )}
                    {sel.companyStyle !== 'GEOMETRIC' && (
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Alineación</label>
                            <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                                {(['left','center','right'] as const).map(a => (
                                    <button key={a} onClick={() => upd({ companyAlign: a })} className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${sel.companyAlign===a ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                                        {a==='left'?'Izq':a==='center'?'Centro':'Der'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <PropertyInput label="Tamaño Fuente (pt)" value={sel.fontSize || 9} onChange={(v:any) => upd({ fontSize: v })} type="number" step={0.5}/>
                    {sel.companyStyle !== 'GEOMETRIC' && (
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Texto</label><input type="color" value={sel.color || '#000000'} onChange={e => upd({ color: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/></div>
                    )}
                    <div className="space-y-2">
                        {[{ key: 'companyShowRTN', label: 'Mostrar RTN' }, { key: 'companyShowPhone', label: 'Mostrar Teléfono' }, { key: 'companyShowEmail', label: 'Mostrar Correo' }].map(item => (
                            <div key={item.key} className="flex items-center gap-2">
                                <input type="checkbox" checked={(sel as any)[item.key] ?? true} onChange={e => upd({ [item.key]: e.target.checked })} className="rounded text-indigo-600"/>
                                <label className="text-xs font-medium text-slate-600">{item.label}</label>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
