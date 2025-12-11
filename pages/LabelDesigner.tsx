
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { 
  ArrowLeft, Save, Type, ScanLine, Trash2, 
  Grid, FolderOpen, Star, 
  AlignLeft, AlignCenter, AlignRight, X, 
  Check, ChevronDown, FileCog,
  QrCode, Image as ImageIcon, Square, Undo2, Redo2,
  ZoomIn, ZoomOut, Layers, Copy, Upload, Settings,
  RotateCw, RotateCcw, Move, ArrowUp, ArrowDown
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- CONSTANTS ---
const MM_TO_PX = 3.7795; // 96 DPI conversion
const HISTORY_LIMIT = 20;

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
  name: 'Nueva Etiqueta',
  isDefault: false,
  width: 50,
  height: 25,
  elements: []
};

const PLACEHOLDERS = [
  { label: 'Nombre Producto', value: '{{NOMBRE}}' },
  { label: 'Código / SKU', value: '{{SKU}}' },
  { label: 'Precio Venta', value: '{{PRECIO}}' },
  { label: 'Código Barras', value: '{{BARCODE}}' },
  { label: 'Marca', value: '{{MARCA}}' },
  { label: 'Modelo', value: '{{MODELO}}' },
];

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- EXTERNAL COMPONENTS (Fixes Focus Loss) ---

const PropertyInput = ({ label, value, onChange, type = "text", step, min, className }: any) => {
    // Internal state to manage fast typing without re-rendering the parent too aggressively
    const [localValue, setLocalValue] = useState(value);

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
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all overflow-hidden h-9">
                <input 
                    type={type}
                    step={step}
                    min={min}
                    className="w-full px-2 text-sm font-mono outline-none bg-transparent h-full text-slate-700"
                    value={localValue} 
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    );
};

const ToolbarButton = ({ icon, label, onClick, isActive }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-2 w-full rounded-xl transition-all active:scale-95 group relative ${isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
        <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-white shadow-sm ring-1 ring-indigo-100' : 'bg-transparent'}`}>
            {icon}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
        {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-600 rounded-l-full hidden md:block"></div>}
    </button>
);

const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- STATE ---
  const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(3);
  const [history, setHistory] = useState<LabelTemplate[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  
  // 'TOOLS' | 'LAYERS' | 'SETTINGS' | 'PROPERTIES'
  const [activePanel, setActivePanel] = useState<'TOOLS' | 'LAYERS' | 'SETTINGS' | 'PROPERTIES'>('TOOLS'); 
  const [isMobilePropertiesOpen, setIsMobilePropertiesOpen] = useState(false);
  const [clipboard, setClipboard] = useState<LabelElement | null>(null);

  // Interaction State
  const [interaction, setInteraction] = useState<{
      mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE';
      startPos: { x: number, y: number };
      elementStart: { x: number, y: number, w: number, h: number, r: number };
      handle?: string; 
  }>({ 
      mode: 'NONE', 
      startPos: {x:0, y:0}, 
      elementStart: {x:0, y:0, w:0, h:0, r:0} 
  });

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      loadSavedTemplates();
      handleResize();
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [selectedId, template, clipboard]); // Deps for shortcuts

  const handleResize = () => {
      // Auto zoom adjustment on load
      setZoom(window.innerWidth < 768 ? 2.5 : 3.5);
  };

  const loadSavedTemplates = async () => {
      try {
          const data = await LabelService.getAll();
          setSavedTemplates(data || []);
      } catch (e) { console.error(e); }
  };

  // --- KEYBOARD SHORTCUTS ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedId) deleteSelected();
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          if (selectedId) {
              const el = template.elements.find(x => x.id === selectedId);
              if (el) {
                  setClipboard(el);
                  const Toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1000 });
                  Toast.fire({ icon: 'success', title: 'Copiado' });
              }
          }
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
          if (clipboard) {
              const newEl = { 
                  ...clipboard, 
                  id: generateId(), 
                  x: clipboard.x + 2, 
                  y: clipboard.y + 2 
              };
              const newElements = [...template.elements, newEl];
              updateTemplate({ elements: newElements });
              setSelectedId(newEl.id);
          }
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          undo();
      }
      // Nudge with Arrows
      else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && selectedId) {
          e.preventDefault();
          const delta = e.shiftKey ? 5 : 0.5; // Shift for big jump
          const el = template.elements.find(x => x.id === selectedId);
          if(!el) return;
          
          let { x, y } = el;
          if (e.key === 'ArrowUp') y -= delta;
          if (e.key === 'ArrowDown') y += delta;
          if (e.key === 'ArrowLeft') x -= delta;
          if (e.key === 'ArrowRight') x += delta;
          
          updateElement(selectedId, { x, y });
      }
  }, [selectedId, template, clipboard]);

  // --- HISTORY MANAGEMENT ---
  const addToHistory = (newState: LabelTemplate) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newState)));
      if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
      if (historyIndex > 0) {
          const prev = history[historyIndex - 1];
          setTemplate(JSON.parse(JSON.stringify(prev)));
          setHistoryIndex(historyIndex - 1);
          setSelectedId(null);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          const next = history[historyIndex + 1];
          setTemplate(JSON.parse(JSON.stringify(next)));
          setHistoryIndex(historyIndex + 1);
          setSelectedId(null);
      }
  };

  const updateTemplate = (updates: Partial<LabelTemplate>) => {
      const newState = { ...template, ...updates };
      setTemplate(newState);
      addToHistory(newState);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
      const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
      // We don't use updateTemplate directly here to avoid excessive history on drag, 
      // but for discrete property updates it's fine. 
      // Ideally separate 'preview' state from 'committed' state, but for this scale direct update is OK.
      const newState = { ...template, elements: newElements };
      setTemplate(newState);
      // Only add to history if it's not a drag operation (handled by pointerUp)
      if (interaction.mode === 'NONE') {
          // Debounce or check? For property inputs we want history.
          addToHistory(newState); 
      }
  };

  // --- ADD ELEMENTS ---
  const addElement = (type: LabelElement['type'], extra: Partial<LabelElement> = {}) => {
      const newEl: LabelElement = {
          id: generateId(),
          type,
          x: 5,
          y: 5,
          width: type === 'TEXT' ? 25 : 20,
          height: type === 'TEXT' ? 5 : 20,
          rotation: 0,
          content: 'Nuevo Elemento',
          fontSize: 8,
          color: '#000000',
          textAlign: 'center',
          fontWeight: 'normal',
          fontFamily: 'helvetica',
          barcodeFormat: 'CODE128',
          displayValue: true,
          ...extra
      };

      if (type === 'BARCODE') { newEl.content = '123456'; newEl.width = 30; newEl.height = 10; newEl.variableField = '{{SKU}}'; }
      if (type === 'QR') { newEl.content = 'https://example.com'; newEl.width = 15; newEl.height = 15; }
      if (type === 'SHAPE') { newEl.shapeType = 'RECTANGLE'; newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; }

      const newElements = [...template.elements, newEl];
      updateTemplate({ elements: newElements });
      setSelectedId(newEl.id);
      
      // On mobile, switch to properties automatically
      if (window.innerWidth < 768) {
          // Logic handled by mobile view rendering
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              addElement('IMAGE', { content: reader.result as string, width: 20, height: 20 });
          };
          reader.readAsDataURL(file);
      }
  };

  const deleteSelected = () => {
      if (selectedId) {
          const newElements = template.elements.filter(e => e.id !== selectedId);
          updateTemplate({ elements: newElements });
          setSelectedId(null);
      }
  };

  const changeLayerOrder = (id: string, direction: 'UP' | 'DOWN') => {
      const index = template.elements.findIndex(e => e.id === id);
      if (index === -1) return;
      
      const newElements = [...template.elements];
      if (direction === 'UP' && index < newElements.length - 1) {
          [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
      } else if (direction === 'DOWN' && index > 0) {
          [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
      }
      updateTemplate({ elements: newElements });
  };

  // --- RENDER HELPERS ---
  const renderBarcode = (el: LabelElement) => {
      const canvas = document.createElement('canvas');
      try {
          JsBarcode(canvas, "123456", {
              format: (el.barcodeFormat as any) || "CODE128",
              displayValue: el.displayValue,
              margin: 0,
              width: 2, height: 50, fontSize: 20
          });
          return canvas.toDataURL("image/png");
      } catch (e) { return ''; }
  };

  const renderQR = (el: LabelElement) => {
      let url = '';
      QRCode.toDataURL(el.content || 'error', { margin: 0 }, (err, u) => { url = u; });
      return url;
  };

  const getPreviewText = (el: LabelElement) => {
      if (el.variableField) {
          const mapping: any = { '{{NOMBRE}}': 'Producto Ej.', '{{SKU}}': 'ABC-001', '{{PRECIO}}': 'L. 100.00', '{{BARCODE}}': '12345678' };
          return mapping[el.variableField] || el.variableField;
      }
      return el.content;
  };

  // --- INTERACTION HANDLERS ---
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string, mode: 'MOVE' | 'RESIZE' | 'ROTATE', handle?: string) => {
      e.stopPropagation(); // Critical to prevent deselection
      const el = template.elements.find(x => x.id === id);
      if (!el) return;

      setSelectedId(id);

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      setInteraction({
          mode,
          startPos: { x: clientX, y: clientY },
          elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation },
          handle
      });
  };

  const handleCanvasWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.5 : 0.5;
          setZoom(z => Math.max(1, Math.min(6, z + delta)));
      }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (interaction.mode === 'NONE' || !selectedId) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaPxX = clientX - interaction.startPos.x;
      const deltaPxY = clientY - interaction.startPos.y;
      
      const deltaMmX = deltaPxX / (MM_TO_PX * zoom);
      const deltaMmY = deltaPxY / (MM_TO_PX * zoom);

      const elStart = interaction.elementStart;
      let newEl = { ...template.elements.find(x => x.id === selectedId)! };

      if (interaction.mode === 'MOVE') {
          newEl.x = Number((elStart.x + deltaMmX).toFixed(1));
          newEl.y = Number((elStart.y + deltaMmY).toFixed(1));
      } else if (interaction.mode === 'RESIZE' && interaction.handle) {
          if (interaction.handle.includes('e')) newEl.width = Math.max(2, Number((elStart.w + deltaMmX).toFixed(1)));
          if (interaction.handle.includes('s')) newEl.height = Math.max(2, Number((elStart.h + deltaMmY).toFixed(1)));
          if (interaction.handle.includes('w')) {
             const w = Math.max(2, Number((elStart.w - deltaMmX).toFixed(1)));
             newEl.width = w;
             newEl.x = Number((elStart.x + (elStart.w - w)).toFixed(1));
          }
      } else if (interaction.mode === 'ROTATE') {
          newEl.rotation = (elStart.r + (deltaPxX / 2)) % 360;
      }

      // Direct state update for smoothness, commit on up
      setTemplate(prev => ({
          ...prev,
          elements: prev.elements.map(el => el.id === selectedId ? newEl : el)
      }));
  };

  const handlePointerUp = () => {
      if (interaction.mode !== 'NONE') {
          addToHistory(template); 
          setInteraction({ ...interaction, mode: 'NONE' });
      }
  };

  const saveTemplate = async () => {
      if (!template.name) return Swal.fire('Error', 'Asigne un nombre', 'warning');
      try {
          if (template.id) await LabelService.update(template.id, template);
          else await LabelService.create(template);
          Swal.fire('Guardado', 'Plantilla guardada', 'success');
          loadSavedTemplates();
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  // --- UI PANELS ---

  const LayersPanel = () => (
      <div className="p-4 space-y-2 h-full overflow-y-auto">
          <h3 className="font-bold text-slate-800 text-xs uppercase mb-3 flex items-center gap-2">
              <Layers size={14}/> Capas
          </h3>
          {[...template.elements].reverse().map((el, idx) => {
              // Real index in original array is length - 1 - idx
              // But we just need the ID
              return (
                  <div key={el.id} 
                       onClick={() => setSelectedId(el.id)}
                       className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer text-sm ${selectedId === el.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-2">
                          {el.type === 'TEXT' && <Type size={14}/>}
                          {el.type === 'BARCODE' && <ScanLine size={14}/>}
                          {el.type === 'QR' && <QrCode size={14}/>}
                          {el.type === 'IMAGE' && <ImageIcon size={14}/>}
                          {el.type === 'SHAPE' && <Square size={14}/>}
                          <span className="truncate max-w-[100px]">{el.type === 'TEXT' ? el.content.substring(0,12) : el.type}</span>
                      </div>
                      <div className="flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); changeLayerOrder(el.id, 'UP'); }} className="p-1 hover:bg-white rounded shadow-sm text-slate-400 hover:text-slate-600"><ArrowUp size={12}/></button>
                          <button onClick={(e) => { e.stopPropagation(); changeLayerOrder(el.id, 'DOWN'); }} className="p-1 hover:bg-white rounded shadow-sm text-slate-400 hover:text-slate-600"><ArrowDown size={12}/></button>
                      </div>
                  </div>
              );
          })}
          {template.elements.length === 0 && <p className="text-center text-slate-400 text-xs mt-10">Sin elementos</p>}
      </div>
  );

  const SettingsPanel = () => (
      <div className="p-4 space-y-4">
          <h3 className="font-bold text-slate-800 text-xs uppercase mb-3 flex items-center gap-2">
              <Settings size={14}/> Configuración Página
          </h3>
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <PropertyInput label="Ancho (mm)" value={template.width} onChange={(v:any) => setTemplate({...template, width: v})} type="number"/>
              <PropertyInput label="Alto (mm)" value={template.height} onChange={(v:any) => setTemplate({...template, height: v})} type="number"/>
          </div>
          
          <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50" onClick={() => setTemplate({...template, isDefault: !template.isDefault})}>
              <div className={`w-4 h-4 border rounded flex items-center justify-center ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white'}`}>
                  {template.isDefault && <Check size={10} className="text-white"/>}
              </div>
              <span className="text-sm font-medium text-slate-700">Plantilla Predeterminada</span>
          </div>
      </div>
  );

  const PropertiesPanel = () => {
      const sel = template.elements.find(e => e.id === selectedId);
      if (!sel) return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
              <Move size={48} className="mb-4 opacity-20"/>
              <p className="text-center text-sm">Selecciona un elemento para editar</p>
          </div>
      );

      return (
          <div className="space-y-5 p-4 overflow-y-auto h-full pb-20 md:pb-4 custom-scrollbar">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-700 text-xs uppercase bg-slate-100 px-2 py-1 rounded">{sel.type}</span>
                  <button onClick={deleteSelected} className="p-1.5 hover:bg-red-50 text-red-500 rounded transition-colors" title="Eliminar"><Trash2 size={16}/></button>
              </div>

              {/* Advanced Geometry */}
              <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase">Geometría</h4>
                  <div className="grid grid-cols-2 gap-2">
                      <PropertyInput label="X" value={sel.x} onChange={(v:any) => updateElement(sel.id, {x:v})} type="number" />
                      <PropertyInput label="Y" value={sel.y} onChange={(v:any) => updateElement(sel.id, {y:v})} type="number" />
                      <PropertyInput label="Ancho" value={sel.width} onChange={(v:any) => updateElement(sel.id, {width:v})} type="number" min={1}/>
                      <PropertyInput label="Alto" value={sel.height} onChange={(v:any) => updateElement(sel.id, {height:v})} type="number" min={1}/>
                  </div>
                  
                  {/* Advanced Rotation */}
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center gap-2">
                      <button onClick={() => updateElement(sel.id, {rotation: (sel.rotation - 90) % 360})} className="p-1 text-slate-500 hover:text-indigo-600"><RotateCcw size={16}/></button>
                      <div className="flex-1">
                          <PropertyInput value={Math.round(sel.rotation)} onChange={(v:any) => updateElement(sel.id, {rotation: v})} type="number" className="text-center"/>
                      </div>
                      <button onClick={() => updateElement(sel.id, {rotation: (sel.rotation + 90) % 360})} className="p-1 text-slate-500 hover:text-indigo-600"><RotateCw size={16}/></button>
                  </div>
              </div>

              {/* Type Specific */}
              {(sel.type === 'TEXT' || sel.type === 'BARCODE' || sel.type === 'QR') && (
                  <div className="space-y-3">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Contenido / Variable</label>
                          <select className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500/50 outline-none" 
                              value={sel.variableField || 'CUSTOM'} 
                              onChange={e => updateElement(sel.id, {variableField: e.target.value === 'CUSTOM' ? '' : e.target.value, content: e.target.value === 'CUSTOM' ? 'Texto' : e.target.value})}
                          >
                              <option value="CUSTOM">Texto Personalizado</option>
                              {PLACEHOLDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                          
                          {!sel.variableField && (
                              <textarea 
                                  className="w-full p-2 mt-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none" 
                                  value={sel.content} 
                                  onChange={e => updateElement(sel.id, {content: e.target.value})} 
                                  rows={2}
                              />
                          )}
                      </div>
                  </div>
              )}

              {sel.type === 'TEXT' && (
                  <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase">Tipografía</h4>
                      
                      <select 
                          className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                          value={sel.fontFamily || 'helvetica'}
                          onChange={e => updateElement(sel.id, {fontFamily: e.target.value})}
                      >
                          {FONTS.map(f => (
                              <option key={f.value} value={f.value} style={{fontFamily: f.value}}>{f.name}</option>
                          ))}
                      </select>

                      <div className="grid grid-cols-2 gap-2">
                          <PropertyInput label="Tamaño (pt)" value={sel.fontSize} onChange={(v:any) => updateElement(sel.id, {fontSize:v})} type="number" />
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Peso</label>
                              <div className="flex bg-white rounded-lg border border-slate-300 overflow-hidden h-9">
                                  <button onClick={() => updateElement(sel.id, {fontWeight: 'normal'})} className={`flex-1 text-xs font-medium ${sel.fontWeight !== 'bold' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>R</button>
                                  <div className="w-px bg-slate-200"></div>
                                  <button onClick={() => updateElement(sel.id, {fontWeight: 'bold'})} className={`flex-1 text-xs font-bold ${sel.fontWeight === 'bold' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>B</button>
                              </div>
                          </div>
                      </div>
                      
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Alineación</label>
                          <div className="flex bg-white rounded-lg border border-slate-300 overflow-hidden">
                              {['left','center','right'].map((a:any) => (
                                  <button key={a} onClick={() => updateElement(sel.id, {textAlign: a})} 
                                      className={`flex-1 p-2 flex justify-center hover:bg-slate-50 transition-colors ${sel.textAlign === a ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
                                      {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
              )}

              {sel.type === 'SHAPE' && (
                  <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase">Apariencia</h4>
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Relleno</label>
                              <div className="flex items-center gap-2">
                                  <input type="color" className="w-8 h-8 rounded cursor-pointer border-none p-0" value={sel.fill === 'transparent' ? '#ffffff' : sel.fill} onChange={e => updateElement(sel.id, {fill: e.target.value})} />
                                  <button onClick={() => updateElement(sel.id, {fill: 'transparent'})} className={`text-xs px-2 py-1 rounded border ${sel.fill === 'transparent' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600'}`}>None</button>
                              </div>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Borde</label>
                              <input type="color" className="w-full h-8 rounded cursor-pointer border-none p-0" value={sel.stroke} onChange={e => updateElement(sel.id, {stroke: e.target.value})} />
                          </div>
                      </div>
                      <PropertyInput label="Grosor Borde" value={sel.strokeWidth} onChange={(v:any) => updateElement(sel.id, {strokeWidth:v})} type="number" step={0.5} />
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans"
         onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
         onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
        
        {/* --- HEADER --- */}
        <header className="bg-white border-b h-14 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
            <div className="flex items-center gap-2 w-1/3">
                <button onClick={() => navigate(-1)} className="hover:bg-slate-100 p-2 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
                <div className="hidden md:flex gap-1 border-l border-slate-200 pl-2 ml-2">
                    <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Undo2 size={18}/></button>
                    <button onClick={redo} disabled={historyIndex >= history.length-1} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Redo2 size={18}/></button>
                </div>
            </div>
            
            <div className="flex-1 flex justify-center">
                <input 
                    className="text-center font-bold text-slate-800 bg-transparent hover:bg-slate-50 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 text-sm md:text-base w-full max-w-[200px]"
                    value={template.name}
                    onChange={e => setTemplate({...template, name: e.target.value})}
                    placeholder="Nombre del Diseño"
                />
            </div>

            <div className="w-1/3 flex justify-end gap-2">
                <button onClick={() => setShowTemplatesModal(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg md:flex hidden items-center gap-2">
                    <FolderOpen size={18}/> <span className="text-xs font-bold">Abrir</span>
                </button>
                <button onClick={saveTemplate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm flex items-center gap-2 text-xs md:text-sm transition-all active:scale-95">
                    <Save size={16}/> <span className="hidden md:inline">Guardar</span>
                </button>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
            
            {/* --- LEFT TOOLBAR (Desktop) --- */}
            <aside className="hidden md:flex w-20 bg-white border-r flex-col items-center py-4 gap-3 z-20 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                <ToolbarButton icon={<Type/>} label="Texto" onClick={() => addElement('TEXT')}/>
                <ToolbarButton icon={<ScanLine/>} label="Código" onClick={() => addElement('BARCODE')}/>
                <ToolbarButton icon={<QrCode/>} label="QR" onClick={() => addElement('QR')}/>
                <ToolbarButton icon={<Square/>} label="Forma" onClick={() => addElement('SHAPE')}/>
                <ToolbarButton icon={<ImageIcon/>} label="Imagen" onClick={() => fileInputRef.current?.click()}/>
                <div className="h-px w-10 bg-slate-200 my-1"/>
                <ToolbarButton 
                    icon={<FileCog/>} 
                    label="Config" 
                    isActive={activePanel === 'SETTINGS'} 
                    onClick={() => { setActivePanel('SETTINGS'); setSelectedId(null); }}
                />
                <ToolbarButton 
                    icon={<Layers/>} 
                    label="Capas" 
                    isActive={activePanel === 'LAYERS'} 
                    onClick={() => setActivePanel('LAYERS')}
                />
            </aside>

            {/* --- CANVAS WORKSPACE --- */}
            <main className="flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-8 touch-none"
                  onWheel={handleCanvasWheel}
                  onClick={() => {
                      // Only deselect if clicked on empty space (handled by bubbling check ideally, 
                      // but here relying on elements stopping propagation)
                      setSelectedId(null); 
                      if(activePanel === 'PROPERTIES') setActivePanel('TOOLS');
                  }}
            >
                {/* Zoom Controls (Floating) */}
                <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white p-1 rounded-lg shadow-lg border border-slate-200 z-10">
                    <button onClick={() => setZoom(z => Math.min(z + 0.5, 6))} className="p-2 hover:bg-slate-100 rounded text-slate-600"><ZoomIn size={20}/></button>
                    <div className="text-[10px] font-bold text-slate-400 text-center py-1 border-y border-slate-100">{Math.round(zoom*100/3.7795)}%</div>
                    <button onClick={() => setZoom(z => Math.max(z - 0.5, 1))} className="p-2 hover:bg-slate-100 rounded text-slate-600"><ZoomOut size={20}/></button>
                </div>

                {/* Canvas Container */}
                <div 
                    ref={canvasRef}
                    className="bg-white shadow-2xl relative transition-all duration-100"
                    style={{
                        width: `${template.width * MM_TO_PX * zoom}px`,
                        height: `${template.height * MM_TO_PX * zoom}px`,
                    }}
                    onClick={(e) => e.stopPropagation()} // Stop bubbling to main container to prevent immediate deselect if logic changes
                >
                    {/* Page Size Label */}
                    <div className="absolute -top-6 left-0 text-xs font-bold text-slate-400 select-none">
                        {template.width}mm x {template.height}mm
                    </div>

                    {/* Grid Background */}
                    <div className="absolute inset-0 pointer-events-none opacity-20" 
                       style={{backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)', backgroundSize: `${5*MM_TO_PX*zoom}px ${5*MM_TO_PX*zoom}px`}}>
                    </div>

                    {template.elements.map(el => {
                        const isSelected = selectedId === el.id;
                        return (
                            <div
                                key={el.id}
                                onMouseDown={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                onTouchStart={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                className={`absolute group select-none cursor-move
                                    ${isSelected ? 'z-50' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                                style={{
                                    left: `${el.x * MM_TO_PX * zoom}px`,
                                    top: `${el.y * MM_TO_PX * zoom}px`,
                                    width: `${el.width * MM_TO_PX * zoom}px`,
                                    height: `${el.height * MM_TO_PX * zoom}px`,
                                    transform: `rotate(${el.rotation}deg)`,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation(); // CRITICAL: Stop propagation so bg click doesn't deselect
                                    setSelectedId(el.id);
                                    if(window.innerWidth < 768) setIsMobilePropertiesOpen(true);
                                    setActivePanel('PROPERTIES'); // Switch sidebar on desktop
                                }}
                            >
                                {/* Element Content */}
                                <div className="w-full h-full overflow-hidden" style={{
                                    border: el.type === 'SHAPE' ? `${(el.strokeWidth || 0) * zoom}px solid ${el.stroke}` : 'none',
                                    backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent'
                                }}>
                                    {el.type === 'TEXT' && (
                                        <div style={{
                                            fontSize: `${(el.fontSize || 10) * zoom}pt`,
                                            fontFamily: el.fontFamily || 'helvetica',
                                            fontWeight: el.fontWeight,
                                            color: el.color,
                                            textAlign: el.textAlign,
                                            lineHeight: 1,
                                            width: '100%',
                                            height: '100%',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {getPreviewText(el)}
                                        </div>
                                    )}
                                    {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                                    {el.type === 'QR' && <img src={renderQR(el)} className="w-full h-full object-contain pointer-events-none"/>}
                                    {el.type === 'IMAGE' && <img src={el.content} className="w-full h-full object-contain pointer-events-none"/>}
                                </div>

                                {/* Selection Handles */}
                                {isSelected && (
                                    <>
                                        <div className="absolute inset-0 border-2 border-indigo-600 pointer-events-none"/>
                                        {/* Resize Handles */}
                                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-full cursor-nwse-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'nw')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'nw')}/>
                                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-full cursor-nesw-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'ne')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'ne')}/>
                                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-full cursor-nesw-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'sw')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'sw')}/>
                                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nwse-resize shadow-md"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')}/>
                                        
                                        {/* Rotate Handle */}
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
                                            <div className="w-px h-4 bg-indigo-600"></div>
                                            <div className="w-5 h-5 bg-white border border-indigo-600 rounded-full cursor-grab flex items-center justify-center shadow-sm"
                                                 onMouseDown={(e) => handlePointerDown(e, el.id, 'ROTATE')} onTouchStart={(e) => handlePointerDown(e, el.id, 'ROTATE')}>
                                                <RefreshCwIcon size={10} className="text-indigo-600"/>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* --- RIGHT PANEL (Desktop) --- */}
            <aside className="hidden md:block w-80 bg-white border-l z-20 shadow-lg flex flex-col">
                <div className="p-3 border-b flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                        {activePanel === 'LAYERS' ? 'Gestión de Capas' : activePanel === 'SETTINGS' ? 'Configuración' : 'Propiedades'}
                    </h3>
                    <div className="flex gap-1">
                        {/* Tab Switchers if item selected */}
                        {selectedId && (
                            <button onClick={() => setActivePanel('PROPERTIES')} className={`p-1.5 rounded ${activePanel === 'PROPERTIES' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>
                                <Settings size={14}/>
                            </button>
                        )}
                        <button onClick={() => setActivePanel('LAYERS')} className={`p-1.5 rounded ${activePanel === 'LAYERS' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>
                            <Layers size={14}/>
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-hidden relative">
                    {activePanel === 'SETTINGS' && <SettingsPanel />}
                    {activePanel === 'LAYERS' && <LayersPanel />}
                    {(activePanel === 'PROPERTIES' || activePanel === 'TOOLS') && <PropertiesPanel />}
                </div>
            </aside>
        </div>

        {/* --- MOBILE BOTTOM TOOLBAR (Always Visible) --- */}
        <div className="md:hidden bg-white border-t px-2 py-2 flex justify-between items-center shrink-0 z-40 pb-safe">
            <div className="flex gap-1 overflow-x-auto no-scrollbar w-full justify-around">
               <ToolbarButton icon={<Type size={20}/>} label="Texto" onClick={() => addElement('TEXT')}/>
               <ToolbarButton icon={<ScanLine size={20}/>} label="Código" onClick={() => addElement('BARCODE')}/>
               <ToolbarButton icon={<QrCode size={20}/>} label="QR" onClick={() => addElement('QR')}/>
               <ToolbarButton icon={<Square size={20}/>} label="Forma" onClick={() => addElement('SHAPE')}/>
               <ToolbarButton icon={<ImageIcon size={20}/>} label="Imagen" onClick={() => fileInputRef.current?.click()}/>
            </div>
        </div>

        {/* --- MOBILE PROPERTIES SHEET (Slide Up) --- */}
        {isMobilePropertiesOpen && (
            <div className="md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-[0_-5px_30px_rgba(0,0,0,0.15)] z-50 max-h-[60vh] overflow-hidden flex flex-col border-t border-slate-200 animate-slide-up pb-safe">
                <div className="bg-white p-3 flex justify-between items-center border-b shrink-0" onClick={() => setIsMobilePropertiesOpen(false)}>
                    <span className="text-xs font-bold text-slate-400 uppercase">Propiedades</span>
                    <ChevronDown size={20} className="text-slate-400"/>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {selectedId ? <PropertiesPanel /> : <SettingsPanel />}
                </div>
            </div>
        )}

        {/* TEMPLATES MODAL */}
        {showTemplatesModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-xl text-slate-800">Mis Plantillas</h3>
                        <button onClick={() => setShowTemplatesModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X/></button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 overflow-y-auto p-1 custom-scrollbar">
                        <button onClick={() => { setTemplate(INITIAL_TEMPLATE); setHistory([]); setShowTemplatesModal(false); }}
                            className="border-2 border-dashed border-indigo-200 bg-indigo-50/50 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-indigo-50 min-h-[140px] transition-colors group">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-sm group-hover:scale-110 transition-transform"><Upload size={20}/></div>
                            <span className="font-bold text-indigo-600 text-sm">Nueva Plantilla</span>
                        </button>
                        {savedTemplates.map(t => (
                            <div key={t.id} onClick={() => { setTemplate(t); setHistory([]); setShowTemplatesModal(false); }}
                                className="border border-slate-200 rounded-xl p-4 hover:shadow-lg cursor-pointer bg-white relative transition-all group hover:border-indigo-300">
                                {t.isDefault && <div className="absolute top-2 right-2 text-amber-500"><Star size={16} fill="currentColor"/></div>}
                                <div className="aspect-[2/1] bg-slate-100 rounded mb-3 flex items-center justify-center">
                                    <FileCog className="text-slate-300"/>
                                </div>
                                <p className="font-bold text-slate-700 text-sm truncate group-hover:text-indigo-700">{t.name}</p>
                                <p className="text-[10px] text-slate-400">{t.width}x{t.height}mm</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* Hidden File Input */}
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload}/>
    </div>
  );
};

// Simple icon for rotation handle
const RefreshCwIcon = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
    </svg>
);

export default LabelDesigner;
