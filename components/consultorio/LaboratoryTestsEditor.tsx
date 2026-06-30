import React, { useCallback } from 'react';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { ConsultorioService } from '../../services/api';
import type { ConsultorioTipo } from '../../types';
import { AttachmentUploader, type ClinicalAttachment } from './ClinicalAttachments';
import { ProfessionalSelect, type ProfessionalValue } from './ProfessionalSelect';
import { SearchableOption, SearchableSelect } from './SearchableSelect';

export type LabTestItem = {
  id: string;
  profesional?: ProfessionalValue;
  pruebaId?: string | number;
  prueba?: string;
  categoria?: string;
  cantidad?: number;
  resultadoCategoria?: string;
};

type LaboratoryTestsEditorProps = {
  value?: LabTestItem[];
  onChange: (value: LabTestItem[]) => void;
  patientId: number;
  tipo: ConsultorioTipo;
  attachments: ClinicalAttachment[];
  onAttachmentsChange: (items: ClinicalAttachment[]) => void;
};

export function LaboratoryTestsEditor({ value = [], onChange, patientId, tipo, attachments, onAttachmentsChange }: LaboratoryTestsEditorProps) {
  const rows = value.length ? value : [newLabTestRow()];

  const updateRow = (id: string, patch: Partial<LabTestItem>) => {
    onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const addRow = () => onChange([...rows, newLabTestRow()]);

  const removeRow = (id: string) => {
    const row = rows.find(item => item.id === id);
    const nextRows = rows.length === 1 ? [newLabTestRow()] : rows.filter(item => item.id !== id);
    const nextAttachments = row?.resultadoCategoria
      ? attachments.filter(att => att.categoria !== row.resultadoCategoria)
      : attachments;
    onChange(nextRows);
    onAttachmentsChange(nextAttachments);
  };

  const searchTests = useCallback(async (term: string): Promise<SearchableOption<any>[]> => {
    const tests = await ConsultorioService.getLaboratorioPruebas({ q: term, limit: 40 });
    return tests.map((test: any) => ({
      id: test.id,
      label: test.nombre,
      description: [test.categoria, test.descripcion].filter(Boolean).join(' - '),
      raw: test,
    }));
  }, []);

  const createTest = async (rowId: string) => {
    const result = await Swal.fire({
      title: 'Registrar prueba de laboratorio',
      html: `
        <div style="display:grid;gap:12px;text-align:left">
          <label style="font-size:13px;color:#475569">Categoria/Agrupacion</label>
          <input id="lab-test-category" class="swal2-input" style="margin:0;width:100%" placeholder="Hematologia, bioquimica, perfil...">
          <label style="font-size:13px;color:#475569">Nombre de la prueba</label>
          <input id="lab-test-name" class="swal2-input" style="margin:0;width:100%" placeholder="Hemograma completo">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const popup = Swal.getPopup();
        const nombre = (popup?.querySelector('#lab-test-name') as HTMLInputElement)?.value.trim();
        const categoria = (popup?.querySelector('#lab-test-category') as HTMLInputElement)?.value.trim();
        if (!nombre) {
          Swal.showValidationMessage('Ingrese el nombre de la prueba');
          return false;
        }
        return { nombre, categoria };
      },
    });
    if (!result.value) return;
    const created = await ConsultorioService.createLaboratorioPrueba(result.value);
    updateRow(rowId, { pruebaId: created.id, prueba: created.nombre, categoria: created.categoria });
  };

  return (
    <div className="md:col-span-2 rounded-2xl border border-teal-200 bg-teal-50/20 p-3">
      <div className="mb-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
          <FlaskConical size={17} />
          <span>Pruebas de laboratorio</span>
        </div>
      </div>
      <div className="space-y-4">
        {rows.map(row => (
          <article key={row.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                <FlaskConical size={17} />
                <span>Prueba de laboratorio</span>
              </div>
              <button type="button" onClick={() => removeRow(row.id)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600">
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1.3fr_90px_190px]">
              <FieldShell label="Profesional">
                <ProfessionalSelect value={row.profesional} onChange={profesional => updateRow(row.id, { profesional })} />
              </FieldShell>
              <FieldShell label="Prueba/Examen" action={<button type="button" onClick={() => createTest(row.id)} className="text-xs font-medium text-indigo-600">+ Registrar nuevo</button>}>
                <SearchableSelect
                  value={row.prueba ? { id: row.pruebaId || row.prueba, label: row.prueba } : null}
                  placeholder="Selecciona un examen"
                  emptyText="No hay pruebas registradas"
                  onSearch={searchTests}
                  onCreate={() => createTest(row.id)}
                  createLabel="Registrar nuevo"
                  onChange={option => updateRow(row.id, { pruebaId: option.id, prueba: option.label, categoria: option.raw?.categoria })}
                />
              </FieldShell>
              <FieldShell label="Cantidad">
                <input
                  type="number"
                  min="1"
                  value={row.cantidad || 1}
                  onChange={event => updateRow(row.id, { cantidad: Number(event.target.value || 1) })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                />
              </FieldShell>
              <FieldShell label="Resultado">
                <AttachmentUploader
                  label="Resultado"
                  compact
                  buttonLabel="Seleccionar"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  patientId={patientId}
                  tipo={tipo}
                  categoria={row.resultadoCategoria || `laboratorio_resultado_${row.id}`}
                  attachments={attachments}
                  onChange={onAttachmentsChange}
                />
              </FieldShell>
            </div>
          </article>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
        <Plus size={17} /> Agregar prueba de laboratorio
      </button>
    </div>
  );
}

function newLabTestRow(): LabTestItem {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, cantidad: 1, resultadoCategoria: `laboratorio_resultado_${id}` };
}

function FieldShell({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-normal text-indigo-900/70">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span>{label}</span>
        {action}
      </span>
      {children}
    </label>
  );
}
