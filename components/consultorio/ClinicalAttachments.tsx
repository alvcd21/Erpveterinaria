import React, { useMemo, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import Swal from 'sweetalert2';
import { ConsultorioService } from '../../services/api';
import type { ConsultorioTipo } from '../../types';

const CLINICAL_MAX_FILE_BYTES = 8 * 1024 * 1024;
const CLINICAL_ACCEPTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/dicom',
  'application/octet-stream',
]);
const CLINICAL_ACCEPTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'dcm']);

export type ClinicalAttachment = {
  id?: string;
  nombre: string;
  mime: string;
  size?: number;
  categoria?: string;
  tipo_registro?: string;
  r2_key?: string;
  url?: string;
  signed_url?: string;
  data_url?: string;
  uploaded_at?: string;
};

type AttachmentUploaderProps = {
  label: string;
  helper?: string;
  accept?: string;
  patientId: number;
  tipo: ConsultorioTipo;
  categoria?: string;
  attachments: ClinicalAttachment[];
  onChange: (items: ClinicalAttachment[]) => void;
};

export function AttachmentUploader({ label, helper, accept, patientId, tipo, categoria = 'adjunto', attachments, onChange }: AttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const inputId = useMemo(() => `clinical-file-${tipo}-${categoria}-${Math.random().toString(16).slice(2)}`, [tipo, categoria]);
  const visibleAttachments = attachments.filter(att => (att.categoria || 'adjunto') === categoria);

  const handleFiles = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setUploading(true);
    try {
      const uploaded: ClinicalAttachment[] = [];
      for (const file of selected) {
        if (!isAcceptedFile(file)) {
          throw new Error(`El archivo "${file.name}" no tiene un formato permitido.`);
        }
        if (file.size > CLINICAL_MAX_FILE_BYTES) {
          throw new Error(`El archivo "${file.name}" supera el limite de ${formatBytes(CLINICAL_MAX_FILE_BYTES)}.`);
        }
        const base64 = await fileToDataUrl(file);
        const saved = await ConsultorioService.uploadAdjunto(patientId, {
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          base64,
          tipo,
          categoria,
        });
        uploaded.push(saved);
      }
      onChange([...attachments, ...uploaded]);
    } catch (err: any) {
      Swal.fire('No se pudo subir el adjunto', err.message || 'Revise el archivo e intente de nuevo.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (attachment: ClinicalAttachment) => {
    onChange(attachments.filter(att => attachmentKey(att) !== attachmentKey(attachment)));
  };

  return (
    <section className="rounded-2xl border border-teal-100 bg-teal-50/30 p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-900/70">{label}</p>
          {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
        </div>
        <div>
          <input
            id={inputId}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={e => {
              handleFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <label
            htmlFor={inputId}
            className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            <Upload size={16} />
            {uploading ? 'Subiendo...' : 'Agregar'}
          </label>
        </div>
      </div>
      {visibleAttachments.length > 0 ? (
        <AttachmentList attachments={visibleAttachments} onRemove={removeAttachment} />
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-teal-200 bg-white/70 px-4 py-5 text-sm text-slate-500">
          No hay adjuntos cargados para este registro.
        </div>
      )}
    </section>
  );
}

export function AttachmentList({ attachments, onRemove, compact = false }: { attachments: ClinicalAttachment[]; onRemove?: (item: ClinicalAttachment) => void; compact?: boolean }) {
  if (!attachments.length) return null;
  return (
    <div className={compact ? 'mt-3 flex flex-wrap gap-2' : 'mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3'}>
      {attachments.map((att) => {
        const url = attachmentUrl(att);
        const isImage = String(att.mime || '').startsWith('image/');
        return (
          <div key={attachmentKey(att)} className={compact ? 'flex min-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs' : 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3'}>
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100 grid place-items-center text-slate-500">
              {isImage && url ? <img src={url} alt={att.nombre} className="h-full w-full object-cover" /> : isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{att.nombre || 'Adjunto clinico'}</p>
              <p className="truncate text-[11px] text-slate-400">{formatBytes(att.size)} {att.mime ? `- ${att.mime}` : ''}</p>
            </div>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="Abrir adjunto">
                <ExternalLink size={16} />
              </a>
            ) : (
              <Paperclip size={16} className="text-slate-400" />
            )}
            {onRemove && (
              <button type="button" onClick={() => onRemove(att)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Quitar adjunto">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function isAcceptedFile(file: File) {
  const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  if (file.type && file.type !== 'application/octet-stream') return CLINICAL_ACCEPTED_MIMES.has(file.type);
  return CLINICAL_ACCEPTED_EXTENSIONS.has(ext);
}

function attachmentUrl(att: ClinicalAttachment) {
  return att.signed_url || att.url || att.data_url || '';
}

function attachmentKey(att: ClinicalAttachment) {
  return att.id || att.r2_key || att.url || `${att.nombre}-${att.size || 0}-${att.uploaded_at || ''}`;
}

function formatBytes(value?: number) {
  const bytes = Number(value || 0);
  if (!bytes) return 'Tamano no registrado';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
