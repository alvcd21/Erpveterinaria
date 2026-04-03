import { useEffect, useRef } from 'react';

/**
 * Hook offline-first: recarga datos automáticamente cuando:
 * - Se completa una sincronización con el servidor (smartcloud:synced)
 * - Se hace una escritura optimista local (smartcloud:write-queued)
 *
 * Usa useRef internamente para que el caller NO necesite useCallback.
 *
 * Uso:
 *   useOfflineSync(loadClients);
 *   useOfflineSync(loadData);
 */
export function useOfflineSync(reloadFn: () => void) {
  const reloadRef = useRef(reloadFn);
  reloadRef.current = reloadFn; // Siempre la versión más reciente sin re-suscribir

  useEffect(() => {
    const handle = () => reloadRef.current();
    window.addEventListener('smartcloud:synced', handle);
    window.addEventListener('smartcloud:write-queued', handle);
    return () => {
      window.removeEventListener('smartcloud:synced', handle);
      window.removeEventListener('smartcloud:write-queued', handle);
    };
  }, []); // Solo suscribe una vez al montar
}
