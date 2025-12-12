
import React, { memo, useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { RotateCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { LabelTemplate, LabelElement } from '../../types';
import { useLabelDesigner } from '../../hooks/useLabelDesigner';

interface DesignerCanvasProps {
    template: LabelTemplate;
    selectedId: string | null;
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    setSelectedId: (id: string | null) => void;
    onPointerDown: (e: any, id: string | null, mode: any, handle?: string) => void;
    tool: 'SELECT' | 'HAND';
    pan: { x: number, y: number };
}

const renderBarcode = (el: LabelElement) => {
    const canvas = document.createElement('canvas');
    try { 
        // FIX: If content has variable braces {{...}}, render a generic code for preview
        const hasVariable = /{{.*?}}/.test(el.content);
        const content = hasVariable ? '123456' : el.content;
        
        JsBarcode(canvas, content, { format: (el.barcodeFormat as any) || "CODE128", displayValue: el.displayValue, margin: 0, width: 2, height: 50, fontSize: 20 }); 
        return canvas.toDataURL("image/png"); 
    } catch (e) { return ''; }
};

const renderQR = (el: LabelElement) => { 
    let url = ''; 
    const hasVariable = /{{.*?}}/.test(el.content);
    const content = hasVariable ? 'DEMO-QR' : el.content;
    QRCode.toDataURL(content, { margin: 0 }, (err, u) => { url = u; }); 
    return url; 
};

// Memoized Element with Scale Injection
const CanvasElement = memo(({ el, isSelected, scale, onPointerDown, onSelect, tool }: any) => {
    // Logic for "Hollow" objects:
    // If it's a SHAPE and fill is transparent (or none), the CONTAINER should ignore pointers
    // so you can click things behind it. The INNER visible part should capture pointers.
    const isHollow = el.type === 'SHAPE' && (el.fill === 'transparent' || !el.fill);
    
    return (
        <div
            onMouseDown={(e) => tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE')}
            onTouchStart={(e) => tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE')}
            className={`absolute group select-none cursor-move
                ${isSelected ? 'z-50 outline outline-2 outline-indigo-500' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}
                ${isHollow ? 'pointer-events-none' : ''}`} 
            style={{
                left: `${el.x * scale}px`,
                top: `${el.y * scale}px`,
                width: `${el.width * scale}px`,
                height: `${el.height * scale}px`,
                transform: `rotate(${el.rotation}deg)`,
            }}
            onClick={(e) => { e.stopPropagation(); if(tool === 'SELECT') onSelect(el.id); }}
        >
            {/* Inner Content needs pointer-events-auto if container is none, EXCEPT for pure transparent fill where we only want border clickable? 
                Actually, user wants to select "what is inside the hole". So the center must pass events.
                The border/content needs to capture it.
            */}
            <div className={`w-full h-full overflow-hidden flex items-center justify-center relative ${isHollow ? 'pointer-events-none' : ''}`} style={{
                borderRadius: el.shapeType === 'CIRCLE' ? '50%' : '0',
                backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent',
            }}>
                {/* Specific Handling for Hollow Shapes BORDER */}
                {el.type === 'SHAPE' && (
                    <div 
                        className={isHollow ? 'pointer-events-auto' : ''}
                        style={{
                            position: 'absolute', inset: 0,
                            border: el.shapeType !== 'LINE' ? `${(el.strokeWidth||1)}px solid ${el.stroke}` : 'none',
                            borderRadius: el.shapeType === 'CIRCLE' ? '50%' : '0'
                        }}
                    />
                )}

                {el.type === 'TEXT' && (
                    <div className="pointer-events-auto" style={{
                        fontSize: `${(el.fontSize||10)}pt`, 
                        fontFamily: el.fontFamily,
                        fontWeight: el.fontWeight,
                        color: el.color,
                        textAlign: el.textAlign,
                        whiteSpace: el.isMultiline ? 'pre-wrap' : 'nowrap',
                        width: '100%', height: '100%', lineHeight: 1.2,
                        display: 'flex', alignItems: 'center', justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start'
                    }}>{el.content}</div>
                )}
                {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                {el.type === 'QR' && <img src={renderQR(el)} className="w-full h-full object-contain pointer-events-none"/>}
                {el.type === 'IMAGE' && <img src={el.content} className="w-full h-full object-contain pointer-events-none"/>}
                {el.type === 'SHAPE' && el.shapeType === 'LINE' && <div className={isHollow ? 'pointer-events-auto' : ''} style={{width:'100%', height:`${(el.strokeWidth||1)}px`, backgroundColor: el.stroke}}/>}
                
                {el.type === 'DETAIL_TABLE' && (
                    <div className="w-full h-full border border-slate-300 bg-white text-xs pointer-events-auto">
                        <div className="bg-slate-100 font-bold p-1 border-b">Encabezado Tabla</div>
                        <div className="p-1 text-slate-400">Filas de datos...</div>
                    </div>
                )}
            </div>

            {/* HANDLES */}
            {isSelected && tool === 'SELECT' && (
                <>
                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-sm cursor-nwse-resize pointer-events-auto"
                            onMouseDown={(e) => onPointerDown(e, el.id, 'RESIZE', 'se')} onTouchStart={(e) => onPointerDown(e, el.id, 'RESIZE', 'se')}/>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center cursor-grab shadow-sm text-slate-500 pointer-events-auto"
                            onMouseDown={(e) => onPointerDown(e, el.id, 'ROTATE')} onTouchStart={(e) => onPointerDown(e, el.id, 'ROTATE')}>
                        <RotateCw size={12}/>
                    </div>
                </>
            )}
        </div>
    );
});

const DesignerCanvas: React.FC<DesignerCanvasProps> = ({ template, selectedId, zoom, setZoom, setSelectedId, onPointerDown, tool, pan }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDist = useRef<number | null>(null);
    
    const currentScale = template.type === 'DOCUMENT' ? 37.795 : 3.7795;
    const currentUnit = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    // --- GESTURE LOGIC ---
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY * -0.01;
                setZoom(z => Math.max(0.1, Math.min(5, z + delta)));
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                lastDist.current = dist;
            } else if (e.touches.length === 1 && tool === 'HAND') {
                // Handled in onPointerDown via parent
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && lastDist.current) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const delta = dist - lastDist.current;
                setZoom(z => Math.max(0.1, Math.min(5, z + (delta * 0.005))));
                lastDist.current = dist;
            }
        };

        const handleTouchEnd = () => { lastDist.current = null; };

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [setZoom, tool]);

    return (
        <div 
            ref={containerRef}
            className={`flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-8 touch-none ${tool === 'HAND' ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onMouseDown={(e) => onPointerDown(e, null, 'PANNING')}
            onTouchStart={(e) => onPointerDown(e, null, 'PANNING')}
        >
            {/* Viewport Controls */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white p-1 rounded-xl shadow-lg border border-slate-200 z-20">
                <button onClick={() => setZoom(z => Math.min(z + 0.5, 5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomIn size={20}/></button>
                <div className="text-[10px] font-bold text-slate-400 text-center py-1 border-y border-slate-100 select-none">{Math.round(zoom*100)}%</div>
                <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomOut size={20}/></button>
                <button onClick={() => { /* Reset View */ }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 border-t border-slate-100 mt-1"><Maximize size={20}/></button>
            </div>

            <div 
                className="bg-white shadow-2xl relative transition-transform duration-75 ease-out ring-1 ring-slate-900/5 origin-center"
                style={{
                    width: `${template.width * currentScale}px`,
                    height: `${template.height * currentScale}px`,
                    // Apply Pan and Zoom
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()} // Stop propagation to canvas pan if clicking inside paper
                onTouchStart={(e) => e.stopPropagation()}
            >
                {/* Visual Grid for Reports */}
                {template.type === 'DOCUMENT' && (
                    <div className="absolute inset-0 pointer-events-none opacity-10" 
                        style={{backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`, backgroundSize: `${currentScale}px ${currentScale}px`}}>
                    </div>
                )}

                <div 
                    className="absolute -top-8 left-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm opacity-50 hover:opacity-100 transition-opacity"
                    style={{ transform: `scale(${1/zoom})`, transformOrigin: 'bottom left' }}
                >
                    {template.width}{currentUnit} x {template.height}{currentUnit}
                </div>

                {template.elements.map(el => (
                    <CanvasElement 
                        key={el.id} 
                        el={el} 
                        isSelected={selectedId === el.id} 
                        scale={currentScale}
                        onPointerDown={onPointerDown}
                        onSelect={setSelectedId}
                        tool={tool}
                    />
                ))}
            </div>
        </div>
    );
};

export default memo(DesignerCanvas);
