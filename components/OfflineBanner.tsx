import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw, CloudOff, CheckCircle } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const OfflineBanner: React.FC = () => {
  const { isOnline, isSyncing, pendingCount, lastSyncAt, syncError, processQueue } = useOnlineStatus();
  const [showSyncedToast, setShowSyncedToast] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.successCount > 0) {
        setShowSyncedToast(true);
        setTimeout(() => setShowSyncedToast(false), 4000);
      }
    };
    window.addEventListener('smartcloud:synced', handler);
    return () => window.removeEventListener('smartcloud:synced', handler);
  }, []);

  // Toast de sincronizacion exitosa
  if (showSyncedToast) {
    return (
      <div className="fixed top-4 right-4 z-[9999] flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in">
        <CheckCircle size={18} />
        <span className="text-sm font-semibold">Datos sincronizados correctamente</span>
      </div>
    );
  }

  // App offline
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white px-4 py-2 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2">
          <WifiOff size={16} />
          <span className="text-sm font-bold">Modo sin conexion</span>
          {pendingCount > 0 && (
            <span className="bg-amber-700 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-xs opacity-80">Los cambios se guardaran y sincronizaran al reconectarse</span>
      </div>
    );
  }

  // Sincronizando
  if (isSyncing) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-indigo-600 text-white px-4 py-2 flex items-center gap-2 shadow-lg">
        <RefreshCw size={16} className="animate-spin" />
        <span className="text-sm font-bold">Sincronizando {pendingCount} operacion(es)...</span>
      </div>
    );
  }

  // Error de sincronizacion
  if (syncError) {
    return (
      <div className="fixed top-4 right-4 z-[9999] flex items-center gap-2 bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl">
        <CloudOff size={16} />
        <span className="text-sm">{syncError}</span>
        <button
          onClick={processQueue}
          className="ml-2 underline text-xs hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
