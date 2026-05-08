'use client';

/**
 * ReceiptScanner.tsx
 *
 * OpenCV-powered receipt scanner.
 *
 * Architecture:
 *   <video> = visible camera feed (object-cover handles aspect ratio)
 *   <canvas> = overlay ONLY (quad trace drawn on top of video, pointer-events-none)
 *   offscreen canvas = OpenCV detection (never rendered to DOM)
 *
 * CRITICAL: Uses createPortal to render on document.body so it escapes any
 * parent stacking contexts (e.g. Radix Dialog with CSS transforms that break
 * `fixed` positioning).
 *
 * IMPORTANT: The root div has data-scanner-portal attribute so the parent
 * Dialog can detect pointer events inside the scanner and not treat them
 * as "outside clicks" that would close the dialog.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScannerEngine } from './useScannerEngine';
import {
  Camera,
  X,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CheckCircle,
  RotateCcw,
} from 'lucide-react';

// ─── Props (drop-in compatible with old AutoReceiptCameraScanner) ───

export interface ReceiptScannerProps {
  onCapture: (file: File) => void;
  onDismiss?: () => void;
  className?: string;
  autoStart?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ReceiptScanner({
  onCapture,
  onDismiss,
  className = '',
}: ReceiptScannerProps) {
  const {
    videoRef,
    overlayCanvasRef,
    phase,
    scanStatus,
    error,
    scannedUrl,
    scannedFile,
    discardScan,
    retake,
    retry,
  } = useScannerEngine();

  // Callback refs (stable references, no stale closures)
  const onCaptureRef = useRef(onCapture);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onCaptureRef.current = onCapture; }, [onCapture]);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  const handleUse = () => {
    if (!scannedFile) return;
    const file = scannedFile;
    discardScan(); // Revoke ObjectURL — file is now owned by consumer
    onCaptureRef.current(file);
  };

  const handleDismiss = () => {
    discardScan(); // Free Blob + revoke ObjectURL immediately
    onDismissRef.current?.();
  };

  // ── Render ───────────────────────────────────────────────────────

  if (phase === 'dismissed') return null;

  // Keep video visible during processing too so the frozen frame stays behind
  // the opaque overlay — prevents a black flash when stopCamera() kills the stream.
  const showVideo = phase === 'scanning' || phase === 'capturing' || phase === 'processing';
  const showResult = phase === 'result' && scannedUrl;

  const content = (
    <div
      data-scanner-portal
      className={`fixed inset-0 z-[9999] flex flex-col bg-black ${className}`}
      role="dialog"
      aria-label="Kvitteringsscanner"
    >
      {/* ── Camera phases: video + overlays ── */}
      <div className={`relative flex-1 ${showResult ? 'hidden' : ''}`}>

        {/* ── Video: the ONLY visible camera feed ── */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${showVideo ? '' : 'hidden'}`}
          playsInline
          muted
          aria-hidden="true"
        />

        {/* ── Loading OpenCV ── */}
        {phase === 'loading' && <LoadingScreen />}

        {/* ── Permission pending ── */}
        {phase === 'permission_pending' && <PermissionScreen />}

        {/* ── Scanning (overlay + controls on top of video) ── */}
        {phase === 'scanning' && (
          <>
            {/* Overlay canvas: ONLY the quad trace, not the video feed */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Cancel button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 left-4 z-20 flex items-center justify-center w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-colors active:scale-95"
              aria-label="Annuller scanning"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Status indicator — auto-capture only, no manual button */}
            <div className="absolute bottom-0 inset-x-0 z-20 pb-8 pt-16 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex flex-col items-center">
                {/* Animated status dot */}
                <div className={`w-3 h-3 rounded-full mb-3 transition-colors ${
                  scanStatus === 'stable'
                    ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50'
                    : scanStatus === 'found'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-white/40 animate-pulse'
                }`} />
                <p className="text-center text-white/90 text-sm font-medium mb-1">
                  {scanStatus === 'stable'
                    ? 'Holder stil – optager automatisk…'
                    : scanStatus === 'found'
                      ? 'Kvittering fundet – hold rolig'
                      : 'Placér kvitteringen i rammen'}
                </p>
                <p className="text-center text-white/40 text-xs">
                  {scanStatus === 'searching'
                    ? 'Søger efter kvitteringskanter…'
                    : scanStatus === 'found'
                      ? 'Bevæg ikke kameraet'
                      : 'Automatisk optagelse aktiveret'}
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── Capturing (flash on top of video) ── */}
        {phase === 'capturing' && (
          <div
            className="absolute inset-0 z-10 bg-white pointer-events-none"
            style={{ animation: 'captureFlash 400ms ease-out forwards' }}
          />
        )}

        {/* ── Processing (opaque overlay on top of frozen video) ── */}
        {phase === 'processing' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black p-6 text-center">
            <div className="relative mb-5">
              <div className="absolute -inset-2 rounded-full bg-teal-400/15 animate-ping" style={{ animationDuration: '1.5s' }} />
              <Loader2 className="relative h-10 w-10 text-teal-400 animate-spin" />
            </div>
            <p className="text-white/80 text-sm font-medium">Behandler kvittering…</p>
            <p className="text-xs text-white/40 mt-1.5">Tilpasser perspektiv og beskærer</p>
          </div>
        )}

        {/* ── Error ── */}
        {phase === 'error' && error && (
          <ErrorScreen
            message={error.message}
            retryable={error.retryable}
            onRetry={retry}
            onDismiss={handleDismiss}
          />
        )}
      </div>

      {/* ── Result screen: completely separate from camera ── */}
      {showResult && (
        <div className="flex flex-col h-full bg-white dark:bg-[#1a1f1e]">
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white text-center">
              Kvittering scannet
            </h3>
          </div>

          {/* Scrollable image area */}
          <div className="flex-1 overflow-auto p-4">
            <div className="w-full max-w-lg mx-auto">
              <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-900/50 shadow-sm">
                <img
                  src={scannedUrl}
                  alt="Scannet kvittering"
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>

          {/* Action buttons — explicitly positioned with touch-manipulation for mobile */}
          <div className="shrink-0 relative z-10 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1f1e] px-3 sm:px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2 sm:gap-3 max-w-lg mx-auto">
              <button
                type="button"
                onClick={handleDismiss}
                style={{ touchAction: 'manipulation' }}
                className="cursor-pointer flex items-center justify-center gap-1 h-12 px-4 sm:px-5 rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 font-medium text-sm active:scale-[0.97] transition-all shrink-0 min-w-[48px]"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Annuller</span>
              </button>
              <button
                type="button"
                onClick={handleUse}
                style={{ touchAction: 'manipulation' }}
                className="cursor-pointer flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] active:bg-[#0a7c72] text-white font-semibold text-sm shadow-lg shadow-teal-600/20 active:scale-[0.97] transition-all"
              >
                <CheckCircle className="h-5 w-5" />
                <span>Brug denne kvittering</span>
              </button>
              <button
                type="button"
                onClick={retake}
                style={{ touchAction: 'manipulation' }}
                className="cursor-pointer flex items-center justify-center gap-1 h-12 px-4 sm:px-5 rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/10 text-[#0d9488] dark:text-[#2dd4bf] font-medium text-sm active:scale-[0.97] transition-all shrink-0 min-w-[48px]"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Prøv igen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes captureFlash {
          0%   { opacity: 0; }
          12%  { opacity: 0.85; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );

  // Portal to body to escape any parent stacking contexts (e.g. Radix Dialog with CSS transforms)
  if (typeof window !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUB-COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="relative mb-5">
        {/* Outer pulsing ring */}
        <div className="absolute -inset-2 rounded-3xl bg-teal-400/20 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
          <Camera className="h-8 w-8 text-white" />
        </div>
      </div>
      <div className="h-8 w-8 rounded-full border-[3px] border-white/20 border-t-teal-400 animate-spin mb-4" />
      <p className="text-sm text-white/80 font-medium">Indlæser scanner…</p>
      <p className="text-xs text-white/40 mt-1.5">Forbereder billedgenkendelse</p>
    </div>
  );
}

function PermissionScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="relative mb-5">
        <div className="h-16 w-16 rounded-full border-[3px] border-white/15 border-t-teal-400 animate-spin" />
      </div>
      <p className="text-sm text-white/80 font-medium">Venter på kameratilladelse…</p>
      <p className="text-xs text-white/40 mt-1.5">Tillad kameraadgang i browseren</p>
    </div>
  );
}

function ErrorScreen({
  message,
  retryable,
  onRetry,
  onDismiss,
}: {
  message: string;
  retryable: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-red-500/20 flex items-center justify-center mb-5">
        <AlertTriangle className="h-7 w-7 text-red-400" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">{message}</h2>
      <div className="flex items-center gap-3 mt-4">
        {retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors min-h-[48px]"
          >
            <RefreshCw className="h-4 w-4" />
            Prøv igen
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors min-h-[48px]"
        >
          <X className="h-4 w-4" />
          Luk
        </button>
      </div>
    </div>
  );
}
