import { LabelElement, InvoiceColumn, SummaryRow } from '../types';

export const thermalCols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}',  widthPct: 48, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cant',        field: '{{item.cantidad}}',     widthPct: 12, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'Precio',      field: '{{item.precioVenta}}',  widthPct: 20, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'Total',       field: '{{item.total}}',        widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

export const a4Cols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción',  field: '{{item.descripcion}}', widthPct: 45, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cantidad',     field: '{{item.cantidad}}',    widthPct: 10, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'P. Unitario',  field: '{{item.precioVenta}}', widthPct: 15, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'ISV (15%)',    field: '{{item.isv}}',         widthPct: 10, align: 'right',  format: 'CURRENCY' },
  { id: 'c5', header: 'Total',        field: '{{item.total}}',       widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

export const invoiceSummaryRows: SummaryRow[] = [
  { id: 's1', label: 'Descuento:',  field: '{{venta.descuento}}', format: 'CURRENCY', bold: false },
  { id: 's2', label: 'ISV (15%):',  field: '{{venta.isv}}',       format: 'CURRENCY', bold: false },
  { id: 's3', label: 'TOTAL:',      field: '{{venta.total}}',     format: 'CURRENCY', bold: true, separator: true },
];

export const pharmaCols: InvoiceColumn[] = [
  { id: 'c1', header: 'Medicamento', field: '{{item.descripcion}}', widthPct: 48, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cant.',       field: '{{item.cantidad}}',    widthPct: 12, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'Precio',      field: '{{item.precioVenta}}', widthPct: 20, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'Total',       field: '{{item.total}}',       widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

export const pharmaSummaryRows: SummaryRow[] = [
  { id: 's1', label: 'Descuento:', field: '{{venta.descuento}}', format: 'CURRENCY', bold: false },
  { id: 's2', label: 'ISV:',       field: '{{venta.isv}}',       format: 'CURRENCY', bold: false },
  { id: 's3', label: 'TOTAL:',     field: '{{venta.total}}',     format: 'CURRENCY', bold: true, separator: true },
];

export function el(id: string, type: LabelElement['type'], x: number, y: number, w: number, h: number, extra: Partial<LabelElement> = {}): LabelElement {
  return {
    id, type, x, y, width: w, height: h,
    rotation: 0, content: '', opacity: 1,
    fontSize: 9, color: '#000000', textAlign: 'left', fontWeight: 'normal',
    fontFamily: 'helvetica', barcodeFormat: 'CODE128', displayValue: true,
    shapeType: 'RECTANGLE', isStretchWithOverflow: false,
    ...extra,
  };
}
