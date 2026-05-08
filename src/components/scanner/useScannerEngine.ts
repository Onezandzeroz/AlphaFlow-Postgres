'use client';

/**
 * useScannerEngine.ts
 *
 * Scanner engine hook with:
 *   - Quad lock-on: once detected, the overlay persists and tracks the receipt
 *     even if a few frames fail to detect
 *   - Exponential moving average (EMA) smoothing for stable corner positions
 *   - Graduated stillness: small movements decay the counter slowly, not reset to 0
 *   - Auto-capture only (no manual button)
 *
 * Architecture:
 *   - <video> element = visible camera feed (object-cover)
 *   - <canvas ref={overlayCanvasRef}> = overlay for quad trace
 *   - offscreen canvases = OpenCV detection + stillness
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { loadOpenCV } from '@/lib/opencv/loadOpenCV';
import { detectDocumentQuad, type Quad } from '@/lib/opencv/documentDetect';
import { warpAndThreshold } from '@/lib/opencv/perspectiveWarp';

// ── Tuning constants ───────────────────────────────────────────────

// Detection interval: ~20fps (faster = more responsive)
const DETECT_INTERVAL_MS = 50;

// Detection canvas max dimension — keep SMALL for speed
// 480px wide = ~260K pixels vs 2M at 1080p → ~8× faster OpenCV
const DETECT_MAX_DIM = 480;

// Stillness: allow MORE movement (relaxed from 0.025)
const STILL_THRESHOLD = 0.06;          // 6% avg pixel shift = "still enough"
const STILL_HARD_THRESHOLD = 0.15;      // 15% = definitely moving
const STILL_FRAMES_NEEDED = 10;         // Reduced from 15 for faster capture

// Quad lock-on: keep showing overlay for N frames after last detection
const LOCK_MAX_AGE = 60;                // 60 × 80ms = 4.8 seconds of persistence

// EMA smoothing for corner positions (lower = smoother but slower to follow)
const CORNER_SMOOTH_ALPHA = 0.35;

// Camera constraints with fallbacks
const CONSTRAINTS_FULL: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1080, min: 480 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: false,
};

const CONSTRAINTS_RELAXED: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1024 },
    height: { ideal: 720 },
  },
  audio: false,
};

const CONSTRAINTS_MINIMAL: MediaStreamConstraints = {
  video: true,
  audio: false,
};

type Phase = 'loading' | 'permission_pending' | 'scanning' | 'capturing' | 'processing' | 'result' | 'error' | 'dismissed';

export interface ScannerError {
  message: string;
  retryable: boolean;
}

// ── Smart camera selection for multi-lens devices ───────────────────

interface CameraCandidate {
  deviceId: string;
  label: string;
  maxResW: number;
  maxResH: number;
}

/**
 * On multi-lens phones (e.g. Galaxy A53 with 4 rear cameras),
 * `facingMode: 'environment'` often selects the ultrawide or macro lens
 * instead of the main camera — producing lower quality scans.
 *
 * This function:
 *   1. Gets any rear-facing stream to trigger permission + enumerate devices
 *   2. Lists all video devices and tests each rear-facing one
 *   3. Picks the camera with the highest max resolution (= main sensor)
 *   4. Opens a new stream on that specific camera
 *
 * Falls back to simple facingMode if enumeration isn't supported.
 */
async function acquireBestCameraStream(): Promise<MediaStream | null> {
  // Step 1: Get initial stream to trigger permission grant
  // (enumerateDevices() returns empty labels without permission)
  const initialStream = await acquireStreamBasic();
  if (!initialStream) return null;

  try {
    // Step 2: Enumerate all video devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (videoDevices.length <= 1) {
      // Single camera device — nothing to choose, use what we have
      return initialStream;
    }

    // Step 3: Test each device to find the best rear camera
    const candidates: CameraCandidate[] = [];

    for (const device of videoDevices) {
      // Skip devices that are clearly not rear-facing (based on label)
      if (device.label) {
        const label = device.label.toLowerCase();
        // Skip front-facing cameras
        if (label.includes('user') || label.includes('front') || label.includes('facetime')) {
          continue;
        }
        // On Samsung, depth and IR cameras are low-res and useless for scanning
        if (label.includes('depth') || label.includes('ir ') || label.includes('infrared')) {
          continue;
        }
      }

      try {
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: device.deviceId },
            width: { ideal: 4000 },
            height: { ideal: 3000 },
          },
          audio: false,
        });

        const track = testStream.getVideoTracks()[0];
        const settings = track.getSettings();
        let maxW = settings.width || 0;
        let maxH = settings.height || 0;

        // Check capabilities for the true maximum resolution
        try {
          const caps = track.getCapabilities() as { width?: { max: number }; height?: { max: number } };
          if (caps.width?.max && caps.width.max > maxW) maxW = caps.width.max;
          if (caps.height?.max && caps.height.max > maxH) maxH = caps.height.max;
        } catch { /* getCapabilities not supported on some browsers */ }

        // Stop test stream immediately
        testStream.getTracks().forEach(t => t.stop());

        candidates.push({
          deviceId: device.deviceId,
          label: device.label || `camera-${device.deviceId.slice(0, 8)}`,
          maxResW: maxW,
          maxResH: maxH,
        });
      } catch {
        // Can't open this device — skip it
        continue;
      }
    }

    // Stop the initial stream
    initialStream.getTracks().forEach(t => t.stop());

    if (candidates.length === 0) {
      // No valid rear cameras found — fall back
      return acquireStreamBasic();
    }

    // Step 4: Pick the camera with the highest max resolution (main sensor)
    candidates.sort((a, b) => (b.maxResW * b.maxResH) - (a.maxResW * a.maxResH));
    const best = candidates[0];

    console.log(`[ScannerCamera] Selected: ${best.label} (${best.maxResW}×${best.maxResH})`);
    if (candidates.length > 1) {
      console.log(`[ScannerCamera] Rejected: ${candidates.slice(1).map(c => `${c.label} (${c.maxResW}×${c.maxResH})`).join(', ')}`);
    }

    // Step 5: Open stream on the selected camera with ideal resolution
    const bestStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: best.deviceId },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });

    return bestStream;

  } catch (err) {
    console.warn('[ScannerCamera] Smart selection failed, using fallback:', err);
    // Stop initial stream and fall back to basic acquisition
    initialStream.getTracks().forEach(t => t.stop());
    return acquireStreamBasic();
  }
}

/**
 * Basic stream acquisition with constraint fallback chain.
 * Used as fallback when smart camera selection isn't available.
 */
async function acquireStreamBasic(): Promise<MediaStream | null> {
  const attempts = [CONSTRAINTS_FULL, CONSTRAINTS_RELAXED, CONSTRAINTS_MINIMAL];
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      continue;
    }
  }
  return null;
}

// Keep old name as alias for compatibility
async function acquireStream(): Promise<MediaStream | null> {
  return acquireBestCameraStream();
}

// ── Video → display coordinate mapping (object-cover) ───────────────

interface Pt { x: number; y: number; }

function videoToDisplay(pt: Pt, video: HTMLVideoElement, dw: number, dh: number): Pt {
  const va = video.videoWidth / video.videoHeight;
  const da = dw / dh;
  let rw: number, rh: number, ox: number, oy: number;
  if (va > da) {
    rh = dh; rw = dh * va; ox = (dw - rw) / 2; oy = 0;
  } else {
    rw = dw; rh = dw / va; ox = 0; oy = (dh - rh) / 2;
  }
  return {
    x: (pt.x / video.videoWidth) * rw + ox,
    y: (pt.y / video.videoHeight) * rh + oy,
  };
}

// ── Quad smoothing (EMA) ────────────────────────────────────────────

function lerpPt(a: Pt, b: Pt, alpha: number): Pt {
  return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}

function smoothQuad(prev: Quad, fresh: Quad, alpha: number): Quad {
  return {
    tl: lerpPt(prev.tl, fresh.tl, alpha),
    tr: lerpPt(prev.tr, fresh.tr, alpha),
    br: lerpPt(prev.br, fresh.br, alpha),
    bl: lerpPt(prev.bl, fresh.bl, alpha),
  };
}

// ── False-positive filter ───────────────────────────────────────────

function isEdgeQuad(dp: Pt[], dw: number, dh: number): boolean {
  const edgeMargin = 0.03; // Tight margin — only filter obvious full-frame matches
  return dp.every(p =>
    p.x < dw * edgeMargin || p.x > dw * (1 - edgeMargin) ||
    p.y < dh * edgeMargin || p.y > dh * (1 - edgeMargin)
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useScannerEngine() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stillnessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState<Phase>('loading');
  const [quad, setQuad] = useState<Quad | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [scanStatus, setScanStatus] = useState<'searching' | 'found' | 'stable'>('searching');
  const [error, setError] = useState<ScannerError | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);
  const [scannedFile, setScannedFile] = useState<File | null>(null);

  // Detection state refs
  const quadRef = useRef<Quad | null>(null);         // Latest raw detection result
  const lockedQuadRef = useRef<Quad | null>(null);   // Smoothed, persisted quad for overlay
  const lockAgeRef = useRef(0);                       // Frames since last detection confirmed lock
  const stillnessCountRef = useRef(0);
  const prevFrameRef = useRef<Uint8Array | null>(null);
  const capturingRef = useRef(false);
  const scannedUrlRef = useRef<string | null>(null);
  const overlaySizedRef = useRef(false);
  const displayDimsRef = useRef({ dw: 0, dh: 0 });

  // Function refs (break circular dependencies)
  const stopCameraRef = useRef<() => void>(() => {});
  const doCaptureRef = useRef<() => void>(() => {});
  const startDetectionLoopRef = useRef<() => void>(() => {});

  useEffect(() => { scannedUrlRef.current = scannedUrl; }, [scannedUrl]);

  // ── Stop camera (comprehensive cleanup) ──────────────────────────

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    }

    overlaySizedRef.current = false;
    quadRef.current = null;
    lockedQuadRef.current = null;
    lockAgeRef.current = 0;
    stillnessCountRef.current = 0;
    prevFrameRef.current = null;
    capturingRef.current = false;
  }, []);

  useEffect(() => { stopCameraRef.current = stopCamera; }, [stopCamera]);

  // ── Draw overlay on canvas (quad trace on top of video) ──────────

  const drawOverlay = useCallback((
    ctx: CanvasRenderingContext2D,
    dw: number,
    dh: number,
    video: HTMLVideoElement,
    detectedQuad: Quad | null,
    stillCount: number,
    isLocked: boolean,
  ) => {
    ctx.clearRect(0, 0, dw, dh);

    if (!detectedQuad) return;

    const { tl, tr, br, bl } = detectedQuad;
    const dp = [
      videoToDisplay(tl, video, dw, dh),
      videoToDisplay(tr, video, dw, dh),
      videoToDisplay(br, video, dw, dh),
      videoToDisplay(bl, video, dw, dh),
    ];

    // Only run false-positive filter on freshly detected quads, not locked ones
    if (!isLocked && isEdgeQuad(dp, dw, dh)) return;

    const stable = stillCount >= 4;

    // Fill
    ctx.fillStyle = stable ? 'rgba(13, 148, 136, 0.30)' : 'rgba(13, 148, 136, 0.15)';
    ctx.beginPath();
    ctx.moveTo(dp[0].x, dp[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(dp[i].x, dp[i].y);
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.strokeStyle = stable ? 'rgba(45, 212, 191, 1)' : 'rgba(45, 212, 191, 0.9)';
    ctx.lineWidth = stable ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.setLineDash(stable ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner dots
    const r = stable ? 6 : 4;
    for (const p of dp) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = stable ? 'rgba(16, 185, 129, 1)' : 'rgba(45, 212, 191, 0.9)';
      ctx.fill();
      // White center
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }, []);

  // ── Detection loop ───────────────────────────────────────────────

  const startDetectionLoop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      // Guard: don't run if unmounted or capturing
      if (!mountedRef.current || capturingRef.current) return;

      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      const frame = frameCanvasRef.current;
      const stillCanvas = stillnessCanvasRef.current;
      if (!video || !overlay || !frame || !stillCanvas || video.readyState < 2) return;

      // Size overlay canvas to match its CSS display size (once)
      if (!overlaySizedRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const cw = overlay.clientWidth;
        const ch = overlay.clientHeight;
        if (cw === 0 || ch === 0) return;
        overlay.width = cw * dpr;
        overlay.height = ch * dpr;
        const ctx = overlay.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
        overlaySizedRef.current = true;
        displayDimsRef.current = { dw: cw, dh: ch };
      }

      const { dw, dh } = displayDimsRef.current;
      const overlayCtx = overlay.getContext('2d');
      if (!overlayCtx) return;

      // Draw frame to offscreen detection canvas (already at small size)
      const fctx = frame.getContext('2d');
      if (!fctx) return;
      fctx.drawImage(video, 0, 0, frame.width, frame.height);

      // ── Stillness check (graduated — not hard reset) ──────────
      const sctx = stillCanvas.getContext('2d');
      if (sctx) {
        sctx.drawImage(video, 0, 0, 64, 48);
        const imgData = sctx.getImageData(0, 0, 64, 48);
        const currentFrame = new Uint8Array(imgData.data.buffer);
        const prev = prevFrameRef.current;

        if (prev) {
          let sad = 0;
          for (let i = 0; i < currentFrame.length; i += 4) {
            sad += Math.abs(currentFrame[i] - prev[i]);
          }
          const avgSad = sad / (64 * 48) / 255;

          if (avgSad < STILL_THRESHOLD) {
            // Still enough → increment
            stillnessCountRef.current = stillnessCountRef.current + 1;
          } else if (avgSad < STILL_HARD_THRESHOLD) {
            // Slight movement → gentle decay (don't kill progress)
            stillnessCountRef.current = Math.max(0, stillnessCountRef.current - 1);
          } else {
            // Large movement → faster decay but still not instant reset
            stillnessCountRef.current = Math.max(0, stillnessCountRef.current - 3);
          }
        }
        prevFrameRef.current = currentFrame;
      }

      const isCurrentlyStable = stillnessCountRef.current >= 4;

      // ── OpenCV detection with quad lock-on ────────────────────
      try {
        let freshQuad = detectDocumentQuad(frame);

        // Scale quad from detection canvas coords → video resolution coords
        if (freshQuad) {
          const s = parseFloat(frame.dataset.scale || '1');
          if (s !== 1) {
            freshQuad = {
              tl: { x: freshQuad.tl.x / s, y: freshQuad.tl.y / s },
              tr: { x: freshQuad.tr.x / s, y: freshQuad.tr.y / s },
              br: { x: freshQuad.br.x / s, y: freshQuad.br.y / s },
              bl: { x: freshQuad.bl.x / s, y: freshQuad.bl.y / s },
            };
          }
        }

        quadRef.current = freshQuad;

        let displayQuad: Quad | null = null;
        let hasTracking = false;

        if (freshQuad) {
          // Fresh detection — lock on or update
          if (lockedQuadRef.current) {
            // Smooth with EMA for stable tracking
            displayQuad = smoothQuad(lockedQuadRef.current, freshQuad, CORNER_SMOOTH_ALPHA);
          } else {
            displayQuad = freshQuad;
          }
          lockedQuadRef.current = displayQuad;
          lockAgeRef.current = 0;
          hasTracking = true;
        } else if (lockedQuadRef.current) {
          // No fresh detection but we have a lock — keep showing it
          lockAgeRef.current += 1;
          if (lockAgeRef.current < LOCK_MAX_AGE) {
            displayQuad = lockedQuadRef.current;
            hasTracking = true;
          } else {
            // Lost tracking for too long — release lock
            lockedQuadRef.current = null;
          }
        }

        // Update React state for UI indicators
        setQuad(displayQuad);
        const newStatus = hasTracking
          ? (isCurrentlyStable ? 'stable' : 'found')
          : 'searching';
        setScanStatus(newStatus);
        setIsStable(hasTracking && isCurrentlyStable);

        // Draw overlay using the (possibly locked) quad
        drawOverlay(overlayCtx, dw, dh, video, displayQuad, stillnessCountRef.current, hasTracking && lockAgeRef.current > 0);

        // ── Auto-capture: stillness + locked quad ──────────────
        if (
          !capturingRef.current &&
          stillnessCountRef.current >= STILL_FRAMES_NEEDED &&
          hasTracking &&
          lockedQuadRef.current
        ) {
          capturingRef.current = true;
          setTimeout(() => doCaptureRef.current(), 0);
        }
      } catch {
        // On error, keep the locked quad if we had one
        if (lockedQuadRef.current) {
          lockAgeRef.current += 1;
          if (lockAgeRef.current < LOCK_MAX_AGE) {
            drawOverlay(overlayCtx, dw, dh, video, lockedQuadRef.current, stillnessCountRef.current, true);
            setIsStable(isCurrentlyStable);
            setScanStatus(isCurrentlyStable ? 'stable' : 'found');
          } else {
            lockedQuadRef.current = null;
            setQuad(null);
            setScanStatus('searching');
            setIsStable(false);
            overlayCtx.clearRect(0, 0, dw, dh);
          }
        } else {
          quadRef.current = null;
          setQuad(null);
          setScanStatus('searching');
          setIsStable(false);
          overlayCtx.clearRect(0, 0, dw, dh);
        }
      }
    }, DETECT_INTERVAL_MS);
  }, [drawOverlay]);

  useEffect(() => { startDetectionLoopRef.current = startDetectionLoop; }, [startDetectionLoop]);

  // ── Capture + warp ───────────────────────────────────────────────

  const doCapture = useCallback(() => {
    const video = videoRef.current;
    const currentQuad = lockedQuadRef.current || quadRef.current;
    if (!video || !video.videoWidth) return;

    if (!mountedRef.current) return;

    setPhase('capturing');

    // Capture a FULL-RES frame from the video
    const capCanvas = document.createElement('canvas');
    capCanvas.width = video.videoWidth;
    capCanvas.height = video.videoHeight;
    const capCtx = capCanvas.getContext('2d');
    if (capCtx) capCtx.drawImage(video, 0, 0);

    // Flash animation delay
    setTimeout(() => {
      if (!mountedRef.current) return;

      setPhase('processing');
      stopCameraRef.current();

      try {
        let resultCanvas: HTMLCanvasElement;

        if (currentQuad) {
          // Dynamic dimensions — computed from quad proportions inside warpAndThreshold
          resultCanvas = warpAndThreshold(capCanvas, currentQuad);
        } else {
          resultCanvas = capCanvas;
        }

        // The enhanceCanvas pipeline (v5) already produces grayscale output.
        // Just export directly — no redundant pixel pass needed.
        resultCanvas.toBlob(
          (blob) => {
            if (!mountedRef.current) return;
            if (!blob) {
              setError({ message: 'Kunne ikke generere billede.', retryable: true });
              setPhase('error');
              return;
            }

            const file = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            setScannedUrl(url);
            setScannedFile(file);
            setPhase('result');
          },
          'image/jpeg',
          0.82
        );
      } catch (err) {
        console.error('[ScannerEngine] Processing failed:', err);
        if (!mountedRef.current) return;
        setError({ message: 'Kunne ikke behandle billedet. Prøv igen.', retryable: true });
        setPhase('error');
      }
    }, 400);
  }, []);

  useEffect(() => { doCaptureRef.current = doCapture; }, [doCapture]);

  // ── Start camera ─────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    try {
      const stream = await acquireStream();
      if (!stream) {
        setError({ message: 'Kunne ikke få adgang til kameraet.', retryable: true });
        setPhase('error');
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', 'true');
        video.srcObject = stream;
        void video.play().catch(() => {});
      }

      await new Promise<void>((resolve) => {
        const v = video || videoRef.current;
        if (!v || (v.videoWidth && v.videoHeight)) { resolve(); return; }
        const onMeta = () => { resolve(); };
        v?.addEventListener('loadedmetadata', onMeta, { once: true });
        setTimeout(resolve, 2000);
      });

      const currentVideo = videoRef.current;
      const vw = currentVideo?.videoWidth || 640;
      const vh = currentVideo?.videoHeight || 480;

      // Downscale detection canvas for SPEED (480px max dim)
      const maxDim = Math.max(vw, vh);
      const detectScale = maxDim > DETECT_MAX_DIM ? DETECT_MAX_DIM / maxDim : 1;
      const dw = Math.round(vw * detectScale);
      const dh = Math.round(vh * detectScale);

      frameCanvasRef.current = document.createElement('canvas');
      frameCanvasRef.current.width = dw;
      frameCanvasRef.current.height = dh;
      // Store scale factor so we can upscale quad coords back to video resolution
      frameCanvasRef.current.dataset.scale = String(detectScale);

      stillnessCanvasRef.current = document.createElement('canvas');
      stillnessCanvasRef.current.width = 64;
      stillnessCanvasRef.current.height = 48;

      if (mountedRef.current) {
        setPhase('scanning');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Ukendt fejl';
      const isNotAllowed = msg.includes('NotAllowed') || msg.includes('Permission');
      const isNotFound = msg.includes('NotFound');
      setError({
        message: isNotAllowed
          ? 'Kameratilladelse blev afvist. Tillad kameraadgang i browserindstillingerne.'
          : isNotFound
            ? 'Intet kamera fundet på denne enhed.'
            : `Kamerafejl: ${msg}`,
        retryable: !isNotAllowed,
      });
      setPhase('error');
    }
  }, []);

  // ── Discard scan result (free Blob + revoke ObjectURL) ───────────

  /**
   * Revoke the ObjectURL and null out the scanned file/blob so the browser
   * can immediately free the memory. Called before retake, dismiss, and unmount.
   */
  const discardScan = useCallback(() => {
    const url = scannedUrlRef.current;
    if (url) {
      URL.revokeObjectURL(url);
      scannedUrlRef.current = null;
    }
    setScannedUrl(null);
    setScannedFile(null);
  }, []);

  // ── Retake ───────────────────────────────────────────────────────

  const retake = useCallback(() => {
    discardScan();
    setQuad(null);
    setIsStable(false);
    setScanStatus('searching');
    stillnessCountRef.current = 0;
    prevFrameRef.current = null;
    capturingRef.current = false;
    overlaySizedRef.current = false;
    lockedQuadRef.current = null;
    lockAgeRef.current = 0;
    quadRef.current = null;
    setPhase('permission_pending');
  }, [discardScan]);

  // ── Retry ────────────────────────────────────────────────────────

  const retry = useCallback(() => {
    setError(null);
    setPhase('permission_pending');
  }, []);

  // ── Effects ──────────────────────────────────────────────────────

  // Load OpenCV
  useEffect(() => {
    mountedRef.current = true;

    loadOpenCV()
      .then(() => {
        if (mountedRef.current) setPhase('permission_pending');
      })
      .catch((err) => {
        console.error('[ScannerEngine] OpenCV load failed:', err);
        if (mountedRef.current) {
          setError({
            message: 'Kunne ikke indlæse scannersystemet. Tjek din internetforbindelse.',
            retryable: true,
          });
          setPhase('error');
        }
      });

    return () => {
      mountedRef.current = false;
      stopCameraRef.current();
    };
  }, []);

  // Start camera on permission_pending
  const startCameraRef = useRef(startCamera);
  useEffect(() => { startCameraRef.current = startCamera; }, [startCamera]);

  useEffect(() => {
    if (phase === 'permission_pending') {
      startCameraRef.current();
    }
  }, [phase]);

  // Start detection loop when scanning
  useEffect(() => {
    if (phase === 'scanning') {
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          startDetectionLoopRef.current();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      discardScan();
    };
  }, [discardScan]);

  return {
    videoRef,
    overlayCanvasRef,
    phase,
    quad,
    isStable,
    scanStatus,
    error,
    discardScan,
    scannedUrl,
    scannedFile,
    retake,
    retry,
    stopCamera,
  };
}
