'use client';

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useSidebarStore, type SidebarSectionId } from '@/lib/sidebar-store';
import { useLanguageStore } from '@/lib/language-store';
import { useAuthStore } from '@/lib/auth-store';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Receipt,
  Calculator,
  Download,
  FileText,
  DatabaseBackup,
  ScrollText,
  BookOpen,
  PenLine,
  Users,
  Calendar,
  Scale,
  BarChart3,
  Landmark,
  CalendarClock,
  Clock,
  Wallet,
  RefreshCw,
  Target,
  FolderOpen,
  BookCheck,
  FileBarChart,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────

type View =
  | 'dashboard'
  | 'transactions'
  | 'vat-report'
  | 'exports'
  | 'invoices'
  | 'backups'
  | 'audit-log'
  | 'accounts'
  | 'journal'
  | 'contacts'
  | 'periods'
  | 'ledger'
  | 'reports'
  | 'bank-recon'
  | 'year-end'
  | 'aging'
  | 'cash-flow'
  | 'recurring'
  | 'budget'
  | 'settings'
  | 'settings-company';

interface NavItemDef {
  id: View;
  nameDa: string;
  nameEn: string;
  icon: LucideIcon;
}

interface NavSectionDef {
  id: SidebarSectionId;
  nameDa: string;
  nameEn: string;
  icon: LucideIcon;
  items: NavItemDef[];
}

interface AccordionNavProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

// ── Navigation Config ──────────────────────────────────────────────────

export const NAV_SECTIONS: NavSectionDef[] = [
  {
    id: 'daily-operations',
    nameDa: 'Daglig Drift',
    nameEn: 'Daily Operations',
    icon: FolderOpen,
    items: [
      { id: 'dashboard', nameDa: 'Kontrolpanel', nameEn: 'Dashboard', icon: LayoutDashboard },
      { id: 'transactions', nameDa: 'Indkøb & Kvittering', nameEn: 'Purchases & Receipts', icon: Receipt },
      { id: 'invoices', nameDa: 'Salg & Faktura', nameEn: 'Sales & Invoice', icon: FileText },
      { id: 'contacts', nameDa: 'Kontakter', nameEn: 'Contacts', icon: Users },
    ],
  },
  {
    id: 'bookkeeping',
    nameDa: 'Bogføring',
    nameEn: 'Bookkeeping',
    icon: BookCheck,
    items: [
      { id: 'journal', nameDa: 'Finansjournal', nameEn: 'Journal', icon: PenLine },
      { id: 'accounts', nameDa: 'Kontoplan', nameEn: 'Accounts', icon: BookOpen },
      { id: 'ledger', nameDa: 'Hovedbog', nameEn: 'Ledger', icon: Scale },
      { id: 'budget', nameDa: 'Budgetter', nameEn: 'Budgets', icon: Target },
    ],
  },
  {
    id: 'reporting',
    nameDa: 'Regnskab',
    nameEn: 'Accounting',
    icon: FileBarChart,
    items: [
      { id: 'reports', nameDa: 'Rapporter', nameEn: 'Reports', icon: BarChart3 },
      { id: 'bank-recon', nameDa: 'Bankafstemning', nameEn: 'Bank Reconcil.', icon: Landmark },
      { id: 'aging', nameDa: 'Aldersopdeling', nameEn: 'Aging', icon: Clock },
      { id: 'cash-flow', nameDa: 'Likviditet', nameEn: 'Cash Flow', icon: Wallet },
    ],
  },
  {
    id: 'compliance',
    nameDa: 'Afslutning & Compliance',
    nameEn: 'Closing & Compliance',
    icon: ShieldCheck,
    items: [
      { id: 'vat-report', nameDa: 'Momsafregning', nameEn: 'VAT Report', icon: Calculator },
      { id: 'periods', nameDa: 'Periode', nameEn: 'Periods', icon: Calendar },
      { id: 'exports', nameDa: 'Eksport', nameEn: 'Exports', icon: Download },
      { id: 'year-end', nameDa: 'Årsafslutning', nameEn: 'Year-End', icon: CalendarClock },
    ],
  },
  {
    id: 'maintenance',
    nameDa: 'Indstillinger',
    nameEn: 'Settings',
    icon: Settings,
    items: [
      { id: 'settings', nameDa: 'Kontoprofil', nameEn: 'Account Profile', icon: Settings },
      { id: 'backups', nameDa: 'Backup', nameEn: 'Backups', icon: DatabaseBackup },
      { id: 'audit-log', nameDa: 'Revisionslog', nameEn: 'Audit Log', icon: ScrollText },
    ],
  },
];

// ── Sync debounce ──────────────────────────────────────────────────────

function useSyncToServer() {
  const { user } = useAuthStore();
  const { expandedSections, setSyncing } = useSidebarStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !expandedSections) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      try {
        setSyncing(true);
        await fetch('/api/user/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expandedSections }),
        });
      } catch {
        // Silent fail — preferences still saved locally
      } finally {
        setSyncing(false);
      }
    }, 1500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [expandedSections, user, setSyncing]);
}

// ── Component ──────────────────────────────────────────────────────────

export function AccordionNav({ currentView, onViewChange }: AccordionNavProps) {
  const { language } = useLanguageStore();
  const { expandedSections, toggleSection, syncFromServer } =
    useSidebarStore();
  const { user } = useAuthStore();
  const mounted = useRef(false);

  // Sync from server on mount (once)
  useEffect(() => {
    if (mounted.current || !user) return;
    mounted.current = true;

    (async () => {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          if (data.preferences) {
            syncFromServer(data.preferences);
          }
        }
      } catch {
        // Silently fall back to localStorage
      }
    })();
  }, [user, syncFromServer]);

  // Keep server in sync with debounced saves
  useSyncToServer();

  // Find which section contains the currently active view
  const activeSectionId = useMemo(() => {
    for (const section of NAV_SECTIONS) {
      if (section.items.some((item) => item.id === currentView)) {
        return section.id;
      }
    }
    return null;
  }, [currentView]);

  const isDa = language === 'da';

  const handleNavClick = useCallback(
    (view: View) => {
      onViewChange(view);
    },
    [onViewChange]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Navigation Accordion */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <Accordion
          type="single"
          collapsible
          value={expandedSections[0] || ''}
          onValueChange={(value) => {
            if (value) {
              toggleSection(value as SidebarSectionId);
            } else {
              useSidebarStore.setState({ expandedSections: [] });
            }
          }}
          className="space-y-1"
        >
          {NAV_SECTIONS.map((section, sectionIndex) => {
            const SectionIcon = section.icon;
            const isActive = activeSectionId === section.id;
            const isExpanded = expandedSections.includes(section.id);

            return (
              <div key={section.id}>
                {/* Gradient separator between nav groups (not before first) */}
                {sectionIndex > 0 && (
                  <div className="sidebar-separator" />
                )}
                <AccordionItem
                  value={section.id}
                  className={cn(
                    'border-0 rounded-lg overflow-hidden transition-colors duration-200',
                    isExpanded
                      ? 'bg-[#f0fdf9] dark:bg-[#1a2e2b]'
                      : '',
                    isActive && !isExpanded
                      ? 'bg-[#f0fdf9]/50 dark:bg-[#1a2e2b]/50'
                      : ''
                  )}
                >
                  <AccordionTrigger
                    className={cn(
                      'px-3 py-2.5 rounded-lg hover:no-underline transition-all duration-150',
                      '[&[data-state=open]>svg]:rotate-180',
                      'hover:bg-[#f0fdf9] dark:hover:bg-[#1a2e2b]',
                      isExpanded
                        ? 'text-[#0d9488] dark:text-[#2dd4bf]'
                        : 'text-slate-600 dark:text-gray-400'
                    )}
                  >
                    <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-wide uppercase sidebar-section-label">
                      <SectionIcon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors duration-200',
                          isExpanded
                            ? 'text-[#0d9488] dark:text-[#2dd4bf]'
                            : isActive
                              ? 'text-[#0d9488]'
                              : 'text-gray-400 dark:text-gray-500'
                        )}
                      />
                      <span className="sidebar-label">{isDa ? section.nameDa : section.nameEn}</span>
                    </span>
                  </AccordionTrigger>

                  <AccordionContent className="pb-1 pl-1 pr-1">
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const ItemIcon = item.icon;
                        const isItemActive = currentView === item.id;
                        const itemName = isDa ? item.nameDa : item.nameEn;

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative hover-lift',
                              isItemActive
                                ? 'bg-[#0d9488] text-white shadow-sm sidebar-nav-item-active-glow'
                                : 'text-slate-600 dark:text-gray-300 hover:bg-[#f0fdf9] dark:hover:bg-[#1a2e2b] hover:text-[#1a1d1c] dark:hover:text-white'
                            )}
                          >
                            <ItemIcon
                              className={cn(
                                'h-5 w-5 shrink-0 transition-colors duration-200',
                                isItemActive
                                  ? 'text-white'
                                  : 'text-gray-400 dark:text-gray-500 group-hover:text-[#0d9488] dark:group-hover:text-[#2dd4bf]'
                              )}
                            />
                            <span className="truncate sidebar-label">{itemName}</span>
                            {isItemActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-white/80 shadow-sm" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </div>
            );
          })}
        </Accordion>
      </nav>
    </div>
  );
}
