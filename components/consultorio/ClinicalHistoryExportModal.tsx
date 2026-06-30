import React, { useState } from 'react';
import { FileDown, Printer, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { ConsultorioService } from '../../services/api';
import type { ConsultorioEvento, Paciente } from '../../types';

type ClinicalHistoryExportModalProps = {
  patient: Paciente & Record<string, any>;
  onClose: () => void;
};

export function ClinicalHistoryExportModal({ patient, onClose }: ClinicalHistoryExportModalProps) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(false);

  const loadEvents = async () => {
    const events = await ConsultorioService.getTimeline(patient.id_paciente, { tipo: 'historia', limit: 120, offset: 0 });
    const start = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const end = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null;
    return events.filter(event => {
      const ts = new Date(event.fecha_evento).getTime();
      return (!start || ts >= start) && (!end || ts <= end);
    });
  };

  const exportPdf = async () => {
    setLoading(true);
    try {
      const events = await loadEvents();
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      writePdf(doc, patient, events, { desde, hasta });
      doc.save(`historia-clinica-${safeName(patient.nombre)}.pdf`);
    } catch (error: any) {
      Swal.fire('No se pudo exportar', error.message || 'Intente de nuevo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const printHistory = async () => {
    setLoading(true);
    try {
      const events = await loadEvents();
      const printWindow = window.open('', '_blank', 'width=1024,height=720');
      if (!printWindow) throw new Error('El navegador bloqueo la ventana de impresion.');
      printWindow.document.write(buildPrintHtml(patient, events, { desde, hasta }));
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 350);
    } catch (error: any) {
      Swal.fire('No se pudo imprimir', error.message || 'Intente de nuevo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{patient.nombre} <span className="text-sm font-normal text-slate-400">Exportar historia clinica</span></h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </header>
        <div className="space-y-5 px-6 py-5">
          <label className="block text-sm font-normal text-indigo-900/70">
            Formato
            <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200">
              <option>Descarga directa PDF / impresion</option>
            </select>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-normal text-indigo-900/70">
              Registros desde
              <input type="date" value={desde} onChange={event => setDesde(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" />
              <span className="mt-1 block text-xs text-slate-400">Opcional</span>
            </label>
            <label className="block text-sm font-normal text-indigo-900/70">
              Registros hasta
              <input type="date" value={hasta} onChange={event => setHasta(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" />
              <span className="mt-1 block text-xs text-slate-400">Opcional</span>
            </label>
          </div>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">Cancelar</button>
          <button type="button" disabled={loading} onClick={printHistory} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
            <Printer size={16} /> Imprimir
          </button>
          <button type="button" disabled={loading} onClick={exportPdf} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-60">
            <FileDown size={16} /> {loading ? 'Generando...' : 'Generar'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function writePdf(doc: any, patient: any, events: ConsultorioEvento[], range: { desde?: string; hasta?: string }) {
  let y = 54;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Historia clinica veterinaria', 54, y);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  y += 24;
  doc.text(`Paciente: ${patient.nombre || 'No registrado'}   Especie: ${patient.especie || 'N/D'}   Raza: ${patient.raza || 'N/D'}`, 54, y);
  y += 17;
  doc.text(`Tutor: ${patient.tutorNombre || 'N/D'}   Telefono: ${patient.tutorTelefono || 'N/D'}   Correo: ${patient.tutorCorreo || 'N/D'}`, 54, y);
  y += 17;
  doc.text(`Rango: ${range.desde || 'inicio'} al ${range.hasta || 'actualidad'}`, 54, y);
  y += 28;
  if (!events.length) {
    doc.text('No hay registros clinicos en el rango seleccionado.', 54, y);
    return;
  }
  events.forEach((event) => {
    if (y > 700) {
      doc.addPage();
      y = 54;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${formatDate(event.fecha_evento)} - ${event.titulo || event.tipoLabel || event.tipo}`, 54, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const text = [event.resumen, event.detalle, payloadText(event.payload)].filter(Boolean).join('\n');
    const lines = doc.splitTextToSize(text || 'Sin detalle registrado.', 500);
    doc.text(lines.slice(0, 12), 54, y);
    y += Math.min(lines.length, 12) * 12 + 16;
  });
}

function buildPrintHtml(patient: any, events: ConsultorioEvento[], range: { desde?: string; hasta?: string }) {
  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>Historia clinica ${escapeHtml(patient.nombre)}</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;color:#1f2937;margin:36px}
    h1{font-size:24px;margin:0 0 8px} h2{font-size:15px;margin:24px 0 8px}
    .muted{color:#64748b;font-size:12px}.card{border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:12px 0}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.label{font-weight:600;color:#334155}
    pre{white-space:pre-wrap;font-family:inherit;margin:8px 0 0;color:#475569}
  </style></head><body>
    <h1>Historia clinica veterinaria</h1>
    <p class="muted">Rango: ${escapeHtml(range.desde || 'inicio')} al ${escapeHtml(range.hasta || 'actualidad')}</p>
    <section class="card grid">
      <div><span class="label">Paciente:</span> ${escapeHtml(patient.nombre)}</div>
      <div><span class="label">Especie:</span> ${escapeHtml(patient.especie || 'N/D')}</div>
      <div><span class="label">Raza:</span> ${escapeHtml(patient.raza || 'N/D')}</div>
      <div><span class="label">Tutor:</span> ${escapeHtml(patient.tutorNombre || 'N/D')}</div>
      <div><span class="label">Telefono:</span> ${escapeHtml(patient.tutorTelefono || 'N/D')}</div>
      <div><span class="label">Correo:</span> ${escapeHtml(patient.tutorCorreo || 'N/D')}</div>
    </section>
    <h2>Registros clinicos</h2>
    ${events.length ? events.map(event => `<article class="card">
      <div class="label">${escapeHtml(formatDate(event.fecha_evento))} - ${escapeHtml(event.titulo || event.tipoLabel || event.tipo)}</div>
      <pre>${escapeHtml([event.resumen, event.detalle, payloadText(event.payload)].filter(Boolean).join('\n') || 'Sin detalle registrado.')}</pre>
    </article>`).join('') : '<p class="muted">No hay registros clinicos en el rango seleccionado.</p>'}
  </body></html>`;
}

function payloadText(payload?: Record<string, any>) {
  if (!payload) return '';
  return Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${displayValue(value)}`)
    .join('\n');
}

function displayValue(value: any): string {
  if (Array.isArray(value)) return value.map(displayValue).join('; ');
  if (typeof value === 'object') return value.nombre || value.prueba || JSON.stringify(value);
  return String(value);
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha';
}

function escapeHtml(value: any) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
}

function safeName(value?: string) {
  return String(value || 'paciente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
}
