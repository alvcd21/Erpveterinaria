
import { LabelTemplate, LabelElement, InvoiceColumn, SummaryRow } from '../types';

// ─── Shared column definitions ────────────────────────────────────────────────

const thermalCols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}',  widthPct: 48, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cant',        field: '{{item.cantidad}}',     widthPct: 12, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'Precio',      field: '{{item.precioVenta}}',  widthPct: 20, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'Total',       field: '{{item.total}}',        widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

const a4Cols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción',  field: '{{item.descripcion}}', widthPct: 45, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cantidad',     field: '{{item.cantidad}}',    widthPct: 10, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'P. Unitario',  field: '{{item.precioVenta}}', widthPct: 15, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'ISV (15%)',    field: '{{item.isv}}',         widthPct: 10, align: 'right',  format: 'CURRENCY' },
  { id: 'c5', header: 'Total',        field: '{{item.total}}',       widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

const invoiceSummaryRows: SummaryRow[] = [
  { id: 's1', label: 'Descuento:',  field: '{{venta.descuento}}', format: 'CURRENCY', bold: false },
  { id: 's2', label: 'ISV (15%):',  field: '{{venta.isv}}',       format: 'CURRENCY', bold: false },
  { id: 's3', label: 'TOTAL:',      field: '{{venta.total}}',     format: 'CURRENCY', bold: true, separator: true },
];

// ─── Helper to create an element with defaults ────────────────────────────────

function el(id: string, type: LabelElement['type'], x: number, y: number, w: number, h: number, extra: Partial<LabelElement> = {}): LabelElement {
  return {
    id, type, x, y, width: w, height: h,
    rotation: 0, content: '', opacity: 1,
    fontSize: 9, color: '#000000', textAlign: 'left', fontWeight: 'normal',
    fontFamily: 'helvetica', barcodeFormat: 'CODE128', displayValue: true,
    shapeType: 'RECTANGLE', isStretchWithOverflow: false,
    ...extra,
  };
}

// ─── STARTER TEMPLATES ────────────────────────────────────────────────────────

/** Factura Térmica 80mm — ideal for POS thermal printers */
export const FACTURA_TERMICA: Omit<LabelTemplate, 'id'> = {
  name:       'Factura Térmica 80mm',
  type:       'DOCUMENT',
  category:   'INVOICE',
  dataSource: 'SALES',
  isDefault:  false,
  width:      8,   // cm
  height:     23,  // cm (cuts dynamically when printed)
  snapEnabled: false,
  gridSize:   0.5,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // Company header
    el('st_ch', 'COMPANY_HEADER', 0.2, 0.2, 7.6, 2.8, { fontSize: 9, companyAlign: 'center', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    // Divider
    el('st_l1', 'SHAPE', 0, 3.2, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    // Invoice title
    el('st_t1', 'TEXT', 0.2, 3.35, 7.6, 0.8, { content: 'F A C T U R A', textAlign: 'center', fontWeight: 'bold', fontSize: 14 }),
    // Invoice number
    el('st_t2', 'TEXT', 0.2, 4.25, 7.6, 0.55, { content: 'No.: {{venta.codVenta}}', fontSize: 9 }),
    // Date
    el('st_t3', 'TEXT', 0.2, 4.85, 7.6, 0.55, { content: 'Fecha: {{venta.fecha}}', fontSize: 9 }),
    // CAI
    el('st_t4', 'TEXT', 0.2, 5.45, 7.6, 0.5, { content: 'CAI: {{empresa.cai}}', fontSize: 7, color: '#555555' }),
    // Range
    el('st_t5', 'TEXT', 0.2, 5.95, 7.6, 0.5, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 7, color: '#555555' }),
    // Client section
    el('st_t6', 'TEXT', 0.2, 6.6, 7.6, 0.55, { content: 'Cliente: {{cliente.nombre}}', fontSize: 9, fontWeight: 'bold' }),
    el('st_t7', 'TEXT', 0.2, 7.2, 7.6, 0.5, { content: 'RTN: {{cliente.identidad}}', fontSize: 8 }),
    // Divider
    el('st_l2', 'SHAPE', 0, 7.85, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    // Invoice table
    el('st_tb', 'INVOICE_TABLE', 0, 8.0, 8, 8.5, {
      tableColumns: thermalCols, tableHeaderBg: '#1e293b', tableHeaderColor: '#ffffff',
      tableRowHeight: 0.75, tableAlternateRows: true, tableAlternateBg: '#f8fafc', tableFontSize: 8,
    }),
    // Divider
    el('st_l3', 'SHAPE', 0, 16.6, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    // Summary box (right-aligned)
    el('st_sb', 'SUMMARY_BOX', 3.5, 16.75, 4.5, 2.5, {
      summaryRows: invoiceSummaryRows, summaryFontSize: 9,
      summaryLabelColor: '#1e293b', summaryValueColor: '#1e293b',
    }),
    // Divider
    el('st_l4', 'SHAPE', 0, 19.35, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    // Footer message
    el('st_ft', 'TEXT', 0.2, 19.5, 7.6, 1.5, {
      content: '{{empresa.mensajeFinal}}\nFecha límite emisión: {{empresa.fechaLimite}}',
      textAlign: 'center', fontSize: 7, color: '#555555', isMultiline: true,
    }),
  ],
};

/** Factura A4 — formal invoice for full-page printing */
export const FACTURA_A4: Omit<LabelTemplate, 'id'> = {
  name:       'Factura A4',
  type:       'DOCUMENT',
  category:   'INVOICE',
  dataSource: 'SALES',
  isDefault:  false,
  width:      21,
  height:     29.7,
  snapEnabled: false,
  gridSize:   0.5,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // Company header
    el('a4_ch', 'COMPANY_HEADER', 1, 1, 19, 3, { fontSize: 11, companyAlign: 'center', companyShowRTN: true, companyShowPhone: true, companyShowEmail: true }),
    // Divider
    el('a4_l1', 'SHAPE', 1, 4.2, 19, 0.05, { shapeType: 'LINE', stroke: '#1e293b', strokeWidth: 2 }),
    // Title
    el('a4_t0', 'TEXT', 1, 4.4, 19, 1, { content: 'FACTURA', textAlign: 'center', fontWeight: 'bold', fontSize: 18, color: '#1e293b' }),
    // Invoice meta (two-column layout using text blocks)
    el('a4_t1', 'TEXT', 1,   5.7, 9, 0.6, { content: 'No. Factura:',      fontSize: 9, color: '#555', fontWeight: 'bold' }),
    el('a4_t2', 'TEXT', 10,  5.7, 10, 0.6, { content: '{{venta.codVenta}}', fontSize: 9 }),
    el('a4_t3', 'TEXT', 1,   6.4, 9, 0.6, { content: 'Fecha Emisión:',     fontSize: 9, color: '#555', fontWeight: 'bold' }),
    el('a4_t4', 'TEXT', 10,  6.4, 10, 0.6, { content: '{{venta.fecha}}',    fontSize: 9 }),
    el('a4_t5', 'TEXT', 1,   7.1, 9, 0.6, { content: 'CAI:',               fontSize: 9, color: '#555', fontWeight: 'bold' }),
    el('a4_t6', 'TEXT', 4,   7.1, 16, 0.6, { content: '{{empresa.cai}}',    fontSize: 9 }),
    el('a4_t7', 'TEXT', 1,   7.8, 9, 0.6, { content: 'Rango Autorizado:',  fontSize: 9, color: '#555', fontWeight: 'bold' }),
    el('a4_t8', 'TEXT', 6.5, 7.8, 13.5, 0.6, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 9 }),
    // Divider
    el('a4_l2', 'SHAPE', 1, 8.6, 19, 0.05, { shapeType: 'LINE', stroke: '#e2e8f0', strokeWidth: 1 }),
    // Client info box
    el('a4_cb', 'SHAPE', 1, 8.8, 19, 2.2, { shapeType: 'RECTANGLE', fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('a4_cl', 'TEXT', 1.3, 8.95, 18, 0.55, { content: 'DATOS DEL CLIENTE', fontSize: 8, fontWeight: 'bold', color: '#64748b' }),
    el('a4_cn', 'TEXT', 1.3, 9.55, 18, 0.6, { content: 'Cliente: {{cliente.nombre}}', fontSize: 10, fontWeight: 'bold' }),
    el('a4_ci', 'TEXT', 1.3, 10.2, 9, 0.55, { content: 'RTN/Identidad: {{cliente.identidad}}', fontSize: 9 }),
    el('a4_cd', 'TEXT', 10.5, 10.2, 9.5, 0.55, { content: 'Tipo Venta: {{venta.tipoCompra}}', fontSize: 9 }),
    // Items table
    el('a4_tb', 'INVOICE_TABLE', 1, 11.2, 19, 11, {
      tableColumns: a4Cols, tableHeaderBg: '#1e293b', tableHeaderColor: '#ffffff',
      tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#f8fafc', tableFontSize: 9,
    }),
    // Divider
    el('a4_l3', 'SHAPE', 1, 22.4, 19, 0.05, { shapeType: 'LINE', stroke: '#e2e8f0', strokeWidth: 1 }),
    // Summary box
    el('a4_sb', 'SUMMARY_BOX', 13, 22.6, 7, 3, {
      summaryRows: invoiceSummaryRows, summaryFontSize: 10,
      summaryLabelColor: '#1e293b', summaryValueColor: '#1e293b', summaryBg: '#f8fafc',
    }),
    // Footer
    el('a4_ft', 'TEXT', 1, 26.5, 19, 1.5, {
      content: '{{empresa.mensajeFinal}}\nFecha límite de emisión: {{empresa.fechaLimite}}',
      textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true,
    }),
  ],
};

/** Orden de Reparación — repair order for the service module */
export const ORDEN_REPARACION: Omit<LabelTemplate, 'id'> = {
  name:       'Orden de Reparación',
  type:       'DOCUMENT',
  category:   'REPORT',
  dataSource: 'NONE',
  isDefault:  false,
  width:      21,
  height:     29.7,
  snapEnabled: false,
  gridSize:   0.5,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // Header
    el('rp_ch', 'COMPANY_HEADER', 1, 1, 19, 2.5, { fontSize: 10, companyAlign: 'center', companyShowRTN: true, companyShowPhone: true }),
    el('rp_l1', 'SHAPE', 1, 3.7, 19, 0.08, { shapeType: 'LINE', stroke: '#1e293b', strokeWidth: 3 }),
    el('rp_tt', 'TEXT', 1, 3.9, 19, 1.0, { content: 'ORDEN DE REPARACIÓN', textAlign: 'center', fontWeight: 'bold', fontSize: 16, color: '#1e293b' }),
    // Order info
    el('rp_i1', 'TEXT', 1,   5.2, 8, 0.6, { content: 'No. Orden:',           fontWeight: 'bold', fontSize: 9, color: '#555' }),
    el('rp_i2', 'TEXT', 4.5, 5.2, 5, 0.6, { content: '{{reparacion.id_reparacion}}', fontSize: 9 }),
    el('rp_i3', 'TEXT', 10,  5.2, 5, 0.6, { content: 'Fecha Ingreso:',       fontWeight: 'bold', fontSize: 9, color: '#555' }),
    el('rp_i4', 'TEXT', 15, 5.2, 5, 0.6, { content: '{{reparacion.fecha_ingreso}}', fontSize: 9 }),
    el('rp_i5', 'TEXT', 1,   5.9, 8, 0.6, { content: 'Entrega Estimada:',    fontWeight: 'bold', fontSize: 9, color: '#555' }),
    el('rp_i6', 'TEXT', 6.5, 5.9, 7, 0.6, { content: '{{reparacion.fecha_entrega_estimada}}', fontSize: 9 }),
    // Section: Client
    el('rp_cb', 'SHAPE', 1, 6.8, 19, 2.2, { shapeType: 'RECTANGLE', fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('rp_cl', 'TEXT', 1.3, 6.95, 18, 0.5, { content: 'DATOS DEL CLIENTE', fontSize: 8, fontWeight: 'bold', color: '#64748b' }),
    el('rp_cn', 'TEXT', 1.3, 7.5, 18, 0.6, { content: 'Cliente: {{reparacion.nombre_cliente}}', fontSize: 10, fontWeight: 'bold' }),
    el('rp_ci', 'TEXT', 1.3, 8.1, 18, 0.55, { content: 'Identidad: {{reparacion.identidad_cliente}}', fontSize: 9 }),
    // Section: Device
    el('rp_db', 'SHAPE', 1, 9.2, 19, 2.2, { shapeType: 'RECTANGLE', fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('rp_dl', 'TEXT', 1.3, 9.35, 18, 0.5, { content: 'DATOS DEL EQUIPO', fontSize: 8, fontWeight: 'bold', color: '#64748b' }),
    el('rp_dm', 'TEXT', 1.3, 9.9, 8, 0.6, { content: 'Marca/Modelo: {{reparacion.marca}} {{reparacion.modelo}}', fontSize: 9 }),
    el('rp_di', 'TEXT', 10, 9.9, 10, 0.6, { content: 'IMEI: {{reparacion.imei_equipo}}', fontSize: 9 }),
    el('rp_dc', 'TEXT', 1.3, 10.5, 18, 0.55, { content: 'Complementos: {{reparacion.complementos}}', fontSize: 9 }),
    // Section: Fault
    el('rp_fl', 'TEXT', 1, 12.0, 19, 0.55, { content: 'DESCRIPCIÓN DE FALLA:', fontSize: 9, fontWeight: 'bold', color: '#555' }),
    el('rp_fb', 'SHAPE', 1, 12.6, 19, 2.5, { shapeType: 'RECTANGLE', fill: '#fffbeb', stroke: '#fcd34d', strokeWidth: 1, borderRadius: 4 }),
    el('rp_fd', 'TEXT', 1.3, 12.7, 18.4, 2.3, { content: '{{reparacion.descripcion_falla}}', fontSize: 9, isMultiline: true }),
    // Section: Technician
    el('rp_tl', 'TEXT', 1,  15.4, 8, 0.55, { content: 'Técnico:',            fontWeight: 'bold', fontSize: 9, color: '#555' }),
    el('rp_tn', 'TEXT', 4,  15.4, 8, 0.55, { content: '{{reparacion.nombre_tecnico}}', fontSize: 9 }),
    el('rp_pl', 'TEXT', 10, 15.4, 5, 0.55, { content: 'Precio Cliente:',     fontWeight: 'bold', fontSize: 9, color: '#555' }),
    el('rp_pv', 'TEXT', 16, 15.4, 4, 0.55, { content: '{{reparacion.precio_cliente}}', fontSize: 9, fontWeight: 'bold' }),
    // Signatures
    el('rp_sl1', 'SHAPE', 1,  23, 8.5, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    el('rp_st1', 'TEXT',  1,  23.2, 8.5, 0.6, { content: 'Firma Técnico', textAlign: 'center', fontSize: 8, color: '#555' }),
    el('rp_sl2', 'SHAPE', 11.5, 23, 8.5, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    el('rp_st2', 'TEXT',  11.5, 23.2, 8.5, 0.6, { content: 'Firma Cliente', textAlign: 'center', fontSize: 8, color: '#555' }),
  ],
};

/** Etiqueta de Precio — for phone/accessory price tags */
export const ETIQUETA_PRECIO: Omit<LabelTemplate, 'id'> = {
  name:       'Etiqueta de Precio',
  type:       'LABEL',
  category:   'TELEPHONE',
  dataSource: 'TELEPHONES',
  isDefault:  false,
  width:      50,  // mm
  height:     25,  // mm
  snapEnabled: true,
  gridSize:   2,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // Product name
    el('ep_n', 'TEXT', 2, 1, 46, 7, { content: '{{marca}} {{modelo}}', fontWeight: 'bold', fontSize: 8, textAlign: 'center' }),
    // Price - large
    el('ep_p', 'TEXT', 2, 8, 46, 8, { content: 'L. {{precioVenta}}', fontWeight: 'bold', fontSize: 14, textAlign: 'center', color: '#1e293b' }),
    // Barcode
    el('ep_b', 'BARCODE', 3, 16, 44, 7, { content: '{{codigo}}', barcodeFormat: 'CODE128', displayValue: true, fontSize: 6 }),
  ],
};

/** Etiqueta IMEI — for phones with IMEI traceability */
export const ETIQUETA_IMEI: Omit<LabelTemplate, 'id'> = {
  name:       'Etiqueta IMEI',
  type:       'LABEL',
  category:   'TELEPHONE',
  dataSource: 'TELEPHONES',
  isDefault:  false,
  width:      60,
  height:     30,
  snapEnabled: true,
  gridSize:   2,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    el('ei_n', 'TEXT',    2,  1,  56, 6,  { content: '{{marca}} {{modelo}}', fontWeight: 'bold', fontSize: 9, textAlign: 'center' }),
    el('ei_p', 'TEXT',    2,  7,  56, 5,  { content: 'L. {{precioVenta}}', fontWeight: 'bold', fontSize: 12, textAlign: 'center', color: '#1e293b' }),
    el('ei_i', 'TEXT',    2,  12, 56, 4,  { content: 'IMEI: {{imei1}}', fontSize: 6, textAlign: 'center', color: '#555' }),
    el('ei_b', 'BARCODE', 3,  16, 35, 10, { content: '{{imei1}}', barcodeFormat: 'CODE128', displayValue: false }),
    el('ei_q', 'QR',      40, 16, 18, 12, { content: '{{imei1}}' }),
  ],
};

// ─── Catalog for the UI ───────────────────────────────────────────────────────

export interface StarterTemplateEntry {
  id: string;
  name: string;
  description: string;
  icon: string;       // emoji
  type: 'LABEL' | 'DOCUMENT';
  category: string;
  template: Omit<LabelTemplate, 'id'>;
}

export const STARTER_TEMPLATES: StarterTemplateEntry[] = [
  {
    id: 'factura_termica',
    name: 'Factura Térmica 80mm',
    description: 'Ticket para impresora térmica. Incluye datos de empresa, tabla de ítems y totales.',
    icon: '🧾',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_TERMICA,
  },
  {
    id: 'factura_a4',
    name: 'Factura A4',
    description: 'Factura formal tamaño carta/A4 con todos los campos fiscales requeridos.',
    icon: '📄',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_A4,
  },
  {
    id: 'orden_reparacion',
    name: 'Orden de Reparación',
    description: 'Formulario para ordenes de servicio técnico con datos del equipo y firmas.',
    icon: '🔧',
    type: 'DOCUMENT',
    category: 'REPORT',
    template: ORDEN_REPARACION,
  },
  {
    id: 'etiqueta_precio',
    name: 'Etiqueta de Precio',
    description: 'Etiqueta compacta 50x25mm con nombre, precio y código de barras.',
    icon: '🏷️',
    type: 'LABEL',
    category: 'TELEPHONE',
    template: ETIQUETA_PRECIO,
  },
  {
    id: 'etiqueta_imei',
    name: 'Etiqueta IMEI',
    description: 'Etiqueta 60x30mm con IMEI en código de barras y QR para trazabilidad.',
    icon: '📱',
    type: 'LABEL',
    category: 'TELEPHONE',
    template: ETIQUETA_IMEI,
  },
];
