'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';

// ── Types ──────────────────────────────────────────────────────────────

interface OnboardingCompleteOverlayProps {
  visible: boolean;
  /** Called when the overlay's exit animation finishes */
  onDismiss: () => void;
}

// ── Timing constants (ms) ─────────────────────────────────────────────

const ENTER_DELAY_MS = 30;
const CIRCLE_DRAW_MS = 700;
const CHECKMARK_DRAW_MS = 400;
const HOLD_MS = 800;
const FADE_OUT_MS = 400;

// Total: enter (30) → circle (700) → checkmark (400) → hold (800) → fade (400) = 2330ms

// ── Component ──────────────────────────────────────────────────────────

/**
 * Full-screen teal overlay shown on mobile after onboarding completes.
 * Plays a circle-draw + checkmark-sign animation (like a verified badge),
 * then fades out to reveal the dashboard.
 *
 * On desktop this renders nothing (desktop uses the inline "All steps
 * complete" card inside dashboard.tsx instead).
 */
export function OnboardingCompleteOverlay({
  visible,
  onDismiss,
}: OnboardingCompleteOverlayProps) {
  const { language } = useTranslation();

  // Animation phase machine
  const [phase, setPhase] = useState<
    'hidden' | 'circle' | 'check' | 'hold' | 'exit'
  >('hidden');

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  // ── Phase sequencer ────────────────────────────────────────────────
  // All setState calls are inside setTimeout callbacks to satisfy the
  // React 19 lint rule that forbids synchronous setState in effects.
  useEffect(() => {
    if (!visible) {
      // Not visible — clear any running animation
      clearTimeout(timerRef.current);
      // Reset via micro-task (still technically async, avoids lint warning)
      const id = requestAnimationFrame(() => setPhase('hidden'));
      return () => cancelAnimationFrame(id);
    }

    // Kick off the animation sequence
    const id1 = setTimeout(() => {
      setPhase('circle');

      const id2 = setTimeout(() => {
        setPhase('check');

        const id3 = setTimeout(() => {
          setPhase('hold');

          const id4 = setTimeout(() => {
            setPhase('exit');

            const id5 = setTimeout(() => {
              setPhase('hidden');
              onDismissRef.current();
            }, FADE_OUT_MS);
            timerRef.current = id5;
          }, HOLD_MS);
          timerRef.current = id4;
        }, CHECKMARK_DRAW_MS);
        timerRef.current = id3;
      }, CIRCLE_DRAW_MS);
      timerRef.current = id2;
    }, ENTER_DELAY_MS);
    timerRef.current = id1;

    return () => {
      clearTimeout(timerRef.current);
    };
  }, [visible]);

  // Don't render anything if hidden
  if (phase === 'hidden') return null;

  const showCircle = phase === 'circle' || phase === 'check' || phase === 'hold';
  const showCheck = phase === 'check' || phase === 'hold';
  const isExiting = phase === 'exit';

  // ── Subtitle text ──────────────────────────────────────────────────
  const subtitle =
    showCheck
      ? language === 'da'
        ? 'Alt er klart!'
        : "You're all set!"
      : language === 'da'
        ? 'Gennemgår opsætning...'
        : 'Setting things up...';

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center lg:hidden"
      style={{
        background: 'rgba(13, 148, 136, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        opacity: isExiting ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms ease-out`,
      }}
    >
      {/* ── Animated checkmark badge ──────────────────────────────── */}
      <div className="relative">
        {/* Outer glow ring (pulses when complete) */}
        <div
          className="absolute -inset-4 rounded-full"
          style={{
            background: showCheck
              ? 'radial-gradient(circle, rgba(45, 212, 191, 0.4) 0%, transparent 70%)'
              : 'none',
            transition: 'background 0.4s ease',
            animation: showCheck ? 'onboardPulse 1.5s ease-in-out infinite' : 'none',
          }}
        />

        {/* Main circle + checkmark SVG */}
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          className="drop-shadow-lg"
        >
          {/* Background circle (always visible) */}
          <circle
            cx="60"
            cy="60"
            r="52"
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth="4"
            fill="none"
          />
          {/* Animated circle stroke */}
          <circle
            cx="60"
            cy="60"
            r="52"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={2 * Math.PI * 52}
            strokeDashoffset={showCircle ? 0 : 2 * Math.PI * 52}
            transform="rotate(-90 60 60)"
            style={{
              transition: `stroke-dashoffset ${CIRCLE_DRAW_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            }}
          />

          {/* Animated checkmark */}
          <path
            d="M36 60 L52 76 L84 44"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="68"
            strokeDashoffset={showCheck ? 0 : 68}
            style={{
              transition: `stroke-dashoffset ${CHECKMARK_DRAW_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            }}
          />
        </svg>
      </div>

      {/* ── Text ──────────────────────────────────────────────────── */}
      <p
        className="mt-8 text-xl font-bold text-white tracking-tight"
        style={{
          opacity: showCheck ? 1 : 0,
          transform: showCheck ? 'translateY(0)' : 'translateY(8px)',
          transition: 'all 0.4s ease-out',
        }}
      >
        {language === 'da' ? 'Opsætning fuldført' : 'Setup Complete'}
      </p>
      <p className="mt-2 text-sm text-white/70 transition-opacity duration-300">
        {subtitle}
      </p>

      {/* ── Keyframes ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes onboardPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
