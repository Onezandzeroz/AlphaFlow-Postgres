import { create } from 'zustand';

/**
 * Independent scanner module store.
 *
 * Architecture:
 *   - Any component can call `openScanner()` to show the fullscreen scanner.
 *   - When the user captures a receipt ("Brug denne kvittering"), `completeScan(file)`
 *     stores the result and closes the scanner.
 *   - Consuming components (e.g. PosteringerPage) subscribe to `pendingResult`.
 *     When a result arrives, they call `consumeResult()` to claim it and open
 *     their UI with the file.
 *
 * The scanner renders via createPortal at the app root (z-9999), so it's
 * completely independent of any Dialog, view, or layout context.
 */

export interface ScanResult {
  file: File;
  /** Monotonically increasing ID — prevents stale re-consumption. */
  id: number;
}

interface ScannerState {
  /** Whether the standalone fullscreen scanner is visible. */
  isOpen: boolean;

  /** Result waiting to be picked up by a consumer. */
  pendingResult: ScanResult | null;

  /** Open the standalone scanner (e.g. from FAB "Scan bilag"). */
  openScanner: () => void;

  /** Close the scanner without capturing (user dismissed). */
  closeScanner: () => void;

  /**
   * Capture the file and close the scanner.
   * Stores the result so any subscriber can pick it up.
   */
  completeScan: (file: File) => void;

  /**
   * Claim the pending result and clear it from the store.
   * Returns null if there's nothing to consume.
   */
  consumeResult: () => ScanResult | null;
}

let nextResultId = 0;

export const useScannerStore = create<ScannerState>((set, get) => ({
  isOpen: false,
  pendingResult: null,

  openScanner: () => set({ isOpen: true, pendingResult: null }),

  closeScanner: () => set({ isOpen: false, pendingResult: null }),

  completeScan: (file: File) => {
    const id = ++nextResultId;
    // Close scanner AND store result in a single batch
    set({ isOpen: false, pendingResult: { file, id } });
  },

  consumeResult: () => {
    const result = get().pendingResult;
    if (result) {
      set({ pendingResult: null });
    }
    return result;
  },
}));
