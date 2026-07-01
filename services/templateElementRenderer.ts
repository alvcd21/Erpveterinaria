import { LabelElement, SummaryRow, DetalleVenta } from '../types';
import { PrintDataContext, resolveContent, adaptDocumentText, escapeHtml, formatValue, safeEvaluateCondition, buildReceiptItemLines } from './templateRendererUtils';
import { MediaCache } from './templateRendererMedia';
import { getLogoSync } from './logoLoader';

export function elementToHTML(
  el: LabelElement,
  scale: number,
  ctx: PrintDataContext,
  media: MediaCache,
  tableItems?: Partial<DetalleVenta>[],
  yOffsetUnits: number = 0,
  heightOverrideUnits?: number,
): string {
  if (el.visibilityCondition) {
    const expr = resolveContent(el.visibilityCondition, ctx);
    if (!safeEvaluateCondition(expr)) return '';
  }

  const left = el.x * scale;
  const top  = (el.y + yOffsetUnits) * scale;
  const w    = el.width * scale;
  const h    = (heightOverrideUnits ?? el.height) * scale;
  const baseTop = el.y * scale;
  const baseHeight = el.height * scale;
  const rot  = el.rotation ? `rotate(${el.rotation}deg)` : '';
  const opa  = el.opacity ?? 1;
  const shadow = el.shadowEnabled
    ? `filter:drop-shadow(${el.shadowOffsetX ?? 2}px ${el.shadowOffsetY ?? 2}px ${el.shadowBlur ?? 4}px ${el.shadowColor ?? 'rgba(0,0,0,0.3)'});`
    : '';
  const growFlag = (
    el.type === 'INVOICE_TABLE' ||
    el.type === 'SUMMARY_BOX' ||
    el.type === 'RECEIPT_ITEMS'
  )
    ? el.canGrow !== false
    : Boolean(el.canGrow || el.isStretchWithOverflow);
  const base = `position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;` +
    `--ld-base-top:${baseTop}px;--ld-base-height:${baseHeight}px;--ld-can-grow:${growFlag ? 1 : 0};` +
    `transform:${rot};opacity:${opa};overflow:hidden;box-sizing:border-box;${shadow}`;

  if (el.type === 'TEXT') {
    const resolved = adaptDocumentText(resolveContent(el.content || '', ctx), ctx);
    const justifyMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
    const alignItems = (el.isMultiline || el.canGrow || el.isStretchWithOverflow) ? 'flex-start' : 'center';
    const inner = `font-size:${el.fontSize || 10}pt;font-family:${el.fontFamily || 'Arial,sans-serif'};` +
      `font-weight:${el.fontWeight || 'normal'};font-style:${el.italic ? 'italic' : 'normal'};` +
      `text-decoration:${el.underline ? 'underline' : 'none'};color:${el.color || '#000'};` +
      `text-align:${el.textAlign || 'left'};white-space:${el.isMultiline ? 'pre-wrap' : 'nowrap'};` +
      `line-height:${el.lineHeight || 1.2};letter-spacing:${el.letterSpacing ? el.letterSpacing + 'px' : 'normal'};` +
      `background-color:${el.backgroundColor || 'transparent'};` +
      `width:100%;min-height:100%;display:flex;align-items:${alignItems};padding:2px 2px;` +
      `justify-content:${justifyMap[el.textAlign || 'left'] || 'flex-start'};`;
    return `<div style="${base}overflow:visible;"><div style="${inner}">${escapeHtml(resolved)}</div></div>`;
  }

  if (el.type === 'SHAPE') {
    if (el.shapeType === 'LINE') {
      const lineH = el.strokeWidth || 1;
      return `<div style="${base}display:flex;align-items:center;">` +
        `<div style="width:100%;height:${lineH}px;background-color:${el.stroke || '#000'};"></div></div>`;
    }
    const clipPaths: Record<string, string> = {
      TRIANGLE_TL: 'polygon(0 0, 100% 0, 0 100%)',
      TRIANGLE_TR: 'polygon(0 0, 100% 0, 100% 100%)',
      TRIANGLE_BL: 'polygon(0 0, 0 100%, 100% 100%)',
      TRIANGLE_BR: 'polygon(100% 0, 100% 100%, 0 100%)',
      RHOMBUS: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
    };
    const clip = clipPaths[el.shapeType || ''];
    const radius = el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0');
    const bg = el.gradientEnabled && el.gradientColor1 && el.gradientColor2
      ? (el.gradientType === 'radial'
          ? `radial-gradient(circle, ${el.gradientColor1}, ${el.gradientColor2})`
          : `linear-gradient(${el.gradientAngle ?? 135}deg, ${el.gradientColor1}, ${el.gradientColor2})`)
      : (el.fill === 'transparent' ? 'transparent' : (el.fill || 'transparent'));
    const inner = `width:100%;height:100%;background:${bg};` +
      (clip
        ? `clip-path:${clip};`
        : `border:${el.strokeWidth || 1}px solid ${el.stroke || '#000'};border-radius:${radius};`) +
      `box-sizing:border-box;`;
    return `<div style="${base}"><div style="${inner}"></div></div>`;
  }

  if (el.type === 'IMAGE') {
    const imgSrc = /\{\{/.test(el.content || '') ? resolveContent(el.content || '', ctx) : (el.content || '');
    if (!imgSrc || /\{\{/.test(imgSrc)) return '';
    const safeSrc = /^(data:|\/|\.\/|\.\.\/)/i.test(imgSrc) ? imgSrc : '';
    if (!safeSrc) return '';
    return `<div style="${base}"><img src="${escapeHtml(safeSrc)}" style="width:100%;height:100%;object-fit:${el.imageObjectFit || 'contain'};" /></div>`;
  }

  if (el.type === 'COMPANY_HEADER') {
    const emp  = ctx.empresa || {};
    const fs   = el.fontSize || 9;
    const font = el.fontFamily || 'Arial,sans-serif';

    if (el.companyStyle === 'GEOMETRIC') {
      const logoSrc  = emp.logoBase64 || getLogoSync();
      const logoHtml = logoSrc
        ? `<img src="${logoSrc}" style="height:72%;max-height:56px;max-width:56px;object-fit:contain;margin-right:12px;flex-shrink:0;" />`
        : '';
      const companyInfo =
        `<div style="font-weight:bold;font-size:${fs + 4}pt;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.5px;">${escapeHtml(emp.nombreEmpresa || 'EMPRESA')}</div>` +
        (el.companyShowRTN !== false && emp.rtn ? `<div style="font-size:${fs}pt;color:rgba(255,255,255,0.88);">RTN: ${escapeHtml(String(emp.rtn))}</div>` : '') +
        (emp.direccion ? `<div style="font-size:${fs}pt;color:rgba(255,255,255,0.88);">${escapeHtml(String(emp.direccion))}</div>` : '') +
        (el.companyShowPhone !== false && emp.telefono ? `<div style="font-size:${fs}pt;color:rgba(255,255,255,0.88);">Tel: ${escapeHtml(String(emp.telefono))}${el.companyShowEmail && emp.correo ? ' | ' + escapeHtml(String(emp.correo)) : ''}</div>` : '');
      const docTitle = el.companyDocTitle
        ? adaptDocumentText(resolveContent(el.companyDocTitle, ctx), ctx)
        : '';
      const titleHtml = docTitle
        ? `<div style="text-align:right;color:#fff;flex-shrink:0;padding-left:10px;line-height:1;">` +
          `<div style="font-size:${fs + 12}pt;font-weight:900;letter-spacing:3px;">${docTitle}</div></div>`
        : '';
      return `<div style="${base}overflow:hidden;background:#1e3a8a;font-family:${font};">` +
        `<div style="position:absolute;inset:0;background:#3b82f6;clip-path:polygon(0 0, 48% 0, 0 100%);"></div>` +
        `<div style="position:absolute;inset:0;display:flex;align-items:center;padding:8px 16px;box-sizing:border-box;">` +
          logoHtml +
          `<div style="flex:1;min-width:0;">${companyInfo}</div>` +
          titleHtml +
        `</div></div>`;
    }

    const align = el.companyAlign || 'center';
    const col   = el.color || '#000000';
    const inner =
      `<div style="font-weight:bold;font-size:${fs + 2}pt;color:${col};">${escapeHtml(emp.nombreEmpresa || '')}</div>` +
      (el.companyShowRTN !== false && emp.rtn ? `<div style="font-size:${fs}pt;color:${col};">RTN: ${escapeHtml(String(emp.rtn))}</div>` : '') +
      (emp.direccion ? `<div style="font-size:${fs}pt;color:${col};">${escapeHtml(String(emp.direccion))}</div>` : '') +
      (el.companyShowPhone !== false && emp.telefono ? `<div style="font-size:${fs}pt;color:${col};">Tel: ${escapeHtml(String(emp.telefono))}</div>` : '') +
      (el.companyShowEmail && emp.correo ? `<div style="font-size:${fs}pt;color:${col};">${escapeHtml(String(emp.correo))}</div>` : '');
    return `<div style="${base}text-align:${align};line-height:1.5;padding:2px;font-family:${font};">${inner}</div>`;
  }

  if (el.type === 'SUMMARY_BOX') {
    const rows  = el.summaryRows || [];
    const fSize = el.summaryFontSize || 9;
    const lCol  = el.summaryLabelColor || '#000';
    const vCol  = el.summaryValueColor || '#000';
    const bgCol = el.summaryBg || 'transparent';
    const font  = el.fontFamily || 'Arial,sans-serif';
    const rowPad = Math.max(4, Math.round(fSize * 0.45));
    const rowsHTML = rows.map((row: SummaryRow) => {
      const sepLine = row.separator ? `<div style="border-top:1px solid #cbd5e1;margin:4px 0;"></div>` : '';
      const resolved = resolveContent(row.field, ctx);
      const formatted = formatValue(resolved, row.format);
      return sepLine +
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:${rowPad}px 4px;font-weight:${row.bold ? 'bold' : 'normal'};font-size:${fSize}pt;font-family:${font};line-height:1.3;">` +
        `<span style="color:${lCol};">${escapeHtml(row.label)}</span>` +
        `<span style="color:${vCol};">${escapeHtml(formatted)}</span>` +
        `</div>`;
    }).join('');
    return `<div style="${base}background-color:${bgCol};">${rowsHTML}</div>`;
  }

  if (el.type === 'BARCODE') {
    const src = media.get(el.id) || '';
    return `<div style="${base}display:flex;align-items:center;justify-content:center;">` +
      (src ? `<img src="${src}" style="width:100%;height:100%;object-fit:fill;" />` :
        `<span style="font-family:monospace;font-size:8pt;color:#555;">[BARCODE]</span>`) +
      `</div>`;
  }

  if (el.type === 'QR') {
    const src = media.get(el.id) || '';
    return `<div style="${base}display:flex;align-items:center;justify-content:center;">` +
      (src ? `<img src="${src}" style="width:100%;height:100%;object-fit:contain;" />` :
        `<span style="font-size:7pt;color:#555;">[QR]</span>`) +
      `</div>`;
  }

  if (el.type === 'INVOICE_TABLE') {
    const cols  = el.tableColumns || [];
    const hBg   = el.tableHeaderBg || '#1e293b';
    const hCol  = el.tableHeaderColor || '#ffffff';
    const fSize = el.tableFontSize || 8;
    const altBg = el.tableAlternateBg || '#f8fafc';
    const font  = el.fontFamily || 'Arial,sans-serif';
    const lineHeight = 1.4;
    const cellPad = Math.max(5, Math.round(fSize * 0.55));

    const thCells = cols.map(col =>
      `<th style="width:${col.widthPct}%;text-align:${col.align};padding:${cellPad}px 6px;font-size:${fSize}px;line-height:${lineHeight};font-family:${font};font-weight:bold;overflow:hidden;white-space:normal;overflow-wrap:anywhere;border-right:1px solid rgba(255,255,255,0.2);vertical-align:middle;">${escapeHtml(col.header)}</th>`
    ).join('');

    const rows = tableItems && tableItems.length > 0
      ? tableItems.map((item: any, ri) => {
          const bg = el.tableAlternateRows && ri % 2 === 1 ? altBg : '#fff';
          const tdCells = cols.map(col => {
            const fieldMatch = col.field.match(/\{\{item\.([^}]+)\}\}/);
            const rawVal    = fieldMatch ? String(item[fieldMatch[1]] ?? '') : resolveContent(col.field, ctx);
            const formatted = formatValue(rawVal, col.format);
            const whiteSpace = col.format === 'TEXT' ? 'normal' : 'nowrap';
            const wrap = col.format === 'TEXT' ? 'overflow-wrap:anywhere;word-break:break-word;' : '';
            return `<td style="width:${col.widthPct}%;text-align:${col.align};padding:${cellPad}px 6px;font-size:${fSize}px;line-height:${lineHeight};font-family:${font};overflow:hidden;white-space:${whiteSpace};${wrap}vertical-align:top;">${escapeHtml(formatted)}</td>`;
          }).join('');
          return `<tr style="background-color:${bg};border-top:1px solid #e2e8f0;">${tdCells}</tr>`;
        }).join('')
      : [0, 1, 2].map((ri) => {
          const bg = el.tableAlternateRows && ri % 2 === 1 ? altBg : '#fff';
          const tdCells = cols.map(col =>
            `<td style="width:${col.widthPct}%;text-align:${col.align};padding:${cellPad}px 6px;font-size:${fSize}px;line-height:${lineHeight};font-family:${font};color:#94a3b8;white-space:nowrap;overflow:hidden;">` +
            `${col.format === 'CURRENCY' ? 'L. 0.00' : col.format === 'NUMBER' ? '0' : '···'}</td>`
          ).join('');
          return `<tr style="background-color:${bg};border-top:1px solid #e2e8f0;">${tdCells}</tr>`;
        }).join('');

    const tableStr = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;">` +
      `<thead><tr style="background-color:${hBg};color:${hCol};">${thCells}</tr></thead>` +
      `<tbody>${rows}</tbody></table>`;
    return `<div style="${base.replace('overflow:hidden;', '')}overflow:visible;">${tableStr}</div>`;
  }

  if (el.type === 'RECEIPT_ITEMS') {
    const fSize = el.fontSize || el.tableFontSize || 7;
    const lines = buildReceiptItemLines(el, tableItems);

    return `<div style="${base.replace('overflow:hidden;', '')}overflow:visible;background-color:${el.backgroundColor || 'transparent'};">` +
      `<pre style="margin:0;font-size:${fSize}pt;font-family:${el.fontFamily || "'Courier New',monospace"};font-weight:${el.fontWeight || 'normal'};font-style:${el.italic ? 'italic' : 'normal'};text-decoration:${el.underline ? 'underline' : 'none'};text-align:${el.textAlign || 'left'};letter-spacing:${el.letterSpacing ? el.letterSpacing + 'px' : 'normal'};line-height:${el.lineHeight || 1.25};white-space:pre-wrap;color:${el.color || '#000'};">${escapeHtml(lines.join('\n'))}</pre>` +
      `</div>`;
  }

  return '';
}
