/**
 * loadOpenCV.ts
 *
 * Singleton loader for OpenCV.js (8 MB WASM). Loads once, app-wide.
 * Subsequent calls return the same Promise.
 */

let loadPromise: Promise<void> | null = null;

export function loadOpenCV(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Server side — skip'));
      return;
    }
    if ('cv' in window) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;
    (window as any).Module = { onRuntimeInitialized: resolve };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Check if OpenCV is already loaded (non-blocking).
 */
export function isCVReady(): boolean {
  return typeof window !== 'undefined' && 'cv' in window;
}
