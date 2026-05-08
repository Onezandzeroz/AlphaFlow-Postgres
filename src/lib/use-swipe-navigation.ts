'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { NAV_SECTIONS } from '@/components/layout/accordion-nav';
import type { View } from '@/components/layout/app-layout';

// ── Build flat ordered list of all navigable views ────────────────────────

const SWIPEABLE_VIEWS: View[] = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => item.id)
);

// ── Types ──────────────────────────────────────────────────────────────

interface SwipeNavOptions {
  currentView: View;
  onViewChange: (view: View) => void;
  enabled?: boolean;
}

export interface SwipeState {
  /** Raw pixel displacement from touch start (negative = swiping left, positive = swiping right) */
  offsetX: number;
  /** The view being swiped toward, or null */
  targetView: View | null;
  /** Swipe direction: left (next page) or right (previous page) */
  direction: 'left' | 'right' | null;
  /** True while the user's finger is on screen and dragging */
  isDragging: boolean;
  /** True during snap-back or commit settle animation */
  isSettling: boolean;
  /**
   * True during the brief "landing" phase after a committed swipe.
   * The target page stays visible while the new view mounts behind it,
   * then a crossfade hides the mount-time layout jitter.
   */
  isLanding: boolean;
}

const INITIAL_STATE: SwipeState = {
  offsetX: 0,
  targetView: null,
  direction: null,
  isDragging: false,
  isSettling: false,
  isLanding: false,
};

// ── Hook ───────────────────────────────────────────────────────────────

/**
 * iOS-style swipe navigation between sidebar pages.
 *
 * Behaviour:
 * - Pages physically glide with the finger (1:1 tracking).
 * - The incoming page is visible and slides in from the side.
 * - The user can stop mid-swipe and reverse direction at any time.
 * - Rubber-band resistance at the first/last page boundary.
 * - Velocity-based flick detection for quick navigation.
 * - Smooth CSS settle animation on release.
 * - Seamless "landing" phase: after commit, a crossfade hides the
 *   component-mount jitter so the destination page appears stable.
 *
 * Only activates on touch devices; desktop is unaffected.
 */
export function useSwipeNavigation({
  currentView,
  onViewChange,
  enabled = true,
}: SwipeNavOptions) {
  // ── Refs (only written in event handlers / effects, never during render) ──
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidthRef = useRef(0);
  const stateRef = useRef(INITIAL_STATE);
  const currentIndexRef = useRef(SWIPEABLE_VIEWS.indexOf(currentView));
  const onViewChangeRef = useRef(onViewChange);

  /**
   * When true, the render-phase reset is suppressed because the
   * view change originated from a swipe commit (not an external action).
   * This prevents the landing phase from being immediately undone.
   */
  const swipeCommitRef = useRef(false);

  /** Timer handle for the landing-phase cleanup. */
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── State ──────────────────────────────────────────────────────────
  const [containerWidth, setContainerWidth] = useState(0);
  const [state, setState] = useState<SwipeState>(INITIAL_STATE);

  // ── Sync derived refs (effects only, no render-time writes) ────────
  useEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    currentIndexRef.current = SWIPEABLE_VIEWS.indexOf(currentView);
  }, [currentView]);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  // ── Cancel any in-progress landing ─────────────────────────────────
  const cancelLanding = useCallback(() => {
    if (landingTimerRef.current !== undefined) {
      clearTimeout(landingTimerRef.current);
      landingTimerRef.current = undefined;
    }
    swipeCommitRef.current = false;
  }, []);

  // ── External-view-change reset (effect-based to avoid accessing refs
  //    during render, which React 19's linter prohibits) ───────────────
  //
  //  When the user navigates via sidebar click / keyboard shortcut /
  //  hash change, we need to cancel any in-progress swipe animation.
  //  When the view change originates from a swipe commit (swipeCommitRef),
  //  we skip the reset so the landing phase can finish cleanly.
  const prevViewRef = useRef(currentView);
  const prevEnabledRef = useRef(enabled);

  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = currentView;
    if (prev !== currentView && !swipeCommitRef.current) {
      cancelLanding();
      requestAnimationFrame(() => setState(INITIAL_STATE));
    }
  }, [currentView, cancelLanding]);

  useEffect(() => {
    const prev = prevEnabledRef.current;
    prevEnabledRef.current = enabled;
    if (prev !== enabled && !enabled) {
      cancelLanding();
      requestAnimationFrame(() => setState(INITIAL_STATE));
    }
  }, [enabled, cancelLanding]);

  // ── Measure container width ────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      containerWidthRef.current = w;
      setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Element guard ──────────────────────────────────────────────────
  const isSwipeableElement = useCallback((target: HTMLElement): boolean => {
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;

    const scrollParent = target.closest('[data-swipe="false"]');
    if (scrollParent) return false;

    let el: HTMLElement | null = target;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        el.scrollWidth > el.clientWidth
      ) {
        return false;
      }
      el = el.parentElement;
    }

    return true;
  }, []);

  // ── Touch handlers ─────────────────────────────────────────────────

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      // Cancel any in-progress landing if the user starts a new swipe
      if (stateRef.current.isLanding) {
        cancelLanding();
        setState(INITIAL_STATE);
      }
      const target = e.target as HTMLElement;
      if (!isSwipeableElement(target)) return;
      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
      };
    },
    [enabled, isSwipeableElement],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchRef.current) return;

      const touch = e.touches[0];
      const dx = touch.clientX - touchRef.current.startX;
      const dy = touch.clientY - touchRef.current.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // ── Direction lock phase ──────────────────────────────────────
      if (!stateRef.current.isDragging) {
        if (absDx < 10 && absDy < 10) return;
        if (absDy > absDx * 0.6) {
          // Vertical scroll — bow out
          touchRef.current = null;
          return;
        }
      }

      // Prevent browser back/forward navigation once we own the swipe
      e.preventDefault();

      // ── Compute offset & target ───────────────────────────────────
      const idx = currentIndexRef.current;
      const direction: 'left' | 'right' = dx < 0 ? 'left' : 'right';
      const targetIndex = direction === 'left' ? idx + 1 : idx - 1;
      const hasTarget = targetIndex >= 0 && targetIndex < SWIPEABLE_VIEWS.length;

      let effectiveDx: number;
      if (!hasTarget) {
        // Rubber-band at list boundaries
        const w = containerWidthRef.current || window.innerWidth;
        const maxPull = w * 0.2;
        effectiveDx = Math.sign(dx) * Math.min(Math.abs(dx) * 0.3, maxPull);
      } else {
        effectiveDx = dx;
      }

      setState({
        offsetX: effectiveDx,
        targetView: hasTarget ? SWIPEABLE_VIEWS[targetIndex] : null,
        direction: hasTarget ? direction : null,
        isDragging: true,
        isSettling: false,
        isLanding: false,
      });
    },
    [enabled],
  );

  const handleTouchEnd = useCallback(() => {
    const touchData = touchRef.current;
    touchRef.current = null;

    const currentState = stateRef.current;
    if (!touchData || !currentState.isDragging || currentState.isSettling) {
      return;
    }

    // ── Decide: commit or snap-back ───────────────────────────────
    const elapsed = Date.now() - touchData.startTime;
    const velocity =
      Math.abs(currentState.offsetX) / Math.max(elapsed, 1); // px/ms

    const w = containerWidthRef.current || window.innerWidth;
    const progress = Math.abs(currentState.offsetX) / w;

    // Commit on fast flick OR slow swipe past 20 %
    const fastFlick = velocity > 0.35 && Math.abs(currentState.offsetX) > 20;
    const slowSwipe = progress > 0.2;
    const shouldCommit = currentState.targetView && (fastFlick || slowSwipe);

    if (shouldCommit && currentState.targetView && currentState.direction) {
      const pendingView = currentState.targetView;
      const targetOffset =
        currentState.direction === 'left' ? -w : w;

      setState((prev) => ({
        ...prev,
        offsetX: targetOffset,
        isDragging: false,
        isSettling: true,
        isLanding: false,
        targetView: pendingView,
      }));
    } else {
      cancelLanding();
      setState({
        offsetX: 0,
        targetView: null,
        direction: null,
        isDragging: false,
        isSettling: true,
        isLanding: false,
      });
    }
  }, []);

  // ── Settle-complete callback (called from SwipeViewContainer) ──────
  //
  //  On COMMIT:
  //    1. Enter "landing" phase — keep the target page visible so the
  //       user sees a stable destination page.
  //    2. Change the view — the new page component mounts behind the
  //       still-visible target (any mount-time jitter is hidden).
  //    3. After the crossfade completes, clean up.
  //
  //  On SNAP-BACK:
  //    Just reset to initial state.

  const onSettleComplete = useCallback(() => {
    const currentState = stateRef.current;

    if (!currentState.targetView || !currentState.direction) {
      // Snap-back — nothing to commit
      cancelLanding();
      setState(INITIAL_STATE);
      return;
    }

    const pendingView = currentState.targetView;
    const dir = currentState.direction;

    // ── Enter landing phase ───────────────────────────────────────
    // Reset offsetX to 0 (current page snaps to center, hidden by opacity).
    // Keep targetView so the target div stays rendered and visible.
    swipeCommitRef.current = true;

    setState({
      offsetX: 0,
      targetView: pendingView,
      direction: dir,
      isDragging: false,
      isSettling: false,
      isLanding: true,
    });

    // Commit the navigation — currentView changes, new page mounts
    // in the current-page div (invisible because of the landing opacity).
    onViewChangeRef.current(pendingView);

    // After the crossfade finishes, clean up everything.
    // 300ms = 200ms fade-in + 100ms safety buffer.
    landingTimerRef.current = setTimeout(() => {
      swipeCommitRef.current = false;
      landingTimerRef.current = undefined;
      setState(INITIAL_STATE);
    }, 350);

    // Clean up on unmount
    return () => {
      cancelLanding();
    };
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelLanding();
    };
  }, []);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    state,
    containerWidth,
    onSettleComplete,
    containerRef,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: () => handleTouchEnd(),
      onTouchCancel: () => handleTouchEnd(),
    },
  };
}
