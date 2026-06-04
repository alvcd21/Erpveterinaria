import React from 'react';
import {
    ArrowLeft, Undo2, Redo2, Eye, Printer, Download, Keyboard, Copy, Save,
    AlignLeft, AlignCenterHorizontal, AlignRight, AlignStartVertical,
    AlignVerticalJustifyCenter, AlignEndVertical, Clipboard,
} from 'lucide-react';
import { printTemplate, downloadHTML } from '../../services/TemplateRenderer';
import { LabelTemplate } from '../../types';
import Swal from 'sweetalert2';

type AlignDir = 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v';

interface Props {
    template: LabelTemplate;
    onNameChange: (name: string) => void;
    editHistory: any[];
    historyIndex: number;
    undo: () => void;
    redo: () => void;
    lastAutoSave: Date | null;
    selectedId: string | null;
    selectedIds: string[];
    onBack: () => void;
    onPreview: () => void;
    onShortcuts: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    alignElements: (dir: AlignDir) => void;
    distributeH: () => void;
    moveLayer: (dir: 'UP' | 'DOWN') => void;
    updateElement: (id: string, updates: any) => void;
    styleClipboardRef: React.MutableRefObject<Partial<any> | null>;
}

export default function DesignerHeader({
    template, onNameChange, editHistory, historyIndex, undo, redo, lastAutoSave,
    selectedId, selectedIds, onBack, onPreview, onShortcuts, onSave, onSaveAs,
    alignElements, distributeH, moveLayer, updateElement, styleClipboardRef,
}: Props) {
    return (
        <>
            <header className="bg-white border-b h-16 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={onBack} className="hover:bg-slate-100 p-2 rounded-full text-slate-600 transition-colors"><ArrowLeft size={20}/></button>
                    <div className="hidden md:flex gap-1 border-l pl-3 ml-2">
                        <button onClick={undo} disabled={editHistory.length <= 0 || historyIndex <= 0} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Undo2 size={18}/></button>
                        <button onClick={redo} disabled={historyIndex >= editHistory.length - 1} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Redo2 size={18}/></button>
                    </div>
                </div>

                <div className="flex-1 flex justify-center relative">
                    <input
                        className="text-center font-bold text-slate-800 bg-transparent hover:bg-slate-50 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[250px] transition-all"
                        value={template.name}
                        onChange={e => onNameChange(e.target.value)}
                        placeholder="Nombre del Diseño"
                    />
                    {lastAutoSave && (
                        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">
                            Auto-guardado {lastAutoSave.toLocaleTimeString()}
                        </div>
                    )}
                </div>

                <div className="flex-shrink-0 flex items-center justify-end gap-1 md:gap-2">
                    <button onClick={onPreview} className="border border-slate-200 hover:bg-slate-50 text-slate-600 p-2 md:px-3 md:py-2 rounded-lg font-bold flex items-center gap-2 text-sm transition-all active:scale-95" title="Vista previa con datos reales">
                        <Eye size={18}/> <span className="hidden md:inline">Preview</span>
                    </button>
                    <button onClick={() => printTemplate(template, {})} className="border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg font-bold flex items-center gap-2 text-sm transition-all active:scale-95" title="Imprimir">
                        <Printer size={18}/><span className="hidden lg:inline text-xs">Imprimir</span>
                    </button>
                    <button onClick={() => downloadHTML(template, {})} className="hidden sm:flex border border-slate-200 hover:bg-slate-50 text-slate-600 p-2 md:px-3 md:py-2 rounded-lg font-bold items-center gap-2 text-sm transition-all active:scale-95" title="Descargar HTML">
                        <Download size={18}/> <span className="hidden md:inline">HTML</span>
                    </button>
                    <button onClick={onShortcuts} className="hidden md:flex border border-slate-200 hover:bg-slate-50 text-slate-500 p-2 rounded-lg transition-all" title="Atajos de teclado">
                        <Keyboard size={18}/>
                    </button>
                    <button onClick={onSaveAs} className="hidden md:flex border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg font-bold items-center gap-2 text-sm transition-all active:scale-95" title="Guardar como nuevo diseño">
                        <Copy size={16}/> <span className="hidden lg:inline">Guardar Como</span>
                    </button>
                    <button onClick={onSave} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 md:px-4 md:py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 text-sm transition-all active:scale-95">
                        <Save size={18}/> <span className="hidden md:inline">Guardar</span>
                    </button>
                </div>
            </header>

            {selectedIds.length >= 2 && (
                <div className="hidden md:flex bg-indigo-50 border-b border-indigo-200 px-4 py-1.5 gap-1 items-center shrink-0 z-20">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase mr-2">{selectedIds.length} seleccionados · Alinear:</span>
                    {([
                        { icon: <AlignLeft size={14}/>, label: 'Izquierda', dir: 'left' as AlignDir },
                        { icon: <AlignCenterHorizontal size={14}/>, label: 'Centro H', dir: 'center-h' as AlignDir },
                        { icon: <AlignRight size={14}/>, label: 'Derecha', dir: 'right' as AlignDir },
                        { icon: <AlignStartVertical size={14}/>, label: 'Arriba', dir: 'top' as AlignDir },
                        { icon: <AlignVerticalJustifyCenter size={14}/>, label: 'Centro V', dir: 'center-v' as AlignDir },
                        { icon: <AlignEndVertical size={14}/>, label: 'Abajo', dir: 'bottom' as AlignDir },
                    ]).map(({ icon, label, dir }) => (
                        <button key={dir} onClick={() => alignElements(dir)} title={label} className="p-1.5 rounded hover:bg-indigo-200 text-indigo-600 transition-colors">
                            {icon}
                        </button>
                    ))}
                    {selectedIds.length >= 3 && (
                        <button onClick={distributeH} title="Distribuir horizontalmente" className="ml-1 px-2 py-1 text-[10px] font-bold rounded hover:bg-indigo-200 text-indigo-600 transition-colors border border-indigo-200">
                            ↔ Distribuir
                        </button>
                    )}
                </div>
            )}

            {selectedId && selectedIds.length <= 1 && (
                <div className="hidden md:flex bg-slate-50 border-b border-slate-100 px-4 py-1 gap-2 items-center shrink-0 z-20">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Elemento:</span>
                    <button
                        onClick={() => {
                            const el = template.elements.find((e: any) => e.id === selectedId);
                            if (!el) return;
                            const { id, x, y, width, height, rotation, content, type, ...style } = el;
                            styleClipboardRef.current = style;
                            Swal.fire({ icon: 'success', title: 'Estilo copiado', toast: true, position: 'bottom-end', timer: 1500, showConfirmButton: false });
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-200 text-slate-600 transition-colors"
                    >
                        <Clipboard size={12}/> Copiar Estilo
                    </button>
                    <button
                        onClick={() => {
                            if (!styleClipboardRef.current || !selectedId) return;
                            updateElement(selectedId, styleClipboardRef.current);
                        }}
                        disabled={!styleClipboardRef.current}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-30"
                    >
                        <Clipboard size={12}/> Pegar Estilo
                    </button>
                    <button onClick={() => moveLayer('UP')} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-200 text-slate-600 transition-colors">↑ Capa</button>
                    <button onClick={() => moveLayer('DOWN')} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-200 text-slate-600 transition-colors">↓ Capa</button>
                    <span className="text-[10px] text-slate-300 ml-2">Ctrl+C/V copiar · Ctrl+D duplicar · Ctrl+A selec. todo · Del eliminar · Flechas mover</span>
                </div>
            )}
        </>
    );
}
