
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { ArrowLeft, Save, Printer, RefreshCw, LayoutTemplate } from 'lucide-react';
import Swal from 'sweetalert2';

// 1mm = 3.7795px (aprox 96 DPI)
const MM_TO_PX = 3.7795;

interface ElementConfig {
  id: string;
  type: 'TEXT' | 'BARCODE';
  x: number; // mm
  y: number; // mm
  rotation: number; // degrees (0, 90, 180, 270)
  fontSize?: number; // pt (for text)
  text?: string;
  width?: number; // mm (for barcode)
  height?: number; // mm (for barcode)
}

interface LabelConfig {
  pageWidth: number; // mm
  pageHeight: number; // mm
  elements: ElementConfig[];
}

const DEFAULT_CONFIG: LabelConfig = {
  pageWidth: 50,
  pageHeight: 80,
  elements: [
    { id: 'title', type: 'TEXT', x: 5, y: 40, rotation: 90, fontSize: 8, text: 'TITULO PRODUCTO' },
    { id: 'barcode', type: 'BARCODE', x: 18, y: 40, rotation: 90, width: 12, height: 60, text: '123456' },
    { id: 'sku', type: 'TEXT', x: 44, y: 40, rotation: 90, fontSize: 11, text: 'SKU-123456' }
  ]
};

const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCode, itemDesc } = location.state || { itemCode: 'TEST-001', itemDesc: 'Producto de Prueba' };

  const [config, setConfig] = useState<LabelConfig>(DEFAULT_CONFIG);
  const [barcodeSrc, setBarcodeSrc] = useState<string>('');

  // Cargar configuración guardada
  useEffect(() => {
    const saved = localStorage.getItem('smartcloud_label_design');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Actualizar textos con los datos recibidos de inventario
        const updatedElements = parsed.elements.map((el: ElementConfig) => {
          if (el.id === 'title') return { ...el, text: itemDesc };
          if (el.id === 'barcode') return { ...el, text: itemCode };
          if (el.id === 'sku') return { ...el, text: itemCode };
          return el;
        });
        setConfig({ ...parsed, elements: updatedElements });
      } catch (e) {
        console.error("Error loading config", e);
        loadDefaultWithData();
      }
    } else {
      loadDefaultWithData();
    }
  }, [itemCode, itemDesc]);

  // Generar imagen base del código de barras
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, itemCode, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        width: 4, 
        height: 100, 
        fontSize: 0
      });
      setBarcodeSrc(canvas.toDataURL("image/png"));
    } catch (e) {
      console.error(e);
    }
  }, [itemCode]);

  const loadDefaultWithData = () => {
    const updated = {
      ...DEFAULT_CONFIG,
      elements: DEFAULT_CONFIG.elements.map(el => {
        if (el.id === 'title') return { ...el, text: itemDesc };
        if (el.id === 'barcode') return { ...el, text: itemCode };
        if (el.id === 'sku') return { ...el, text: itemCode };
        return el;
      })
    };
    setConfig(updated);
  };

  const updateElement = (id: string, updates: Partial<ElementConfig>) => {
    setConfig(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.id === id ? { ...el, ...updates } : el)
    }));
  };

  const saveConfig = () => {
    // Guardar plantilla (sin los datos específicos, para reutilizar estructura)
    const toSave = {
      ...config,
      elements: config.elements.map(el => ({ ...el, text: 'PLACEHOLDER' })) 
    };
    localStorage.setItem('smartcloud_label_design', JSON.stringify(toSave));
    Swal.fire({
      icon: 'success',
      title: 'Diseño Guardado',
      text: 'Este diseño se usará por defecto para futuras impresiones.',
      timer: 1500,
      showConfirmButton: false
    });
  };

  // Función para rotar imagen en canvas para el PDF final
  const getRotatedImage = (src: string, angle: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        if (angle === 90 || angle === 270) {
            canvas.width = img.height;
            canvas.height = img.width;
        } else {
            canvas.width = img.width;
            canvas.height = img.height;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(src);

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL("image/png"));
      };
    });
  };

  const handlePrint = async () => {
    try {
      const doc = new jsPDF({
        orientation: config.pageWidth > config.pageHeight ? 'l' : 'p',
        unit: 'mm',
        format: [config.pageWidth, config.pageHeight]
      });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);

      for (const el of config.elements) {
        if (el.type === 'TEXT') {
          doc.setFontSize(el.fontSize || 10);
          if (el.id === 'sku') doc.setFont("courier", "bold");
          else doc.setFont("helvetica", "bold");

          // jsPDF text rotation
          // La alineación 'center' usa Y como eje en rotación 90.
          doc.text(el.text || '', el.x, el.y, { align: "center", angle: el.rotation });
        } else if (el.type === 'BARCODE' && barcodeSrc) {
          // Para imagenes rotadas, jsPDF addImage rotation a veces es compleja con coordenadas.
          // Es mejor rotar la imagen fuente.
          let finalImg = barcodeSrc;
          let w = el.width || 10;
          let h = el.height || 50;

          // Si rotamos 90 grados, el ancho visual en PDF es la altura de la imagen
          if (el.rotation !== 0) {
             finalImg = await getRotatedImage(barcodeSrc, el.rotation);
             // Intercambiar dimensiones para el PDF si rota 90/270
             if (el.rotation === 90 || el.rotation === 270) {
                 // No intercambiamos aquí porque el usuario configuró Width/Height visuales en el diseñador
                 // El diseñador visualmente ya muestra W/H relativos al papel.
                 // PERO addImage espera W y H de la imagen. 
             }
          }
          
          // addImage(img, fmt, x, y, w, h)
          // El 'y' en el designer para barcode suele ser el centro vertical visual
          // Ajustamos para que la coord sea top-left como espera jsPDF
          let drawX = el.x;
          let drawY = el.y;
          
          // Centrado simplificado: Asumimos que X/Y del designer son Top-Left del elemento
          // O podemos asumir Centro. En el preview CSS usaremos top/left absolute.
          // Ajustaremos para que coincida visualmente.
          
          doc.addImage(finalImg, 'PNG', drawX, drawY, w, h);
        }
      }

      doc.save(`etiqueta_${itemCode}.pdf`);
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo generar el PDF', 'error');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={24} className="text-slate-600"/>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <LayoutTemplate className="text-indigo-600"/> Diseñador de Etiquetas
            </h1>
            <p className="text-sm text-slate-500">Ajusta visualmente tu etiqueta para "{itemCode}"</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={loadDefaultWithData} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold text-sm flex items-center gap-2 border border-slate-200">
            <RefreshCw size={18}/> Reset
          </button>
          <button onClick={saveConfig} className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-slate-700 shadow-md">
            <Save size={18}/> Guardar Diseño
          </button>
          <button onClick={handlePrint} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30">
            <Printer size={18}/> DESCARGAR PDF
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Controls */}
        <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto p-4 shadow-sm z-10 custom-scrollbar">
          <h3 className="font-bold text-slate-800 border-b pb-2 mb-4">Configuración Papel</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-xs font-bold text-slate-500">Ancho (mm)</label>
              <input type="number" className="w-full p-2 border rounded mt-1" value={config.pageWidth} onChange={e => setConfig({...config, pageWidth: Number(e.target.value)})} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500">Alto (mm)</label>
              <input type="number" className="w-full p-2 border rounded mt-1" value={config.pageHeight} onChange={e => setConfig({...config, pageHeight: Number(e.target.value)})} />
            </div>
          </div>

          <h3 className="font-bold text-slate-800 border-b pb-2 mb-4">Elementos</h3>
          
          {config.elements.map((el) => (
            <div key={el.id} className="mb-6 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <h4 className="font-bold text-indigo-700 mb-3 text-sm uppercase">{el.id} ({el.type})</h4>
              
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="text-xs text-slate-500">Pos X (mm)</label>
                  <input type="number" className="w-full p-1.5 border rounded text-sm" value={el.x} onChange={e => updateElement(el.id, { x: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Pos Y (mm)</label>
                  <input type="number" className="w-full p-1.5 border rounded text-sm" value={el.y} onChange={e => updateElement(el.id, { y: Number(e.target.value) })} />
                </div>
              </div>

              <div className="mb-2">
                 <label className="text-xs text-slate-500">Rotación</label>
                 <select className="w-full p-1.5 border rounded text-sm" value={el.rotation} onChange={e => updateElement(el.id, { rotation: Number(e.target.value) })}>
                    <option value={0}>0° (Horizontal)</option>
                    <option value={90}>90° (Vertical)</option>
                    <option value={180}>180° (Invertido)</option>
                    <option value={270}>270° (Vertical Inv.)</option>
                 </select>
              </div>

              {el.type === 'TEXT' && (
                <div>
                  <label className="text-xs text-slate-500">Tamaño Fuente (pt)</label>
                  <input type="number" className="w-full p-1.5 border rounded text-sm" value={el.fontSize} onChange={e => updateElement(el.id, { fontSize: Number(e.target.value) })} />
                </div>
              )}

              {el.type === 'BARCODE' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Ancho Visual (mm)</label>
                    <input type="number" className="w-full p-1.5 border rounded text-sm" value={el.width} onChange={e => updateElement(el.id, { width: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Alto Visual (mm)</label>
                    <input type="number" className="w-full p-1.5 border rounded text-sm" value={el.height} onChange={e => updateElement(el.id, { height: Number(e.target.value) })} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-slate-200 flex items-center justify-center p-10 overflow-auto relative">
           <div className="absolute top-4 right-4 bg-white/80 p-2 rounded text-xs text-slate-500 backdrop-blur-sm">
              Escala de vista: x3
           </div>

           {/* PAPER REPRESENTATION */}
           <div 
             className="bg-white shadow-2xl relative transition-all duration-300 ease-in-out"
             style={{
               width: `${config.pageWidth * MM_TO_PX * 3}px`, // Scaled x3 for visibility
               height: `${config.pageHeight * MM_TO_PX * 3}px`,
             }}
           >
              {config.elements.map(el => (
                <div
                  key={el.id}
                  className="absolute border border-transparent hover:border-indigo-400 cursor-move flex items-center justify-center whitespace-nowrap group"
                  style={{
                    left: `${el.x * MM_TO_PX * 3}px`,
                    top: `${el.y * MM_TO_PX * 3}px`,
                    transform: `rotate(${el.rotation}deg)`,
                    transformOrigin: 'top left', // Coincide con lógica PDF usualmente
                    // Para texto, el PDF 'text' usa la coordenada como baseline o inicio.
                    // Para simplificar, usaremos position absolute directo.
                  }}
                >
                   {/* Tooltip on Hover */}
                   <div className="hidden group-hover:block absolute -top-6 left-0 bg-indigo-600 text-white text-[10px] px-1 rounded whitespace-nowrap z-50">
                      {el.id} (x:{el.x}, y:{el.y})
                   </div>

                   {el.type === 'TEXT' ? (
                     <span style={{ 
                        fontSize: `${(el.fontSize || 10) * 3}pt`, // Scale font
                        fontFamily: el.id === 'sku' ? 'monospace' : 'sans-serif',
                        fontWeight: 'bold',
                        // Centrar texto visualmente si en PDF usamos align center.
                        // Hack: transform translate -50% si rotation 0, pero con rotación es complejo.
                        // Asumiremos Left Align para el designer por simplicidad o Center
                        textAlign: 'center'
                     }}>
                        {el.text}
                     </span>
                   ) : (
                     <img 
                       src={barcodeSrc} 
                       alt="barcode"
                       style={{
                         width: `${(el.width || 10) * MM_TO_PX * 3}px`,
                         height: `${(el.height || 50) * MM_TO_PX * 3}px`,
                         display: 'block'
                       }}
                     />
                   )}
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

export default LabelDesigner;
