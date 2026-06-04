import { EmpresaConfig, Venta, DetalleVenta, Cliente, LabelElement } from '../types';

export interface PrintDataContext {
  empresa?: Partial<EmpresaConfig>;
  venta?: Partial<Venta> & { detalles?: Partial<DetalleVenta>[] };
  cliente?: Partial<Cliente>;
  medicamento?: Record<string, any>;
  producto?: Record<string, any>;
  [key: string]: any;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseConditionOperand(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

export function safeEvaluateCondition(expr: string): boolean {
  const e = expr.trim();
  if (e === 'true') return true;
  if (e === 'false') return false;
  const m = e.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!m) return true;
  const lv = parseConditionOperand(m[1].trim());
  const op = m[2];
  const rv = parseConditionOperand(m[3].trim());
  if (op === '==' || op === '===') return lv === rv;
  if (op === '!=' || op === '!==') return lv !== rv;
  const ln = Number(lv), rn = Number(rv);
  if (isNaN(ln) || isNaN(rn)) return true;
  if (op === '>') return ln > rn;
  if (op === '<') return ln < rn;
  if (op === '>=') return ln >= rn;
  if (op === '<=') return ln <= rn;
  return true;
}

function flattenObject(obj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (!obj || typeof obj !== 'object') return result;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, fullKey));
    } else if (!Array.isArray(val)) {
      result[fullKey] = val != null ? String(val) : '';
    }
  }
  return result;
}

const DATE_FIELD_RE = /\b(fecha|fechaLimite|fechaVenta|fechaIngreso|fechaCreacion|fechaSalida|fecha_limite|fecha_venta|fechaFactura)\b/i;

function formatSpanishDate(val: string): string {
  if (!val) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}(T00:00:00)?/.test(val);
  const day   = String(isDateOnly ? d.getUTCDate()        : d.getDate()).padStart(2, '0');
  const month = String(isDateOnly ? d.getUTCMonth() + 1   : d.getMonth() + 1).padStart(2, '0');
  const year  =        isDateOnly ? d.getUTCFullYear()     : d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function resolveContent(content: string, ctx: PrintDataContext): string {
  const flat = flattenObject(ctx);
  return content.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const trimmed = path.trim();
    const val = flat[trimmed];
    if (val === undefined) return `{{${trimmed}}}`;
    if (DATE_FIELD_RE.test(trimmed)) return formatSpanishDate(val) || val;
    return val;
  });
}

export function formatValue(val: string, format: 'TEXT' | 'CURRENCY' | 'NUMBER'): string {
  if (!val && val !== '0') return '';
  if (format === 'CURRENCY') {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return `L. ${num.toFixed(2)}`;
  }
  if (format === 'NUMBER') {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toLocaleString('es-HN');
  }
  return val;
}

function padReceipt(value: string, len: number, dir: 'left' | 'right' = 'right'): string {
  const str = String(value || '').slice(0, len);
  return dir === 'left' ? str.padStart(len, ' ') : str.padEnd(len, ' ');
}

function moneyPlain(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function wrapReceiptText(text: string, len: number): string[] {
  const safeLen = Math.max(4, len);
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > safeLen) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += safeLen) {
        lines.push(word.slice(i, i + safeLen));
      }
    } else if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= safeLen) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export function buildReceiptItemLines(
  el: Pick<LabelElement, 'receiptLineChars'>,
  tableItems?: Partial<DetalleVenta>[],
): string[] {
  const lineChars = Math.max(30, el.receiptLineChars || 42);
  const codeWidth = 10;
  const totalWidth = 10;
  const descWidth = Math.max(8, lineChars - codeWidth - totalWidth);
  const items = tableItems && tableItems.length > 0 ? tableItems : [
    { codigo: 'MED-0001', descripcion: 'Producto de ejemplo', cantidad: 1, precioVenta: 0, total: 0 } as any,
    { codigo: 'MED-0002', descripcion: 'Otro producto', cantidad: 1, precioVenta: 0, total: 0 } as any,
  ];

  const header = `${padReceipt('CODIGO', codeWidth)}${padReceipt('DESCRIPCION', descWidth)}${padReceipt('TOTAL', totalWidth, 'left')}`;
  const lines = [header, '-'.repeat(lineChars)];

  for (const item of items as any[]) {
    const code = String(item.codigo || item.id_medicamento || item.codDetalleVenta || '').slice(0, codeWidth);
    const total = moneyPlain(item.total ?? (Number(item.cantidad || 0) * Number(item.precioVenta || 0)));
    const descLines = wrapReceiptText(item.descripcion || item.descripcionProducto || 'PRODUCTO', descWidth);

    lines.push(`${padReceipt(code, codeWidth)}${padReceipt(descLines[0], descWidth)}${padReceipt(total, totalWidth, 'left')}`);
    for (const extraLine of descLines.slice(1)) {
      lines.push(`${padReceipt('', codeWidth)}${padReceipt(extraLine, descWidth + totalWidth)}`);
    }

    const qty = Number(item.cantidad || 0).toLocaleString('es-HN', { maximumFractionDigits: 3 });
    const unit = moneyPlain(item.precioVenta);
    const tax = String(item.tipoIsv || '').toLowerCase() === 'exento' ? 'EXE' : `ISV ${item.tipoIsv || '15'}%`;
    lines.push(`  ${qty} x ${unit}   ${tax}`);
  }

  lines.push('-'.repeat(lineChars));
  return lines;
}
