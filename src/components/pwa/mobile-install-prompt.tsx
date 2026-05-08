'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePwaInstall } from '@/components/pwa/pwa-register';
import { X, Smartphone, Share2, Download, MonitorUp } from 'lucide-react';

const STORAGE_KEY = 'alphaflow-mobile-install-dismissed';

// ─── Helpers ──────────────────────────────────────────────────────────

function detectPlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

function getDismissedAt(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

function setDismissed(): void {
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

// ─── Component ────────────────────────────────────────────────────────

export function MobileInstallPrompt() {
  const { isInstalled, handleInstall, showInstall } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [platform] = useState<'ios' | 'android' | 'other'>(() => {
    if (typeof window === 'undefined') return 'other';
    return detectPlatform();
  });

  // Decide visibility based on platform and install state
  useEffect(() => {
    if (isInstalled) return;

    // Only show on actual mobile devices (not desktop)
    const isMobile = platform === 'ios' || platform === 'android';
    if (!isMobile) return;

    // Check if dismissed recently (within 3 days = 259200000ms)
    const dismissedAt = getDismissedAt();
    const now = Date.now();
    if (now - dismissedAt < 259_200_000) return;

    // Delay showing by 2 seconds so the page loads first
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [isInstalled, platform]);

  const handleDismiss = useCallback(() => {
    setDismissed();
    setVisible(false);
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (showInstall) {
      // Android Chrome: use the native prompt
      await handleInstall();
      return;
    }
    // iOS: can't trigger install programmatically, just dismiss
    handleDismiss();
  }, [showInstall, handleInstall, handleDismiss]);

  if (!visible || isInstalled) return null;

  return (
    <div className="lg:hidden relative w-full mb-4 animate-in slide-in-from-bottom-2 duration-500">
      <div className="relative rounded-2xl bg-white dark:bg-[#1a1f1e] border border-gray-200 dark:border-[#2a3330] shadow-lg p-4">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Luk"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shadow-sm">
            <Smartphone className="h-5 w-5 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Få fuld skærm
            </p>

            {platform === 'ios' && (
              <div className="mt-1.5 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Installer som app for at fjerne browser-linjen. Tryk på
                  <span className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[10px] font-bold text-gray-700 dark:text-gray-300 align-middle">
                    <Share2 className="h-3 w-3" />
                    Del
                  </span>
                  i bunden af Safari, vælg
                  <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[10px] font-bold text-gray-700 dark:text-gray-300 align-middle">
                    Føj til hjemmeskærm
                  </span>
                </p>
              </div>
            )}

            {platform === 'android' && (
              <div className="mt-1.5 space-y-2">
                {showInstall ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Installer AlphaFlow som app for fuld skærm uden browser-linje.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Tryk på
                    <span className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[10px] font-bold text-gray-700 dark:text-gray-300 align-middle">
                      ⋮
                    </span>
                    i Chromes adresselinje og vælg
                    <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[10px] font-bold text-gray-700 dark:text-gray-300 align-middle">
                      Føj til hjemmeskærm
                    </span>
                  </p>
                )}
              </div>
            )}

            {(showInstall && platform === 'android') && (
              <button
                onClick={handleInstallClick}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#0d9488] hover:bg-[#0f766e] text-white transition-colors shadow-sm active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                Installer app
              </button>
            )}

            <div className="mt-2 flex items-center gap-1.5">
              <MonitorUp className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Ingen browser-linje — hurtig adgang fra hjemmeskærmen
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
