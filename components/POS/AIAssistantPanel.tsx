import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Search, ShieldAlert, Sparkles, X } from 'lucide-react';
import { AIService } from '../../services/api';
import { AISymptomAgeRange, AISymptomRecommendationResult } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onViewProduct: (codigo: string) => void;
  idSucursal?: number;
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const labelCls = 'mb-1 block text-xs font-bold uppercase text-slate-500';

function splitList(value: string) {
  return value.split(',').map(v => v.trim()).filter(Boolean).slice(0, 12);
}

function confidenceLabel(value: number) {
  if (value >= 0.75) return 'Alta';
  if (value >= 0.45) return 'Media';
  return 'Baja';
}

function availabilityLabel(value: string) {
  if (value === 'in_current_branch') return 'Disponible aqui';
  if (value === 'other_branch') return 'En otra sucursal';
  return 'Sin stock';
}

export default function AIAssistantPanel({ visible, onClose, onViewProduct, idSucursal }: Props) {
  const [symptomsText, setSymptomsText] = useState('');
  const [ageRange, setAgeRange] = useState<AISymptomAgeRange>('adulto');
  const [pregnant, setPregnant] = useState(false);
  const [allergiesText, setAllergiesText] = useState('');
  const [currentMedsText, setCurrentMedsText] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AISymptomRecommendationResult | null>(null);

  const symptoms = useMemo(() => splitList(symptomsText), [symptomsText]);

  if (!visible) return null;

  const runAnalysis = async () => {
    if (symptoms.length === 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await AIService.recommendBySymptoms({
        symptoms,
        ageRange,
        pregnant,
        allergies: splitList(allergiesText),
        currentMedications: splitList(currentMedsText),
        chronicConditions: splitList(conditionsText),
        id_sucursal: idSucursal,
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'No se pudo consultar la IA.');
    } finally {
      setLoading(false);
    }
  };

  const handleView = (codigo: string) => {
    onViewProduct(codigo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <Bot size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Asistente IA</h2>
              <p className="text-sm text-slate-500">Sugerencias basadas en inventario disponible</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={22} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[380px_1fr]">
          <div className="border-b border-slate-100 bg-slate-50 p-5 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Sintomas principales</label>
                <textarea
                  className={inputCls + ' min-h-[92px] resize-none'}
                  value={symptomsText}
                  onChange={e => setSymptomsText(e.target.value)}
                  placeholder="Ej. gripe, tos, congestion nasal, fiebre leve"
                />
                <p className="mt-1 text-xs text-slate-400">Separe cada sintoma con coma.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Edad aproximada</label>
                  <select className={inputCls} value={ageRange} onChange={e => setAgeRange(e.target.value as AISymptomAgeRange)}>
                    <option value="adulto">Adulto</option>
                    <option value="adulto_mayor">Adulto mayor</option>
                    <option value="nino">Nino</option>
                    <option value="desconocido">Desconocido</option>
                  </select>
                </div>
                <label className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
                  <input type="checkbox" checked={pregnant} onChange={e => setPregnant(e.target.checked)} />
                  Embarazo
                </label>
              </div>

              <div>
                <label className={labelCls}>Alergias conocidas</label>
                <input className={inputCls} value={allergiesText} onChange={e => setAllergiesText(e.target.value)} placeholder="Ej. ibuprofeno, penicilina" />
              </div>

              <div>
                <label className={labelCls}>Medicamentos actuales</label>
                <input className={inputCls} value={currentMedsText} onChange={e => setCurrentMedsText(e.target.value)} placeholder="Ej. losartan, metformina" />
              </div>

              <div>
                <label className={labelCls}>Condiciones conocidas</label>
                <input className={inputCls} value={conditionsText} onChange={e => setConditionsText(e.target.value)} placeholder="Ej. hipertension, diabetes" />
              </div>

              <button
                onClick={runAnalysis}
                disabled={loading || symptoms.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                Consultar inventario con IA
              </button>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                Revise los datos antes de vender. La IA puede equivocarse y no sustituye una consulta medica.
              </div>
            </div>
          </div>

          <div className="min-h-[420px] bg-white p-5">
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}

            {!result && !loading && (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Search size={30} />
                </div>
                <h3 className="text-xl font-black text-slate-800">Consulta segura por sintomas</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  La IA revisara solo productos reales del inventario y marcara receta, controlados, stock y alertas de derivacion.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center text-slate-500">
                <Loader2 className="mb-4 animate-spin text-indigo-600" size={36} />
                <p className="font-bold">Analizando sintomas contra el inventario...</p>
              </div>
            )}

            {result && !loading && (
              <div className="space-y-5">
                <div className={`rounded-2xl border p-4 ${result.requiresMedicalReferral ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-start gap-3">
                    {result.requiresMedicalReferral ? <ShieldAlert className="mt-0.5 text-red-600" /> : <CheckCircle2 className="mt-0.5 text-emerald-600" />}
                    <div>
                      <h3 className={`font-black ${result.requiresMedicalReferral ? 'text-red-800' : 'text-emerald-800'}`}>
                        {result.requiresMedicalReferral ? 'Requiere valoracion medica' : 'Orientacion disponible'}
                      </h3>
                      <p className={`mt-1 text-sm ${result.requiresMedicalReferral ? 'text-red-700' : 'text-emerald-700'}`}>{result.summary}</p>
                      {result.referralReasons.length > 0 && (
                        <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                          {result.referralReasons.map(reason => <li key={reason}>{reason}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-black uppercase text-slate-500">Sugerencias del inventario</h3>
                  {result.recommendations.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">
                      No se encontraron productos recomendables para esta consulta.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {result.recommendations.map(rec => (
                        <div key={rec.codigo} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-black text-slate-900">{rec.nombre}</h4>
                              <p className="mt-1 text-sm leading-relaxed text-slate-600">{rec.reason}</p>
                            </div>
                            <span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-black text-indigo-700">
                              {confidenceLabel(rec.confidence)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-black">
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">{availabilityLabel(rec.availability)}</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">Aqui: {rec.stockCurrentBranch}</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">Total: {rec.stockTotal}</span>
                            {rec.requiresPrescription && <span className="rounded-lg bg-amber-100 px-2 py-1 text-amber-700">Receta</span>}
                            {rec.isControlled && <span className="rounded-lg bg-red-100 px-2 py-1 text-red-700">Controlado</span>}
                          </div>
                          {rec.warnings.length > 0 && (
                            <div className="mt-3 rounded-xl bg-amber-50 p-2 text-xs text-amber-800">
                              <AlertTriangle size={13} className="mr-1 inline" />
                              {rec.warnings.join(' ')}
                            </div>
                          )}
                          <button
                            onClick={() => handleView(rec.codigo)}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-700 transition hover:bg-indigo-100"
                          >
                            <Search size={16} /> Ver en catalogo
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {result.notRecommended.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-black uppercase text-slate-500">No recomendado o requiere cuidado</h3>
                    <div className="space-y-2">
                      {result.notRecommended.map(item => (
                        <div key={item.codigo} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          <span className="font-black text-slate-800">{item.nombre || item.codigo}:</span> {item.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">{result.safetyMessage}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
