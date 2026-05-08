'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────

interface StatsCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  trend?: { direction: 'up' | 'down' | 'neutral'; value: number };
  variant?: 'primary' | 'green' | 'amber' | 'red' | 'purple' | 'turquoise' | 'blue';
  badge?: string;
  formatAsCurrency?: boolean;
  sparklineData?: number[];
  className?: string;
}

// ── Variant config maps ─────────────────────────────────────────────────

const ICON_COLORS: Record<string, { light: string; dark: string }> = {
  primary:   { light: 'text-[#0d9488]', dark: 'dark:text-[#2dd4bf]' },
  green:     { light: 'text-[#16a34a]', dark: 'dark:text-[#4ade80]' },
  amber:     { light: 'text-[#d97706]', dark: 'dark:text-[#fbbf24]' },
  red:       { light: 'text-[#dc2626]', dark: 'dark:text-[#f87171]' },
  purple:    { light: 'text-[#7c3aed]', dark: 'dark:text-[#a78bfa]' },
  turquoise: { light: 'text-[#0d9488]', dark: 'dark:text-[#5eead4]' },
  blue:      { light: 'text-[#2563eb]', dark: 'dark:text-[#60a5fa]' },
};

const ICON_BG_CLASSES: Record<string, string> = {
  primary:   'stat-icon-primary',
  green:     'stat-icon-green',
  amber:     'stat-icon-amber',
  red:       'stat-icon-red',
  purple:    'stat-icon-purple',
  turquoise: 'stat-icon-turquoise',
  blue:      'stat-icon-blue',
};

const SPARKLINE_COLORS: Record<string, { light: string; dark: string }> = {
  primary:   { light: 'bg-[#0d9488]/60', dark: 'dark:bg-[#2dd4bf]/60' },
  green:     { light: 'bg-[#16a34a]/60', dark: 'dark:bg-[#4ade80]/60' },
  amber:     { light: 'bg-[#d97706]/60', dark: 'dark:bg-[#fbbf24]/60' },
  red:       { light: 'bg-[#dc2626]/60', dark: 'dark:bg-[#f87171]/60' },
  purple:    { light: 'bg-[#7c3aed]/60', dark: 'dark:bg-[#a78bfa]/60' },
  turquoise: { light: 'bg-[#0d9488]/50', dark: 'dark:bg-[#5eead4]/50' },
  blue:      { light: 'bg-[#2563eb]/60', dark: 'dark:bg-[#60a5fa]/60' },
};

// ── Animated counter hook ───────────────────────────────────────────────

function useAnimatedCounter(target: number, duration: number = 800) {
  const [displayValue, setDisplayValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let startTime: number | null = null;

    function step(timestamp: number) {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(target);
      }
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return displayValue;
}

// ── Number formatting ──────────────────────────────────────────────────

function formatNumber(value: number, asCurrency: boolean): string {
  if (asCurrency) {
    // DKK currency formatting (Danish locale style)
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }

  // Compact number formatting
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

// ── Sparkline mini bar chart ───────────────────────────────────────────

function Sparkline({
  data,
  variant = 'primary',
}: {
  data: number[];
  variant: string;
}) {
  const [mounted, setMounted] = useState(false);
  const maxVal = Math.max(...data, 1);

  useEffect(() => {
    // Trigger animation after mount
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const colors = SPARKLINE_COLORS[variant] || SPARKLINE_COLORS.primary;

  return (
    <div className="flex items-end gap-[3px] h-8">
      {data.map((val, i) => {
        const heightPercent = mounted ? Math.max((val / maxVal) * 100, 4) : 0;
        return (
          <div
            key={i}
            className={cn(
              'sparkline-bar flex-1 min-w-[4px]',
              colors.light,
              colors.dark
            )}
            style={{
              height: `${heightPercent}%`,
              transitionDelay: `${i * 50}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Trend indicator ────────────────────────────────────────────────────

function TrendIndicator({
  trend,
}: {
  trend: { direction: 'up' | 'down' | 'neutral'; value: number };
}) {
  if (trend.direction === 'neutral') {
    return (
      <div className="flex items-center gap-1 text-xs">
        <Minus className="h-3.5 w-3.5 trend-neutral" />
        <span className="trend-neutral font-medium">{trend.value}%</span>
      </div>
    );
  }

  const TrendIcon = trend.direction === 'up' ? TrendingUp : TrendingDown;
  const trendClass = trend.direction === 'up' ? 'trend-up' : 'trend-down';

  return (
    <div className="flex items-center gap-1 text-xs">
      <TrendIcon className={cn('h-3.5 w-3.5', trendClass)} />
      <span className={cn('font-medium', trendClass)}>
        {trend.value}%
      </span>
    </div>
  );
}

// ── Main StatsCard component ───────────────────────────────────────────

export function StatsCard({
  icon: Icon,
  label,
  value,
  trend,
  variant = 'primary',
  badge,
  formatAsCurrency = true,
  sparklineData,
  className,
}: StatsCardProps) {
  const animatedValue = useAnimatedCounter(value);
  const colors = ICON_COLORS[variant] || ICON_COLORS.primary;
  const iconBg = ICON_BG_CLASSES[variant] || ICON_BG_CLASSES.primary;

  return (
    <div className={cn('stat-card stat-card-refined stat-card-variant-' + variant, 'p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        {/* Left: Icon + Label + Value */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div
            className={cn(
              'flex items-center justify-center h-10 w-10 rounded-xl shrink-0',
              iconBg
            )}
          >
            <Icon className={cn('h-5 w-5', colors.light, colors.dark)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Label row with optional badge */}
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                {label}
              </p>
              {badge && (
                <span className="badge-soft bg-secondary text-secondary-foreground shrink-0">
                  {badge}
                </span>
              )}
            </div>

            {/* Value */}
            <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums tracking-tight">
              {formatNumber(animatedValue, formatAsCurrency)}
            </p>

            {/* Trend */}
            {trend && (
              <div className="mt-1.5">
                <TrendIndicator trend={trend} />
              </div>
            )}
          </div>
        </div>

        {/* Right: Sparkline */}
        {sparklineData && sparklineData.length > 0 && (
          <div className="shrink-0 w-16 sm:w-20 mt-1">
            <Sparkline data={sparklineData} variant={variant} />
          </div>
        )}
      </div>
    </div>
  );
}

export type { StatsCardProps };
