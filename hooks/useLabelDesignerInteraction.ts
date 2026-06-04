import React, { useState } from 'react';
import { LabelTemplate } from '../types';

interface InteractionState {
    mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE' | 'PANNING' | 'LASSO';
    startPos: { x: number; y: number };
    elementStart: { x: number; y: number; w: number; h: number; r: number };
    panStart: { x: number; y: number };
    handle?: string;
    multiElementStarts?: Record<string, { x: number; y: number }>;
}

const INITIAL_INTERACTION: InteractionState = {
    mode: 'NONE',
    startPos: { x: 0, y: 0 },
    elementStart: { x: 0, y: 0, w: 0, h: 0, r: 0 },
    panStart: { x: 0, y: 0 },
};

export function useLabelDesignerInteraction(
    template: LabelTemplate,
    setTemplate: React.Dispatch<React.SetStateAction<LabelTemplate>>,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    selectedIds: string[],
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>,
    zoom: number,
    pan: { x: number; y: number },
    setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>,
    tool: 'SELECT' | 'HAND',
    scaleFactor: number,
    addToHistory: (s: LabelTemplate) => void,
) {
    const [interaction, setInteraction] = useState<InteractionState>(INITIAL_INTERACTION);
    const [lasso, setLasso] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const [snapGuides, setSnapGuides] = useState<{ axis: 'x' | 'y'; pos: number }[]>([]);

    const snapValue = (val: number): number => {
        if (!template.snapEnabled || !template.gridSize) return val;
        const gs = template.gridSize;
        return Math.round(val / gs) * gs;
    };

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string | null, mode: 'MOVE' | 'RESIZE' | 'ROTATE' | 'PANNING', handle?: string) => {
        e.stopPropagation();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const isShift = 'shiftKey' in e ? e.shiftKey : false;

        if (tool === 'HAND') {
            setInteraction({ mode: 'PANNING', startPos: { x: clientX, y: clientY }, elementStart: { x:0, y:0, w:0, h:0, r:0 }, panStart: { x: pan.x, y: pan.y } });
            return;
        }

        if (id) {
            const el = template.elements.find(x => x.id === id);
            if (!el) return;

            if (el.locked && (mode === 'MOVE' || mode === 'RESIZE' || mode === 'ROTATE')) {
                setSelectedId(id);
                setSelectedIds([id]);
                return;
            }

            if (isShift && mode === 'MOVE') {
                setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                setSelectedId(id);
            } else if (mode !== 'RESIZE' && mode !== 'ROTATE') {
                setSelectedId(id);
                setSelectedIds([id]);
            } else {
                setSelectedId(id);
            }

            const multiStarts: Record<string, { x: number; y: number }> = {};
            if (mode === 'MOVE' && selectedIds.length > 1 && selectedIds.includes(id)) {
                template.elements.forEach(e2 => {
                    if (selectedIds.includes(e2.id)) multiStarts[e2.id] = { x: e2.x, y: e2.y };
                });
            }

            setInteraction({
                mode, startPos: { x: clientX, y: clientY },
                elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation },
                panStart: { x: 0, y: 0 }, handle,
                multiElementStarts: Object.keys(multiStarts).length > 0 ? multiStarts : undefined,
            });
        } else {
            if (tool === 'SELECT') {
                let lassoX = 0, lassoY = 0;
                const containerEl = ('currentTarget' in e) ? (e as React.MouseEvent).currentTarget as HTMLElement : null;
                if (containerEl) {
                    const rect = containerEl.getBoundingClientRect();
                    const pageW = template.width * scaleFactor * zoom;
                    const pageH = template.height * scaleFactor * zoom;
                    const pageOriginX = rect.width / 2 + pan.x - pageW / 2;
                    const pageOriginY = rect.height / 2 + pan.y - pageH / 2;
                    lassoX = (clientX - rect.left - pageOriginX) / (scaleFactor * zoom);
                    lassoY = (clientY - rect.top - pageOriginY) / (scaleFactor * zoom);
                }
                setLasso({ x1: lassoX, y1: lassoY, x2: lassoX, y2: lassoY });
                setInteraction({ mode: 'LASSO', startPos: { x: clientX, y: clientY }, elementStart: { x: lassoX, y: lassoY, w: 0, h: 0, r: 0 }, panStart: { x: 0, y: 0 } });
            } else {
                setSelectedId(null);
                setSelectedIds([]);
            }
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (interaction.mode === 'NONE') return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        if (interaction.mode === 'PANNING') {
            e.preventDefault();
            setPan({ x: interaction.panStart.x + (clientX - interaction.startPos.x), y: interaction.panStart.y + (clientY - interaction.startPos.y) });
            return;
        }

        if (interaction.mode === 'LASSO') {
            const dx = (clientX - interaction.startPos.x) / (scaleFactor * zoom);
            const dy = (clientY - interaction.startPos.y) / (scaleFactor * zoom);
            setLasso({ x1: interaction.elementStart.x, y1: interaction.elementStart.y, x2: interaction.elementStart.x + dx, y2: interaction.elementStart.y + dy });
            return;
        }

        if (!selectedId) return;

        const deltaX = (clientX - interaction.startPos.x) / (scaleFactor * zoom);
        const deltaY = (clientY - interaction.startPos.y) / (scaleFactor * zoom);
        const start = interaction.elementStart;
        let newEl = { ...template.elements.find(x => x.id === selectedId)! };

        if (interaction.mode === 'MOVE' && interaction.multiElementStarts && Object.keys(interaction.multiElementStarts).length > 0) {
            setTemplate(prev => ({
                ...prev,
                elements: prev.elements.map(el => {
                    const s = interaction.multiElementStarts![el.id];
                    if (!s) return el;
                    return { ...el, x: Number((s.x + deltaX).toFixed(2)), y: Number((s.y + deltaY).toFixed(2)) };
                }),
            }));
            return;
        }

        if (interaction.mode === 'MOVE') {
            let rawX = start.x + deltaX;
            let rawY = start.y + deltaY;

            const others = template.elements.filter(e => e.id !== selectedId);
            const threshold = template.type === 'DOCUMENT' ? 0.25 : 2.5;
            const guides: { axis: 'x' | 'y'; pos: number }[] = [];

            // X-axis snap
            const mLeft = rawX, mCenterX = rawX + newEl.width / 2, mRight = rawX + newEl.width;
            let snapX: number | null = null, snapXOffset = 0;
            for (const o of others) {
                for (const [oEdge, mEdge, offset] of [
                    [o.x, mLeft, 0], [o.x + o.width, mLeft, 0],
                    [o.x, mRight, -newEl.width], [o.x + o.width, mRight, -newEl.width],
                    [o.x + o.width / 2, mCenterX, -newEl.width / 2],
                ] as [number, number, number][]) {
                    if (Math.abs(oEdge - mEdge) < threshold && (snapX === null || Math.abs(oEdge - mEdge) < Math.abs(snapX - (mLeft - snapXOffset)))) {
                        snapX = oEdge; snapXOffset = offset;
                        if (!guides.find(g => g.axis === 'x' && Math.abs(g.pos - oEdge) < 0.01)) guides.push({ axis: 'x', pos: oEdge });
                    }
                }
            }
            if (snapX !== null) rawX = snapX + snapXOffset;

            // Y-axis snap
            const mTop = rawY, mCenterY = rawY + newEl.height / 2, mBottom = rawY + newEl.height;
            let snapY: number | null = null, snapYOffset = 0;
            for (const o of others) {
                for (const [oEdge, mEdge, offset] of [
                    [o.y, mTop, 0], [o.y + o.height, mTop, 0],
                    [o.y, mBottom, -newEl.height], [o.y + o.height, mBottom, -newEl.height],
                    [o.y + o.height / 2, mCenterY, -newEl.height / 2],
                ] as [number, number, number][]) {
                    if (Math.abs(oEdge - mEdge) < threshold && (snapY === null || Math.abs(oEdge - mEdge) < Math.abs(snapY - (mTop - snapYOffset)))) {
                        snapY = oEdge; snapYOffset = offset;
                        if (!guides.find(g => g.axis === 'y' && Math.abs(g.pos - oEdge) < 0.01)) guides.push({ axis: 'y', pos: oEdge });
                    }
                }
            }
            if (snapY !== null) rawY = snapY + snapYOffset;

            setSnapGuides(guides);
            newEl.x = snapValue(Number(rawX.toFixed(2)));
            newEl.y = snapValue(Number(rawY.toFixed(2)));
        } else if (interaction.mode === 'RESIZE' && interaction.handle) {
            const h = interaction.handle;
            if (h.includes('e')) newEl.width  = Math.max(1,   Number((start.w + deltaX).toFixed(2)));
            if (h.includes('s')) newEl.height = Math.max(0.5, Number((start.h + deltaY).toFixed(2)));
            if (h.includes('w')) { newEl.x = Number((start.x + deltaX).toFixed(2)); newEl.width  = Math.max(1,   Number((start.w - deltaX).toFixed(2))); }
            if (h.includes('n')) { newEl.y = Number((start.y + deltaY).toFixed(2)); newEl.height = Math.max(0.5, Number((start.h - deltaY).toFixed(2))); }
        } else if (interaction.mode === 'ROTATE') {
            newEl.rotation = (start.r + ((clientX - interaction.startPos.x) / 2)) % 360;
        }
        setTemplate(prev => ({ ...prev, elements: prev.elements.map(el => el.id === selectedId ? newEl : el) }));
    };

    const handlePointerUp = () => {
        if (interaction.mode === 'LASSO') {
            if (lasso) {
                const lx1 = Math.min(lasso.x1, lasso.x2), lx2 = Math.max(lasso.x1, lasso.x2);
                const ly1 = Math.min(lasso.y1, lasso.y2), ly2 = Math.max(lasso.y1, lasso.y2);
                const threshold = template.type === 'DOCUMENT' ? 0.3 : 2;
                if (Math.abs(lasso.x2 - lasso.x1) > threshold || Math.abs(lasso.y2 - lasso.y1) > threshold) {
                    const ids = template.elements
                        .filter(el => el.visible !== false && !el.locked)
                        .filter(el => !(el.x + el.width < lx1 || el.x > lx2 || el.y + el.height < ly1 || el.y > ly2))
                        .map(el => el.id);
                    if (ids.length > 0) {
                        setSelectedIds(ids);
                        setSelectedId(ids[ids.length - 1]);
                    } else {
                        setSelectedId(null);
                        setSelectedIds([]);
                    }
                } else {
                    setSelectedId(null);
                    setSelectedIds([]);
                }
            }
            setLasso(null);
            setInteraction({ ...interaction, mode: 'NONE' });
            return;
        }
        if (interaction.mode !== 'NONE' && interaction.mode !== 'PANNING') {
            addToHistory(template);
        }
        setSnapGuides([]);
        setInteraction({ ...interaction, mode: 'NONE' });
    };

    return { interaction, lasso, snapGuides, handlePointerDown, handlePointerMove, handlePointerUp, snapValue };
}
