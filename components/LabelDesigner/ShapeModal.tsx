import React from 'react';
import { X, Square, Circle, Minus } from 'lucide-react';

const SHAPES = [
    { type: 'RECTANGLE',   icon: <Square size={28} strokeWidth={1.5}/>,  label: 'Rect.',    props: {} },
    { type: 'CIRCLE',      icon: <Circle size={28} strokeWidth={1.5}/>,  label: 'Círculo',  props: {} },
    { type: 'LINE',        icon: <Minus size={28} strokeWidth={1.5}/>,   label: 'Línea',    props: {} },
    { type: 'TRIANGLE_TL', icon: <span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◤</span>, label: '▲ SupIzq', props: {fill:'#4f46e5',stroke:'transparent',strokeWidth:0} },
    { type: 'TRIANGLE_TR', icon: <span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◥</span>, label: '▲ SupDer', props: {fill:'#4f46e5',stroke:'transparent',strokeWidth:0} },
    { type: 'TRIANGLE_BL', icon: <span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◣</span>, label: '▲ InfIzq', props: {fill:'#4f46e5',stroke:'transparent',strokeWidth:0} },
    { type: 'TRIANGLE_BR', icon: <span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◢</span>, label: '▲ InfDer', props: {fill:'#4f46e5',stroke:'transparent',strokeWidth:0} },
    { type: 'RHOMBUS',     icon: <span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◆</span>, label: 'Rombo',    props: {fill:'#4f46e5',stroke:'transparent',strokeWidth:0} },
];

interface Props {
    show: boolean;
    onClose: () => void;
    addElement: (type: any, props?: any) => void;
}

export default function ShapeModal({ show, onClose, addElement }: Props) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Formas</h3>
                    <button onClick={onClose}><X/></button>
                </div>
                <div className="grid grid-cols-4 gap-3">
                    {SHAPES.map(({ type, icon, label, props }) => (
                        <button
                            key={type}
                            onClick={() => { addElement('SHAPE', { shapeType: type, ...props }); onClose(); }}
                            className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"
                        >
                            {icon}
                            <span className="text-xs font-bold text-slate-600">{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
