import React from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
    ['Ctrl+Z', 'Deshacer'],
    ['Ctrl+Y', 'Rehacer'],
    ['Ctrl+C', 'Copiar elemento'],
    ['Ctrl+V', 'Pegar elemento'],
    ['Ctrl+A', 'Seleccionar todo'],
    ['Ctrl+D', 'Duplicar elemento'],
    ['Delete', 'Eliminar elemento'],
    ['Escape', 'Deseleccionar'],
    ['↑↓←→', 'Mover (0.1 cm)'],
    ['Shift+↑↓←→', 'Mover (1 cm)'],
    ['Doble clic', 'Editar texto'],
    ['Clic derecho', 'Menú contextual'],
];

interface Props {
    show: boolean;
    onClose: () => void;
}

export default function ShortcutsModal({ show, onClose }: Props) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Keyboard size={18} className="text-indigo-600"/> Atajos de Teclado</h3>
                    <button onClick={onClose}><X/></button>
                </div>
                <div className="space-y-1 text-sm">
                    {SHORTCUTS.map(([key, desc]) => (
                        <div key={key} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                            <span className="text-slate-600">{desc}</span>
                            <kbd className="bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono px-2 py-0.5 rounded">{key}</kbd>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
