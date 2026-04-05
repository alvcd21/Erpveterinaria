/**
 * BarcodeScanner.tsx
 * Cross-browser camera barcode/QR scanner using @zxing/browser.
 * Works on: Chrome, Firefox, Safari, iPhone (iOS Safari), Android, Edge.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, ScanLine, Keyboard, ZapOff, CheckCircle2, Package } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
  /** Keep scanner open after each scan (batch mode) */
  continuous?: boolean;
  /** Number of items already scanned — shown in batch mode */
  batchCount?: number;
  /** If provided, shows a ✓ Confirm button in batch mode */
  onConfirmBatch?: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose,
  title = 'Escanear Código',
  hint  = 'Apunta al código de barras',
  continuous    = false,
  batchCount    = 0,
  onConfirmBatch,
}) => {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const lastCodeRef = useRef<string>('');
  const confirmRef  = useRef<number>(0);
  const laserYRef   = useRef<number>(0);
  const laserDirRef = useRef<number>(1);
  const stoppedRef  = useRef<boolean>(false);

  const [error,     setError]     = useState<string>('');
  const [fallback,  setFallback]  = useState(false);
  const [manualCode,setManualCode]= useState('');
  const [lastResult,setLastResult]= useState<string>('');
  const [scanning,  setScanning]  = useState(false);
  const [torchOn,   setTorchOn]   = useState(false);
  const [torchAvail,setTorchAvail]= useState(false);

  // ── Overlay animation ───────────────────────────────────────────────────────
  const animateOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const oc = overlay.getContext('2d');
    if (!oc) return;

    overlay.width  = overlay.clientWidth  || overlay.offsetWidth  || 320;
    overlay.height = overlay.clientHeight || overlay.offsetHeight || 480;
    const W = overlay.width;
    const H = overlay.height;

    const zx = W * 0.10;
    const zy = H * 0.28;
    const zw = W * 0.80;
    const zh = H * 0.44;

    oc.fillStyle = 'rgba(0,0,0,0.55)';
    oc.fillRect(0, 0, W, H);
    oc.clearRect(zx, zy, zw, zh);

    const cLen = 26; const cTh = 3;
    oc.strokeStyle = '#22d3ee'; oc.lineWidth = cTh;
    const corner = (x1:number,y1:number,x2:number,y2:number,x3:number,y3:number) => {
      oc.beginPath(); oc.moveTo(x1,y1); oc.lineTo(x2,y2); oc.lineTo(x3,y3); oc.stroke();
    };
    corner(zx,zy, zx+cLen,zy, zx,zy+cLen);
    corner(zx+zw-cLen,zy, zx+zw,zy, zx+zw,zy+cLen);
    corner(zx,zy+zh-cLen, zx,zy+zh, zx+cLen,zy+zh);
    corner(zx+zw-cLen,zy+zh, zx+zw,zy+zh, zx+zw,zy+zh-cLen);

    laserYRef.current += laserDirRef.current * 2;
    if (laserYRef.current >= zh - 2) laserDirRef.current = -1;
    if (laserYRef.current <= 2)      laserDirRef.current = 1;
    const ly = zy + laserYRef.current;
    const g = oc.createLinearGradient(zx, ly, zx+zw, ly);
    g.addColorStop(0,   'rgba(34,211,238,0)');
    g.addColorStop(0.3, 'rgba(34,211,238,0.9)');
    g.addColorStop(0.7, 'rgba(34,211,238,0.9)');
    g.addColorStop(1,   'rgba(34,211,238,0)');
    oc.strokeStyle = g; oc.lineWidth = 2;
    oc.beginPath(); oc.moveTo(zx, ly); oc.lineTo(zx+zw, ly); oc.stroke();

    rafRef.current = requestAnimationFrame(animateOverlay);
  }, []);

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    try { readerRef.current?.reset?.(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ── Start camera + ZXing ────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    stoppedRef.current = false;
    setError('');
    setScanning(false);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e: any) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError('Permiso de cámara denegado. Actívalo en configuración del navegador.');
      } else if (e.name === 'NotFoundError') {
        setError('No se encontró cámara en este dispositivo.');
      } else {
        setError('Error al iniciar la cámara: ' + (e.message || e.name));
      }
      return;
    }

    streamRef.current = stream;
    const [track] = stream.getVideoTracks();
    const caps = track.getCapabilities?.() as any;
    if (caps?.torch) setTorchAvail(true);

    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try { await videoRef.current.play(); } catch {}
    setScanning(true);

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    try {
      await reader.decodeFromStream(stream, videoRef.current, (result) => {
        if (stoppedRef.current || !result) return;
        const code = result.getText().trim();
        if (code === lastCodeRef.current) {
          confirmRef.current++;
        } else {
          lastCodeRef.current = code;
          confirmRef.current = 1;
        }
        if (confirmRef.current >= 2) {
          confirmRef.current = 0;
          lastCodeRef.current = '';
          setLastResult(code);
          onScan(code);
          if (!continuous) stopAll();
        }
      });
    } catch (e: any) {
      if (!stoppedRef.current) setError('Error al iniciar el escáner: ' + (e.message || String(e)));
    }
  }, [onScan, continuous, stopAll]);

  // ── Torch ───────────────────────────────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try { await (track as any).applyConstraints({ advanced: [{ torch: next }] }); setTorchOn(next); } catch {}
  }, [torchOn]);

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => stopAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scanning) rafRef.current = requestAnimationFrame(animateOverlay);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning, animateOverlay]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
    if (continuous) setManualCode('');
  };

  const isBatchMode = continuous && onConfirmBatch;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ height: '100dvh' }}>

      {/* Header — safe area aware */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}>
        <div className="flex-1 min-w-0 mr-2">
          <h2 className="text-white font-black text-base leading-tight truncate">{title}</h2>
          <p className="text-cyan-300 text-xs">{hint}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {torchAvail && (
            <button onClick={toggleTorch}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'}`}>
              <ZapOff size={18}/>
            </button>
          )}
          <button onClick={() => setFallback(f => !f)}
            className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center">
            <Keyboard size={18}/>
          </button>
          <button onClick={() => { stopAll(); onClose(); }}
            className="w-10 h-10 rounded-full bg-white/20 text-white hover:bg-red-500 flex items-center justify-center transition-all">
            <X size={18}/>
          </button>
        </div>
      </div>

      {/* Camera */}
      {!error && (
        <>
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay/>
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none"/>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <ScanLine size={28} className="text-red-400"/>
          </div>
          <p className="text-red-300 font-bold text-sm">{error}</p>
          <button onClick={startCamera} className="bg-cyan-500 text-black font-black px-6 py-3 rounded-xl text-sm">Reintentar</button>
          <button onClick={() => setFallback(true)} className="bg-white/10 text-white font-bold px-6 py-3 rounded-xl text-sm">Ingresar manualmente</button>
        </div>
      )}

      {/* Bottom area: batch status + confirm button OR scanning indicator */}
      {!error && !fallback && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 pb-safe"
             style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>

          {/* Last scanned in batch mode */}
          {lastResult && continuous && (
            <div className="mx-4 w-full max-w-sm">
              <div className="bg-emerald-500/90 backdrop-blur-sm text-white rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xl">
                <ScanLine size={16} className="shrink-0"/>
                <p className="font-black text-sm font-mono truncate flex-1">{lastResult}</p>
              </div>
            </div>
          )}

          {/* Batch: item count + confirm button */}
          {isBatchMode ? (
            <div className="flex items-center gap-3 px-4 w-full max-w-sm">
              <div className="flex-1 bg-black/60 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                <Package size={18} className="text-cyan-400 shrink-0"/>
                <div>
                  <p className="text-white font-black text-base leading-none">{batchCount}</p>
                  <p className="text-cyan-300 text-[10px] font-bold uppercase tracking-wider">escaneados</p>
                </div>
              </div>
              <button
                onClick={onConfirmBatch}
                className="w-16 h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white flex flex-col items-center justify-center gap-0.5 shadow-2xl shadow-emerald-500/40 active:scale-95 transition-all"
              >
                <CheckCircle2 size={26} strokeWidth={2.5}/>
                <span className="text-[9px] font-black uppercase tracking-wider">Listo</span>
              </button>
            </div>
          ) : (
            scanning && (
              <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"/>
                <span className="text-cyan-300 text-xs font-bold uppercase tracking-widest">Escaneando...</span>
              </div>
            )
          )}
        </div>
      )}

      {/* Manual input overlay */}
      {fallback && (
        <div className="absolute inset-0 z-30 bg-slate-900/97 flex flex-col items-center justify-center px-6 gap-5">
          <ScanLine size={36} className="text-cyan-400"/>
          <p className="text-white font-bold text-center text-sm">Ingresa el código manualmente</p>
          <form onSubmit={handleManualSubmit} className="w-full max-w-xs space-y-3">
            <input
              autoFocus inputMode="numeric" type="text"
              value={manualCode} onChange={e => setManualCode(e.target.value)}
              placeholder="123456789012"
              className="w-full px-4 py-4 text-xl font-mono font-bold rounded-2xl bg-white/10 text-white border border-white/20 outline-none focus:border-cyan-400 text-center tracking-widest"
            />
            <button type="submit" className="w-full py-4 bg-cyan-500 text-black font-black rounded-2xl text-sm tracking-widest">
              CONFIRMAR
            </button>
            {scanning && (
              <button type="button" onClick={() => setFallback(false)} className="w-full py-3 bg-white/10 text-white font-bold rounded-2xl text-sm">
                Volver a Cámara
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

export default BarcodeScanner;
