import React from 'react';

interface ContextMenuState {
    x: number;
    y: number;
    elementId: string;
}

interface Props {
    contextMenu: ContextMenuState;
    closeContextMenu: () => void;
    template: any;
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
    setSelectedId: (id: string | null) => void;
    addElement: (type: any, props?: any) => void;
    updateElement: (id: string, updates: any) => void;
    moveLayer: (dir: 'UP' | 'DOWN') => void;
    deleteSelected: () => void;
}

export default function ContextMenu({
    contextMenu, closeContextMenu, template, selectedIds, setSelectedIds, setSelectedId,
    addElement, updateElement, moveLayer, deleteSelected,
}: Props) {
    const el = template.elements.find((e: any) => e.id === contextMenu.elementId);
    if (!el) return null;

    const menuItem = (label: string, icon: string, onClick: () => void, danger = false) => (
        <button
            key={label}
            onClick={() => { onClick(); closeContextMenu(); }}
            className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors text-left ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'}`}
        >
            <span className="text-base leading-none">{icon}</span>
            <span className="font-medium">{label}</span>
        </button>
    );

    return (
        <>
            <div className="fixed inset-0 z-[70]" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}/>
            <div
                className="fixed z-[71] bg-white rounded-xl shadow-2xl border border-slate-200 py-1 min-w-[160px] text-sm animate-fade-in"
                style={{ left: contextMenu.x, top: contextMenu.y }}
            >
                {menuItem('Duplicar', '⧉', () => {
                    addElement(el.type, {
                        ...el,
                        x: el.x + (template.type === 'DOCUMENT' ? 0.5 : 2),
                        y: el.y + (template.type === 'DOCUMENT' ? 0.5 : 2),
                    });
                })}
                {menuItem('Selec. mismo tipo', '⬡', () => {
                    const sameType = template.elements.filter((e: any) => e.type === el.type).map((e: any) => e.id);
                    setSelectedIds(sameType);
                    if (sameType.length > 0) setSelectedId(sameType[sameType.length - 1]);
                })}
                {menuItem(el.locked ? 'Desbloquear' : 'Bloquear', el.locked ? '🔓' : '🔒', () => {
                    updateElement(el.id, { locked: !el.locked });
                })}
                <div className="border-t border-slate-100 my-1"/>
                {menuItem('Subir capa', '↑', () => moveLayer('UP'))}
                {menuItem('Bajar capa', '↓', () => moveLayer('DOWN'))}
                <div className="border-t border-slate-100 my-1"/>
                {menuItem('Eliminar', '✕', () => deleteSelected(), true)}
            </div>
        </>
    );
}
