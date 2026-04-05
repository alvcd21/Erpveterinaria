/**
 * BarcodeScanner.tsx
 * Cross-browser camera barcode/QR scanner using @zxing/browser.
 * Works on: Chrome, Firefox, Safari, iPhone (iOS Safari), Android, Edge.
 *
 * Features:
 *  - Targeting reticle with animated laser
 *  - Torch toggle when available
 *  - Manual fallback input always available
 *  - Debounce: same code must appear twice before emitting
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/browser';
import { X, ScanLine, Keyboard, ZapOff } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
  /** If true, scanner stays open after each scan */
  continuous?: boolean;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose, title = 'Escanear Código', hint = 'Apunta al código de barras', continuous = false,
}) => {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const readerRef    = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const lastCodeRef  = useRef<string>('');
  const confirmRef   = useRef<number>(0);
  const laserYRef    = useRef<number>(0);
  const laserDirRef  = useRef<number>(1);
  const stoppedRef   = useRef<boolean>(false);

  const [error, setError]         = useState<string>('');
  const [fallback, setFallback]   = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [lastResult, setLastResult] = useState<string>('');
  const [scanning, setScanning]   = useState(false);
  const [torchOn, setTorchOn]     = useState(false);
  const [torchAvail, setTorchAvail] = useState(false);

  // ── Overlay laser animation ─────────────────────────────────────────────────
  const animateOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const oc = overlay.getContext('2d');
    if (!oc) return;

    overlay.width  = overlay.clientWidth  || overlay.offsetWidth;
    overlay.height = overlay.clientHeight || overlay.offsetHeight;
    const W = overlay.width;
    const H = overlay.height;

    // Zone: center 60%×50%
    const zx = W * 0.20;
    const zy = H * 0.25;
    const zw = W * 0.60;
    const zh = H * 0.50;

    // Dark mask
    oc.fillStyle = 'rgba(0,0,0,0.50)';
    oc.fillRect(0, 0, W, H);
    oc.clearRect(zx, zy, zw, zh);

    // Corner brackets
    const cLen = 28; const cTh = 3;
    oc.strokeStyle = '#22d3ee'; oc.lineWidth = cTh;
    const drawCorner = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
      oc.beginPath(); oc.moveTo(x1, y1); oc.lineTo(x2, y2); oc.lineTo(x3, y3); oc.stroke();
    };
    drawCorner(zx, zy, zx + cLen, zy, zx, zy + cLen);
    drawCorner(zx + zw - cLen, zy, zx + zw, zy, zx + zw, zy + cLen);
    drawCorner(zx, zy + zh - cLen, zx, zy + zh, zx + cLen, zy + zh);
    drawCorner(zx + zw - cLen, zy + zh, zx + zw, zy + zh, zx + zw, zy + zh - cLen);

    // Animated laser line
    laserYRef.current += laserDirRef.current * 2;
    if (laserYRef.current >= zh - 2) laserDirRef.current = -1;
    if (laserYRef.current <= 2)      laserDirRef.current = 1;
    const laserY = zy + laserYRef.current;
    const grad = oc.createLinearGradient(zx, laserY, zx + zw, laserY);
    grad.addColorStop(0,   'rgba(34,211,238,0)');
    grad.addColorStop(0.3, 'rgba(34,211,238,0.9)');
    grad.addColorStop(0.7, 'rgba(34,211,238,0.9)');
    grad.addColorStop(1,   'rgba(34,211,238,0)');
    oc.strokeStyle = grad; oc.lineWidth = 2;
    oc.beginPath(); oc.moveTo(zx, laserY); oc.lineTo(zx + zw, laserY); oc.stroke();

    rafRef.current = requestAnimationFrame(animateOverlay);
  }, []);

  // ── Stop everything ─────────────────────────────────────────────────────────
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

    // Get camera stream manually so we can check torch support
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e: any) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError('Permiso de cámara denegado. Activa la cámara en la configuración del navegador.');
      } else if (e.name === 'NotFoundError') {
        setError('No se encontró cámara en este dispositivo.');
      } else {
        setError('Error al iniciar la cámara: ' + (e.message || e.name));
      }
      return;
    }

    streamRef.current = stream;

    // Torch check
    const [track] = stream.getVideoTracks();
    const caps = track.getCapabilities?.() as any;
    if (caps?.torch) setTorchAvail(true);

    // Attach stream to video element
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try {
      await videoRef.current.play();
    } catch {}

    setScanning(true);

    // Start ZXing reader using the existing stream
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    try {
      await reader.decodeFromStream(stream, videoRef.current, (result, err) => {
        if (stoppedRef.current) return;
        if (result) {
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
        }
        // NotFoundException is normal (no barcode in frame), ignore it
      });
    } catch (e: any) {
      if (!stoppedRef.current) {
        setError('Error al iniciar el escáner: ' + (e.message || String(e)));
      }
    }
  }, [onScan, continuous, stopAll]);

  // ── Toggle torch ────────────────────────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {}
  }, [torchOn]);

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => stopAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scanning) {
      rafRef.current = requestAnimationFrame(animateOverlay);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning, animateOverlay]);

  // ── Manual fallback ─────────────────────────────────────────────────────────
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
    if (continuous) setManualCode('');
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col overflow-hidden">

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-gradient-to-b from-black/80 to-transparent">
        <div>
          <h2 className="text-white font-black text-lg tracking-tight">{title}</h2>
          <p className="text-cyan-300 text-xs font-medium">{hint}</p>
        </div>
        <div className="flex gap-2">
          {torchAvail && (
            <button onClick={toggleTorch}
              className={`p-2.5 rounded-full transition-all ${torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'}`}
              title="Linterna">
              <ZapOff size={20}/>
            </button>
          )}
          <button onClick={() => setFallback(f => !f)}
            className="p-2.5 rounded-full bg-white/20 text-white"
            title="Ingresar manualmente">
            <Keyboard size={20}/>
          </button>
          <button onClick={() => { stopAll(); onClose(); }}
            className="p-2.5 rounded-full bg-white/20 text-white hover:bg-red-500 transition-all">
            <X size={20}/>
          </button>
        </div>
      </div>

      {/* Camera feed */}
      {!error && (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline muted autoPlay
          />
          {/* Overlay: dark mask + laser */}
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none"/>
        </>
      )}

      {/* Error state */}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <ScanLine size={32} className="text-red-400"/>
          </div>
          <p className="text-red-300 font-bold text-sm">{error}</p>
          <button onClick={startCamera} className="bg-cyan-500 text-black font-black px-6 py-3 rounded-xl">
            Reintentar
          </button>
          <button onClick={() => setFallback(true)} className="bg-white/10 text-white font-bold px-6 py-3 rounded-xl text-sm">
            Ingresar código manualmente
          </button>
        </div>
      )}

      {/* Manual input overlay */}
      {fallback && (
        <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center px-6 gap-6">
          <ScanLine size={40} className="text-cyan-400"/>
          <p className="text-white font-bold text-center">Ingresa el código manualmente</p>
          <form onSubmit={handleManualSubmit} className="w-full max-w-sm space-y-3">
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Ej: 123456789012"
              className="w-full px-4 py-4 text-lg font-mono font-bold rounded-2xl bg-white/10 text-white border border-white/20 outline-none focus:border-cyan-400 text-center tracking-widest"
            />
            <button type="submit"
              className="w-full py-4 bg-cyan-500 text-black font-black rounded-2xl text-sm tracking-widest">
              CONFIRMAR
            </button>
            {scanning && (
              <button type="button" onClick={() => setFallback(false)}
                className="w-full py-3 bg-white/10 text-white font-bold rounded-2xl text-sm">
                Volver a Cámara
              </button>
            )}
          </form>
        </div>
      )}

      {/* Last scanned result (continuous mode) */}
      {lastResult && continuous && !fallback && (
        <div className="absolute bottom-28 left-4 right-4 z-20 pointer-events-none">
          <div className="bg-emerald-500 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <ScanLine size={18}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Detectado</p>
              <p className="font-black text-sm font-mono truncate">{lastResult}</p>
            </div>
          </div>
        </div>
      )}

      {/* Scanning indicator */}
      {scanning && !fallback && !error && (
        <div className="absolute bottom-8 left-0 right-0 z-20 flex flex-col items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"/>
            <span className="text-cyan-300 text-xs font-bold uppercase tracking-widest">Escaneando...</span>
          </div>
          <p className="text-white/50 text-[10px]">Mantén el código dentro del recuadro</p>
        </div>
      )}
    </div>
  );
};

export default BarcodeScanner;
