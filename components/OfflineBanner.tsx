import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CloudOff, CheckCircle } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import { warmAllCaches, startPeriodicWarm, stopPeriodicWarm } from '../services/offlineSync';

const OfflineBanner: React.FC = () => {
  const { isOnline, isSyncing, pendingCount, syncError, processQueue } = useOnlineStatus();
  const { isAuthenticated } = useAuth();
  const [showSyncedToast, setShowSyncedToast] = useState(false);
  const [showQueuedToast, setShowQueuedToast] = useState(false);

  // Precarga proactiva al autenticarse y estar online
  useEffect(() => {
    if (isAuthenticated && isOnline) {
      warmAllCaches();
      startPeriodicWarm();
    }
    return () => stopPeriodicWarm();
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    const handleSynced = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.successCount > 0) {
        setShowSyncedToast(true);
        setTimeout(() => setShowSyncedToast(false), 4000);
      }
    };
    window.addEventListener('smartcloud:synced', handleSynced);
    return () => window.removeEventListener('smartcloud:synced', handleSynced);
  }, []);

  useEffect(() => {
    const handleQueued = () => {
      setShowQueuedToast(true);
      setTimeout(() => setShowQueuedToast(false), 3500);
    };
    window.addEventListener('smartcloud:write-queued', handleQueued);
    return () => window.removeEventListener('smartcloud:write-queued', handleQueued);
  }, []);

  // Toast de operación encolada offline
  if (showQueuedToast) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in">
        <CheckCircle size={18} />
        <span className="text-sm font-semibold">Guardado. Se sincronizará al reconectarse</span>
      </div>
    );
  }

  // Toast de sincronización exitosa (esquina superior derecha, no bloquea header)
  if (showSyncedToast) {
    return (
      <div className="fixed top-4 right-4 z-[9999] flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in">
        <CheckCircle size={18} />
        <span className="text-sm font-semibold">Datos sincronizados</span>
      </div>
    );
  }

  // Offline: barra compacta abajo en móvil, barra arriba en desktop
  if (!isOnline) {
    return (
      <>
        {/* Desktop: barra superior fina */}
        <div className="hidden md:flex fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white px-4 py-1.5 items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <WifiOff size={14} />
            <span className="text-xs font-bold">Sin conexión</span>
            {pendingCount > 0 && (
              <span className="bg-amber-700 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span className="text-[10px] opacity-80">Los cambios se sincronizarán al reconectarse</span>
        </div>

        {/* Móvil: pill compacto en la parte inferior, no interfiere con el header */}
        <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg animate-fade-in">
          <WifiOff size={14} />
          <span className="text-xs font-bold">Sin conexión</span>
          {pendingCount > 0 && (
            <span className="bg-amber-700 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {pendingCount}
            </span>
          )}
        </div>
      </>
    );
  }

  // Sincronizando
  if (isSyncing) {
    return (
      <>
        <div className="hidden md:flex fixed top-0 left-0 right-0 z-[9999] bg-indigo-600 text-white px-4 py-1.5 items-center gap-2 shadow-md">
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-xs font-bold">Sincronizando {pendingCount} operacion(es)...</span>
        </div>
        <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg animate-fade-in">
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-xs font-bold">Sincronizando...</span>
        </div>
      </>
    );
  }

  // Error de sincronización
  if (syncError) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in">
        <CloudOff size={16} />
        <span className="text-sm">{syncError}</span>
        <button onClick={processQueue} className="ml-2 underline text-xs hover:no-underline">
          Reintentar
        </button>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
