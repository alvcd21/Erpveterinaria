
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
  ArrowLeft, Save, Type, ScanLine, Trash2, 
  AlignLeft, AlignCenter, AlignRight, X, 
  Check, ChevronDown, FileCog,
  QrCode, Image as ImageIcon, Square, Undo2, Redo2,
  ZoomIn, ZoomOut, Layers, Upload, Settings,
  RotateCw, RotateCcw, Move, ArrowUp, ArrowDown,
  Database, Shapes, Circle, Minus,
  FileText, Receipt, Table as TableIcon, Eye, Star,
  Ruler, Columns, Filter, Tag
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService, AdminService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- CONSTANTS ---
const MM_TO_PX = 3.7795; // 96 DPI
const CM_TO_PX = 37.795;

const FONTS = [
    { name: 'Predeterminada', value: 'helvetica' },
    { name: 'Roboto', value: "'Roboto', sans-serif" },
    { name: 'Open Sans', value: "'Open Sans', sans-serif" },
    { name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { name: 'Oswald', value: "'Oswald', sans-serif" },
    { name: 'Playfair', value: "'Playfair Display', serif" },
    { name: 'Courier (Code)', value: "'Courier Prime', monospace" },
];

const INITIAL_TEMPLATE: LabelTemplate = {
  id: '',
  name: 'Nuevo Diseño',
  category: 'GENERAL',
  type: 'LABEL',
  dataSource: 'NONE',
  isDefault: false,
  width: 50,
  height: 25,
  elements: []
};

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- COMPONENT: PropertyInput (DEFINED OUTSIDE TO FIX FOCUS LOSS) ---
const PropertyInput = React.memo(({ label, value, onChange, type = "text", step, min, className, disabled, placeholder }: any) => {
    // Keep local state for fast typing
    const [localValue, setLocalValue] = useState(value);

    // Sync from parent ONLY if parent changes drastically (e.g. undo/redo) or initially
    // We compare with previous prop to avoid loop if parent updates on every keystroke
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleBlur = () => {
        let finalVal = localValue;
        if (type === 'number') {
            finalVal = parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        if (finalVal !== value) {
            onChange(finalVal);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>}
            <div className={`flex items-center gap-1 bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all overflow-hidden h-9 ${disabled ? 'bg-slate-100' : ''}`}>
                <input 
                    type={type}
                    step={step}
                    min={min}
                    disabled={disabled}
                    placeholder={placeholder}
                    className="w-full px-2 text-sm font-mono outline-none bg-transparent h-full text-slate-700"
                    value={localValue} 
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    );
});

// --- COMPONENT: Band Separator (For Reports) ---
const BandSeparator = ({ label, y, width, zoom }: { label: string, y: number, width: number, zoom: number }) => (
    <div 
        className="absolute left-0 border-t border-dashed border-indigo-300 w-full flex items-center"
        style={{ top: `${y * zoom}px`, width: `${width * zoom}px` }}
    >
        <span className="bg-indigo-100 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-r uppercase border border-indigo-200 border-l-0 shadow-sm relative -top-3">
            {label}
        </span>
    </div>
);

// --- MAIN COMPONENT ---
const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = 100% based on Unit (MM or CM)
  const [unit, setUnit] = useState<'mm' | 'cm'>('mm'); // Unit state
  
  const [history, setHistory] = useState<LabelTemplate[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Panels & Modals
  const [activeTab, setActiveTab] = useState<'PROPERTIES' | 'DATA'>('PROPERTIES');
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(true); // Start with setup
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  
  // Data Source State
  const [dbSchema, setDbSchema] = useState<Record<string, {name:string, type:string}[]>>({});
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [queryConditions, setQueryConditions] = useState<{field:string, operator:string, value:string}[]>([]);

  // Interaction
  const [interaction, setInteraction] = useState<{
      mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE';
      startPos: { x: number, y: number };
      elementStart: { x: number, y: number, w: number, h: number, r: number };
      handle?: string; 
  }>({ mode: 'NONE', startPos: {x:0, y:0}, elementStart: {x:0, y:0, w:0, h:0, r:0} });

  const canvasRef = useRef<HTMLDivElement>(null);

  // Conversion Factor based on unit
  const SCALE = unit === 'mm' ? MM_TO_PX : CM_TO_PX;

  // --- LIFECYCLE ---
  useEffect(() => {
      loadSavedTemplates();
      fetchDbSchema();
      // Setup Defaults
      setZoom(1.5); 
  }, []);

  const fetchDbSchema = async () => {
      try {
          const schema = await AdminService.getSchema();
          setDbSchema(schema);
      } catch (e) {
          console.error("Error loading schema", e);
      }
  };

  // --- LOGIC ---
  const handleResize = () => {
      // Responsive zoom logic if needed
  };

  const loadSavedTemplates = async () => {
      try {
          const data = await LabelService.getAll();
          setSavedTemplates(data || []);
      } catch (e) { console.error(e); }
  };

  const addToHistory = (newState: LabelTemplate) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newState)));
      if (newHistory.length > 20) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const updateTemplate = (updates: Partial<LabelTemplate>) => {
      const newState = { ...template, ...updates };
      setTemplate(newState);
      addToHistory(newState);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
      const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
      // Direct update for speed, history on interaction end
      setTemplate({ ...template, elements: newElements });
  };

  // --- TOOLS ---
  const addElement = (type: LabelElement['type'], extra: Partial<LabelElement> = {}) => {
      const newEl: LabelElement = {
          id: generateId(),
          type,
          x: 1, y: 1,
          width: type === 'TEXT' ? 5 : 3, // Default size in logic units (cm or mm approx)
          height: type === 'TEXT' ? 1 : 3,
          rotation: 0,
          content: type === 'TEXT' ? 'Texto' : '',
          fontSize: 10, color: '#000000', textAlign: 'left',
          shapeType: 'RECTANGLE',
          ...extra
      };
      
      // Adjust defaults based on Unit
      if (unit === 'mm') {
          newEl.x = 5; newEl.y = 5;
          newEl.width = type === 'TEXT' ? 30 : 20;
          newEl.height = type === 'TEXT' ? 5 : 20;
      }

      if (type === 'BARCODE') { newEl.content = '123456'; newEl.width = unit==='mm'?30:4; newEl.height = unit==='mm'?10:1.5; }
      if (type === 'DETAIL_TABLE') { 
          newEl.width = template.width - (unit==='mm'?10:2); 
          newEl.height = unit==='mm'?20:3; 
          newEl.content = 'TABLA DE DATOS (Repetible)'; 
      }

      const newElements = [...template.elements, newEl];
      updateTemplate({ elements: newElements });
      setSelectedId(newEl.id);
  };

  // --- INTERACTION ---
  const handlePointerDown = (e: React.MouseEvent, id: string, mode: 'MOVE'|'RESIZE'|'ROTATE', handle?: string) => {
      e.stopPropagation();
      const el = template.elements.find(x => x.id === id);
      if (!el) return;
      setSelectedId(id);
      setInteraction({
          mode,
          startPos: { x: e.clientX, y: e.clientY },
          elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation },
          handle
      });
  };

  const handlePointerMove = (e: React.MouseEvent) => {
      if (interaction.mode === 'NONE' || !selectedId) return;
      const deltaX = (e.clientX - interaction.startPos.x) / (SCALE * zoom);
      const deltaY = (e.clientY - interaction.startPos.y) / (SCALE * zoom);
      
      const start = interaction.elementStart;
      let newEl = { ...template.elements.find(x => x.id === selectedId)! };

      if (interaction.mode === 'MOVE') {
          newEl.x = parseFloat((start.x + deltaX).toFixed(2));
          newEl.y = parseFloat((start.y + deltaY).toFixed(2));
      } else if (interaction.mode === 'RESIZE' && interaction.handle) {
          if (interaction.handle.includes('e')) newEl.width = Math.max(0.5, start.w + deltaX);
          if (interaction.handle.includes('s')) newEl.height = Math.max(0.5, start.h + deltaY);
      } else if (interaction.mode === 'ROTATE') {
          // Simplified rotation
          newEl.rotation = (start.r + (deltaX * 10)) % 360;
      }
      
      setTemplate(prev => ({ ...prev, elements: prev.elements.map(el => el.id === selectedId ? newEl : el) }));
  };

  const handlePointerUp = () => {
      if (interaction.mode !== 'NONE') {
          addToHistory(template);
          setInteraction({ ...interaction, mode: 'NONE' });
      }
  };

  // --- UI PARTS ---

  const renderRuler = (size: number, orientation: 'h' | 'v') => {
      const steps = Math.floor(size);
      return (
          <div className={`absolute bg-slate-100 border-slate-300 ${orientation==='h' ? 'h-5 left-0 top-[-20px] border-b' : 'w-5 top-0 left-[-20px] border-r'}`}
               style={{ 
                   width: orientation==='h' ? `${size * SCALE * zoom}px` : '20px', 
                   height: orientation==='v' ? `${size * SCALE * zoom}px` : '20px' 
               }}>
              {Array.from({length: steps + 1}).map((_, i) => (
                  <div key={i} className="absolute bg-slate-400 text-[8px] text-slate-500"
                       style={{
                           left: orientation==='h' ? `${i * SCALE * zoom}px` : '0',
                           top: orientation==='v' ? `${i * SCALE * zoom}px` : '0',
                           width: orientation==='h' ? '1px' : '100%',
                           height: orientation==='v' ? '1px' : '100%',
                       }}>
                      {i % 5 === 0 && <span className="absolute -top-3 -left-1">{i}</span>}
                  </div>
              ))}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans" onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}>
        
        {/* --- HEADER --- */}
        <header className="bg-white border-b h-14 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
            <div className="flex items-center gap-2">
                <button onClick={() => navigate(-1)} className="hover:bg-slate-100 p-2 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
                <h1 className="font-bold text-slate-700 hidden md:block">Diseñador</h1>
            </div>
            
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
                <button onClick={() => { if(historyIndex > 0) { setTemplate(history[historyIndex-1]); setHistoryIndex(h => h-1); } }} className="p-2 hover:bg-white rounded shadow-sm disabled:opacity-30"><Undo2 size={16}/></button>
                <button onClick={() => { if(historyIndex < history.length-1) { setTemplate(history[historyIndex+1]); setHistoryIndex(h => h+1); } }} className="p-2 hover:bg-white rounded shadow-sm disabled:opacity-30"><Redo2 size={16}/></button>
            </div>

            <div className="flex gap-2">
                <button onClick={() => setShowTemplatesModal(true)} className="px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded border">Abrir</button>
                <button onClick={() => {/* Save Logic */}} className="px-3 py-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm flex gap-2 items-center"><Save size={16}/> Guardar</button>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
            
            {/* --- LEFT TOOLBOX --- */}
            <aside className="w-16 bg-white border-r flex flex-col items-center py-4 gap-4 z-20 shadow-sm">
                <button onClick={() => addElement('TEXT')} className="group relative flex flex-col items-center gap-1">
                    <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-indigo-50 group-hover:text-indigo-600"><Type size={20}/></div>
                    <span className="text-[9px] font-bold text-slate-500">Texto</span>
                </button>
                <button onClick={() => addElement('BARCODE')} className="group relative flex flex-col items-center gap-1">
                    <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-indigo-50 group-hover:text-indigo-600"><ScanLine size={20}/></div>
                    <span className="text-[9px] font-bold text-slate-500">Bar</span>
                </button>
                <button onClick={() => addElement('SHAPE', {shapeType:'RECTANGLE'})} className="group relative flex flex-col items-center gap-1">
                    <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-indigo-50 group-hover:text-indigo-600"><Square size={20}/></div>
                    <span className="text-[9px] font-bold text-slate-500">Forma</span>
                </button>
                {/* Advanced: Table for Reports */}
                {(template.type === 'REPORT' || template.type === 'INVOICE') && (
                    <button onClick={() => addElement('DETAIL_TABLE')} className="group relative flex flex-col items-center gap-1">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg border border-purple-100"><TableIcon size={20}/></div>
                        <span className="text-[9px] font-bold text-purple-600">Tabla</span>
                    </button>
                )}
            </aside>

            {/* --- CANVAS AREA --- */}
            <main className="flex-1 bg-slate-200/50 overflow-hidden relative flex flex-col">
                {/* Toolbar Canvas */}
                <div className="h-10 bg-white border-b flex items-center px-4 justify-between">
                    <div className="text-xs text-slate-500 font-mono">
                        {template.width} x {template.height} {unit}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}><ZoomOut size={16}/></button>
                        <span className="text-xs font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.min(4, z + 0.1))}><ZoomIn size={16}/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto flex items-center justify-center p-10 relative" 
                     onClick={() => setSelectedId(null)}>
                    
                    <div className="relative shadow-2xl bg-white transition-all duration-75 ease-linear ring-1 ring-slate-900/5"
                         style={{ 
                             width: `${template.width * SCALE * zoom}px`, 
                             height: `${template.height * SCALE * zoom}px` 
                         }}>
                        
                        {/* Visual Rulers */}
                        {renderRuler(template.width, 'h')}
                        {renderRuler(template.height, 'v')}

                        {/* Report Bands Visuals */}
                        {(template.type === 'REPORT' || template.type === 'INVOICE') && (
                            <>
                                <BandSeparator label="Encabezado" y={0} width={template.width} zoom={zoom} />
                                <BandSeparator label="Detalle (Repetible)" y={template.height * 0.3} width={template.width} zoom={zoom} />
                                <BandSeparator label="Pie de Página" y={template.height * 0.8} width={template.width} zoom={zoom} />
                            </>
                        )}

                        {/* Elements */}
                        {template.elements.map(el => (
                            <div key={el.id}
                                 onMouseDown={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                 className={`absolute group cursor-move select-none ${selectedId === el.id ? 'z-50 outline outline-2 outline-indigo-500' : 'hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                                 style={{
                                     left: `${el.x * SCALE * zoom}px`,
                                     top: `${el.y * SCALE * zoom}px`,
                                     width: `${el.width * SCALE * zoom}px`,
                                     height: `${el.height * SCALE * zoom}px`,
                                     transform: `rotate(${el.rotation}deg)`
                                 }}
                                 onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                            >
                                {/* Element Rendering */}
                                <div className="w-full h-full overflow-hidden" style={{
                                    border: el.type === 'SHAPE' && el.shapeType !== 'LINE' ? `${1*zoom}px solid ${el.stroke||'black'}` : 'none',
                                    backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent',
                                    borderRadius: el.shapeType === 'CIRCLE' ? '50%' : '0'
                                }}>
                                    {el.type === 'TEXT' && (
                                        <div style={{ fontSize: `${(el.fontSize||10)*zoom}px`, fontFamily: el.fontFamily, whiteSpace: el.isMultiline ? 'pre-wrap' : 'nowrap' }}>
                                            {el.content}
                                        </div>
                                    )}
                                    {el.type === 'DETAIL_TABLE' && (
                                        <div className="w-full h-full bg-indigo-50/50 border-2 border-dashed border-indigo-300 flex items-center justify-center text-indigo-400 text-[10px]">
                                            LISTA DE DATOS
                                        </div>
                                    )}
                                    {/* Barcode/QR placehodlers... */}
                                </div>

                                {/* Handles */}
                                {selectedId === el.id && (
                                    <>
                                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-indigo-500 cursor-nwse-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')} />
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* --- RIGHT PANEL (PROPERTIES & DATA) --- */}
            <aside className="w-80 bg-white border-l z-20 shadow-lg flex flex-col">
                <div className="flex border-b">
                    <button onClick={() => setActiveTab('PROPERTIES')} className={`flex-1 py-3 text-xs font-bold uppercase ${activeTab === 'PROPERTIES' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}>Propiedades</button>
                    <button onClick={() => setActiveTab('DATA')} className={`flex-1 py-3 text-xs font-bold uppercase ${activeTab === 'DATA' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}>Datos</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    
                    {/* PROPERTIES TAB */}
                    {activeTab === 'PROPERTIES' && (
                        <div className="space-y-6">
                            {selectedId ? (
                                <>
                                    {/* Element Props */}
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-slate-800 text-xs uppercase border-b pb-2">Geometría</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <PropertyInput label="X" value={template.elements.find(e=>e.id===selectedId)?.x} onChange={(v:any) => updateElement(selectedId, {x:v})} type="number" />
                                            <PropertyInput label="Y" value={template.elements.find(e=>e.id===selectedId)?.y} onChange={(v:any) => updateElement(selectedId, {y:v})} type="number" />
                                            <PropertyInput label="Ancho" value={template.elements.find(e=>e.id===selectedId)?.width} onChange={(v:any) => updateElement(selectedId, {width:v})} type="number" />
                                            <PropertyInput label="Alto" value={template.elements.find(e=>e.id===selectedId)?.height} onChange={(v:any) => updateElement(selectedId, {height:v})} type="number" />
                                        </div>

                                        {template.elements.find(e=>e.id===selectedId)?.type === 'TEXT' && (
                                            <>
                                                <h4 className="font-bold text-slate-800 text-xs uppercase border-b pb-2 pt-2">Contenido</h4>
                                                <textarea 
                                                    className="w-full border rounded p-2 text-sm" 
                                                    rows={3}
                                                    value={template.elements.find(e=>e.id===selectedId)?.content}
                                                    onChange={e => updateElement(selectedId, {content: e.target.value})}
                                                />
                                                <div className="flex items-center gap-2 mt-2">
                                                    <input type="checkbox" checked={template.elements.find(e=>e.id===selectedId)?.isMultiline} onChange={e => updateElement(selectedId, {isMultiline: e.target.checked})} />
                                                    <label className="text-xs">Multilinea (Ajuste)</label>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center text-slate-400 py-10">
                                    <Move size={40} className="mx-auto mb-2 opacity-20"/>
                                    <p className="text-sm">Selecciona un elemento</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* DATA TAB */}
                    {activeTab === 'DATA' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <h4 className="font-bold text-blue-800 text-xs uppercase mb-2 flex items-center gap-2"><Database size={14}/> Origen de Datos</h4>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {Object.keys(dbSchema).map(table => (
                                        <label key={table} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-blue-100/50 p-1 rounded">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedTables.includes(table)}
                                                onChange={e => {
                                                    if (e.target.checked) setSelectedTables([...selectedTables, table]);
                                                    else setSelectedTables(selectedTables.filter(t => t !== table));
                                                }}
                                                className="rounded text-indigo-600 focus:ring-0"
                                            />
                                            {table}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {selectedTables.length > 0 && (
                                <>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-xs uppercase mb-2 border-b pb-1">Campos Disponibles</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedTables.flatMap(table => dbSchema[table].map(col => (
                                                <button 
                                                    key={`${table}.${col.name}`}
                                                    onClick={() => {
                                                        if (selectedId) {
                                                            const el = template.elements.find(e => e.id === selectedId);
                                                            if (el) updateElement(selectedId, { content: (el.content || '') + ` {{${col.name}}}` });
                                                        }
                                                    }}
                                                    className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 border rounded text-[10px] font-bold text-slate-600 hover:text-indigo-600 transition-colors"
                                                    title={`${table} (${col.type})`}
                                                >
                                                    {col.name}
                                                </button>
                                            )))}
                                        </div>
                                    </div>

                                    <div className="border-t pt-4">
                                        <h4 className="font-bold text-slate-800 text-xs uppercase mb-2 flex items-center gap-2"><Filter size={14}/> Filtros (Condiciones)</h4>
                                        <div className="space-y-2">
                                            {queryConditions.map((cond, idx) => (
                                                <div key={idx} className="flex gap-1 text-xs">
                                                    <span className="bg-slate-100 px-2 py-1 rounded">{cond.field}</span>
                                                    <span className="font-bold">{cond.operator}</span>
                                                    <span className="bg-slate-100 px-2 py-1 rounded">{cond.value}</span>
                                                    <button onClick={() => setQueryConditions(prev => prev.filter((_, i) => i !== idx))}><X size={12} className="text-red-500"/></button>
                                                </div>
                                            ))}
                                            <div className="flex gap-1">
                                                <select className="flex-1 text-xs border rounded" id="newCondField">
                                                    {selectedTables.flatMap(t => dbSchema[t].map(c => <option key={c.name} value={c.name}>{c.name}</option>))}
                                                </select>
                                                <select className="w-16 text-xs border rounded" id="newCondOp">
                                                    <option value="=">=</option>
                                                    <option value=">">&gt;</option>
                                                    <option value="<">&lt;</option>
                                                    <option value="LIKE">LIKE</option>
                                                </select>
                                                <input className="flex-1 text-xs border rounded px-1" placeholder="Valor" id="newCondVal"/>
                                                <button onClick={() => {
                                                    const f = (document.getElementById('newCondField') as HTMLSelectElement).value;
                                                    const o = (document.getElementById('newCondOp') as HTMLSelectElement).value;
                                                    const v = (document.getElementById('newCondVal') as HTMLInputElement).value;
                                                    if(f && v) setQueryConditions([...queryConditions, {field:f, operator:o, value:v}]);
                                                }} className="bg-indigo-600 text-white px-2 rounded">+</button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </aside>
        </div>

        {/* --- STARTUP MODAL (WIZARD) --- */}
        {showSetupModal && (
            <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-2xl p-8 shadow-2xl">
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Nuevo Documento</h2>
                    <p className="text-slate-500 mb-8">¿Qué deseas diseñar hoy?</p>
                    
                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <button 
                            onClick={() => {
                                setTemplate({ ...INITIAL_TEMPLATE, type: 'LABEL', width: 50, height: 25 });
                                setUnit('mm');
                                setShowSetupModal(false);
                            }}
                            className="flex flex-col items-center gap-4 p-6 border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 rounded-2xl transition-all group"
                        >
                            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform"><Tag size={32} className="text-indigo-600"/></div>
                            <div className="text-center">
                                <h3 className="font-bold text-lg text-slate-800">Etiqueta</h3>
                                <p className="text-sm text-slate-500">Códigos de barra, precios (mm)</p>
                            </div>
                        </button>

                        <button 
                            onClick={() => {
                                setTemplate({ ...INITIAL_TEMPLATE, type: 'INVOICE', width: 21, height: 29.7 }); // A4 approx in cm
                                setUnit('cm');
                                setShowSetupModal(false);
                            }}
                            className="flex flex-col items-center gap-4 p-6 border-2 border-slate-200 hover:border-purple-500 hover:bg-purple-50 rounded-2xl transition-all group"
                        >
                            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform"><Receipt size={32} className="text-purple-600"/></div>
                            <div className="text-center">
                                <h3 className="font-bold text-lg text-slate-800">Reporte / Factura</h3>
                                <p className="text-sm text-slate-500">Documentos A4, Carta o Tickets (cm)</p>
                            </div>
                        </button>
                    </div>
                    
                    <div className="text-center">
                        <button onClick={() => setShowSetupModal(false)} className="text-slate-400 hover:text-slate-600 text-sm underline">Cancelar / Abrir Existente</button>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};

export default LabelDesigner;
