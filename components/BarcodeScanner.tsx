/**
 * BarcodeScanner.tsx — High-performance barcode/QR scanner.
 *
 * Improvements over the previous version:
 *  - Custom rAF decode loop with canvas preprocessing (contrast + brightness boost)
 *  - Scan zone crop: only the center rectangle is sent to the decoder (smaller = faster)
 *  - TRY_HARDER + limited POSSIBLE_FORMATS hints for ZXing
 *  - Single-confirmation (no double-scan delay)
 *  - inputMode="text" for the manual input field (allows letters, numbers, symbols)
 *  - Better camera constraints with graceful fallback for low-end devices
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BinaryBitmap,
  DecodeHintType,
  BarcodeFormat,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
} from '@zxing/library';
import { HTMLCanvasElementLuminanceSource } from '@zxing/browser';
import { X, ScanLine, Keyboard, ZapOff, CheckCircle2, Package } from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── ZXing reader with optimized hints ────────────────────────────────────────

function buildReader(): MultiFormatReader {
  const hints = new Map<DecodeHintType, any>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.ITF,
    BarcodeFormat.PDF_417,
  ]);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  return reader;
}

// ─── Component ────────────────────────────────────────────────────────────────

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose,
  title      = 'Escanear Código',
  hint       = 'Apunta al código de barras o QR',
  continuous    = false,
  batchCount    = 0,
  onConfirmBatch,
}) => {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const overlayRef     = useRef<HTMLCanvasElement>(null);   // visible UI overlay
  const captureRef     = useRef<HTMLCanvasElement>(null);   // hidden processing canvas
  const streamRef      = useRef<MediaStream | null>(null);
  const readerRef      = useRef<MultiFormatReader>(buildReader());
  const rafRef         = useRef<number>(0);
  const rafOverlayRef  = useRef<number>(0);
  const stoppedRef     = useRef<boolean>(false);
  const lastCodeRef    = useRef<string>('');
  const cooldownRef    = useRef<boolean>(false);
  const laserYRef      = useRef<number>(0);
  const laserDirRef    = useRef<number>(1);

  const [error,      setError]      = useState('');
  const [fallback,   setFallback]   = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [lastResult, setLastResult] = useState('');
  const [scanning,   setScanning]   = useState(false);
  const [torchOn,    setTorchOn]    = useState(false);
  const [torchAvail, setTorchAvail] = useState(false);
  const [flashBg,    setFlashBg]    = useState(false);   // green flash on success

  // ── Stop everything ──────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(rafOverlayRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ── Overlay animation (laser line + corners) ─────────────────────────────────
  const animateOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const oc = overlay.getContext('2d');
    if (!oc) return;

    overlay.width  = overlay.clientWidth  || overlay.offsetWidth  || 320;
    overlay.height = overlay.clientHeight || overlay.offsetHeight || 480;
    const W = overlay.width;
    const H = overlay.height;

    // Tighter scan zone for faster decode (70% wide, 38% tall centered)
    const zx = W * 0.12;
    const zy = H * 0.30;
    const zw = W * 0.76;
    const zh = H * 0.40;

    oc.fillStyle = 'rgba(0,0,0,0.60)';
    oc.fillRect(0, 0, W, H);
    oc.clearRect(zx, zy, zw, zh);

    // Corner brackets
    const cLen = 22; const cTh = 3;
    oc.strokeStyle = '#22d3ee'; oc.lineWidth = cTh;
    const corner = (x1:number,y1:number,x2:number,y2:number,x3:number,y3:number) => {
      oc.beginPath(); oc.moveTo(x1,y1); oc.lineTo(x2,y2); oc.lineTo(x3,y3); oc.stroke();
    };
    corner(zx,zy,       zx+cLen,zy,    zx,zy+cLen);
    corner(zx+zw-cLen,zy, zx+zw,zy,    zx+zw,zy+cLen);
    corner(zx,zy+zh-cLen, zx,zy+zh,    zx+cLen,zy+zh);
    corner(zx+zw-cLen,zy+zh, zx+zw,zy+zh, zx+zw,zy+zh-cLen);

    // Laser line
    laserYRef.current += laserDirRef.current * 2.5;
    if (laserYRef.current >= zh - 2) laserDirRef.current = -1;
    if (laserYRef.current <= 2)      laserDirRef.current =  1;
    const ly = zy + laserYRef.current;
    const g = oc.createLinearGradient(zx, ly, zx+zw, ly);
    g.addColorStop(0,   'rgba(34,211,238,0)');
    g.addColorStop(0.25,'rgba(34,211,238,0.9)');
    g.addColorStop(0.75,'rgba(34,211,238,0.9)');
    g.addColorStop(1,   'rgba(34,211,238,0)');
    oc.strokeStyle = g; oc.lineWidth = 2;
    oc.beginPath(); oc.moveTo(zx, ly); oc.lineTo(zx+zw, ly); oc.stroke();

    rafOverlayRef.current = requestAnimationFrame(animateOverlay);
  }, []);

  // ── Decode loop (canvas-based with preprocessing) ────────────────────────────
  const decodeLoop = useCallback(() => {
    if (stoppedRef.current) return;

    const video   = videoRef.current;
    const capture = captureRef.current;
    if (!video || !capture || video.readyState < 2 || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(decodeLoop);
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // ── Compute crop region matching the visible scan zone ──────────────────
    // The overlay is sized to the viewport; map the scan zone fraction to video pixels.
    // Zone: x=12%, y=30%, w=76%, h=40% of the display — we crop the same proportions
    // from the video feed for faster decoding.
    const cx = Math.floor(vw * 0.12);
    const cy = Math.floor(vh * 0.30);
    const cw = Math.floor(vw * 0.76);
    const ch = Math.floor(vh * 0.40);

    capture.width  = cw;
    capture.height = ch;

    const ctx = capture.getContext('2d', { willReadFrequently: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(decodeLoop); return; }

    // ── Draw cropped zone with image enhancements ───────────────────────────
    // contrast(1.6) + brightness(1.15) helps low-res / out-of-focus cameras
    ctx.filter = 'contrast(1.6) brightness(1.15) saturate(0)';
    ctx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);
    ctx.filter = 'none';

    // ── Attempt ZXing decode ────────────────────────────────────────────────
    try {
      const luminance = new HTMLCanvasElementLuminanceSource(capture);
      const bitmap    = new BinaryBitmap(new HybridBinarizer(luminance));
      const result    = readerRef.current.decode(bitmap);
      const code      = result.getText().trim();

      if (code && code !== lastCodeRef.current && !cooldownRef.current) {
        cooldownRef.current = true;
        lastCodeRef.current = code;
        setLastResult(code);
        setFlashBg(true);
        setTimeout(() => setFlashBg(false), 300);

        // Haptic feedback on mobile
        try { navigator.vibrate?.(60); } catch {}

        onScan(code);
        if (!continuous) {
          stopAll();
          return;
        }
        // In batch mode, reset after short cooldown to allow next scan
        setTimeout(() => {
          lastCodeRef.current = '';
          cooldownRef.current = false;
        }, 1200);
      }
    } catch (e) {
      // NotFoundException is normal — no barcode in this frame
      if (!(e instanceof NotFoundException)) {
        // Unexpected error — reset lastCode to allow retry
        lastCodeRef.current = '';
      }
    }

    if (!stoppedRef.current) {
      rafRef.current = requestAnimationFrame(decodeLoop);
    }
  }, [onScan, continuous, stopAll]);

  // ── Torch toggle ─────────────────────────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {}
  }, [torchOn]);

  // ── Start camera ─────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    stoppedRef.current = false;
    lastCodeRef.current = '';
    cooldownRef.current = false;
    setError('');
    setScanning(false);

    // Try best quality first, fall back to any available camera
    const constraints: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920, min: 640 }, height: { ideal: 1080, min: 480 }, advanced: [{ focusMode: 'continuous' } as any] }, audio: false },
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false },
    ];

    let stream: MediaStream | null = null;
    for (const c of constraints) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch {}
    }

    if (!stream) {
      setError('No se pudo acceder a la cámara. Verifica los permisos en la configuración del navegador.');
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
    rafRef.current      = requestAnimationFrame(decodeLoop);
    rafOverlayRef.current = requestAnimationFrame(animateOverlay);
  }, [decodeLoop, animateOverlay]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => stopAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
    if (continuous) setManualCode('');
    else { stopAll(); }
  };

  const isBatchMode = continuous && onConfirmBatch;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ height: '100dvh' }}>

      {/* Green flash on scan */}
      {flashBg && <div className="absolute inset-0 z-50 bg-emerald-400/30 pointer-events-none animate-ping" style={{ animationDuration: '0.3s', animationIterationCount: 1 }}/>}

      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}>
        <div className="flex-1 min-w-0 mr-2">
          <h2 className="text-white font-black text-base leading-tight truncate">{title}</h2>
          <p className="text-cyan-300 text-xs">{hint}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {torchAvail && (
            <button onClick={toggleTorch}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'}`}
              title="Linterna">
              <ZapOff size={18}/>
            </button>
          )}
          <button onClick={() => setFallback(f => !f)}
            className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center"
            title="Ingresar código manualmente">
            <Keyboard size={18}/>
          </button>
          <button onClick={() => { stopAll(); onClose(); }}
            className="w-10 h-10 rounded-full bg-white/20 text-white hover:bg-red-500 flex items-center justify-center transition-all">
            <X size={18}/>
          </button>
        </div>
      </div>

      {/* Camera feed */}
      {!error && (
        <>
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay/>
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none"/>
          {/* Hidden processing canvas — never visible */}
          <canvas ref={captureRef} className="hidden"/>
        </>
      )}

      {/* Error state */}
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

      {/* Bottom: status / batch */}
      {!error && !fallback && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 pb-safe"
             style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>

          {lastResult && continuous && (
            <div className="mx-4 w-full max-w-sm">
              <div className="bg-emerald-500/90 backdrop-blur-sm text-white rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xl">
                <ScanLine size={16} className="shrink-0"/>
                <p className="font-black text-sm font-mono truncate flex-1">{lastResult}</p>
              </div>
            </div>
          )}

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
          <div className="text-center space-y-1">
            <p className="text-white font-bold text-sm">Ingresa el código manualmente</p>
            <p className="text-slate-400 text-xs">Acepta números, letras y símbolos</p>
          </div>
          <form onSubmit={handleManualSubmit} className="w-full max-w-xs space-y-3">
            <input
              autoFocus
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value.toUpperCase())}
              placeholder="Ej: ABC-12345 / 7501234"
              className="w-full px-4 py-4 text-lg font-mono font-bold rounded-2xl bg-white/10 text-white border border-white/20 outline-none focus:border-cyan-400 text-center tracking-widest"
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
