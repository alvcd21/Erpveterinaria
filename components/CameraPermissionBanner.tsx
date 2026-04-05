import React, { useState } from 'react';
import { Camera, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useCameraPermission } from '../hooks/useCameraPermission';

const DISMISSED_KEY = 'camera_banner_dismissed';

/**
 * Shows a one-time banner asking the user to grant camera permission.
 * Once granted (or dismissed), never shows again.
 * Renders nothing if permission is already granted.
 */
const CameraPermissionBanner: React.FC = () => {
  const { state, requestPermission } = useCameraPermission();
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISSED_KEY) === '1'
  );
  const [requesting, setRequesting] = useState(false);
  const [justGranted, setJustGranted] = useState(false);

  // Don't render if already granted or permanently dismissed
  if (state === 'granted' || dismissed) return null;
  // Don't render if permission API says unknown (can't determine yet)
  if (state === 'unknown') return null;
  // Don't show while user is actively using the app and already dismissed the banner
  if (state === 'denied' && dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const handleGrant = async () => {
    setRequesting(true);
    const ok = await requestPermission();
    setRequesting(false);
    if (ok) {
      setJustGranted(true);
      localStorage.setItem(DISMISSED_KEY, '1');
      setTimeout(() => setDismissed(true), 2000);
    }
  };

  if (justGranted) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[9000] flex justify-center pointer-events-none">
        <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl flex items-center gap-3 shadow-2xl shadow-emerald-600/30 animate-fade-in">
          <CheckCircle2 size={20}/>
          <p className="font-bold text-sm">Cámara autorizada — no volverás a ver este aviso</p>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[9000] flex justify-center">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl flex items-start gap-3 shadow-xl max-w-sm w-full">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-500"/>
          <div className="flex-1 text-xs">
            <p className="font-bold">Cámara bloqueada</p>
            <p className="mt-0.5 text-amber-700">Ve a Configuración del navegador → Permisos → Cámara y permite este sitio.</p>
          </div>
          <button onClick={dismiss} className="text-amber-400 hover:text-amber-600 shrink-0"><X size={16}/></button>
        </div>
      </div>
    );
  }

  // state === 'prompt'
  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9000] flex justify-center">
      <div className="bg-indigo-600 text-white px-4 py-3.5 rounded-2xl flex items-center gap-3 shadow-2xl shadow-indigo-600/30 max-w-sm w-full animate-slide-up">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <Camera size={20}/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm">Activar escáner de cámara</p>
          <p className="text-[11px] text-indigo-200 mt-0.5">Toca una vez — nunca más te lo pedirá</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleGrant}
            disabled={requesting}
            className="bg-white text-indigo-600 px-3 py-2 rounded-xl font-black text-xs hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-60"
          >
            {requesting ? '...' : 'Activar'}
          </button>
          <button onClick={dismiss} className="text-white/60 hover:text-white p-1"><X size={16}/></button>
        </div>
      </div>
    </div>
  );
};

export default CameraPermissionBanner;
