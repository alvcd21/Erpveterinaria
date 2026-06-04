import { useState, useEffect, useCallback } from 'react';
import { offlineDB, SyncItem } from '../services/offlineDB';
import { refreshStaleCaches, warmAllCaches } from '../services/offlineSync';
import { getAccessToken, getCurrentTenantId } from '../services/authSession';

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  syncError: string | null;
}

export function useOnlineStatus() {
  const [state, setState] = useState<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    syncError: null
  });

  const updatePendingCount = useCallback(async () => {
    const count = await offlineDB.queueCount();
    setState(prev => ({ ...prev, pendingCount: count }));
  }, []);

  const processQueue = useCallback(async () => {
    const queue = await offlineDB.getQueue();
    if (queue.length === 0) return;

    setState(prev => ({ ...prev, isSyncing: true, syncError: null }));

    const token = getAccessToken();
    const currentTenantId = getCurrentTenantId();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    let successCount = 0;
    let failCount = 0;

    // Only replay items that belong to the currently active tenant.
    // Items from a different tenant stay in the queue until that tenant logs in again.
    const itemsToProcess = queue.filter(item =>
      item.tenantId === null || item.tenantId === currentTenantId
    );

    for (const item of itemsToProcess) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers,
          credentials: 'include',
          body: item.body ? JSON.stringify(item.body) : undefined
        });

        if (response.ok) {
          await offlineDB.removeFromQueue(item.id);
          successCount++;
        } else if (response.status >= 400 && response.status < 500) {
          // Error del cliente (datos invalidos) — remover para no reintentar
          await offlineDB.removeFromQueue(item.id);
          failCount++;
        } else {
          await offlineDB.incrementRetry(item.id);
          failCount++;
        }
      } catch {
        await offlineDB.incrementRetry(item.id);
        failCount++;
      }
    }

    const remaining = await offlineDB.queueCount();
    setState(prev => ({
      ...prev,
      isSyncing: false,
      pendingCount: remaining,
      lastSyncAt: new Date(),
      syncError: failCount > 0 ? `${failCount} operacion(es) no pudieron sincronizarse` : null
    }));

    if (successCount > 0) {
      window.dispatchEvent(new CustomEvent('smartcloud:synced', { detail: { successCount } }));
      // Refrescar todos los caches para reemplazar items _offline con datos reales del servidor
      warmAllCaches().catch(() => {});
    }
  }, []);

  useEffect(() => {
    updatePendingCount();

    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      processQueue();
      refreshStaleCaches();
    };
    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processQueue, updatePendingCount]);

  return { ...state, processQueue, updatePendingCount };
}
