
import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Loader2, Eye, Search } from 'lucide-react';
import { LabelTemplate } from '../../types';
import { renderToHTML, printTemplate, PrintDataContext } from '../../services/TemplateRenderer';
import { SalesService, MedicamentosService, ConfigService } from '../../services/api';

interface PreviewModalProps {
  template: LabelTemplate;
  onClose: () => void;
}

type RecordItem = { id: string | number; label: string; sublabel?: string; raw: any };

const PreviewModal: React.FC<PreviewModalProps> = ({ template, onClose }) => {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [empresa, setEmpresa] = useState<any>(null);
  const empresaRef = useRef<any>(null);
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [ctx, setCtx] = useState<PrintDataContext>({});
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [search, setSearch] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ─── Load empresa and records on mount ──────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingRecords(true);
      try {
        const [empData] = await Promise.all([ConfigService.get()]);
        setEmpresa(empData);
        empresaRef.current = empData;
        await loadRecords(empData);
      } finally {
        setLoadingRecords(false);
      }
    };
    load();
  }, []);

  const loadRecords = async (empData: any) => {
    const ds = template.dataSource;
    try {
      if (ds === 'SALES') {
        const ventas = await SalesService.getVentasDiDaily();
        setRecords(ventas.slice(0, 30).map(v => ({
          id: v.codVenta,
          label: `Factura ${v.codVenta}`,
          sublabel: `${v.nombreCliente || 'Sin nombre'} · L. ${v.total?.toFixed(2)}`,
          raw: v,
        })));
      } else if (ds === 'MEDICAMENTOS') {
        const meds = await MedicamentosService.getAll();
        setRecords(meds.slice(0, 50).map(m => ({
          id: m.codigo,
          label: m.nombre_generico,
          sublabel: `${m.nombre_comercial || ''} · ${m.concentracion || ''}`.trim().replace(/^·\s*/, ''),
          raw: m,
        })));
      } else {
        // No data source or unknown — preview with empty context (shows placeholders)
        setRecords([{ id: 'sample', label: 'Vista previa en blanco', sublabel: 'Variables mostrarán {{placeholder}}', raw: {} }]);
      }
    } catch {
      setRecords([{ id: 'sample', label: 'Vista previa en blanco', sublabel: 'No se pudo cargar datos', raw: {} }]);
    }
  };

  // ─── Build context and render preview ────────────────────────────────────
  const handleSelectRecord = async (item: RecordItem) => {
    setSelectedRecord(item);
    setLoadingPreview(true);
    try {
      const newCtx: PrintDataContext = { empresa: empresaRef.current || empresa };
      const ds = template.dataSource;
      const raw = item.raw;

      if (ds === 'SALES' && raw.codVenta) {
        const detalles = await SalesService.getDetallesVenta(raw.codVenta);
        newCtx.venta  = { ...raw, detalles };
        newCtx.cliente = { nombre: raw.nombreCliente, identidad: raw.identidadCliente, direccion: raw.direccionCliente };
      } else if (ds === 'MEDICAMENTOS') {
        newCtx.medicamento = raw;
        Object.assign(newCtx, raw);
      } else if (ds === 'NONE' || !ds) {
        // Just empresa context
      }

      setCtx(newCtx);
      const html = await renderToHTML(template, newCtx);
      setPreviewHtml(html);
    } finally {
      setLoadingPreview(false);
    }
  };

  // ─── Auto-select first record ────────────────────────────────────────────
  useEffect(() => {
    if (records.length > 0 && !selectedRecord) {
      handleSelectRecord(records[0]);
    }
  }, [records]);

  const handlePrint = () => printTemplate(template, ctx);

  const filtered = records.filter(r =>
    r.label.toLowerCase().includes(search.toLowerCase()) ||
    (r.sublabel || '').toLowerCase().includes(search.toLowerCase())
  );

  const PAGE_SCALE = template.type === 'DOCUMENT' ? 37.795 : 3.7795;
  const pageW = Math.round(template.width * PAGE_SCALE);
  const pageH = Math.round(template.height * PAGE_SCALE);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-900/70 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b bg-white shrink-0">
          <div className="flex items-center gap-3">
            <Eye size={20} className="text-indigo-600"/>
            <div>
              <h2 className="font-bold text-slate-800 text-base">Vista Previa</h2>
              <p className="text-xs text-slate-400">{template.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!previewHtml}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all"
            >
              <Printer size={16}/> Imprimir
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
              <X size={20}/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Record List */}
          <div className="w-64 border-r flex flex-col bg-slate-50 shrink-0">
            <div className="p-3 border-b bg-white">
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
                <Search size={14} className="text-slate-400"/>
                <input
                  className="bg-transparent outline-none text-sm flex-1 text-slate-700 placeholder:text-slate-400"
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loadingRecords ? (
                <div className="flex items-center justify-center h-24 text-slate-400">
                  <Loader2 size={20} className="animate-spin"/>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Sin resultados</p>
              ) : (
                filtered.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectRecord(item)}
                    className={`w-full text-left p-3 rounded-xl mb-1 transition-all ${
                      selectedRecord?.id === item.id
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'hover:bg-white hover:shadow-sm text-slate-700'
                    }`}
                  >
                    <div className={`font-bold text-xs truncate ${selectedRecord?.id === item.id ? 'text-white' : 'text-slate-800'}`}>
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div className={`text-[10px] truncate mt-0.5 ${selectedRecord?.id === item.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {item.sublabel}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="p-2 border-t text-[10px] text-slate-400 text-center">
              {records.length} registros disponibles
            </div>
          </div>

          {/* Preview Iframe */}
          <div className="flex-1 bg-slate-200 overflow-auto relative p-6">
            {loadingPreview && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <Loader2 size={28} className="animate-spin text-indigo-500"/>
                  <span className="text-sm font-medium">Generando vista previa...</span>
                </div>
              </div>
            )}
            {previewHtml ? (
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                className="bg-white shadow-xl rounded"
                style={{ border: 'none', width: `${pageW + 64}px`, height: `${pageH + 64}px`, display: 'block', margin: '0 auto' }}
                title="Vista previa de la plantilla"
              />
            ) : (
              !loadingPreview && (
                <div className="flex flex-col items-center gap-3 text-slate-400 mt-16">
                  <Eye size={40} strokeWidth={1}/>
                  <p className="text-sm">Selecciona un registro de la lista</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
