
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LabelTemplate, LabelElement } from '../types';
import { LabelService, AdminService } from '../services/api';
import Swal from 'sweetalert2';

// Constants
export const MM_TO_PX = 3.7795; // 96 DPI / 25.4
export const CM_TO_PX = 37.795; // 96 DPI / 2.54

const INITIAL_TEMPLATE: LabelTemplate = {
  id: '',
  name: 'Nuevo Diseño',
  category: 'GENERAL',
  type: 'LABEL',
  dataSource: 'NONE',
  isDefault: false,
  width: 50, // mm default
  height: 25, // mm default
  elements: []
};

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Definición de Tipos para Esquema Relacional
interface SchemaTable {
    columns: { name: string, type: string }[];
    relations: { column: string, foreignTable: string, foreignColumn: string }[];
}

export const useLabelDesigner = () => {
    // --- STATE ---
    const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(2); // Initial zoom factor
    const [history, setHistory] = useState<LabelTemplate[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [dbSchema, setDbSchema] = useState<Record<string, SchemaTable>>({});
    const [clipboard, setClipboard] = useState<LabelElement | null>(null);
    
    // Tools & Navigation
    const [tool, setTool] = useState<'SELECT' | 'HAND'>('SELECT');
    const [pan, setPan] = useState({ x: 0, y: 0 });
    
    // Derived State for Unit Scale
    const scaleFactor = template.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
    const unitLabel = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    // Interaction State
    const [interaction, setInteraction] = useState<{
        mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE' | 'PANNING';
        startPos: { x: number, y: number };
        elementStart: { x: number, y: number, w: number, h: number, r: number };
        panStart: { x: number, y: number };
        handle?: string; 
    }>({ mode: 'NONE', startPos: {x:0, y:0}, elementStart: {x:0, y:0, w:0, h:0, r:0}, panStart: {x:0, y:0} });

    // --- INITIALIZATION ---
    const loadTemplate = (tpl: LabelTemplate) => {
        setTemplate(tpl);
        setHistory([]);
        setHistoryIndex(-1);
        // Adjust zoom based on document type for better UX
        setZoom(tpl.type === 'DOCUMENT' ? 0.8 : 2.5);
        setPan({ x: 0, y: 0 });
        setTool('SELECT');
    };

    const createNew = (type: 'LABEL' | 'DOCUMENT', name: string) => {
        setTemplate({
            ...INITIAL_TEMPLATE,
            name,
            type,
            // A4 for Document (cm), Standard for Label (mm)
            width: type === 'DOCUMENT' ? 21 : 50,
            height: type === 'DOCUMENT' ? 29.7 : 25,
            category: type === 'DOCUMENT' ? 'REPORT' : 'GENERAL',
            elements: []
        });
        setHistory([]);
        setHistoryIndex(-1);
        setZoom(type === 'DOCUMENT' ? 0.8 : 2.5);
        setPan({ x: 0, y: 0 });
        setTool('SELECT');
    };

    const fetchDbSchema = async () => {
        try {
            const schema: any = await AdminService.getSchema();
            setDbSchema(schema);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchDbSchema();
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [selectedId, template, clipboard, historyIndex]);

    // --- HISTORY MANAGEMENT ---
    const addToHistory = (newState: LabelTemplate) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(newState)));
        if (newHistory.length > 20) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const undo = () => {
        if (historyIndex > 0) {
            setTemplate(history[historyIndex - 1]);
            setHistoryIndex(h => h - 1);
            setSelectedId(null);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            setTemplate(history[historyIndex + 1]);
            setHistoryIndex(h => h + 1);
            setSelectedId(null);
        }
    };

    // --- ELEMENT MANIPULATION ---
    const updateTemplate = (updates: Partial<LabelTemplate>) => {
        const newState = { ...template, ...updates };
        setTemplate(newState);
        addToHistory(newState);
    };

    const updateElement = (id: string, updates: Partial<LabelElement>) => {
        const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
        setTemplate({ ...template, elements: newElements });
    };

    const addElement = (type: LabelElement['type'], extra: Partial<LabelElement> = {}) => {
        const isDoc = template.type === 'DOCUMENT';
        // Default sizes based on unit type
        const defW = isDoc ? 5 : 30; // 5cm vs 30mm
        const defH = isDoc ? 2 : 5;  // 2cm vs 5mm

        const newEl: LabelElement = {
            id: generateId(),
            type,
            x: isDoc ? 2 : 5, y: isDoc ? 2 : 5,
            width: defW,
            height: defH,
            rotation: 0,
            content: type === 'TEXT' ? 'Texto' : '',
            fontSize: 10, color: '#000000', textAlign: 'left', fontWeight: 'normal', fontFamily: 'helvetica',
            barcodeFormat: 'CODE128', displayValue: true, shapeType: 'RECTANGLE',
            isStretchWithOverflow: false, // Default false
            ...extra
        };

        if (type === 'BARCODE') { newEl.content = '123456'; newEl.width = isDoc?6:30; newEl.height = isDoc?2:10; }
        if (type === 'QR') { newEl.content = 'QR CODE'; newEl.width = isDoc?3:15; newEl.height = isDoc?3:15; }
        if (type === 'SHAPE') { newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; newEl.width = isDoc?4:15; newEl.height = isDoc?4:15; }
        if (type === 'DETAIL_TABLE') { 
            newEl.width = template.width - (isDoc?2:10); 
            newEl.height = isDoc?5:15; 
            newEl.content = 'TABLA DETALLE'; 
        }

        const newElements = [...template.elements, newEl];
        updateTemplate({ elements: newElements });
        setSelectedId(newEl.id);
        setTool('SELECT'); // Switch to select mode after adding
    };

    const deleteSelected = () => {
        if (selectedId) {
            const newElements = template.elements.filter(e => e.id !== selectedId);
            updateTemplate({ elements: newElements });
            setSelectedId(null);
        }
    };

    // --- LAYERS & ORDERING ---
    const moveLayer = (direction: 'UP' | 'DOWN' | 'TOP' | 'BOTTOM') => {
        if (!selectedId) return;
        const index = template.elements.findIndex(e => e.id === selectedId);
        if (index === -1) return;

        const newElements = [...template.elements];
        const el = newElements.splice(index, 1)[0];

        if (direction === 'TOP') newElements.push(el);
        else if (direction === 'BOTTOM') newElements.unshift(el);
        else if (direction === 'UP') newElements.splice(Math.min(index + 1, newElements.length), 0, el);
        else if (direction === 'DOWN') newElements.splice(Math.max(index - 1, 0), 0, el);

        updateTemplate({ elements: newElements });
    };

    const reorderElements = (fromIndex: number, toIndex: number) => {
        const newElements = [...template.elements];
        const [movedItem] = newElements.splice(fromIndex, 1);
        newElements.splice(toIndex, 0, movedItem);
        updateTemplate({ elements: newElements });
    };

    // --- KEYBOARD SHORTCUTS ---
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (selectedId) {
                const el = template.elements.find(x => x.id === selectedId);
                if (el) setClipboard(el);
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            if (clipboard) {
                addElement(clipboard.type, {
                    ...clipboard,
                    x: clipboard.x + (template.type==='DOCUMENT'?0.5:2),
                    y: clipboard.y + (template.type==='DOCUMENT'?0.5:2)
                });
            }
            return;
        }

        if (e.key === 'Delete') {
            if (selectedId) deleteSelected();
            return;
        }
        
        if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const el = template.elements.find(x => x.id === selectedId);
            if (!el) return;

            const step = e.shiftKey ? (template.type==='DOCUMENT'?1:10) : (template.type==='DOCUMENT'?0.1:0.5);
            let { x, y } = el;

            if (e.key === 'ArrowUp') y -= step;
            if (e.key === 'ArrowDown') y += step;
            if (e.key === 'ArrowLeft') x -= step;
            if (e.key === 'ArrowRight') x += step;

            updateElement(selectedId, { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
        }
        
        if (e.key === 'Escape') setSelectedId(null);
    };

    const saveTemplate = async () => {
        if (!template.name) return Swal.fire('Error', 'Asigne un nombre al diseño', 'warning');
        try {
            if (template.id) await LabelService.update(template.id, template);
            else {
                const res: any = await LabelService.create(template);
                setTemplate({ ...template, id: res.id });
            }
            Swal.fire({ icon: 'success', title: 'Guardado', toast: true, position: 'bottom-end', timer: 2000, showConfirmButton: false });
            return true;
        } catch (e: any) { 
            Swal.fire('Error', e.message, 'error'); 
            return false;
        }
    };

    // --- INTERACTION LOGIC (CANVAS) ---
    // // Fix: Explicitly use React namespace for event types which require the React import.
    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string | null, mode: 'MOVE'|'RESIZE'|'ROTATE'|'PANNING', handle?: string) => {
        e.stopPropagation();
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        // If Tool is HAND, overwrite interaction to PANNING regardless of target
        if (tool === 'HAND') {
            setInteraction({
                mode: 'PANNING',
                startPos: { x: clientX, y: clientY },
                elementStart: { x:0, y:0, w:0, h:0, r:0 },
                panStart: { x: pan.x, y: pan.y }
            });
            return;
        }

        if (id) {
            const el = template.elements.find(x => x.id === id);
            if (!el) return;
            
            setSelectedId(id);
            setInteraction({
                mode,
                startPos: { x: clientX, y: clientY },
                elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation },
                panStart: { x: 0, y: 0 },
                handle
            });
        } else {
            // Clicked on empty canvas -> Deselect
            setSelectedId(null);
        }
    };

    // // Fix: Explicitly use React namespace for event types which require the React import.
    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (interaction.mode === 'NONE') return;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        if (interaction.mode === 'PANNING') {
            e.preventDefault(); // Prevent scroll on touch
            const deltaX = clientX - interaction.startPos.x;
            const deltaY = clientY - interaction.startPos.y;
            setPan({
                x: interaction.panStart.x + deltaX,
                y: interaction.panStart.y + deltaY
            });
            return;
        }

        if (!selectedId) return;

        const deltaX = (clientX - interaction.startPos.x) / (scaleFactor * zoom);
        const deltaY = (clientY - interaction.startPos.y) / (scaleFactor * zoom);
        
        const start = interaction.elementStart;
        let newEl = { ...template.elements.find(x => x.id === selectedId)! };

        if (interaction.mode === 'MOVE') {
            newEl.x = Number((start.x + deltaX).toFixed(2));
            newEl.y = Number((start.y + deltaY).toFixed(2));
        } else if (interaction.mode === 'RESIZE' && interaction.handle) {
            if (interaction.handle.includes('e')) newEl.width = Math.max(0.5, Number((start.w + deltaX).toFixed(2)));
            if (interaction.handle.includes('s')) newEl.height = Math.max(0.5, Number((start.h + deltaY).toFixed(2)));
        } else if (interaction.mode === 'ROTATE') {
            newEl.rotation = (start.r + ((clientX - interaction.startPos.x)/2)) % 360;
        }
        setTemplate(prev => ({ ...prev, elements: prev.elements.map(el => el.id === selectedId ? newEl : el) }));
    };

    const handlePointerUp = () => {
        if (interaction.mode !== 'NONE' && interaction.mode !== 'PANNING') {
            addToHistory(template);
        }
        setInteraction({ ...interaction, mode: 'NONE' });
    };

    return {
        template, setTemplate,
        selectedId, setSelectedId,
        zoom, setZoom,
        tool, setTool, pan, setPan,
        history, historyIndex,
        dbSchema,
        loadTemplate, createNew,
        undo, redo,
        addElement, updateElement, deleteSelected, updateTemplate,
        saveTemplate,
        moveLayer, reorderElements,
        interaction, scaleFactor, unitLabel,
        handlePointerDown, handlePointerMove, handlePointerUp
    };
};
