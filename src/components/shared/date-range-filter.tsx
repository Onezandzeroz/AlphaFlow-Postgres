'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguageStore } from '@/lib/language-store';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Infinity,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
} from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────

interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
}

// ─── Component ────────────────────────────────────────────────────

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const { language } = useLanguageStore();
  const isDa = language === 'da';

  // ─── Predefined ranges ─────────────────────────────────────────

  const options = useMemo(() => {
    const now = new Date();
    const lastMonthDate = subMonths(now, 1);

    return [
      {
        key: 'this-month' as const,
        label: isDa ? 'Denne måned' : 'This Month',
        icon: Calendar,
        range: { from: startOfMonth(now), to: endOfMonth(now) } as DateRange,
      },
      {
        key: 'last-month' as const,
        label: isDa ? 'Sidste måned' : 'Last Month',
        icon: CalendarDays,
        range: { from: startOfMonth(lastMonthDate), to: endOfMonth(lastMonthDate) } as DateRange,
      },
      {
        key: 'this-quarter' as const,
        label: isDa ? 'Dette kvartal' : 'This Quarter',
        icon: CalendarRange,
        range: { from: startOfQuarter(now), to: endOfQuarter(now) } as DateRange,
      },
      {
        key: 'this-year' as const,
        label: isDa ? 'Dette år' : 'This Year',
        icon: CalendarClock,
        range: { from: startOfYear(now), to: endOfYear(now) } as DateRange,
      },
      {
        key: 'all-time' as const,
        label: isDa ? 'Altid' : 'All Time',
        icon: Infinity,
        range: null as DateRange | null,
      },
    ];
  }, [isDa]);

  // ─── Active detection ──────────────────────────────────────────

  const isActive = (key: string) => {
    const opt = options.find((o) => o.key === key);
    if (!opt) return false;

    // "All Time" is active when value is null
    if (opt.range === null) return value === null;

    // Compare by timestamp
    if (!value) return false;
    return (
      value.from.getTime() === opt.range.from.getTime() &&
      value.to.getTime() === opt.range.to.getTime()
    );
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = isActive(opt.key);

        return (
          <Button
            key={opt.key}
            variant="ghost"
            size="sm"
            onClick={() => onChange(opt.range)}
            className={`
              h-8 px-3 gap-1.5 text-xs font-medium rounded-lg transition-all duration-200
              ${
                active
                  ? 'bg-[#0d9488] text-white dark:bg-[#2dd4bf] dark:text-gray-900 shadow-sm hover:bg-[#0d9488]/90 dark:hover:bg-[#2dd4bf]/90'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
