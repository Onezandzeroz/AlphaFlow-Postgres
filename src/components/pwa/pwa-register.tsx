'use client';

import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { Download, X, Smartphone, Camera, RefreshCw } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ─── Expected SW version — MUST match CACHE_VERSION in sw.js ────────────
// If this doesn't match the running SW's version, we force an update.
const EXPECTED_SW_VERSION = 'alphaai-v3';

// ─── Camera permission helpers ─────────────────────────────────────────

const CAM_PERMISSION_KEY = 'alphaflow-cam-permission';
const CAM_PROMPT_DISMISSED_KEY = 'alphaflow-cam-prompt-dismissed';
const SW_VERSION_KEY = 'alphaflow-sw-version';
const UPDATE_DISMISSED_KEY = 'alphaflow-update-dismissed';

type CameraPermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported';

function loadCameraState(): CameraPermissionState {
  try {
    const val = localStorage.getItem(CAM_PERMISSION_KEY);
    if (val === 'granted') return 'granted';
    if (val === 'denied') return 'denied';
  } catch { /* ignore */ }
  return 'unknown';
}

function saveCameraState(state: CameraPermissionState) {
  try {
    localStorage.setItem(CAM_PERMISSION_KEY, state);
  } catch { /* ignore */ }
}

function wasCamPromptDismissed(): boolean {
  try {
    const val = localStorage.getItem(CAM_PROMPT_DISMISSED_KEY);
    if (!val) return false;
    return Date.now() - parseInt(val, 10) < 7 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function dismissCamPrompt() {
  try {
    localStorage.setItem(CAM_PROMPT_DISMISSED_KEY, Date.now().toString());
  } catch { /* ignore */ }
}

/**
 * Store the SW version we've confirmed is running.
 * Returns true if we need to force an update (version mismatch or never checked).
 */
function needsSWUpdate(): boolean {
  try {
    const stored = localStorage.getItem(SW_VERSION_KEY);
    return stored !== EXPECTED_SW_VERSION;
  } catch {
    return true;
  }
}

function confirmSWVersion(version: string) {
  try {
    localStorage.setItem(SW_VERSION_KEY, version);
  } catch { /* ignore */ }
}

function wasUpdateDismissedRecently(): boolean {
  try {
    const val = localStorage.getItem(UPDATE_DISMISSED_KEY);
    if (!val) return false;
    return Date.now() - parseInt(val, 10) < 60 * 60 * 1000; // 1 hour
  } catch {
    return false;
  }
}

function dismissUpdateBanner() {
  try {
    localStorage.setItem(UPDATE_DISMISSED_KEY, Date.now().toString());
  } catch { /* ignore */ }
}

// ─── Context to share install state across components ─────────────────────

interface PwaContextValue {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  showInstall: boolean;
  handleInstall: () => Promise<void>;
  dismiss: () => void;
  cameraState: CameraPermissionState;
  requestCameraPermission: () => Promise<boolean>;
  showCameraPrompt: boolean;
  dismissCameraPrompt: () => void;
}

const PwaContext = createContext<PwaContextValue>({
  deferredPrompt: null,
  isInstalled: false,
  showInstall: false,
  handleInstall: async () => {},
  dismiss: () => {},
  cameraState: 'unknown',
  requestCameraPermission: async () => false,
  showCameraPrompt: false,
  dismissCameraPrompt: () => {},
});

export function usePwaInstall() {
  return useContext(PwaContext);
}

// ─── Provider: registers SW & enforces version ───────────────────────────

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false
  );
  const [dismissed, setDismissed] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  const [cameraState, setCameraState] = useState<CameraPermissionState>(() => {
    if (typeof window === 'undefined') return 'unknown';
    return loadCameraState();
  });
  const [showCameraPrompt, setShowCameraPrompt] = useState(false);

  // ─── Effects ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let versionCheckTimeout: ReturnType<typeof setTimeout> | undefined;
    let updateInterval: ReturnType<typeof setInterval> | undefined;

    // Register the service worker
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] SW registered, scope:', registration.scope);

        // ── STEP 1: Query the running SW for its version ──
        // We post a message to the active SW. If it responds with the
        // expected version, great. If it doesn't respond (old SW) or
        // responds with a different version, we force an update.
        const checkVersion = () => {
          if (navigator.serviceWorker.controller) {
            // Clear any previous timeout
            if (versionCheckTimeout) clearTimeout(versionCheckTimeout);

            versionCheckTimeout = setTimeout(() => {
              // SW didn't respond within 2 seconds — it's an old version
              console.log('[PWA] SW version check timeout — forcing update');
              registration.update();
            }, 2000);

            navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
          } else {
            // No controller — SW might still be installing
            console.log('[PWA] No active SW controller, will check on next activation');
          }
        };

        // Listen for version response from the SW
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'VERSION') {
            if (versionCheckTimeout) clearTimeout(versionCheckTimeout);

            const swVersion = event.data.version;
            console.log('[PWA] SW reports version:', swVersion, ', expected:', EXPECTED_SW_VERSION);

            if (swVersion === EXPECTED_SW_VERSION) {
              confirmSWVersion(swVersion);
              setShowUpdateBanner(false);
            } else {
              // Wrong version — force update
              console.log('[PWA] SW version mismatch, forcing update');
              registration.update();
            }
          }

          if (event.data?.type === 'CACHES_CLEARED') {
            console.log('[PWA] All SW caches cleared, reloading...');
            window.location.replace(
              window.location.pathname + '?_upd=' + Date.now()
            );
          }
        };

        navigator.serviceWorker.addEventListener('message', handleMessage);

        // ── STEP 2: Handle SW update lifecycle ──
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          console.log('[PWA] New SW found, state:', newWorker.state);

          newWorker.addEventListener('statechange', () => {
            console.log('[PWA] New SW state:', newWorker.state);

            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // A new SW was installed while we already have one controlling.
                // Tell the new SW to skip waiting and take over immediately.
                newWorker.postMessage({ type: 'SKIP_WAITING' });

                // Show update banner or auto-reload
                if (needsSWUpdate() && !wasUpdateDismissedRecently()) {
                  setShowUpdateBanner(true);
                } else {
                  // Auto-reload with cache-busting URL
                  console.log('[PWA] Reloading to activate new SW...');
                  window.location.replace(
                    window.location.pathname + '?_upd=' + Date.now()
                  );
                }
              }
            }

            if (newWorker.state === 'activated') {
              // New SW is now active — confirm version and reload
              console.log('[PWA] New SW activated, confirming version');
              confirmSWVersion(EXPECTED_SW_VERSION);
              // The reload happens from the 'installed' handler above
            }
          });
        });

        // ── STEP 3: Periodic update checks ──
        // Check for SW updates every time the page loads
        registration.update();

        // Also check every 5 minutes (more aggressive than before)
        updateInterval = setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);

        // ── STEP 4: Initial version check ──
        // Wait a beat for the SW to be ready, then check version
        if (navigator.serviceWorker.controller) {
          setTimeout(checkVersion, 500);
        }

        // ── STEP 5: Nuclear fallback — if version was never confirmed ──
        // If after 3 seconds we still haven't confirmed the right version,
        // ask the SW to clear all caches and force a reload
        setTimeout(() => {
          if (needsSWUpdate()) {
            console.log('[PWA] Nuclear fallback: clearing caches');
            // Send message to SW to clear caches
            if (navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
            }
            // Also clear from the cache API directly (in case SW doesn't respond)
            caches.keys().then((names) => {
              Promise.all(names.map((n) => caches.delete(n))).then(() => {
                // Force the SW to update after clearing caches
                registration.update();
              });
            });
          }
        }, 3000);
      })
      .catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });

    return () => {
      if (versionCheckTimeout) clearTimeout(versionCheckTimeout);
      if (updateInterval) clearInterval(updateInterval);
    };
  }, []);

  // ─── Install event listeners ─────────────────────────────────────
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    let cameraPromptTimer: ReturnType<typeof setTimeout> | undefined;

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      const camState = loadCameraState();
      if (camState !== 'granted' && camState !== 'denied' && !wasCamPromptDismissed()) {
        cameraPromptTimer = setTimeout(() => setShowCameraPrompt(true), 1500);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // ─── Camera prompt for already-installed (standalone) mode ────
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      const camState = loadCameraState();
      if (camState !== 'granted' && camState !== 'denied' && !wasCamPromptDismissed()) {
        cameraPromptTimer = setTimeout(() => setShowCameraPrompt(true), 1500);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (cameraPromptTimer) clearTimeout(cameraPromptTimer);
    };
  }, []);

  /** Reload to apply the new SW version */
  const handleUpdateReload = useCallback(() => {
    setShowUpdateBanner(false);
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    // Small delay to let the SW skip waiting
    setTimeout(() => {
      window.location.replace(window.location.pathname + '?_upd=' + Date.now());
    }, 300);
  }, []);

  const handleDismissUpdate = useCallback(() => {
    setShowUpdateBanner(false);
    dismissUpdateBanner();
  }, []);

  const dismissCameraPrompt = useCallback(() => {
    dismissCamPrompt();
    setShowCameraPrompt(false);
    setCameraState('denied');
    saveCameraState('denied');
  }, []);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unsupported');
      saveCameraState('unsupported');
      setShowCameraPrompt(false);
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      stream.getTracks().forEach(t => t.stop());
      setCameraState('granted');
      saveCameraState('granted');
      setShowCameraPrompt(false);
      return true;
    } catch (err) {
      const errorName = err instanceof DOMException ? err.name : '';
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setCameraState('denied');
        saveCameraState('denied');
      } else {
        setCameraState('unsupported');
        saveCameraState('unsupported');
      }
      setShowCameraPrompt(false);
      return false;
    }
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setDismissed(true);
  };

  const showInstall = !isInstalled && !!deferredPrompt && !dismissed;

  const ctx = {
    deferredPrompt,
    isInstalled,
    showInstall,
    handleInstall,
    dismiss,
    cameraState,
    requestCameraPermission,
    showCameraPrompt,
    dismissCameraPrompt,
  };

  return (
    <PwaContext.Provider value={ctx}>
      {children}
      {/* ── Update available banner ── */}
      <UpdateBanner
        visible={showUpdateBanner}
        onReload={handleUpdateReload}
        onDismiss={handleDismissUpdate}
      />
    </PwaContext.Provider>
  );
}

// ─── Update banner — shown when a new SW is detected ────────────────────

function UpdateBanner({
  visible,
  onReload,
  onDismiss,
}: {
  visible: boolean;
  onReload: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex justify-center p-3 animate-in slide-in-from-top-2 duration-300">
      <div className="w-full max-w-md rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-xl shadow-teal-700/30 p-3.5">
        <div className="flex items-center gap-3">
          <div className="shrink-0 h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center">
            <RefreshCw className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Opdatering tilgængelig</p>
            <p className="text-xs text-white/70 mt-0.5">
              En ny version af appen er klar. Opdater for at få de seneste forbedringer.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onReload}
              className="px-3.5 py-2 rounded-lg bg-white text-teal-700 text-sm font-semibold hover:bg-white/90 active:scale-[0.97] transition-all"
            >
              Opdater
            </button>
            <button
              onClick={onDismiss}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Luk"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab banner — positioned top-left, hangs below browser address bar ──

export function PwaInstallBanner() {
  const { showInstall, handleInstall, dismiss } = usePwaInstall();

  if (!showInstall) return null;

  return (
    <>
      <div className="hidden sm:block fixed top-0 left-6 lg:left-[268px] z-[60]">
        <div className="relative bg-gradient-to-b from-[#0d9488] to-[#0f766e] rounded-b-xl shadow-lg shadow-[#0d9488]/25 animate-in slide-in-from-top-2 duration-300">
          <div className="absolute -top-0.5 left-0 w-0 h-0 border-t-[6px] border-t-transparent border-r-[14px] border-r-[#0d9488]" />

          <div className="flex items-center gap-3 px-4 pt-3 pb-3.5">
            <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <Smartphone className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-xs font-semibold text-white leading-tight">
                Installer som app
              </p>
              <p className="text-[10px] text-white/70 leading-snug mt-0.5">
                Hurtig adgang fra din hjemmeskærm
              </p>
            </div>
            <button
              onClick={handleInstall}
              className="ml-1 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors duration-150 active:scale-[0.97]"
            >
              <Download className="h-3 w-3" />
              Installer
            </button>
            <button
              onClick={dismiss}
              className="shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
              aria-label="Luk"
            >
              <X className="h-3.5 w-3.5 text-white/60 hover:text-white" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Post-install camera permission prompt ───────────────────────────────

export function PostInstallCameraPrompt() {
  const { showCameraPrompt, requestCameraPermission, dismissCameraPrompt } = usePwaInstall();
  const [requesting, setRequesting] = useState(false);

  if (!showCameraPrompt) return null;

  const handleAllow = async () => {
    setRequesting(true);
    await requestCameraPermission();
    setRequesting(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-[55] flex justify-center px-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1f1e] border border-gray-200 dark:border-[#2a3330] shadow-xl p-4">
        <button
          onClick={dismissCameraPrompt}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Luk"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>

        <div className="flex items-start gap-3">
          <div className="shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shadow-sm">
            <Camera className="h-5 w-5 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Aktiver kamera-scanning
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Tillad kameraadgang for at scanne kvitteringer direkte i appen.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleAllow}
                disabled={requesting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#0d9488] hover:bg-[#0f766e] text-white transition-colors shadow-sm active:scale-[0.98] disabled:opacity-60"
              >
                {requesting ? (
                  <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {requesting ? 'Anmoder...' : 'Tillad kamera'}
              </button>
              <button
                onClick={dismissCameraPrompt}
                className="px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                Senere
              </button>
            </div>

            <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
              Du kan altid ændre dette i browserens indstillinger
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
