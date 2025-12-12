
import React, { useState, useEffect, memo } from 'react';
import { 
  Trash2, AlignLeft, AlignCenter, AlignRight, FileCog, Database, Check, ArrowDownToLine
} from 'lucide-react';
import { LabelTemplate, LabelElement } from '../../types';

const FONTS = [
    { name: 'Predeterminada', value: 'helvetica' },
    { name: 'Roboto', value: "'Roboto', sans-serif" },
    { name: 'Open Sans', value: "'Open Sans', sans-serif" },
    { name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { name: 'Courier (Code)', value: "'Courier Prime', monospace" },
];

const PropertyInput = memo(({ label, value, onChange, type = "text", step, min, className, disabled, placeholder }: any) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => { setLocalValue(value); }, [value]);

    const handleBlur = () => {
        let finalVal = localValue;
        if (type === 'number') {
            finalVal = parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        if (finalVal !== value) onChange(finalVal);
    };

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>}
            <div className={`flex items-center gap-1 bg-white border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all overflow-hidden h-9 ${disabled ? 'bg-slate-100' : ''}`}>
                <input 
                    type={type} step={step} min={min} disabled={disabled} placeholder={placeholder}
                    className="w-full px-2 text-sm font-medium outline-none bg-transparent h-full text-slate-700"
                    value={localValue} 
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                />
            </div>
        </div>
    );
});

interface DesignerPropertiesProps {
    selectedId: string | null;
    template: LabelTemplate;
    setTemplate: (t: LabelTemplate) => void;
    updateElement: (id: string, updates: Partial<LabelElement>) => void;
    deleteSelected: () => void;
    setShowVarModal: (show: boolean) => void;
}

const DesignerProperties: React.FC<DesignerPropertiesProps> = ({ 
    selectedId, template, setTemplate, updateElement, deleteSelected, setShowVarModal 
}) => {
    const sel = template.elements.find((e: any) => e.id === selectedId);
    const unit = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    if (!sel) {
        // Page Settings
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center gap-2 text-slate-800 border-b pb-2">
                    <FileCog size={18} className="text-indigo-600"/>
                    <h3 className="font-bold text-sm uppercase">Configuración {template.type === 'DOCUMENT' ? 'Documento' : 'Etiqueta'}</h3>
                </div>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <PropertyInput label={`Ancho (${unit})`} value={template.width} onChange={(v:any) => setTemplate({...template, width:v})} type="number" step={0.1} />
                        <PropertyInput label={`Alto (${unit})`} value={template.height} onChange={(v:any) => setTemplate({...template, height:v})} type="number" step={0.1} />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Contexto de Datos</label>
                        <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={template.dataSource} onChange={e => setTemplate({...template, dataSource:e.target.value as any})}>
                            <option value="NONE">Sin Conexión</option>
                            <option disabled>--- ETIQUETAS ---</option>
                            <option value="TELEPHONES">Inventario Teléfonos (IMEI)</option>
                            <option value="INVENTORY_ACCESSORIES">Inventario Accesorios</option>
                            <option disabled>--- DOCUMENTOS ---</option>
                            <option value="SALES">Ventas / Facturación</option>
                            <option value="CLIENTS">Reporte Clientes</option>
                            <option value="FULL_DB">Base de Datos Completa</option>
                        </select>
                    </div>
                    
                    {template.dataSource && template.dataSource !== 'NONE' && (
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Categoría Uso</label>
                            <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={template.category} onChange={e => setTemplate({...template, category:e.target.value as any})}>
                                {template.type === 'LABEL' ? (
                                    <>
                                        <option value="GENERAL">General</option>
                                        <option value="TELEPHONE">Teléfonos</option>
                                        <option value="ACCESSORY">Accesorios</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="INVOICE">Factura</option>
                                        <option value="REPORT">Reporte</option>
                                    </>
                                )}
                            </select>
                        </div>
                    )}

                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer" onClick={() => setTemplate({...template, isDefault: !template.isDefault})}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                            {template.isDefault && <Check size={14} className="text-white"/>}
                        </div>
                        <span className="text-sm font-medium text-slate-600">Usar como Predeterminado</span>
                    </div>
                </div>
            </div>
        );
    }

    // Element Properties
    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-2">
                <div className="flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold uppercase">{sel.type}</span>
                </div>
                <button onClick={deleteSelected} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"><Trash2 size={18}/></button>
            </div>

            {/* Common Geometry */}
            <div className="grid grid-cols-2 gap-3">
                <PropertyInput label={`X (${unit})`} value={sel.x} onChange={(v:any) => updateElement(sel.id, {x:v})} type="number" step={0.1}/>
                <PropertyInput label={`Y (${unit})`} value={sel.y} onChange={(v:any) => updateElement(sel.id, {y:v})} type="number" step={0.1}/>
                <PropertyInput label="Ancho" value={sel.width} onChange={(v:any) => updateElement(sel.id, {width:v})} type="number" step={0.1}/>
                <PropertyInput label="Alto" value={sel.height} onChange={(v:any) => updateElement(sel.id, {height:v})} type="number" step={0.1}/>
            </div>

            {/* Content Logic (Text/Barcode) */}
            {(sel.type === 'TEXT' || sel.type === 'BARCODE' || sel.type === 'QR') && (
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Contenido / Datos</label>
                        <button onClick={() => setShowVarModal(true)} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 flex items-center gap-1">
                            <Database size={10}/> + Variable
                        </button>
                    </div>
                    <textarea 
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors font-mono" 
                        rows={3} 
                        value={sel.content} 
                        onChange={e => updateElement(sel.id, {content: e.target.value})}
                        placeholder="Texto estático o {{VARIABLE}}"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Usa {"{{VARIABLE}}"} para datos dinámicos.</p>
                </div>
            )}

            {/* Text Specific */}
            {sel.type === 'TEXT' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Tipografía</h4>
                    <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={sel.fontFamily} onChange={e => updateElement(sel.id, {fontFamily:e.target.value})}>
                        {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <PropertyInput value={sel.fontSize} onChange={(v:any) => updateElement(sel.id, {fontSize:v})} type="number" className="flex-1"/>
                        <button onClick={() => updateElement(sel.id, {fontWeight: sel.fontWeight === 'bold' ? 'normal' : 'bold'})} className={`px-3 border rounded-lg font-bold ${sel.fontWeight === 'bold' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>B</button>
                    </div>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                        {['left','center','right'].map((a:any) => (
                            <button key={a} onClick={() => updateElement(sel.id, {textAlign:a})} className={`flex-1 py-1 rounded flex justify-center ${sel.textAlign===a ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                                {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col gap-2 mt-2">
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={sel.isMultiline} onChange={e => updateElement(sel.id, {isMultiline: e.target.checked})} className="rounded text-indigo-600"/>
                            <label className="text-xs font-medium text-slate-600">Multilínea (Ajuste)</label>
                        </div>
                        {sel.isMultiline && (
                             <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100 cursor-pointer" onClick={() => updateElement(sel.id, {isStretchWithOverflow: !sel.isStretchWithOverflow})}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${sel.isStretchWithOverflow ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                    {sel.isStretchWithOverflow && <Check size={12} className="text-white"/>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <ArrowDownToLine size={14} className="text-indigo-600"/>
                                    <span className="text-xs font-medium text-slate-600">Estirar con Desbordamiento</span>
                                </div>
                             </div>
                        )}
                    </div>
                </div>
            )}

            {/* Shape Specific */}
            {sel.type === 'SHAPE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Estilo</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Relleno</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={sel.fill === 'transparent' ? '#ffffff' : sel.fill} onChange={e => updateElement(sel.id, {fill: e.target.value})} className="h-8 w-8 rounded cursor-pointer border-0"/>
                                <button onClick={() => updateElement(sel.id, {fill:'transparent'})} className="text-[10px] px-2 py-1 bg-slate-100 rounded border">None</button>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Borde</label>
                            <input type="color" value={sel.stroke} onChange={e => updateElement(sel.id, {stroke: e.target.value})} className="h-8 w-full rounded cursor-pointer border-0"/>
                        </div>
                    </div>
                    <PropertyInput label="Grosor Borde" value={sel.strokeWidth} onChange={(v:any) => updateElement(sel.id, {strokeWidth:v})} type="number" step={0.5}/>
                </div>
            )}
        </div>
    );
};

export default DesignerProperties;
