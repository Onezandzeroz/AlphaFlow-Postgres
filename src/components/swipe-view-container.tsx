'use client';

import React from 'react';
import type { View } from '@/components/layout/app-layout';
import type { SwipeState } from '@/lib/use-swipe-navigation';

// ── Types ──────────────────────────────────────────────────────────────

interface SwipeViewContainerProps {
  currentView: View;
  state: SwipeState;
  containerWidth: number;
  renderView: (view: View) => React.ReactNode;
  onSettleComplete: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
}

// ── Easing & timing ───────────────────────────────────────────────────

/**
 * iOS-inspired spring-like ease-out: fast initial velocity, gentle
 * deceleration.  Slightly longer than the previous 320ms to feel more
 * relaxed and natural on mobile.
 */
const SETTLE_EASING = 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Landing crossfade duration.  The target page fades out while the
 * current page (now showing the new view) fades in.  Fast enough to
 * feel instant, slow enough to hide component-mount jitter.
 */
const LANDING_FADE_MS = 220;

// ── Inline keyframe for the fade-in (avoids needing a global stylesheet) ──

const fadeOutStyle = {
  animation: `swipeLandFadeOut ${LANDING_FADE_MS}ms ease-out forwards`,
} as React.CSSProperties;

const fadeInStyle = {
  animation: `swipeLandFadeIn ${LANDING_FADE_MS}ms ease-out forwards`,
} as React.CSSProperties;

// ── Keyframe injection (rendered once, never re-created) ───────────────

let keyframesInjected = false;
const keyframeCSS = `
@keyframes swipeLandFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes swipeLandFadeOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}
`;

function Keyframes() {
  if (typeof document !== 'undefined' && !keyframesInjected) {
    const el = document.createElement('style');
    el.textContent = keyframeCSS;
    document.head.appendChild(el);
    keyframesInjected = true;
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Renders two pages side-by-side during a swipe:
 *  - **Current page** follows the finger 1:1.
 *  - **Target page** slides in from the opposite edge.
 *
 * On release the hook decides commit vs snap-back; this component
 * plays the CSS transition and fires `onSettleComplete` when done.
 *
 * After a committed swipe a brief **landing** crossfade hides the
 * component-mount jitter so the destination page appears stable.
 *
 * GPU-composited via `translate3d` / `will-change` / `backface-visibility`.
 */
export function SwipeViewContainer({
  currentView,
  state,
  containerWidth,
  renderView,
  onSettleComplete,
  containerRef,
  handlers,
}: SwipeViewContainerProps) {
  const { offsetX, targetView, direction, isDragging, isSettling, isLanding } = state;

  const isActive = isDragging || isSettling || isLanding;
  const w = containerWidth || (typeof window !== 'undefined' ? window.innerWidth : 390);

  // Swipe progress 0–1 (for shadow / dimming effects)
  const progress = w > 0 ? Math.min(Math.abs(offsetX) / w, 1) : 0;

  // ── Target page position ─────────────────────────────────────────
  let targetTransform: string | undefined;
  if (isActive && targetView && direction) {
    if (isLanding) {
      // During landing the target stays exactly where the settle
      // animation left it — centered on screen.
      targetTransform = 'translate3d(0px, 0px, 0)';
    } else if (direction === 'left') {
      // Next page enters from the right
      targetTransform = `translate3d(${w + offsetX}px, 0px, 0)`;
    } else {
      // Previous page enters from the left
      targetTransform = `translate3d(${-w + offsetX}px, 0px, 0)`;
    }
  }

  // ── Current page transform (always uses translate3d for GPU) ───
  const currentTransform = `translate3d(${offsetX}px, 0px, 0)`;

  // ── Subtle depth shadow on current page during drag ──────────────
  const shadowSpread = 12 * progress;
  const shadowOpacity = progress * 0.08;
  const currentShadow =
    isActive && !isLanding && shadowSpread > 0.5
      ? `0 2px ${shadowSpread}px rgba(0,0,0,${shadowOpacity})`
      : 'none';

  // ── Determine which transition to use ────────────────────────────
  const currentTransition = isSettling
    ? SETTLE_EASING
    : 'none';

  const targetTransition = isSettling
    ? SETTLE_EASING
    : 'none';

  return (
    <>
      <Keyframes />
      <div
        ref={containerRef}
        {...handlers}
        className="relative"
        style={{
          overflowX: isActive ? 'hidden' : undefined,
          touchAction: isActive ? 'none' : 'pan-y',
        }}
      >
        {/* ── Target page (absolutely positioned, non-interactive) ── */}
        {isActive && targetView && targetTransform && (
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden
            style={{
              transform: targetTransform,
              transition: targetTransition,
              zIndex: 0,
              willChange: isActive ? 'transform, opacity' : undefined,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              // During landing: fade out so the current page takes over
              ...(isLanding ? fadeOutStyle : {}),
            }}
          >
            {renderView(targetView)}
          </div>
        )}

        {/* ── Current page (follows finger / settles / lands) ──── */}
        <div
          style={{
            transform: currentTransform,
            transition: currentTransition,
            boxShadow: currentShadow,
            zIndex: 1,
            position: 'relative',
            willChange: isActive ? 'transform' : undefined,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            // During landing: start invisible, fade in (hides mount jitter)
            ...(isLanding ? fadeInStyle : {}),
          }}
          onTransitionEnd={(e) => {
            if (isSettling && e.propertyName === 'transform') {
              onSettleComplete();
            }
          }}
        >
          {renderView(currentView)}
        </div>
      </div>
    </>
  );
}
