import React from 'react';
import { Hand, MousePointer2, Type, ScanLine, Shapes, Layers, Maximize, ChevronDown, MoreVertical, X, GripVertical } from 'lucide-react';
import DesignerProperties from './DesignerProperties';

interface Props {
    tool: string;
    setTool: (t: any) => void;
    addElement: (type: any, props?: any) => void;
    setShowShapeModal: (v: boolean) => void;
    activePanel: 'PROPERTIES' | 'LAYERS';
    setActivePanel: (v: 'PROPERTIES' | 'LAYERS') => void;
    isMobilePropOpen: boolean;
    setIsMobilePropOpen: (v: boolean) => void;
    template: any;
    setZoom: (z: number) => void;
    setPan: (p: { x: number; y: number }) => void;
    selectedId: string | null;
    selectedIds: string[];
    updateTemplate: (patch: any) => void;
    updateElement: (id: string, updates: any) => void;
    updateMultipleElements: (ids: string[], updates: any) => void;
    deleteSelected: () => void;
    setShowVarModal: (v: boolean) => void;
    setSelectedId: (id: string | null) => void;
}

export default function MobileUI({
    tool, setTool, addElement, setShowShapeModal, activePanel, setActivePanel,
    isMobilePropOpen, setIsMobilePropOpen, template, setZoom, setPan,
    selectedId, selectedIds, updateTemplate, updateElement, updateMultipleElements,
    deleteSelected, setShowVarModal, setSelectedId,
}: Props) {
    const fitZoom = () => {
        const scale = template.type === 'DOCUMENT' ? 37.795 : 3.7795;
        const availW = window.innerWidth - 48;
        const availH = window.innerHeight - 180;
        setZoom(Math.max(0.2, Math.min(2, Math.min(availW / (template.width * scale), availH / (template.height * scale)))));
        setPan({ x: 0, y: 0 });
    };

    return (
        <>
            <div className="md:hidden bg-white border-t px-4 py-3 flex justify-between items-center z-40 pb-safe shrink-0">
                <button onClick={() => setTool(tool === 'SELECT' ? 'HAND' : 'SELECT')} className={`p-3 rounded-lg ${tool === 'HAND' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-600'}`}>
                    {tool === 'HAND' ? <Hand size={20}/> : <MousePointer2 size={20}/>}
                </button>
                <div className="w-px h-8 bg-slate-200 mx-1"/>
                <button onClick={() => addElement('TEXT')} className="p-3 bg-slate-50 rounded-lg text-slate-600"><Type size={20}/></button>
                <button onClick={() => addElement('BARCODE')} className="p-3 bg-slate-50 rounded-lg text-slate-600"><ScanLine size={20}/></button>
                <button onClick={() => setShowShapeModal(true)} className="p-3 bg-slate-50 rounded-lg text-slate-600"><Shapes size={20}/></button>
                <button onClick={() => { setActivePanel('LAYERS'); setIsMobilePropOpen(true); }} className="p-3 bg-slate-50 rounded-lg text-slate-600"><Layers size={20}/></button>
                <div className="w-px h-8 bg-slate-200 mx-1"/>
                <button onClick={fitZoom} className="p-3 bg-slate-50 rounded-lg text-slate-600 text-[10px] font-bold" title="Ajustar a pantalla">
                    <Maximize size={20}/>
                </button>
                <div className="w-px h-8 bg-slate-200 mx-2"/>
                <button
                    onClick={() => {
                        if (isMobilePropOpen && activePanel === 'PROPERTIES') setIsMobilePropOpen(false);
                        else { setActivePanel('PROPERTIES'); setIsMobilePropOpen(true); }
                    }}
                    className={`p-3 rounded-full ${selectedId || isMobilePropOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                >
                    {isMobilePropOpen ? <ChevronDown/> : <MoreVertical/>}
                </button>
            </div>

            <div className={`md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-50 transition-transform duration-300 transform flex flex-col max-h-[70vh] border-t border-slate-100 ${isMobilePropOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="flex justify-between items-center px-4 pt-3 pb-2 border-b border-slate-50 cursor-pointer" onClick={() => setIsMobilePropOpen(false)}>
                    <div className="w-8"/>
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full"/>
                    <button onClick={() => setIsMobilePropOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"><X size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {activePanel === 'PROPERTIES' ? (
                        <DesignerProperties
                            selectedId={selectedId}
                            selectedIds={selectedIds}
                            template={template}
                            setTemplate={updateTemplate}
                            updateElement={updateElement}
                            updateMultipleElements={updateMultipleElements}
                            deleteSelected={deleteSelected}
                            setShowVarModal={setShowVarModal}
                        />
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs text-slate-400 mb-2 font-bold uppercase">Orden de capas</p>
                            {template.elements.map((el: any, i: number) => (
                                <div key={el.id} onClick={() => setSelectedId(el.id)} className={`p-3 rounded-lg border flex items-center gap-2 ${selectedId===el.id?'border-indigo-500 bg-indigo-50':'border-slate-200'}`}>
                                    <span className="font-bold text-slate-400 text-xs">{i+1}.</span>
                                    <span className="flex-1 font-medium">{el.type}</span>
                                    <GripVertical size={16} className="text-slate-300"/>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
