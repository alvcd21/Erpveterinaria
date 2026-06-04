import React from 'react';
import { Layers, GripVertical, Eye, EyeOff } from 'lucide-react';

interface Props {
    template: any;
    selectedId: string | null;
    updateElement: (id: string, updates: any) => void;
    setSelectedId: (id: string | null) => void;
    setActivePanel: (p: 'PROPERTIES' | 'LAYERS') => void;
    handleDragStart: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    handleDragEnter: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    handleDragEnd: () => void;
}

const TYPE_COLORS: Record<string, string> = {
    TEXT: 'bg-blue-100 text-blue-700', SHAPE: 'bg-purple-100 text-purple-700',
    IMAGE: 'bg-green-100 text-green-700', BARCODE: 'bg-orange-100 text-orange-700',
    QR: 'bg-amber-100 text-amber-700', INVOICE_TABLE: 'bg-indigo-100 text-indigo-700', RECEIPT_ITEMS: 'bg-slate-100 text-slate-700',
    SUMMARY_BOX: 'bg-teal-100 text-teal-700', COMPANY_HEADER: 'bg-rose-100 text-rose-700',
};

const TYPE_LABEL: Record<string, string> = {
    TEXT: 'T', SHAPE: '■', IMAGE: '⬜', BARCODE: '|||',
    QR: 'QR', INVOICE_TABLE: '▦', SUMMARY_BOX: '∑', COMPANY_HEADER: '🏢',
};

export default function LayersPanel({
    template, selectedId, updateElement, setSelectedId, setActivePanel,
    handleDragStart, handleDragEnter, handleDragEnd,
}: Props) {
    return (
        <div className="p-4 h-full flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2"><Layers size={20}/> Capas</h3>
            <div className="flex-1 overflow-y-auto space-y-1">
                {[...template.elements].reverse().map((el: any, revIdx: number) => {
                    const index = template.elements.length - 1 - revIdx;
                    const isHidden = el.visible === false;
                    const preview = el.elementLabel
                        ? el.elementLabel
                        : el.type === 'TEXT'
                            ? (el.content?.replace(/{{.*?}}/g, '…').slice(0, 24) || '—')
                            : el.type === 'SHAPE' ? (el.shapeType || 'SHAPE')
                            : el.type;

                    return (
                        <div
                            key={el.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragEnter={(e) => handleDragEnter(e, index)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => { if (!isHidden) { setSelectedId(el.id); setActivePanel('PROPERTIES'); }}}
                            className={`px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 select-none transition-colors group border
                                ${selectedId === el.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-transparent'}
                                ${isHidden ? 'opacity-40' : ''}`}
                        >
                            <div className="cursor-grab text-slate-300 hover:text-slate-500 shrink-0"><GripVertical size={13}/></div>
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${TYPE_COLORS[el.type] || 'bg-slate-100 text-slate-600'}`}>
                                {TYPE_LABEL[el.type] || el.type.slice(0,2)}
                            </span>
                            <span className={`truncate flex-1 text-xs ${selectedId === el.id ? 'text-indigo-700 font-bold' : 'text-slate-600'}`}>
                                {preview}
                            </span>
                            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                {el.locked && <span title="Bloqueado" className="text-amber-500">🔒</span>}
                                <button
                                    title={isHidden ? 'Mostrar' : 'Ocultar'}
                                    onClick={(e) => { e.stopPropagation(); updateElement(el.id, { visible: !isHidden }); }}
                                    className={`p-0.5 rounded hover:bg-slate-200 transition-colors ${isHidden ? 'text-slate-300' : 'text-slate-500'}`}
                                >
                                    {isHidden ? <EyeOff size={12}/> : <Eye size={12}/>}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
