
import { useState, useRef, useEffect } from 'react';
import { LabelTemplate, LabelElement } from '../types';
import { LabelService, AdminService } from '../services/api';
import Swal from 'sweetalert2';
import { MM_TO_PX, CM_TO_PX, INITIAL_TEMPLATE, SchemaTable, computeFitZoom, expandCompanyHeader } from './labelDesignerUtils';
import { useLabelDesignerElements } from './useLabelDesignerElements';
import { useLabelDesignerInteraction } from './useLabelDesignerInteraction';

export { MM_TO_PX, CM_TO_PX };

export const useLabelDesigner = () => {
    // --- STATE ---
    const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [zoom, setZoom] = useState(2);
    const [history, setHistory] = useState<LabelTemplate[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [dbSchema, setDbSchema] = useState<Record<string, SchemaTable>>({});
    const [clipboard, setClipboard] = useState<LabelElement | null>(null);
    const [tool, setTool] = useState<'SELECT' | 'HAND'>('SELECT');
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const scaleFactor = template.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
    const unitLabel = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    const isSpaceHeld = useRef(false);
    const preSpaceTool = useRef<'SELECT' | 'HAND'>('SELECT');
    const schemaFetchStarted = useRef(false);

    // --- HISTORY ---
    const addToHistory = (newState: LabelTemplate) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(newState)));
        if (newHistory.length > 20) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const undo = () => {
        if (historyIndex > 0) { setTemplate(history[historyIndex - 1]); setHistoryIndex(h => h - 1); setSelectedId(null); }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) { setTemplate(history[historyIndex + 1]); setHistoryIndex(h => h + 1); setSelectedId(null); }
    };

    // --- SUB-HOOKS ---
    const elements = useLabelDesignerElements(
        template, setTemplate, selectedId, setSelectedId, selectedIds, setSelectedIds, addToHistory, setTool
    );

    const interaction = useLabelDesignerInteraction(
        template, setTemplate, selectedId, setSelectedId, selectedIds, setSelectedIds,
        zoom, pan, setPan, tool, scaleFactor, addToHistory
    );

    // --- INITIALIZATION ---
    const loadTemplate = (tpl: LabelTemplate) => {
        const hasCompanyHeader = tpl.elements.some(e => e.type === 'COMPANY_HEADER');
        const resolvedElements = hasCompanyHeader
            ? tpl.elements.flatMap(e => e.type === 'COMPANY_HEADER' ? expandCompanyHeader(e) : [e])
            : tpl.elements;
        const resolvedTpl = hasCompanyHeader ? { ...tpl, elements: resolvedElements } : tpl;
        setTemplate(resolvedTpl);
        setHistory([]);
        setHistoryIndex(-1);
        setSelectedIds([]);
        setSelectedId(null);
        setZoom(computeFitZoom(resolvedTpl));
        setPan({ x: 0, y: 0 });
        setTool('SELECT');
    };

    const createNew = (type: 'LABEL' | 'DOCUMENT', name: string) => {
        const newTpl = {
            ...INITIAL_TEMPLATE, name, type,
            width:  type === 'DOCUMENT' ? 21   : 50,
            height: type === 'DOCUMENT' ? 29.7 : 25,
            category: type === 'DOCUMENT' ? 'REPORT' : 'GENERAL',
            elements: [], snapEnabled: false,
            gridSize: type === 'DOCUMENT' ? 1 : 5, showGrid: false,
        } as LabelTemplate;
        setTemplate(newTpl);
        setHistory([]);
        setHistoryIndex(-1);
        setSelectedIds([]);
        setZoom(computeFitZoom(newTpl));
        setPan({ x: 0, y: 0 });
        setTool('SELECT');
    };

    const fetchDbSchema = async () => {
        if (schemaFetchStarted.current) return;
        schemaFetchStarted.current = true;
        try {
            setDbSchema(await AdminService.getSchema() as any);
        } catch (e: any) {
            schemaFetchStarted.current = false;
            console.warn('No se pudo cargar el esquema del diseñador:', e?.message || e);
        }
    };

    // --- SAVE ---
    const saveTemplate = async () => {
        if (!template.name) return Swal.fire('Error', 'Asigne un nombre al diseño', 'warning');
        try {
            if (template.id) await LabelService.update(template.id, template);
            else {
                const res: any = await LabelService.create(template);
                setTemplate(prev => ({ ...prev, id: res.id }));
            }
            Swal.fire({ icon: 'success', title: 'Guardado', toast: true, position: 'bottom-end', timer: 2000, showConfirmButton: false });
            return true;
        } catch (e: any) {
            Swal.fire('Error', e.message, 'error');
            return false;
        }
    };

    // --- KEYBOARD SHORTCUTS ---
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const ids = template.elements.map(el => el.id);
            setSelectedIds(ids);
            if (ids.length > 0) setSelectedId(ids[ids.length - 1]);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (selectedId) {
                const el = template.elements.find(x => x.id === selectedId);
                if (el) setClipboard(el);
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            if (clipboard) {
                const offset = template.type === 'DOCUMENT' ? 1.5 : 5;
                elements.addElement(clipboard.type, { ...clipboard, x: clipboard.x + offset, y: clipboard.y + offset });
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            const idsToClone = selectedIds.length > 1 ? selectedIds : (selectedId ? [selectedId] : []);
            if (idsToClone.length === 0) return;
            const offset = template.type === 'DOCUMENT' ? 1.5 : 5;
            const clones = idsToClone.map(id => {
                const src = template.elements.find(x => x.id === id);
                if (!src) return null;
                return { ...src, id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, x: src.x + offset, y: src.y + offset };
            }).filter(Boolean) as LabelElement[];
            if (clones.length === 0) return;
            const newTemplate = { ...template, elements: [...template.elements, ...clones] };
            setTemplate(newTemplate);
            addToHistory(newTemplate);
            setSelectedId(clones[clones.length - 1].id);
            setSelectedIds(clones.map(c => c.id));
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedIds.length > 1) {
                const newEls = template.elements.filter(el => !selectedIds.includes(el.id));
                const newTpl = { ...template, elements: newEls };
                setTemplate(newTpl);
                addToHistory(newTpl);
                setSelectedId(null);
                setSelectedIds([]);
            } else if (selectedId) {
                elements.deleteSelected();
            }
            return;
        }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const idsToMove = selectedIds.length > 1 ? selectedIds : (selectedId ? [selectedId] : []);
            if (idsToMove.length === 0) return;
            e.preventDefault();
            const step = e.shiftKey ? (template.type === 'DOCUMENT' ? 1 : 10) : (template.type === 'DOCUMENT' ? 0.1 : 0.5);
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            const newEls = template.elements.map(el => {
                if (!idsToMove.includes(el.id)) return el;
                return { ...el, x: Number((el.x + dx).toFixed(2)), y: Number((el.y + dy).toFixed(2)) };
            });
            setTemplate({ ...template, elements: newEls });
            return;
        }
        if (e.key === 'Escape') { setSelectedId(null); setSelectedIds([]); return; }
        if (e.key === 'Tab') {
            e.preventDefault();
            const visible = template.elements.filter(el => el.visible !== false);
            if (!visible.length) return;
            const idx = visible.findIndex(el => el.id === selectedId);
            const next = e.shiftKey ? (idx - 1 + visible.length) % visible.length : (idx + 1) % visible.length;
            setSelectedId(visible[next].id);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
            e.preventDefault();
            if (!selectedId) return;
            const el = template.elements.find(x => x.id === selectedId);
            if (!el || el.type !== 'TEXT') return;
            elements.updateElement(selectedId, { fontSize: Math.max(4, (el.fontSize || 10) + (e.key === ']' ? 1 : -1)) });
        }
    };

    useEffect(() => {
        fetchDbSchema();
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
            if (e.code === 'Space' && !inInput) {
                e.preventDefault();
                if (!isSpaceHeld.current) { isSpaceHeld.current = true; preSpaceTool.current = 'SELECT'; setTool('HAND'); }
                return;
            }
            handleGlobalKeyDown(e);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space' && isSpaceHeld.current) { isSpaceHeld.current = false; setTool(preSpaceTool.current); }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
    }, [selectedId, template, clipboard, historyIndex]);

    return {
        template, setTemplate,
        selectedId, setSelectedId,
        selectedIds, setSelectedIds,
        zoom, setZoom,
        tool, setTool, pan, setPan,
        history, historyIndex,
        dbSchema,
        loadTemplate, createNew,
        undo, redo,
        ...elements,
        saveTemplate,
        scaleFactor, unitLabel,
        ...interaction,
    };
};
