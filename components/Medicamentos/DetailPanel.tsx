import React, { useEffect, useState } from 'react';
import { ArrowLeft, X, Plus, Edit2, Image, List, Layers, FlaskConical, Thermometer, Pill, BarChart2, Tag, RefreshCw, ClipboardList, FileText, Sparkles } from 'lucide-react';
import { CategoriaTerapeutica, FormaFarmaceutica, Medicamento, PresentacionVenta, LoteMedicamento, ImagenMedicamento } from '../../types';
import { Badge, Spinner, alertBadge, btnPrimary, btnSecondary, btnIcon, catalogStatusBadge, isvBadge, DetailTab, inp, FieldLabel, VIAS, ALMACENAMIENTO } from './shared';

interface Props {
  selectedMed: Medicamento;
  categorias: CategoriaTerapeutica[];
  formas: FormaFarmaceutica[];
  detailTab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  onClose: () => void;
  onEditBasic: () => void;
  onUpdateMed: (patch: Partial<Medicamento>) => Promise<void>;
  detailLoading: boolean;
  imagenes: ImagenMedicamento[];
  presentaciones: PresentacionVenta[];
  lotesDetalle: LoteMedicamento[];
  onAddLote: () => void;
  onAddPres: () => void;
  onEditPres: (p: PresentacionVenta) => void;
  onDeletePres: (id: number) => void;
  onDeleteImagen: (id: number) => void;
  onSetPrincipalImagen?: (id: number) => void;
  onUploadImage: () => void;
  uploadingImg: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAnalyzeImages?: () => void;
  analyzingImages?: boolean;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5">{value}</p>
    </div>
  );
}

export default function DetailPanel({
  selectedMed, categorias, formas, detailTab, onTabChange, onClose, onEditBasic, onUpdateMed, detailLoading,
  imagenes, presentaciones, lotesDetalle,
  onAddLote, onAddPres, onEditPres, onDeletePres,
  onDeleteImagen, onSetPrincipalImagen, onUploadImage, uploadingImg, fileInputRef, onFileSelected,
  onAnalyzeImages, analyzingImages,
}: Props) {
  const [techForm, setTechForm] = useState<Partial<Medicamento>>(selectedMed);
  const [savingFicha, setSavingFicha] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => { setTechForm(selectedMed); }, [selectedMed]);

  const setFicha = (patch: Partial<Medicamento>) => setTechForm(prev => ({ ...prev, ...patch }));

  const saveFicha = async () => {
    setSavingFicha(true);
    try {
      await onUpdateMed(techForm);
    } finally {
      setSavingFicha(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 h-full flex flex-col overflow-hidden shadow-sm">
      <div className="px-4 sm:px-6 pt-4 pb-4 border-b border-slate-100">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al listado
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <button
            type="button"
            onClick={() => {
              const src = selectedMed.urlImagenPrincipal || selectedMed.imagenBase64Principal;
              if (src) setPreviewImage(src);
            }}
            className="w-20 h-20 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 overflow-hidden border border-slate-100 hover:ring-2 hover:ring-indigo-200 transition"
            title="Ver imagen"
          >
            {(selectedMed.urlImagenPrincipal || selectedMed.imagenBase64Principal)
              ? <img src={selectedMed.urlImagenPrincipal || selectedMed.imagenBase64Principal} className="w-full h-full object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
              : <Pill className="w-6 h-6 text-indigo-400" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h2 className="font-bold text-slate-800 text-xl sm:text-2xl leading-tight break-words">{selectedMed.nombre_generico}</h2>
              <button
                onClick={onEditBasic}
                className="mt-0.5 p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors shrink-0"
                title="Editar datos basicos"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            {selectedMed.nombre_comercial && <p className="text-sm text-slate-400 mt-0.5">{selectedMed.nombre_comercial}</p>}
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {catalogStatusBadge(selectedMed.estadoCatalogo)}
              {isvBadge(selectedMed.tipo_isv)}
              {selectedMed.requiere_receta && <Badge cls="bg-amber-100 text-amber-700">Receta</Badge>}
              {selectedMed.es_controlado && <Badge cls="bg-red-100 text-red-700">Controlado</Badge>}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
          {([
            [<FlaskConical className="w-3 h-3" />, 'Concentracion', selectedMed.concentracion || '-'],
            [<Tag className="w-3 h-3" />, 'Codigo', selectedMed.codigo],
            [<Thermometer className="w-3 h-3" />, 'Almacenamiento', selectedMed.condicion_almacenamiento || '-'],
            [<BarChart2 className="w-3 h-3" />, 'Margen', `${selectedMed.margen_ganancia ?? 0}%`],
          ] as [React.ReactNode, string, string][]).map(([icon, label, val]) => (
            <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-slate-400 mb-0.5">{icon}<span className="text-xs">{label}</span></div>
              <p className="text-sm font-medium text-slate-700 truncate">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex border-b border-slate-100 bg-slate-50 px-4 gap-1 overflow-x-auto">
        {([
          ['RESUMEN', <ClipboardList className="w-3.5 h-3.5" />, 'Resumen'],
          ['PRESENTACIONES', <List className="w-3.5 h-3.5" />, 'Venta'],
          ['LOTES', <Layers className="w-3.5 h-3.5" />, 'Lotes'],
          ['FICHA', <FileText className="w-3.5 h-3.5" />, 'Ficha'],
          ['IMAGENES', <Image className="w-3.5 h-3.5" />, 'Imagenes'],
        ] as [DetailTab, React.ReactNode, string][]).map(([t, icon, label]) => (
          <button key={t} onClick={() => onTabChange(t)}
            className={`flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors border-b-2 whitespace-nowrap
              ${detailTab === t ? 'border-indigo-500 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {detailLoading && detailTab !== 'RESUMEN' && detailTab !== 'FICHA' ? <Spinner /> : (
          <>
            {detailTab === 'RESUMEN' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Estado" value={selectedMed.estadoCatalogo || 'Borrador'} />
                  <Stat label="Stock total" value={Number(selectedMed.stockTotal ?? 0)} />
                  <Stat label="Presentaciones" value={selectedMed.presentacionesActivas ?? presentaciones.length} />
                  <Stat label="Lotes activos" value={selectedMed.lotesActivos ?? lotesDetalle.length} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={onAddPres} className={btnPrimary}>
                    <Plus className="w-3.5 h-3.5" />Agregar presentacion
                  </button>
                  <button onClick={onAddLote} className={btnSecondary}>
                    <Layers className="w-3.5 h-3.5" />Ingresar lote
                  </button>
                  <button onClick={() => onTabChange('FICHA')} className={btnSecondary}>
                    <FileText className="w-3.5 h-3.5" />Completar ficha tecnica
                  </button>
                </div>
              </div>
            )}

            {detailTab === 'LOTES' && (
              <div>
                <button onClick={onAddLote} className={btnPrimary + ' w-full justify-center mb-4'}>
                  <Plus className="w-3.5 h-3.5" />Ingresar lote
                </button>
                <div className="space-y-2">
                  {[...lotesDetalle].sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime()).map(l => (
                    <div key={l.id_lote} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-slate-600 font-semibold">{l.numero_lote}</span>
                        {l.alerta_vencimiento && <Badge cls={alertBadge[l.alerta_vencimiento] || 'bg-slate-100 text-slate-600'}>{l.alerta_vencimiento}</Badge>}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        <span>Vence: <strong className="text-slate-700">{l.fecha_vencimiento_display}</strong></span>
                        <span>Stock: <strong className="text-slate-700">{l.cantidad_actual}</strong></span>
                      </div>
                      {l.precio_compra_unitario && <p className="text-xs text-slate-400 mt-1">Costo: L {Number(l.precio_compra_unitario).toFixed(4)}/u</p>}
                    </div>
                  ))}
                  {lotesDetalle.length === 0 && (
                    <div className="py-10 text-center">
                      <Layers className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">Sin lotes registrados</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailTab === 'PRESENTACIONES' && (
              <div>
                <button onClick={onAddPres} className={btnPrimary + ' w-full justify-center mb-4'}>
                  <Plus className="w-3.5 h-3.5" />Agregar presentacion
                </button>
                <div className="space-y-2">
                  {presentaciones.map(p => (
                    <div key={p.id_presentacion} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{p.nombre}</p>
                          <p className="text-xs text-slate-400 mt-0.5">Factor: {p.factor_conversion}x - L {Number(p.precio_venta ?? 0).toFixed(2)}</p>
                          {p.precio_tercera_edad != null && <p className="text-xs text-slate-400">3a edad: L {Number(p.precio_tercera_edad).toFixed(2)}</p>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => onEditPres(p)} className={`${btnIcon} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50`}><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => onDeletePres(p.id_presentacion)} className={`${btnIcon} text-slate-400 hover:text-red-500 hover:bg-red-50`}><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {p.es_unidad_venta && <Badge cls="bg-indigo-50 text-indigo-600">Venta</Badge>}
                        {p.es_unidad_compra && <Badge cls="bg-purple-50 text-purple-600">Compra</Badge>}
                        {p.permite_fraccion && <Badge cls="bg-teal-50 text-teal-600">Fraccion</Badge>}
                      </div>
                    </div>
                  ))}
                  {presentaciones.length === 0 && (
                    <div className="py-10 text-center">
                      <List className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">Sin presentaciones</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailTab === 'FICHA' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Categoria</FieldLabel>
                    <select className={inp} value={techForm.id_categoria || ''} onChange={e => setFicha({ id_categoria: e.target.value ? Number(e.target.value) : undefined })}>
                      <option value="">Sin definir</option>
                      {categorias.map(c => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Forma</FieldLabel>
                    <select className={inp} value={techForm.id_forma || ''} onChange={e => setFicha({ id_forma: e.target.value ? Number(e.target.value) : undefined })}>
                      <option value="">Sin definir</option>
                      {formas.map(f => <option key={f.id_forma} value={f.id_forma}>{f.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Via</FieldLabel>
                    <select className={inp} value={techForm.via_administracion || 'Oral'} onChange={e => setFicha({ via_administracion: e.target.value })}>
                      {VIAS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Almacenamiento</FieldLabel>
                    <select className={inp} value={techForm.condicion_almacenamiento || 'Temperatura ambiente'} onChange={e => setFicha({ condicion_almacenamiento: e.target.value })}>
                      {ALMACENAMIENTO.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Laboratorio</FieldLabel>
                    <input className={inp} value={techForm.laboratorio || ''} onChange={e => setFicha({ laboratorio: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel>Registro sanitario</FieldLabel>
                    <input className={inp} value={techForm.registro_sanitario || ''} onChange={e => setFicha({ registro_sanitario: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel>Pais</FieldLabel>
                    <input className={inp} value={techForm.pais_origen || 'Honduras'} onChange={e => setFicha({ pais_origen: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel>Codigo de barras</FieldLabel>
                    <input className={inp} value={techForm.codigo_ean13 || ''} onChange={e => setFicha({ codigo_ean13: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Indicaciones</FieldLabel>
                    <textarea className={inp} rows={2} value={techForm.indicaciones || ''} onChange={e => setFicha({ indicaciones: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel>Advertencias</FieldLabel>
                    <textarea className={inp} rows={2} value={techForm.advertencias || ''} onChange={e => setFicha({ advertencias: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel>Contraindicaciones</FieldLabel>
                    <textarea className={inp} rows={2} value={techForm.contraindicaciones || ''} onChange={e => setFicha({ contraindicaciones: e.target.value })} />
                  </div>
                </div>
                <button onClick={saveFicha} disabled={savingFicha} className={btnPrimary + ' w-full justify-center disabled:opacity-60'}>
                  {savingFicha ? 'Guardando...' : 'Guardar ficha tecnica'}
                </button>
              </div>
            )}

            {detailTab === 'IMAGENES' && (
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
                <button onClick={onUploadImage} disabled={uploadingImg} className={btnPrimary + ' w-full justify-center mb-4 disabled:opacity-60'}>
                  {uploadingImg
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Subiendo...</>
                    : <><Image className="w-3.5 h-3.5" />Subir imagen</>}
                </button>
                <button onClick={onAnalyzeImages} disabled={analyzingImages || imagenes.length === 0} className={btnSecondary + ' w-full justify-center mb-4 disabled:opacity-60'}>
                  {analyzingImages
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Analizando...</>
                    : <><Sparkles className="w-3.5 h-3.5 text-indigo-600" />Analizar imagenes con IA</>}
                </button>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {imagenes.map(img => (
                    <button
                      type="button"
                      key={img.id_imagen}
                      onClick={() => setPreviewImage(img.signed_url || img.url_imagen || img.imagen_base64 || null)}
                      className="relative rounded-xl overflow-hidden border border-slate-200 group text-left bg-white"
                    >
                      <img src={img.signed_url || img.url_imagen || img.imagen_base64} className="w-full h-36 object-cover" alt="" />
                      {img.es_principal
                        ? <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full font-bold shadow">Portada</span>
                        : onSetPrincipalImagen && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onSetPrincipalImagen(img.id_imagen); }}
                            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-slate-700/70 hover:bg-indigo-600 text-white text-[10px] rounded-full font-bold opacity-0 group-hover:opacity-100 transition-all"
                          >
                            Portada
                          </button>
                        )
                      }
                      <span
                        onClick={e => { e.stopPropagation(); onDeleteImagen(img.id_imagen); }}
                        className="absolute top-1.5 right-1.5 p-1 bg-red-500 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                  {imagenes.length === 0 && (
                    <div className="col-span-2 py-10 text-center">
                      <Image className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">Sin imagenes</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-6" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-5xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <img src={previewImage} className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl" alt="" />
          </div>
        </div>
      )}
    </div>
  );
}
