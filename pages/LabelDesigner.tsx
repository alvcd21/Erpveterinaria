import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { 
  ArrowLeft, Save, Type, ScanLine, Trash2, 
  Grid, FolderOpen, Star, 
  AlignLeft, AlignCenter, AlignRight, X, Settings2,
  Maximize2, Check, ChevronDown, FileCog
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- UTILS ---
const MM_TO_PX = 3.7795; // 96 DPI
const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

// --- COMPONENTE DE INPUT CONTROLADO (BUFFERED) ---
// Resuelve el problema de borrar el "0" y el lag al escribir
const BufferedInput = ({ label, value, onChange, type = "text", step }: any) => {
    const [localValue, setLocalValue] = useState(value);
    
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleApply = () => {
        let finalVal = localValue;
        if (type === 'number') {
            finalVal = parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        onChange(finalVal);
    };

    return (
        <div className="flex flex-col gap-1">
            {label && <label className="text-[10px] font-bold text-slate-400 uppercase">{label}</label>}
            <div className="flex items-center gap-1">
                <input 
                    type={type}
                    step={step}
                    className="w-full p-2 border rounded text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" 
                    value={localValue} 
                    onChange={e => setLocalValue(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                />
                <button 
                    onClick={handleApply}
                    className="bg-indigo-100 text-indigo-700 p-2 rounded hover:bg-indigo-200 active:scale-95 transition-colors"
                    title="Establecer valor"
                >
                    <Check size={16} />
                </button>
            </div>
        </div>
    );
};

const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  
  // --- STATES ---
  const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
  const [elements, setElements] = useState<LabelElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // UI Logic
  const [zoom, setZoom] = useState(3);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [activePanel, setActivePanel] = useState<'NONE' | 'PROPERTIES' | 'PAGE_SETUP'>('NONE');
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  
  // Interaction Logic
  const [interactionMode, setInteractionMode] = useState<'NONE' | 'MOVE' | 'RESIZE'>('NONE');
  const dragStartPos = useRef({ x: 0, y: 0 }); // Posición del mouse/dedo
  const elementStartPos = useRef({ x: 0, y: 0, w: 0, h: 0 }); // Posición original del elemento
  
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSavedTemplates();
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResize = () => {
      // Ajustar zoom para móviles para que la etiqueta se vea bien
      if (window.innerWidth < 768) setZoom(2.2);
      else setZoom(3.5);
  };

  const loadSavedTemplates = async () => {
    try {
      const data = await LabelService.getAll();
      setSavedTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates", error);
    }
  };

  // --- ELEMENT MANAGEMENT ---
  const addElement = (type: LabelElement['type']) => {
    const newEl: LabelElement = {
      id: generateId(),
      type,
      x: 5,
      y: 5,
      width: type === 'BARCODE' ? 30 : 25,
      height: type === 'BARCODE' ? 10 : 5,
      rotation: 0,
      content: type === 'TEXT' ? 'Texto' : '123456',
      fontSize: 8,
      fontFamily: 'helvetica',
      fontWeight: 'normal',
      color: '#000000',
      textAlign: 'center',
      barcodeFormat: 'CODE128',
      displayValue: true
    };

    if (type === 'BARCODE') newEl.variableField = '{{SKU}}';
    
    setElements(prev => [...prev, newEl]);
    selectElement(newEl.id);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedId(null);
    setActivePanel('NONE');
  };

  const selectElement = (id: string | null) => {
      setSelectedId(id);
      if (id) {
          setActivePanel('PROPERTIES');
      } else {
          setActivePanel('NONE');
      }
  };

  // --- INTERACTION HANDLERS (Unified Mouse/Touch) ---
  
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string, mode: 'MOVE' | 'RESIZE') => {
    e.stopPropagation(); // Evitar que el click llegue al canvas y deseleccione
    
    // Si estamos en movil, abrir panel
    selectElement(id);
    
    setInteractionMode(mode);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    dragStartPos.current = { x: clientX, y: clientY };
    
    const el = elements.find(item => item.id === id);
    if(el) {
        elementStartPos.current = { x: el.x, y: el.y, w: el.width, h: el.height };
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (interactionMode === 'NONE' || !selectedId) return;
    
    // Prevenir scroll en móviles al arrastrar
    // if ('touches' in e) e.preventDefault(); 

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaPixelX = clientX - dragStartPos.current.x;
    const deltaPixelY = clientY - dragStartPos.current.y;

    // Convertir pixels pantalla a milimetros documento
    const deltaMmX = deltaPixelX / (MM_TO_PX * zoom);
    const deltaMmY = deltaPixelY / (MM_TO_PX * zoom);

    setElements(prev => prev.map(el => {
        if(el.id === selectedId) {
            if (interactionMode === 'MOVE') {
                return {
                    ...el,
                    x: Number((elementStartPos.current.x + deltaMmX).toFixed(1)),
                    y: Number((elementStartPos.current.y + deltaMmY).toFixed(1))
                };
            } else if (interactionMode === 'RESIZE') {
                return {
                    ...el,
                    width: Number(Math.max(2, elementStartPos.current.w + deltaMmX).toFixed(1)),
                    height: Number(Math.max(2, elementStartPos.current.h + deltaMmY).toFixed(1))
                };
            }
        }
        return el;
    }));
  };

  const handlePointerUp = () => {
    setInteractionMode('NONE');
  };

  // --- RENDERING HELPERS ---
  const renderBarcode = (el: LabelElement) => {
      const canvas = document.createElement('canvas');
      try {
          JsBarcode(canvas, "123456", {
              format: "CODE128",
              displayValue: el.displayValue,
              margin: 0,
              width: 2,
              height: 50,
              fontSize: 20
          });
          return canvas.toDataURL("image/png");
      } catch (e) { return ''; }
  };

  const resolvePreviewText = (el: LabelElement) => {
      if (el.variableField) {
          switch(el.variableField) {
              case '{{NOMBRE}}': return 'Prod. Ejemplo';
              case '{{SKU}}': return 'ABC-123';
              case '{{PRECIO}}': return 'L. 100.00';
              case '{{MARCA}}': return 'Marca';
              case '{{MODELO}}': return 'Modelo';
              default: return el.variableField;
          }
      }
      return el.content;
  };

  // --- SAVING ---
  const handleSave = async () => {
      if (!template.name) return Swal.fire('Nombre Requerido', 'Asigne un nombre a la plantilla', 'warning');
      const payload = { ...template, elements };
      try {
          if (template.id) await LabelService.update(template.id, payload);
          else await LabelService.create(payload);
          Swal.fire('Guardado', 'Plantilla lista', 'success');
          loadSavedTemplates();
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  // --- UI PANELS ---
  
  const PageSetupPanel = () => (
      <div className="p-4 space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mb-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Grid size={18}/> Configuración Página</h3>
              <button onClick={() => setActivePanel('NONE')} className="md:hidden"><ChevronDown/></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
              <BufferedInput label="Ancho (mm)" value={template.width} onChange={(v:any) => setTemplate({...template, width: Number(v)})} type="number" />
              <BufferedInput label="Alto (mm)" value={template.height} onChange={(v:any) => setTemplate({...template, height: Number(v)})} type="number" />
          </div>
          <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100 cursor-pointer mt-4" 
               onClick={() => setTemplate({...template, isDefault: !template.isDefault})}>
              <div className={`w-5 h-5 rounded flex items-center justify-center border ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                  {template.isDefault && <Check size={12} className="text-white"/>}
              </div>
              <span className="text-sm font-bold text-indigo-900">Plantilla Predeterminada</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Esta plantilla se usará automáticamente al imprimir desde inventario.</p>
      </div>
  );

  const PropertiesPanel = ({ mobile }: { mobile?: boolean } = {}) => {
      const sel = elements.find(e => e.id === selectedId);
      if (!sel) return null;

      return (
          <div className="p-4 space-y-4">
              <div className="flex justify-between items-center border-b pb-2 mb-2">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      {sel.type === 'TEXT' ? <Type size={18}/> : <ScanLine size={18}/>} Propiedades
                  </h3>
                  <div className="flex gap-2">
                      <button onClick={() => deleteElement(sel.id)} className="text-red-500 bg-red-50 p-2 rounded-lg"><Trash2 size={18}/></button>
                      <button onClick={() => setActivePanel('NONE')} className="md:hidden p-2"><ChevronDown/></button>
                  </div>
              </div>

              {/* Data Binding */}
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Dato / Contenido</label>
                  <select className="w-full p-2 border rounded bg-slate-50 text-sm" value={sel.variableField || ''} 
                      onChange={e => updateElement(sel.id, {variableField: e.target.value, content: e.target.value || sel.content})}>
                      <option value="">Texto Manual</option>
                      {PLACEHOLDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {!sel.variableField && (
                      <BufferedInput value={sel.content} onChange={(v:any) => updateElement(sel.id, {content: v})} />
                  )}
              </div>

              {/* Geometry */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <BufferedInput label="X (mm)" value={sel.x} onChange={(v:any) => updateElement(sel.id, {x: Number(v)})} type="number" />
                  <BufferedInput label="Y (mm)" value={sel.y} onChange={(v:any) => updateElement(sel.id, {y: Number(v)})} type="number" />
                  <BufferedInput label="Ancho" value={sel.width} onChange={(v:any) => updateElement(sel.id, {width: Number(v)})} type="number" />
                  <BufferedInput label="Alto" value={sel.height} onChange={(v:any) => updateElement(sel.id, {height: Number(v)})} type="number" />
                  <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Rotación: {sel.rotation}°</label>
                      <input type="range" min="0" max="270" step="90" className="w-full" value={sel.rotation} onChange={e => updateElement(sel.id, {rotation: Number(e.target.value)})} />
                  </div>
              </div>

              {/* Styles */}
              {sel.type === 'TEXT' && (
                  <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                          <BufferedInput label="Tamaño (pt)" value={sel.fontSize || 10} onChange={(v:any) => updateElement(sel.id, {fontSize: Number(v)})} type="number" />
                          <div>
                              <label className="text-[10px] text-slate-400 block mb-1 uppercase">Peso</label>
                              <select className="w-full p-2 border rounded text-sm" value={sel.fontWeight} onChange={e => updateElement(sel.id, {fontWeight: e.target.value})}>
                                  <option value="normal">Normal</option>
                                  <option value="bold">Negrita</option>
                              </select>
                          </div>
                      </div>
                      <div className="flex justify-center gap-1 bg-slate-100 p-1 rounded">
                          {['left','center','right'].map((a:any) => (
                              <button key={a} onClick={() => updateElement(sel.id, {textAlign: a})} 
                                  className={`p-1 rounded flex-1 flex justify-center ${sel.textAlign === a ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>
                                  {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                              </button>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden" 
         onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
         onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
      
      {/* HEADER */}
      <div className="bg-white border-b h-14 flex items-center justify-between px-4 shrink-0 z-20 shadow-sm">
          <div className="flex items-center gap-2 overflow-hidden">
              <button onClick={() => navigate(-1)}><ArrowLeft size={20} className="text-slate-600"/></button>
              <BufferedInput value={template.name} onChange={(v:any) => setTemplate({...template, name: v})} />
          </div>
          <div className="flex gap-2">
              <button onClick={() => setShowTemplateModal(true)} className="p-2 bg-slate-100 rounded-lg text-slate-600"><FolderOpen size={18}/></button>
              <button onClick={handleSave} className="p-2 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700">
                  <Save size={18}/>
              </button>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
          
          {/* CANVAS AREA */}
          <div className="flex-1 bg-slate-200/50 flex items-center justify-center overflow-hidden relative p-4 md:p-10 touch-none">
              
              {/* CANVAS WRAPPER */}
              <div 
                ref={canvasRef}
                className="bg-white shadow-2xl relative transition-shadow"
                style={{
                    width: `${template.width * MM_TO_PX * zoom}px`,
                    height: `${template.height * MM_TO_PX * zoom}px`,
                }}
                onClick={() => selectElement(null)} // Deseleccionar al tocar fondo
              >
                  {/* GRID BACKGROUND */}
                  <div className="absolute inset-0 pointer-events-none opacity-20" 
                       style={{backgroundImage: 'linear-gradient(#ccc 1px, transparent 1px), linear-gradient(90deg, #ccc 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
                  </div>

                  {elements.map(el => {
                      const isSelected = selectedId === el.id;
                      return (
                          <div
                            key={el.id}
                            onMouseDown={(e) => handlePointerDown(e, el.id, 'MOVE')}
                            onTouchStart={(e) => handlePointerDown(e, el.id, 'MOVE')}
                            className={`absolute flex items-center justify-center select-none cursor-move group
                                ${isSelected ? 'outline outline-2 outline-indigo-600 z-50' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                            style={{
                                left: `${el.x * MM_TO_PX * zoom}px`,
                                top: `${el.y * MM_TO_PX * zoom}px`,
                                width: `${el.width * MM_TO_PX * zoom}px`,
                                height: `${el.height * MM_TO_PX * zoom}px`,
                                transform: `rotate(${el.rotation}deg)`,
                                transformOrigin: 'center center',
                            }}
                          >
                              {el.type === 'TEXT' ? (
                                  <div style={{
                                      fontSize: `${(el.fontSize || 10) * zoom}pt`,
                                      fontFamily: el.fontFamily,
                                      fontWeight: el.fontWeight,
                                      color: el.color,
                                      textAlign: el.textAlign,
                                      width: '100%',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      pointerEvents: 'none'
                                  }}>
                                      {resolvePreviewText(el)}
                                  </div>
                              ) : (
                                  <img 
                                    src={renderBarcode(el)} 
                                    alt="barcode" 
                                    className="w-full h-full object-fill pointer-events-none"
                                  />
                              )}

                              {/* RESIZE HANDLE (Only when selected) */}
                              {isSelected && (
                                  <div 
                                    className="absolute -bottom-2 -right-2 w-6 h-6 bg-indigo-600 rounded-full border-2 border-white shadow cursor-nwse-resize flex items-center justify-center z-50 touch-manipulation"
                                    onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE')}
                                    onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE')}
                                  >
                                      <Maximize2 size={12} className="text-white"/>
                                  </div>
                              )}
                          </div>
                      );
                  })}
              </div>
          </div>

          {/* DESKTOP SIDEBAR */}
          <div className="hidden md:flex w-72 bg-white border-l z-20 flex-col shadow-xl">
              {activePanel === 'PROPERTIES' ? <PropertiesPanel /> : <PageSetupPanel />}
          </div>

      </div>

      {/* MOBILE BOTTOM TOOLBAR */}
      <div className="md:hidden bg-white border-t p-2 flex justify-around items-center shrink-0 z-50 pb-safe">
          <ToolBtn icon={<Type size={20}/>} label="Texto" onClick={() => addElement('TEXT')} />
          <ToolBtn icon={<ScanLine size={20}/>} label="Código" onClick={() => addElement('BARCODE')} />
          <ToolBtn icon={<FileCog size={20}/>} label="Página" onClick={() => setActivePanel('PAGE_SETUP')} active={activePanel === 'PAGE_SETUP'} />
      </div>

      {/* MOBILE BOTTOM SHEET (PROPERTIES & PAGE SETUP) */}
      {(activePanel === 'PROPERTIES' || activePanel === 'PAGE_SETUP') && (
          <div className="md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-50 max-h-[60vh] overflow-y-auto border-t border-slate-200 animate-slide-up pb-20">
              <div className="sticky top-0 bg-white p-2 flex justify-center border-b mb-2" onClick={() => setActivePanel('NONE')}>
                  <div className="w-10 h-1 bg-slate-300 rounded-full"/>
              </div>
              {activePanel === 'PROPERTIES' ? <PropertiesPanel mobile /> : <PageSetupPanel />}
          </div>
      )}

      {/* TEMPLATE LOAD MODAL */}
      {showTemplateModal && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">Mis Plantillas</h3>
                      <button onClick={() => setShowTemplateModal(false)}><X/></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 overflow-y-auto p-1">
                      <button onClick={() => { setTemplate(INITIAL_TEMPLATE); setElements([]); setShowTemplateModal(false); }}
                          className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 min-h-[120px]">
                          <span className="font-bold text-slate-500">+ Nueva</span>
                      </button>
                      {savedTemplates.map(t => (
                          <div key={t.id} onClick={() => { setTemplate(t); setElements(t.elements); setShowTemplateModal(false); }}
                              className="border rounded-xl p-4 hover:shadow-md cursor-pointer bg-slate-50 relative">
                              {t.isDefault && <Star size={16} className="absolute top-2 right-2 text-amber-500" fill="currentColor"/>}
                              <p className="font-bold text-sm truncate">{t.name}</p>
                              <p className="text-xs text-slate-500">{t.width}x{t.height}mm</p>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const ToolBtn = ({ icon, label, onClick, active }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-all ${active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 active:bg-slate-100'}`}>
        {icon}
        <span className="text-[10px] font-bold uppercase">{label}</span>
    </button>
);

export default LabelDesigner;