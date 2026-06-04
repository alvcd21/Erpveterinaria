import { LabelTemplate, LabelElement, InvoiceColumn } from '../types';

export const MM_TO_PX = 3.7795;
export const CM_TO_PX = 37.795;

export const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const INITIAL_TEMPLATE: LabelTemplate = {
    id: '',
    name: 'Nuevo Diseño',
    category: 'GENERAL',
    type: 'LABEL',
    dataSource: 'NONE',
    isDefault: false,
    width: 50,
    height: 25,
    elements: [],
    snapEnabled: false,
    gridSize: 5,
    showGrid: false,
};

export const defaultInvoiceColumns: InvoiceColumn[] = [
    { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}', widthPct: 45, align: 'left',   format: 'TEXT'     },
    { id: 'c2', header: 'Cant.',        field: '{{item.cantidad}}',    widthPct: 10, align: 'center', format: 'NUMBER'   },
    { id: 'c3', header: 'P. Unit.',     field: '{{item.precioVenta}}', widthPct: 15, align: 'right',  format: 'CURRENCY' },
    { id: 'c4', header: 'ISV',          field: '{{item.isv}}',         widthPct: 10, align: 'right',  format: 'CURRENCY' },
    { id: 'c5', header: 'Total',        field: '{{item.total}}',       widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

export interface SchemaTable {
    columns: { name: string; type: string }[];
    relations: { column: string; foreignTable: string; foreignColumn: string }[];
}

export function computeFitZoom(tpl: LabelTemplate): number {
    const scale = tpl.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const availW = (typeof window !== 'undefined' ? window.innerWidth : 1200) - (isMobile ? 48 : 340);
    const availH = (typeof window !== 'undefined' ? window.innerHeight : 800) - (isMobile ? 180 : 130);
    const fw = availW / (tpl.width * scale);
    const fh = availH / (tpl.height * scale);
    return Math.max(0.2, Math.min(isMobile ? 2 : 3, Math.min(fw, fh)));
}

export function expandCompanyHeader(ch: LabelElement): LabelElement[] {
    const {
        x, y, width: w, height: h,
        fontSize = 9, color = '#000000',
        companyShowRTN = true, companyShowPhone = true, companyShowEmail = false,
        companyAlign = 'left',
    } = ch;

    const base: Partial<LabelElement> = {
        rotation: 0, opacity: 1,
        barcodeFormat: 'CODE128' as any, displayValue: true,
        shapeType: 'RECTANGLE' as any, isStretchWithOverflow: false,
    };

    const logoW = Math.min(h * 1.1, w * 0.35);
    const logoH = h;
    const gap = w > 10 ? 0.3 : 2;
    const textX = x + logoW + gap;
    const textW = w - logoW - gap;

    const fields: { content: string; bold: boolean; label: string }[] = [
        { content: '{{empresa.nombreEmpresa}}', bold: true,  label: 'Nombre Empresa' },
    ];
    if (companyShowRTN  !== false) fields.push({ content: 'RTN: {{empresa.rtn}}',      bold: false, label: 'RTN' });
    fields.push(                               { content: '{{empresa.direccion}}',      bold: false, label: 'Dirección' });
    if (companyShowPhone !== false) fields.push({ content: 'Tel: {{empresa.telefono}}', bold: false, label: 'Teléfono' });
    if (companyShowEmail)           fields.push({ content: '{{empresa.correo}}',        bold: false, label: 'Correo' });

    const lineH = h / fields.length;

    const logoEl: LabelElement = {
        ...base as any,
        id: generateId(), type: 'IMAGE',
        x, y, width: logoW, height: logoH,
        content: '{{empresa.logoBase64}}',
        imageObjectFit: 'contain',
        fontSize: 10, color: '#000000', textAlign: 'left',
        fontWeight: 'normal', fontFamily: 'helvetica',
        elementLabel: 'Logo Empresa',
    };

    let textY = y;
    const textEls: LabelElement[] = fields.map(f => {
        const el: LabelElement = {
            ...base as any,
            id: generateId(), type: 'TEXT',
            x: textX, y: textY,
            width: textW, height: lineH,
            content: f.content,
            fontSize: f.bold ? fontSize + 2 : fontSize,
            fontWeight: f.bold ? 'bold' : 'normal',
            color, textAlign: companyAlign as any,
            fontFamily: 'helvetica',
            isMultiline: false,
            elementLabel: f.label,
        };
        textY += lineH;
        return el;
    });

    return [logoEl, ...textEls];
}
