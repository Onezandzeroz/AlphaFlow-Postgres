'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguageStore } from '@/lib/language-store';
import {
  ChevronRight,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

// ── Component ──────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
}: PageHeaderProps) {
  const { language } = useLanguageStore();

  return (
    <div className="animate-fade-in">
      {/* Mobile: compact header without banner styling */}
      <div className="lg:hidden flex items-center justify-between gap-3 px-1 py-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-[#1a1d1c] dark:text-[#e2e8e6] truncate">
            {title}
          </h1>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex items-center gap-2 shrink-0">
            {action}
          </div>
        )}
      </div>

      {/* Desktop: teal gradient banner */}
      <div className="hidden lg:block relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0d9488] via-[#14b8a6] to-[#5eead4] dark:from-[#0f766e] dark:via-[#0d6058] dark:to-[#0d9488] p-5 sm:p-7 lg:p-8">
        {/* Decorative dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Decorative blur circles */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-[#5eead4]/10 rounded-full blur-2xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Breadcrumbs + Title + Description */}
          <div className="flex-1 min-w-0">
            {/* Breadcrumb trail */}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="mb-2">
                <ol className="flex items-center gap-1 text-sm flex-wrap">
                  {/* Home / root crumb */}
                  <li className="flex items-center gap-1">
                    <Link
                      href="/"
                      className="inline-flex items-center gap-1 text-white/70 hover:text-white transition-colors duration-150"
                    >
                      <Home className="h-3.5 w-3.5" />
                      <span className="sr-only">
                        {language === 'da' ? 'Hjem' : 'Home'}
                      </span>
                    </Link>
                  </li>

                  {breadcrumbs.map((crumb, index) => {
                    const isLast = index === breadcrumbs.length - 1;

                    return (
                      <li key={index} className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3 text-white/40 shrink-0" />
                        {isLast || !crumb.href ? (
                          <span
                            className={cn(
                              'truncate max-w-[180px]',
                              isLast
                                ? 'text-white font-medium'
                                : 'text-white/70'
                            )}
                            aria-current={isLast ? 'page' : undefined}
                          >
                            {crumb.label}
                          </span>
                        ) : (
                          <Link
                            href={crumb.href}
                            className="text-white/70 hover:text-white transition-colors duration-150 truncate max-w-[180px]"
                          >
                            {crumb.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            )}

            {/* Title */}
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {title}
            </h1>

            {/* Description */}
            {description && (
              <p className="mt-1.5 text-sm sm:text-base text-[#ccfbef] leading-relaxed max-w-2xl opacity-90">
                {description}
              </p>
            )}
          </div>

          {/* Right: Action area */}
          {action && (
            <div className="flex items-center gap-2 shrink-0 sm:self-start">
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { BreadcrumbItem, PageHeaderProps };
