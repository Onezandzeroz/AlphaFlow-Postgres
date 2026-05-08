'use client';

import * as React from 'react';
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useCommandState } from 'cmdk';
import { useLanguageStore } from '@/lib/language-store';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
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
  Search,
  CornerDownLeft,
  ArrowUpDown,
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
  | 'settings';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string) => void;
}

interface NavItemDef {
  id: View;
  nameDa: string;
  nameEn: string;
  icon: LucideIcon;
}

interface NavSectionDef {
  id: string;
  nameDa: string;
  nameEn: string;
  icon: LucideIcon;
  items: NavItemDef[];
}

// ── Navigation Config ──────────────────────────────────────────────────

const NAV_SECTIONS: NavSectionDef[] = [
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

// ── Total page count ───────────────────────────────────────────────────

const TOTAL_PAGES = NAV_SECTIONS.reduce((acc, s) => acc + s.items.length, 0);

// ── Highlight matching text ────────────────────────────────────────────

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-[#0d9488]/20 text-[#0d9488] dark:bg-[#2dd4bf]/25 dark:text-[#2dd4bf] rounded-[2px] px-[1px] font-semibold"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ── Keyboard shortcut badge ────────────────────────────────────────────

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border border-[#e2e8e6] dark:border-[#2a3330] bg-white dark:bg-[#1a2e2b] px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70',
        className
      )}
    >
      {children}
    </kbd>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ── Nav Item Component ─────────────────────────────────────────────────

function NavItem({
  item,
  isDa,
  onSelect,
}: {
  item: NavItemDef;
  isDa: boolean;
  onSelect: (id: string) => void;
}) {
  const search = useCommandState((state) => state.search);
  const ItemIcon = item.icon;
  const itemName = isDa ? item.nameDa : item.nameEn;

  return (
    <CommandItem
      value={`${itemName} ${item.nameDa} ${item.nameEn}`}
      onSelect={() => onSelect(item.id)}
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[#f0fdf9] dark:data-[selected=true]:bg-[#1a2e2b] data-[selected=true]:text-[#0d9488] dark:data-[selected=true]:text-[#2dd4bf] rounded-md mx-1 my-0.5 transition-colors duration-100"
    >
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#f0fdf9] dark:bg-[#1a2e2b] shrink-0 transition-colors duration-100 data-[selected=true]:bg-[#0d9488]/10 dark:data-[selected=true]:bg-[#2dd4bf]/10">
        <ItemIcon className="h-4 w-4 text-[#0d9488]/70 dark:text-[#2dd4bf]/70" />
      </div>
      <span className="flex-1 truncate text-[14px]">
        <HighlightMatch text={itemName} query={search} />
      </span>
      <Kbd>↵</Kbd>
    </CommandItem>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const { language } = useLanguageStore();
  const isDa = language === 'da';

  const handleSelect = useCallback(
    (viewId: string) => {
      onNavigate(viewId);
      onOpenChange(false);
    },
    [onNavigate, onOpenChange]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isDa ? 'Kommandopalet' : 'Command Palette'}
      description={isDa ? 'Søg efter en side at navigere til...' : 'Search for a page to navigate to...'}
      className="sm:max-w-[560px] rounded-xl border border-[#e2e8e6] dark:border-[#2a3330] shadow-2xl"
    >
      {/* Search input */}
      <CommandInput
        placeholder={
          isDa
            ? 'Søg efter sider, funktioner...'
            : 'Search pages, features...'
        }
        className="h-12 text-[15px]"
      />

      <CommandList className="max-h-[360px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2.5 py-6">
            <div className="h-11 w-11 rounded-full bg-[#f0fdf9] dark:bg-[#1a2e2b] flex items-center justify-center">
              <Search className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
            </div>
            <p className="text-sm text-muted-foreground">
              {isDa ? 'Ingen resultater fundet' : 'No results found'}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {isDa ? 'Prøv et andet søgeord' : 'Try a different search term'}
            </p>
          </div>
        </CommandEmpty>

        {NAV_SECTIONS.map((section, sectionIndex) => {
          const SectionIcon = section.icon;
          const sectionName = isDa ? section.nameDa : section.nameEn;

          return (
            <React.Fragment key={section.id}>
              {sectionIndex > 0 && <CommandSeparator className="my-1" />}
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5">
                    <SectionIcon className="h-3.5 w-3.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                    {sectionName}
                  </span>
                }
              >
                {section.items.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    isDa={isDa}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            </React.Fragment>
          );
        })}
      </CommandList>

      {/* Footer with keyboard hints */}
      <div className="flex items-center justify-between border-t border-[#e2e8e6] dark:border-[#2a3330] px-4 py-2.5 bg-[#f8faf9]/80 dark:bg-[#0f1211]/80">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>
              <ArrowUpDown className="h-3 w-3" />
            </Kbd>
            <span className="hidden sm:inline">{isDa ? 'Naviger' : 'Navigate'}</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeft className="h-3 w-3" />
            </Kbd>
            <span className="hidden sm:inline">{isDa ? 'Åbn' : 'Open'}</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd>
            <span className="hidden sm:inline">{isDa ? 'Luk' : 'Close'}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <Search className="h-3.5 w-3.5" />
          <span>{isDa ? `${TOTAL_PAGES} sider` : `${TOTAL_PAGES} pages`}</span>
        </div>
      </div>
    </CommandDialog>
  );
}

// ── Hook: useCommandPalette ────────────────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return { open, setOpen };
}
