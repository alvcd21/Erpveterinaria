import { LabelElement, DetalleVenta } from '../types';
import { buildReceiptItemLines, formatValue, resolveContent, PrintDataContext } from './templateRendererUtils';

export interface GrowthInfo {
  overflowUnits: number;
  actualHeightUnits: number;
}

function estimateInvoiceTableHeightPx(
  el: LabelElement,
  items: Partial<DetalleVenta>[] | undefined,
  scale: number,
  ctx: PrintDataContext,
): number {
  const cols = el.tableColumns || [];
  const fSize = el.tableFontSize || 8;
  const lineHeight = Math.ceil(fSize * 1.4);
  const cellPad = Math.max(5, Math.round(fSize * 0.55)) * 2;
  const headerPx = lineHeight + cellPad;
  const baseRowPx = Math.max(el.tableRowHeight ? el.tableRowHeight * scale : 0, lineHeight + cellPad);

  if (!items || items.length === 0 || cols.length === 0) {
    return headerPx + baseRowPx * 3;
  }

  const tableWidthPx = el.width * scale;
  const rowsPx = items.reduce((sum, item: any) => {
    const maxLines = cols.reduce((max, col) => {
      if (col.format !== 'TEXT') return max;
      const fieldMatch = col.field.match(/\{\{item\.([^}]+)\}\}/);
      const rawVal = fieldMatch ? String(item[fieldMatch[1]] ?? '') : resolveContent(col.field, ctx);
      const formatted = formatValue(rawVal, col.format);
      const colWidthPx = Math.max(12, tableWidthPx * (Number(col.widthPct || 0) / 100) - 8);
      const avgCharPx = Math.max(4, fSize * 0.52);
      const estimatedLines = Math.max(1, Math.ceil((formatted.length * avgCharPx) / colWidthPx));
      return Math.max(max, Math.min(estimatedLines, 4));
    }, 1);
    return sum + Math.max(baseRowPx, lineHeight * maxLines + cellPad);
  }, 0);

  return headerPx + rowsPx;
}

export function computeInvoiceTableGrowth(
  el: LabelElement,
  itemsOrCount: Partial<DetalleVenta>[] | number | undefined,
  scale: number,
  ctx: PrintDataContext = {},
): GrowthInfo | null {
  const items = Array.isArray(itemsOrCount) ? itemsOrCount : undefined;
  const numRows = typeof itemsOrCount === 'number' ? itemsOrCount : (items?.length || 0);
  const fSize    = el.tableFontSize || 8;
  const rowHPx   = Math.max(el.tableRowHeight ? el.tableRowHeight * scale : 0, Math.ceil(fSize * 1.4) + Math.max(5, Math.round(fSize * 0.55)) * 2);
  const actualPx = items
    ? estimateInvoiceTableHeightPx(el, items, scale, ctx)
    : rowHPx * (numRows + 1);
  const designedPx = el.height * scale;
  const overflowPx = Math.max(0, actualPx - designedPx);
  if (overflowPx === 0) return null;
  return {
    overflowUnits:     overflowPx / scale,
    actualHeightUnits: el.height + overflowPx / scale,
  };
}

export function computeReceiptItemsGrowth(
  el: LabelElement,
  items: Partial<DetalleVenta>[] | undefined,
  scale: number,
): GrowthInfo | null {
  const lines = buildReceiptItemLines(el, items);
  const fSize = el.fontSize || el.tableFontSize || 7;
  const lineHeightPx = fSize * (el.lineHeight || 1.25) * (96 / 72);
  const actualPx = (lines.length * lineHeightPx) + 8;
  const designedPx = el.height * scale;
  const overflowPx = Math.max(0, actualPx - designedPx);
  if (overflowPx === 0) return null;
  return {
    overflowUnits: overflowPx / scale,
    actualHeightUnits: el.height + overflowPx / scale,
  };
}

export function computeTextGrowth(
  el: LabelElement,
  scale: number,
  ctx: PrintDataContext = {},
): GrowthInfo | null {
  const resolved = resolveContent(el.content || '', ctx);
  const fSize = el.fontSize || 10;
  const lineHeight = el.lineHeight || 1.2;
  const explicitLines = resolved.split('\n');
  const widthPx = Math.max(12, el.width * scale - 4);
  const avgCharPx = Math.max(3.5, fSize * 0.52);
  const visualLines = explicitLines.reduce((sum, line) => {
    if (!line) return sum + 1;
    return sum + Math.max(1, Math.ceil((line.length * avgCharPx) / widthPx));
  }, 0);
  const actualPx = visualLines * fSize * lineHeight * 1.333 + 6;
  const designedPx = el.height * scale;
  const overflowPx = Math.max(0, actualPx - designedPx);
  if (overflowPx === 0) return null;
  return {
    overflowUnits: overflowPx / scale,
    actualHeightUnits: el.height + overflowPx / scale,
  };
}

export function computeSummaryBoxGrowth(el: LabelElement, scale: number): GrowthInfo | null {
  const numRows  = (el.summaryRows || []).length;
  const numSeparators = (el.summaryRows || []).filter(r => r.separator).length;
  const fSize    = el.summaryFontSize || 9;
  const rowPad   = Math.max(4, Math.round(fSize * 0.45));
  const rowHPx   = Math.ceil(fSize * 1.3 * (96 / 72)) + rowPad * 2;
  const actualPx  = rowHPx * numRows + numSeparators * 8;
  const designedPx = el.height * scale;
  const overflowPx = Math.max(0, actualPx - designedPx);
  if (overflowPx === 0) return null;
  return {
    overflowUnits:     overflowPx / scale,
    actualHeightUnits: el.height + overflowPx / scale,
  };
}
