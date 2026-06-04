import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { LabelTemplate } from '../types';
import { PrintDataContext, resolveContent } from './templateRendererUtils';

export type MediaCache = Map<string, string>;

export async function preRenderMedia(template: LabelTemplate, ctx: PrintDataContext): Promise<MediaCache> {
  const cache: MediaCache = new Map();

  for (const el of template.elements) {
    if (el.visible === false) continue;

    if (el.type === 'BARCODE') {
      const resolved = resolveContent(el.content || '123456', ctx);
      const safeContent = /{{.*?}}/.test(resolved) ? '123456' : resolved;
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, safeContent || '123456', {
          format: (el.barcodeFormat as any) || 'CODE128',
          displayValue: el.displayValue ?? true,
          margin: 0, width: 2, height: 50, fontSize: 20,
          lineColor: el.barcodeFgColor || '#000000',
          background: el.barcodeBgColor || '#ffffff',
        });
        cache.set(el.id, canvas.toDataURL('image/png'));
      } catch { /* element will render as placeholder */ }
    }

    if (el.type === 'QR') {
      const resolved = resolveContent(el.content || 'QR', ctx);
      const safeContent = /{{.*?}}/.test(resolved) ? 'DEMO-QR' : resolved;
      try {
        const url = await QRCode.toDataURL(safeContent || 'QR', {
          margin: 0,
          color: {
            dark: el.qrFgColor || '#000000',
            light: el.qrBgColor || '#ffffff',
          }
        });
        cache.set(el.id, url);
      } catch { /* element will render as placeholder */ }
    }
  }

  return cache;
}
