/**
 * logoLoader.ts
 * Carga el logo de la empresa desde /public/logo.png una sola vez
 * y lo cachea en memoria para uso sincronico en los generadores de PDF.
 *
 * USO:
 *   - Coloca tu logo en: public/logo.png
 *   - Formatos soportados: PNG, JPG, WebP
 *   - Tamaño recomendado: 300x150 px o similar (rectangular horizontal)
 */

let logoCache: string = '';
let loadAttempted = false;

/**
 * Retorna el logo cacheado como data URL (sincronico).
 * Devuelve string vacio si el logo no ha cargado o no existe.
 */
export function getLogoSync(): string {
  return logoCache;
}

/**
 * Carga el logo desde /logo.png y lo almacena en cache.
 * Llamar al inicio de la aplicacion (index.tsx).
 */
export async function preloadLogo(): Promise<void> {
  if (loadAttempted) return;
  loadAttempted = true;

  try {
    const response = await fetch('/logo.png', { cache: 'force-cache' });
    if (!response.ok) return;

    const blob = await response.blob();
    logoCache = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    // El logo es opcional — si no existe, los PDFs se generan sin el
  }
}
