
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { 
  ArrowLeft, Save, Printer, RefreshCw, Type, Image as ImageIcon, ScanLine, 
  Trash2, Copy, Grid, Layers, MousePointer2, Move, RotateCw, AlignLeft, AlignCenter, AlignRight, CheckCircle, FolderOpen, Star
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- CONSTANTES ---
const MM_TO_PX = 3.7795; // 96 DPI
const ZOOM_SCALE = 3; // Escala visual para mejor renderizado

// --- UTILIDADES ---
const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const INITIAL_TEMPLATE: LabelTemplate = {
  id: '',
  name: 'Nueva Etiqueta',
  isDefault: false,
  width: 50,
  height: 25, // Etiqueta más estándar pequeña
  elements: []
};

// Variables disponibles para inyección
const PLACEHOLDERS = [
  { label: 'Nombre Producto', value: '{{NOMBRE}}' },
  { label: 'Código / SKU', value: '{{SKU}}' },
  { label: 'Precio Venta', value: '{{PRECIO}}' },
  { label: 'Código Barras (Valor)', value: '{{BARCODE}}' },
  { label: 'Marca', value: '{{MARCA}}' },
  { label: 'Modelo', value: '{{MODELO}}' },
];

const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Datos del producto "de prueba" para previsualizar
  const { itemCode, itemDesc, itemPrice } = location.state || { 
      itemCode: 'TEST-12345', 
      itemDesc: 'Producto Ejemplo Samsung Galaxy S23', 
      itemPrice: 250.00 
  };

  // --- ESTADOS ---
  const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
  const [elements, setElements] = useState<LabelElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // UI States
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSavedTemplates();
  }, []);

  const loadSavedTemplates = async () => {
    try {
      const data = await LabelService.getAll();
      setSavedTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates", error);
    }
  };

  // --- LOGICA DE ELEMENTOS ---

  const addElement = (type: LabelElement['type']) => {
    const newEl: LabelElement = {
      id: generateId(),
      type,
      x: 2,
      y: 2,
      width: type === 'BARCODE' ? 30 : 20,
      height: type === 'BARCODE' ? 10 : 5,
      rotation: 0,
      content: type === 'TEXT' ? 'Texto' : (type === 'BARCODE' ? '123456' : ''),
      fontSize: 8,
      fontFamily: 'helvetica',
      fontWeight: 'normal',
      color: '#000000',
      textAlign: 'left',
      barcodeFormat: 'CODE128',
      displayValue: true
    };

    if (type === 'BARCODE') {
        newEl.variableField = '{{SKU}}'; // Por defecto SKU
    }

    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedId(null);
  };

  // --- MOUSE HANDLERS (DRAG & DROP SIMPLE) ---
  // Nota: Para una solución de producción super robusta usaríamos 'react-rnd' o similar,
  // pero aquí implementamos lógica básica para no añadir dependencias pesadas.
  
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedId) return;
    
    // Calcular delta en pixeles de pantalla
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    
    // Convertir delta a milimetros
    const deltaXmm = deltaX / (MM_TO_PX * ZOOM_SCALE);
    const deltaYmm = deltaY / (MM_TO_PX * ZOOM_SCALE);

    setElements(prev => prev.map(el => {
        if (el.id === selectedId) {
            return { ...el, x: el.x + deltaXmm, y: el.y + deltaYmm };
        }
        return el;
    }));

    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // --- RENDERIZADO VISUAL ---
  // Reemplaza los placeholders con datos reales para la vista previa
  const resolveContent = (el: LabelElement) => {
      let text = el.content;
      
      // Si tiene un campo variable asignado, úsalo prioritariamente
      if (el.variableField) text = el.variableField;

      // Reemplazo simple
      text = text.replace('{{NOMBRE}}', itemDesc);
      text = text.replace('{{SKU}}', itemCode);
      text = text.replace('{{PRECIO}}', `L. ${Number(itemPrice).toFixed(2)}`);
      text = text.replace('{{BARCODE}}', itemCode); // Barcode value usually matches SKU
      text = text.replace('{{MARCA}}', 'MARCA');
      text = text.replace('{{MODELO}}', 'MODELO');
      
      return text;
  };

  const renderBarcode = (el: LabelElement) => {
      const canvas = document.createElement('canvas');
      try {
          JsBarcode(canvas, resolveContent(el), {
              format: (el.barcodeFormat as any) || "CODE128",
              displayValue: el.displayValue,
              margin: 0,
              width: 2, // Width relativo
              height: 50, // Height relativo
              fontSize: 10
          });
          return canvas.toDataURL("image/png");
      } catch (e) {
          return ''; // Invalid barcode content
      }
  };

  // --- GUARDADO Y GESTIÓN ---
  
  const handleSaveTemplate = async () => {
      if (!template.name) return Swal.fire('Error', 'Ingrese un nombre para la plantilla', 'warning');
      
      const payload = {
          ...template,
          elements: elements
      };

      try {
          if (template.id) {
              await LabelService.update(template.id, payload);
          } else {
              await LabelService.create(payload);
          }
          Swal.fire('Guardado', 'Plantilla guardada correctamente', 'success');
          loadSavedTemplates();
      } catch (error: any) {
          Swal.fire('Error', error.message, 'error');
      }
  };

  const handleLoadTemplate = (tpl: LabelTemplate) => {
      setTemplate(tpl);
      setElements(tpl.elements); // Cargar elementos
      setShowTemplateModal(false);
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm('¿Eliminar plantilla?')) {
          await LabelService.delete(id);
          loadSavedTemplates();
      }
  };

  // --- PDF EXPORT ---
  const handlePrint = () => {
      try {
          // Orientación basada en dimensiones
          const orientation = template.width > template.height ? 'l' : 'p';
          const doc = new jsPDF({
              orientation,
              unit: 'mm',
              format: [template.width, template.height]
          });

          elements.forEach(el => {
              const content = resolveContent(el);
              
              if (el.type === 'TEXT') {
                  doc.setFontSize(el.fontSize || 10);
                  doc.setFont(el.fontFamily || 'helvetica', el.fontWeight || 'normal');
                  doc.setTextColor(el.color || '#000000');
                  
                  // Calcular rotación
                  // jsPDF rota alrededor de un punto.
                  // Simplificación: Text normal
                  // Para rotación avanzada en jsPDF se requiere usar context transformation matrix o doc.text options
                  
                  doc.text(content, el.x, el.y + (el.height/2), { 
                      align: el.textAlign || 'left',
                      angle: el.rotation,
                      baseline: 'middle'
                  });
              } else if (el.type === 'BARCODE') {
                  const imgData = renderBarcode(el);
                  if (imgData) {
                      // Rotación de imagen en PDF es compleja, hacemos rotación básica
                      // Si rotación es 90, intercambiamos W/H en visualización pero jsPDF necesita rotate.
                      // Implementación básica sin rotación compleja de imagen por ahora
                      doc.addImage(imgData, 'PNG', el.x, el.y, el.width, el.height, undefined, 'FAST', el.rotation); 
                  }
              }
          });

          doc.save(`${template.name}_${itemCode}.pdf`);
      } catch (e) {
          console.error(e);
          Swal.fire('Error', 'No se pudo generar el PDF', 'error');
      }
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
         <div className="flex items-center gap-4">
             <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600"/></button>
             <div>
                 <input 
                    className="font-bold text-lg text-slate-800 border-none focus:ring-0 p-0 hover:bg-slate-50 rounded"
                    value={template.name}
                    onChange={e => setTemplate({...template, name: e.target.value})}
                    placeholder="Nombre de Plantilla..."
                 />
                 <div className="flex items-center gap-2 text-xs text-slate-500">
                     <span>{template.width}mm x {template.height}mm</span>
                     {template.isDefault && <span className="bg-amber-100 text-amber-700 px-1.5 rounded font-bold flex items-center gap-1"><Star size={10} fill="currentColor"/> Default</span>}
                 </div>
             </div>
         </div>
         <div className="flex gap-2">
             <button onClick={() => setShowTemplateModal(true)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-200">
                 <FolderOpen size={18}/> Mis Plantillas
             </button>
             <button onClick={handleSaveTemplate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-200">
                 <Save size={18}/> Guardar
             </button>
             <button onClick={handlePrint} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-200">
                 <Printer size={18}/> Imprimir PDF
             </button>
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT TOOLBAR */}
          <div className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-4 z-10">
              <ToolButton icon={<MousePointer2 size={24}/>} label="Seleccionar" onClick={() => setSelectedId(null)} active={!selectedId} />
              <ToolButton icon={<Type size={24}/>} label="Texto" onClick={() => addElement('TEXT')} />
              <ToolButton icon={<ScanLine size={24}/>} label="Código" onClick={() => addElement('BARCODE')} />
              <div className="flex-1"></div>
              <ToolButton icon={<Grid size={24}/>} label="Config Papel" onClick={() => setSelectedId(null)} />
          </div>

          {/* CANVAS AREA */}
          <div className="flex-1 bg-slate-200/50 flex items-center justify-center relative overflow-auto p-10">
              
              {/* RULERS (Visual Mockup) */}
              <div className="absolute top-0 left-0 w-full h-6 bg-white border-b border-slate-300 z-10 flex text-[10px] text-slate-400 pl-10 items-end pb-1">
                  {Array.from({length: 20}).map((_,i) => <span key={i} className="flex-1 border-l border-slate-200 h-2">{i*10}mm</span>)}
              </div>

              {/* PAPER */}
              <div 
                ref={canvasRef}
                className="bg-white shadow-2xl relative transition-all"
                style={{
                    width: `${template.width * MM_TO_PX * ZOOM_SCALE}px`,
                    height: `${template.height * MM_TO_PX * ZOOM_SCALE}px`,
                    // Cursor logic
                    cursor: isDragging ? 'grabbing' : 'default'
                }}
                onClick={() => setSelectedId(null)}
              >
                  {/* Grid Lines Optional */}
                  <div className="absolute inset-0 pointer-events-none opacity-20" 
                       style={{backgroundImage: 'linear-gradient(#ccc 1px, transparent 1px), linear-gradient(90deg, #ccc 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
                  </div>

                  {elements.map(el => {
                      const isSelected = selectedId === el.id;
                      const content = resolveContent(el);

                      return (
                          <div
                            key={el.id}
                            onMouseDown={(e) => handleMouseDown(e, el.id)}
                            className={`absolute flex items-center justify-center group hover:outline hover:outline-1 hover:outline-indigo-300 select-none
                                ${isSelected ? 'outline outline-2 outline-indigo-600 z-50' : 'z-10'}`}
                            style={{
                                left: `${el.x * MM_TO_PX * ZOOM_SCALE}px`,
                                top: `${el.y * MM_TO_PX * ZOOM_SCALE}px`,
                                width: `${el.width * MM_TO_PX * ZOOM_SCALE}px`,
                                height: `${el.height * MM_TO_PX * ZOOM_SCALE}px`,
                                transform: `rotate(${el.rotation}deg)`,
                                color: el.color
                            }}
                          >
                              {/* RESIZE HANDLES (Visual Only for now due to complexity, control via Right Panel) */}
                              {isSelected && (
                                  <>
                                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-indigo-600 rounded-full"/>
                                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-indigo-600 rounded-full"/>
                                  </>
                              )}

                              {el.type === 'TEXT' && (
                                  <div style={{
                                      fontSize: `${(el.fontSize || 10) * ZOOM_SCALE}pt`,
                                      fontFamily: el.fontFamily,
                                      fontWeight: el.fontWeight,
                                      textAlign: el.textAlign,
                                      width: '100%',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden'
                                  }}>
                                      {content}
                                  </div>
                              )}

                              {el.type === 'BARCODE' && (
                                  <img 
                                    src={renderBarcode(el)} 
                                    alt="barcode" 
                                    className="w-full h-full object-fill pointer-events-none"
                                  />
                              )}
                          </div>
                      );
                  })}
              </div>
          </div>

          {/* RIGHT PROPERTY PANEL */}
          <div className="w-80 bg-white border-l border-slate-200 flex flex-col overflow-y-auto">
              {selectedElement ? (
                  <div className="p-4 space-y-6">
                      <div className="flex justify-between items-center border-b pb-2">
                          <h3 className="font-bold text-slate-800 text-sm uppercase flex items-center gap-2">
                              {selectedElement.type === 'TEXT' ? <Type size={16}/> : <ScanLine size={16}/>} Propiedades
                          </h3>
                          <button onClick={() => deleteElement(selectedElement.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                      </div>

                      {/* Content Binding */}
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Contenido</label>
                          <div className="flex gap-2 mb-2">
                              <select 
                                className="flex-1 text-sm border rounded p-1.5 bg-slate-50"
                                value={selectedElement.variableField || ''}
                                onChange={e => updateElement(selectedElement.id, { variableField: e.target.value, content: e.target.value || selectedElement.content })}
                              >
                                  <option value="">Texto Estático</option>
                                  {PLACEHOLDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                              </select>
                          </div>
                          <textarea 
                             className="w-full border rounded p-2 text-sm font-mono"
                             rows={2}
                             value={selectedElement.content}
                             onChange={e => updateElement(selectedElement.id, { content: e.target.value, variableField: '' })}
                             disabled={!!selectedElement.variableField}
                          />
                      </div>

                      {/* Position & Size */}
                      <div className="space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 border-b pb-1">Geometría (mm)</h4>
                          <div className="grid grid-cols-2 gap-3">
                              <InputNum label="X" value={selectedElement.x} onChange={v => updateElement(selectedElement.id, {x:v})} />
                              <InputNum label="Y" value={selectedElement.y} onChange={v => updateElement(selectedElement.id, {y:v})} />
                              <InputNum label="Ancho" value={selectedElement.width} onChange={v => updateElement(selectedElement.id, {width:v})} />
                              <InputNum label="Alto" value={selectedElement.height} onChange={v => updateElement(selectedElement.id, {height:v})} />
                              <InputNum label="Rotación" value={selectedElement.rotation} onChange={v => updateElement(selectedElement.id, {rotation:v})} step={90} />
                          </div>
                      </div>

                      {/* Style */}
                      {selectedElement.type === 'TEXT' && (
                          <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 border-b pb-1">Estilo</h4>
                              <div className="grid grid-cols-2 gap-3">
                                  <InputNum label="Tamaño (pt)" value={selectedElement.fontSize || 10} onChange={v => updateElement(selectedElement.id, {fontSize:v})} />
                                  <div>
                                      <label className="text-[10px] text-slate-400 block mb-1">Peso</label>
                                      <select className="w-full border rounded p-1 text-sm" value={selectedElement.fontWeight} onChange={e => updateElement(selectedElement.id, {fontWeight: e.target.value})}>
                                          <option value="normal">Normal</option>
                                          <option value="bold">Negrita</option>
                                      </select>
                                  </div>
                              </div>
                              <div className="flex gap-1 bg-slate-100 p-1 rounded justify-center">
                                  {['left', 'center', 'right'].map((align: any) => (
                                      <button 
                                        key={align}
                                        onClick={() => updateElement(selectedElement.id, { textAlign: align })}
                                        className={`p-1 rounded ${selectedElement.textAlign === align ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}
                                      >
                                          {align === 'left' ? <AlignLeft size={16}/> : align === 'center' ? <AlignCenter size={16}/> : <AlignRight size={16}/>}
                                      </button>
                                  ))}
                              </div>
                              <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Color</label>
                                  <input type="color" className="w-full h-8 border rounded cursor-pointer" value={selectedElement.color} onChange={e => updateElement(selectedElement.id, {color: e.target.value})} />
                              </div>
                          </div>
                      )}

                      {selectedElement.type === 'BARCODE' && (
                          <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 border-b pb-1">Código de Barras</h4>
                              <div className="flex items-center gap-2">
                                  <input type="checkbox" checked={selectedElement.displayValue} onChange={e => updateElement(selectedElement.id, {displayValue: e.target.checked})}/>
                                  <label className="text-sm">Mostrar Texto Abajo</label>
                              </div>
                          </div>
                      )}

                  </div>
              ) : (
                  <div className="p-4 space-y-6">
                      <h3 className="font-bold text-slate-800 text-sm uppercase border-b pb-2">Configuración Papel</h3>
                      <div className="grid grid-cols-2 gap-4">
                          <InputNum label="Ancho (mm)" value={template.width} onChange={v => setTemplate({...template, width:v})} />
                          <InputNum label="Alto (mm)" value={template.height} onChange={v => setTemplate({...template, height:v})} />
                      </div>
                      <div className="pt-4 border-t">
                          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded border border-slate-200 cursor-pointer" onClick={() => setTemplate({...template, isDefault: !template.isDefault})}>
                              <div className={`w-5 h-5 rounded border flex items-center justify-center ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                  {template.isDefault && <CheckCircle size={14} className="text-white"/>}
                              </div>
                              <span className="text-sm font-bold text-slate-700">Usar como Predeterminada</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-2">Esta plantilla se usará automáticamente al imprimir desde el inventario.</p>
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* TEMPLATE MANAGER MODAL */}
      {showTemplateModal && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl p-6 h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-slate-800">Mis Plantillas</h3>
                      <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-slate-600"><Trash2 className="rotate-45" size={24}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-4 content-start">
                      <button 
                        onClick={() => { setTemplate(INITIAL_TEMPLATE); setElements([]); setShowTemplateModal(false); }}
                        className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-indigo-500 hover:bg-indigo-50 transition-colors h-40"
                      >
                          <div className="bg-indigo-100 text-indigo-600 p-3 rounded-full"><PlusIcon size={24}/></div>
                          <span className="font-bold text-slate-600">Crear Nueva</span>
                      </button>
                      {savedTemplates.map(t => (
                          <div key={t.id} onClick={() => handleLoadTemplate(t)} className="border border-slate-200 rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer relative group bg-slate-50 h-40 flex flex-col">
                              {t.isDefault && <div className="absolute top-2 right-2 text-amber-500"><Star size={16} fill="currentColor"/></div>}
                              <div className="flex-1 flex items-center justify-center bg-white border border-slate-100 rounded mb-2">
                                  <span className="text-xs text-slate-400 font-mono">{t.width}x{t.height}</span>
                              </div>
                              <h4 className="font-bold text-slate-700 truncate">{t.name}</h4>
                              <button 
                                onClick={(e) => handleDeleteTemplate(t.id, e)}
                                className="absolute bottom-4 right-4 bg-white p-1.5 rounded-full shadow text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                              >
                                  <Trash2 size={14}/>
                              </button>
                          </div>
                      ))}
                  </div>
                  <div className="mt-4 pt-4 border-t text-right">
                      <button onClick={() => setShowTemplateModal(false)} className="px-4 py-2 bg-slate-200 font-bold rounded-lg text-slate-700">Cerrar</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

// --- HELPER COMPONENTS ---
const ToolButton = ({ icon, label, onClick, active }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 w-full transition-colors ${active ? 'text-indigo-600 bg-indigo-50 border-r-4 border-indigo-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
        {icon}
        <span className="text-[10px] font-bold">{label}</span>
    </button>
);

const InputNum = ({ label, value, onChange, step=1 }: any) => (
    <div>
        <label className="text-[10px] text-slate-400 block mb-1 uppercase">{label}</label>
        <input 
          type="number" 
          className="w-full border rounded p-1.5 text-sm font-mono" 
          value={value} 
          step={step}
          onChange={e => onChange(Number(e.target.value))} 
        />
    </div>
);

// Lucide Plus Icon helper just in case
const PlusIcon = ({size}: {size:number}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);

export default LabelDesigner;
