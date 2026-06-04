
import React, { memo, useRef, useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2 } from 'lucide-react';
import { LabelTemplate, EmpresaConfig } from '../../types';
import CanvasElement from './CanvasElement';

interface DesignerCanvasProps {
    template: LabelTemplate;
    selectedId: string | null;
    selectedIds?: string[];
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    setPan?: (p: {x:number;y:number}) => void;
    setSelectedId: (id: string | null) => void;
    setSelectedIds?: (ids: string[]) => void;
    onPointerDown: (e: any, id: string | null, mode: any, handle?: string) => void;
    tool: 'SELECT' | 'HAND';
    setTool?: (t: 'SELECT' | 'HAND') => void;
    pan: { x: number, y: number };
    editingId?: string | null;
    onStartEdit?: (id: string) => void;
    onCommitEdit?: (id: string, value: string) => void;
    snapGuides?: { axis: 'x' | 'y'; pos: number }[];
    onContextMenu?: (e: React.MouseEvent, id: string) => void;
    empresaConfig?: Partial<EmpresaConfig>;
    lasso?: { x1: number; y1: number; x2: number; y2: number } | null;
}

const DesignerCanvas: React.FC<DesignerCanvasProps> = ({ template, selectedId, selectedIds = [], zoom, setZoom, setPan, setSelectedId, setSelectedIds, onPointerDown, tool, setTool, pan, editingId, onStartEdit, onCommitEdit, snapGuides = [], onContextMenu, empresaConfig, lasso }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDist = useRef<number | null>(null);
    const panRef = useRef(pan);
    const zoomRef = useRef(zoom);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
    const [editingZoomInput, setEditingZoomInput] = useState(false);
    const [zoomInputVal, setZoomInputVal] = useState('');
    const mmPan = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);

    const currentScale = template.type === 'DOCUMENT' ? 37.795 : 3.7795;
    const currentUnit = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    useEffect(() => { panRef.current = pan; }, [pan]);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                const rect = container.getBoundingClientRect();
                const mx = e.clientX - rect.left - rect.width / 2;
                const my = e.clientY - rect.top - rect.height / 2;
                const factor = e.deltaY < 0 ? 1.12 : 0.893;
                const prevZoom = zoomRef.current;
                const newZoom = Math.max(0.1, Math.min(8, prevZoom * factor));
                const ratio = newZoom / prevZoom;
                const prevPan = panRef.current;
                setZoom(newZoom);
                setPan?.({ x: mx + (prevPan.x - mx) * ratio, y: my + (prevPan.y - my) * ratio });
            } else {
                const prevPan = panRef.current;
                setPan?.({ x: prevPan.x - (e.shiftKey ? e.deltaY : e.deltaX), y: prevPan.y - (e.shiftKey ? e.deltaX : e.deltaY) });
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 1) {
                e.preventDefault();
                mmPan.current = { startX: e.clientX, startY: e.clientY, startPan: { ...panRef.current } };
            }
        };
        const handleMouseMove = (e: MouseEvent) => {
            if (mmPan.current) {
                const dx = e.clientX - mmPan.current.startX;
                const dy = e.clientY - mmPan.current.startY;
                setPan?.({ x: mmPan.current.startPan.x + dx, y: mmPan.current.startPan.y + dy });
            }
        };
        const handleMouseUp = (e: MouseEvent) => { if (e.button === 1) mmPan.current = null; };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                lastDist.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && lastDist.current !== null) {
                e.preventDefault();
                const rect = container.getBoundingClientRect();
                const t0 = e.touches[0], t1 = e.touches[1];
                const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
                const mx = ((t0.clientX + t1.clientX) / 2) - rect.left - rect.width / 2;
                const my = ((t0.clientY + t1.clientY) / 2) - rect.top - rect.height / 2;
                const factor = dist / lastDist.current;
                const prevZoom = zoomRef.current;
                const newZoom = Math.max(0.1, Math.min(5, prevZoom * factor));
                const ratio = newZoom / prevZoom;
                const prevPan = panRef.current;
                setZoom(newZoom);
                setPan?.({ x: mx + (prevPan.x - mx) * ratio, y: my + (prevPan.y - my) * ratio });
                lastDist.current = dist;
            }
        };

        const handleTouchEnd = () => { lastDist.current = null; };

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [setZoom, tool, setPan]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setContainerSize({ w: el.offsetWidth, h: el.offsetHeight }));
        obs.observe(el);
        setContainerSize({ w: el.offsetWidth, h: el.offsetHeight });
        return () => obs.disconnect();
    }, []);

    const handleElementSelect = (id: string, e: React.MouseEvent) => { setSelectedId(id); };

    return (
        <div
            ref={containerRef}
            className={`flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-2 md:p-8 touch-none ${tool === 'HAND' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            onMouseDown={(e) => onPointerDown(e, null, tool === 'HAND' ? 'PANNING' : 'PANNING')}
            onTouchStart={(e) => onPointerDown(e, null, 'PANNING')}
        >
            {/* Rulers */}
            {containerSize.w > 0 && (() => {
                const RULER_SIZE = 18;
                const tickUnit = currentScale * zoom;
                const canvasW = template.width * currentScale * zoom;
                const canvasH = template.height * currentScale * zoom;
                const originX = containerSize.w / 2 + pan.x - canvasW / 2;
                const originY = containerSize.h / 2 + pan.y - canvasH / 2;
                const rawInterval = 60 / tickUnit;
                const niceIntervals = [0.5, 1, 2, 5, 10, 20, 50, 100];
                const tickInterval = niceIntervals.find(n => n >= rawInterval) ?? 100;

                const hTicks: { pos: number; label: string }[] = [];
                const startU = Math.floor(-originX / tickUnit / tickInterval) * tickInterval;
                const endU = Math.ceil((containerSize.w - originX) / tickUnit / tickInterval) * tickInterval;
                for (let u = startU; u <= endU; u += tickInterval) hTicks.push({ pos: originX + u * tickUnit, label: String(u) });

                const vTicks: { pos: number; label: string }[] = [];
                const startV = Math.floor(-originY / tickUnit / tickInterval) * tickInterval;
                const endV = Math.ceil((containerSize.h - originY) / tickUnit / tickInterval) * tickInterval;
                for (let v = startV; v <= endV; v += tickInterval) vTicks.push({ pos: originY + v * tickUnit, label: String(v) });

                return (
                    <>
                        <svg className="absolute top-0 left-0 pointer-events-none z-30" style={{ width: containerSize.w, height: RULER_SIZE }}>
                            <rect width={containerSize.w} height={RULER_SIZE} fill="#f8fafc" />
                            <line x1={0} y1={RULER_SIZE} x2={containerSize.w} y2={RULER_SIZE} stroke="#cbd5e1" strokeWidth={1}/>
                            {hTicks.map((t, i) => (
                                <g key={i}>
                                    <line x1={t.pos} y1={RULER_SIZE - 8} x2={t.pos} y2={RULER_SIZE} stroke="#94a3b8" strokeWidth={1}/>
                                    <text x={t.pos + 2} y={RULER_SIZE - 10} fontSize={8} fill="#94a3b8" fontFamily="monospace">{t.label}</text>
                                </g>
                            ))}
                            <rect width={RULER_SIZE} height={RULER_SIZE} fill="#e2e8f0"/>
                            <text x={2} y={12} fontSize={7} fill="#94a3b8" fontFamily="monospace">{currentUnit}</text>
                        </svg>
                        <svg className="absolute top-0 left-0 pointer-events-none z-30" style={{ width: RULER_SIZE, height: containerSize.h }}>
                            <rect width={RULER_SIZE} height={containerSize.h} fill="#f8fafc" />
                            <line x1={RULER_SIZE} y1={0} x2={RULER_SIZE} y2={containerSize.h} stroke="#cbd5e1" strokeWidth={1}/>
                            {vTicks.map((t, i) => (
                                <g key={i} transform={`translate(0, ${t.pos})`}>
                                    <line x1={RULER_SIZE - 8} y1={0} x2={RULER_SIZE} y2={0} stroke="#94a3b8" strokeWidth={1}/>
                                    <text x={RULER_SIZE - 9} y={0} fontSize={8} fill="#94a3b8" fontFamily="monospace"
                                        transform={`rotate(-90, ${RULER_SIZE - 9}, 0)`} textAnchor="start">{t.label}</text>
                                </g>
                            ))}
                            <rect width={RULER_SIZE} height={RULER_SIZE} fill="#e2e8f0"/>
                        </svg>
                    </>
                );
            })()}

            {/* Viewport Controls */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-1 bg-white p-1 rounded-xl shadow-lg border border-slate-200 z-20 select-none">
                {setTool && (
                    <div className="flex gap-1 mb-1 pb-1 border-b border-slate-100">
                        <button title="Seleccionar (V)" onClick={() => setTool('SELECT')} className={`flex-1 p-1.5 rounded-lg transition-colors ${tool === 'SELECT' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-500'}`}><MousePointer2 size={15}/></button>
                        <button title="Mover (H / Espacio)" onClick={() => setTool('HAND')} className={`flex-1 p-1.5 rounded-lg transition-colors ${tool === 'HAND' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-500'}`}><Hand size={15}/></button>
                    </div>
                )}
                <button onClick={() => { const prevZ = zoom; const newZ = Math.min(prevZ * 1.25, 8); setZoom(newZ); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Zoom + (Ctrl+Scroll)"><ZoomIn size={18}/></button>
                <div className="relative group">
                    {editingZoomInput ? (
                        <input type="number" autoFocus value={zoomInputVal} onChange={e => setZoomInputVal(e.target.value)}
                            onBlur={() => { const pct = parseInt(zoomInputVal); if (!isNaN(pct) && pct >= 5 && pct <= 800) setZoom(pct / 100); setEditingZoomInput(false); }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingZoomInput(false); }}
                            className="w-14 text-center text-[10px] font-bold py-1 border-y border-slate-100 outline-none bg-transparent"/>
                    ) : (
                        <button title="Click para escribir zoom exacto" onClick={() => { setZoomInputVal(String(Math.round(zoom * 100))); setEditingZoomInput(true); }}
                            className="text-[10px] font-bold text-slate-500 text-center py-1 px-2 border-y border-slate-100 hover:bg-slate-50 w-full transition-colors">
                            {Math.round(zoom * 100)}%
                        </button>
                    )}
                    <div className="absolute left-full ml-1 bottom-0 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 w-16">
                        {[25, 50, 75, 100, 150, 200, 300, 400].map(pct => (
                            <button key={pct} onClick={() => setZoom(pct / 100)}
                                className={`px-3 py-1.5 text-xs font-bold hover:bg-indigo-50 text-left transition-colors ${Math.round(zoom * 100) === pct ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`}>
                                {pct}%
                            </button>
                        ))}
                    </div>
                </div>
                <button onClick={() => setZoom(z => Math.max(z / 1.25, 0.05))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Zoom - (Ctrl+Scroll)"><ZoomOut size={18}/></button>
                <button title="Ajustar página" onClick={() => {
                    if (!containerRef.current) return;
                    const cw = containerRef.current.offsetWidth - 64;
                    const ch = containerRef.current.offsetHeight - 64;
                    const tw = template.width * currentScale;
                    const th = template.height * currentScale;
                    setZoom(Math.max(0.05, Math.min(cw / tw, ch / th, 4)));
                    setPan?.({ x: 0, y: 0 });
                }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 border-t border-slate-100 mt-0.5"><Maximize size={18}/></button>
            </div>

            {/* Pan scrollbars */}
            {containerSize.w > 0 && (() => {
                const pageW = template.width * currentScale * zoom;
                const pageH = template.height * currentScale * zoom;
                const rangeH = Math.max(pageW, containerSize.w);
                const rangeV = Math.max(pageH, containerSize.h);
                return (
                    <>
                        <div className="absolute bottom-0 left-5 right-5 h-3 flex items-center z-20 pointer-events-none">
                            <div className="w-full pointer-events-auto opacity-0 hover:opacity-100 transition-opacity">
                                <input type="range" min={-rangeH} max={rangeH} step={1} value={pan.x}
                                    onChange={e => setPan?.({ x: Number(e.target.value), y: pan.y })}
                                    className="w-full h-1 accent-indigo-500 cursor-pointer" title="Desplazar horizontalmente"/>
                            </div>
                        </div>
                        <div className="absolute top-5 bottom-5 right-0 w-3 flex justify-center z-20 pointer-events-none">
                            <div className="h-full pointer-events-auto opacity-0 hover:opacity-100 transition-opacity flex items-center">
                                <input type="range" min={-rangeV} max={rangeV} step={1} value={pan.y}
                                    onChange={e => setPan?.({ x: pan.x, y: Number(e.target.value) })}
                                    className="h-full accent-indigo-500 cursor-pointer"
                                    style={{ writingMode: 'vertical-lr' as any, direction: 'rtl' as any, appearance: 'slider-vertical' as any, width: 12 }}
                                    title="Desplazar verticalmente"/>
                            </div>
                        </div>
                    </>
                );
            })()}

            {/* Canvas outer wrapper */}
            <div style={{
                width: `${template.width * currentScale * zoom}px`,
                height: `${template.height * currentScale * zoom}px`,
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                flexShrink: 0, position: 'relative',
                cursor: tool === 'HAND' ? 'inherit' : undefined,
            }}
                onClick={(e) => { if (tool !== 'HAND') e.stopPropagation(); }}
                onMouseDown={(e) => { if (tool !== 'HAND') e.stopPropagation(); }}
                onTouchStart={(e) => { if (tool !== 'HAND') e.stopPropagation(); }}
            >
                <div className="absolute -top-7 left-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm opacity-50 hover:opacity-100 transition-opacity" style={{ whiteSpace: 'nowrap' }}>
                    {template.width}{currentUnit} x {template.height}{currentUnit}
                </div>
                <div className="bg-white shadow-2xl relative transition-transform duration-75 ease-out ring-1 ring-slate-900/5 overflow-hidden"
                    style={{
                        width: `${template.width * currentScale}px`,
                        height: `${template.height * currentScale}px`,
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                        backgroundColor: template.backgroundColor || '#ffffff',
                    }}
                >
                    {template.showGrid && (() => {
                        const gs = (template.gridSize || (template.type === 'DOCUMENT' ? 1 : 5)) * currentScale;
                        return (
                            <svg className="absolute inset-0 pointer-events-none" style={{ width: template.width * currentScale, height: template.height * currentScale }}>
                                <defs>
                                    <pattern id="designer-grid" width={gs} height={gs} patternUnits="userSpaceOnUse">
                                        <path d={`M ${gs} 0 L 0 0 0 ${gs}`} fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>
                                    </pattern>
                                </defs>
                                <rect width="100%" height="100%" fill="url(#designer-grid)" />
                            </svg>
                        );
                    })()}

                    {!template.showGrid && template.type === 'DOCUMENT' && (
                        <div className="absolute inset-0 pointer-events-none opacity-10"
                            style={{backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`, backgroundSize: `${currentScale}px ${currentScale}px`}}/>
                    )}

                    {template.elements.map(el => el.visible === false ? null : (
                        <CanvasElement
                            key={el.id}
                            el={el}
                            isSelected={selectedId === el.id}
                            isMultiSelected={selectedIds.includes(el.id) && selectedId !== el.id}
                            scale={currentScale}
                            onPointerDown={onPointerDown}
                            onSelect={handleElementSelect}
                            tool={tool}
                            isEditing={editingId === el.id}
                            onStartEdit={onStartEdit}
                            onCommitEdit={onCommitEdit}
                            onContextMenu={onContextMenu}
                            empresaConfig={empresaConfig}
                        />
                    ))}

                    {snapGuides.length > 0 && (
                        <svg className="absolute inset-0 pointer-events-none z-[200]"
                            style={{ width: template.width * currentScale, height: template.height * currentScale, overflow: 'visible' }}>
                            {snapGuides.map((g, i) => g.axis === 'x'
                                ? <line key={i} x1={g.pos * currentScale} y1={-9999} x2={g.pos * currentScale} y2={9999} stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}/>
                                : <line key={i} x1={-9999} y1={g.pos * currentScale} x2={9999} y2={g.pos * currentScale} stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}/>
                            )}
                        </svg>
                    )}

                    {lasso && (
                        <div className="absolute pointer-events-none z-[300]" style={{
                            left: Math.min(lasso.x1, lasso.x2) * currentScale,
                            top:  Math.min(lasso.y1, lasso.y2) * currentScale,
                            width:  Math.abs(lasso.x2 - lasso.x1) * currentScale,
                            height: Math.abs(lasso.y2 - lasso.y1) * currentScale,
                            border: '1.5px dashed #6366f1',
                            background: 'rgba(99,102,241,0.07)',
                            borderRadius: 2,
                        }}/>
                    )}
                </div>
            </div>
        </div>
    );
};

export default memo(DesignerCanvas);
