'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLanguageStore } from '@/lib/language-store';
import { formatDistanceToNow } from 'date-fns';
import { da, enGB } from 'date-fns/locale';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  AlertTriangle,
  FileText,
  Calculator,
  Landmark,
  BookOpen,
  CheckCircle2,
  X,
} from 'lucide-react';

interface NotificationCenterProps {
  onNavigate: (view: string) => void;
}

interface NotificationItem {
  id: string;
  type: 'overdue' | 'vat' | 'bank-recon' | 'journal';
  icon: React.ReactNode;
  title: string;
  description: string;
  timeAgo: string;
  actionView: string;
  actionLabel: string;
}

// Bilingual strings
const strings = {
  da: {
    title: 'Notifikationer',
    markAllRead: 'Markér alle som læst',
    emptyTitle: 'Ingen notifikationer',
    emptyDesc: 'Du er helt opdateret!',
    overdueInvoices: 'Forfaldne fakturaer',
    overdueDescSingle: '1 faktura er forfalden og afventer betaling',
    overdueDescMulti: (count: number) =>
      `${count} fakturaer er forfaldne og afventer betaling`,
    vatDeadline: 'Momsfrist nærmer sig',
    vatDesc: 'Momsrapporten for perioden skal indsendes',
    bankRecon: 'Bankafstemning',
    bankReconDesc: 'Gennemgå bankafstemning for uafstemte posteringer',
    recentJournal: 'Seneste posteringer',
    recentJournalDesc: (ref: string, desc: string) =>
      `${ref}: ${desc}`,
    viewInvoices: 'Vis fakturaer',
    viewVat: 'Momsrapport',
    viewBankRecon: 'Bankafstemning',
    viewJournal: 'Finansjournal',
  },
  en: {
    title: 'Notifications',
    markAllRead: 'Mark all as read',
    emptyTitle: 'No notifications',
    emptyDesc: "You're all caught up!",
    overdueInvoices: 'Overdue Invoices',
    overdueDescSingle: '1 invoice is overdue and awaiting payment',
    overdueDescMulti: (count: number) =>
      `${count} invoices are overdue and awaiting payment`,
    vatDeadline: 'VAT Deadline Approaching',
    vatDesc: 'VAT report for the period needs to be filed',
    bankRecon: 'Bank Reconciliation',
    bankReconDesc: 'Review bank reconciliation for unmatched transactions',
    recentJournal: 'Recent Journal Entries',
    recentJournalDesc: (ref: string, desc: string) =>
      `${ref}: ${desc}`,
    viewInvoices: 'View Invoices',
    viewVat: 'VAT Report',
    viewBankRecon: 'Bank Reconciliation',
    viewJournal: 'Journal',
  },
};

const STORAGE_KEY = 'alphaai-notifications-read';
const FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const { language } = useLanguageStore();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const t = strings[language];

  const locale = language === 'da' ? da : enGB;

  // Track whether we have loaded from localStorage to prevent the persist
  // effect from clobbering saved read state with the initial empty Set.
  const hasLoadedFromStorage = useRef(false);

  // Load read IDs from localStorage on mount (synchronous-ish init)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setReadIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // Ignore localStorage errors
    }
    // Mark as loaded after the microtask so the persist effect skips the first cycle
    // (React batches the setReadIds above with the re-render, so by the next
    //  render hasLoadedFromStorage is true and the persist effect won't wipe data).
    requestAnimationFrame(() => { hasLoadedFromStorage.current = true; });
  }, []);

  // Compute next VAT deadline: 1st day of the 2nd following month
  const computeVatDeadline = useCallback((): Date => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const targetMonth = currentMonth + 2;
    const targetDate = new Date(now.getFullYear(), targetMonth, 1);
    // Handle year overflow
    if (targetDate.getMonth() !== targetMonth % 12) {
      // Month overflowed, adjust
    }
    return targetDate;
  }, []);

  // Fetch notification data
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const items: NotificationItem[] = [];

      // 1. Fetch invoices for overdue check
      try {
        const invRes = await fetch('/api/invoices');
        if (invRes.ok) {
          const invData = await invRes.json();
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const overdueInvoices = (invData.invoices || []).filter(
            (inv: { status: string; dueDate: string; cancelled: boolean }) =>
              inv.status !== 'PAID' &&
              inv.status !== 'CANCELLED' &&
              !inv.cancelled &&
              new Date(inv.dueDate) < today
          );

          if (overdueInvoices.length > 0) {
            // Sort by due date descending to show most urgent first
            overdueInvoices.sort(
              (a: { dueDate: string }, b: { dueDate: string }) =>
                new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
            );

            // Create one notification per overdue invoice (up to 3)
            const showInvoices = overdueInvoices.slice(0, 3);
            for (const inv of showInvoices) {
              const dueDate = new Date(inv.dueDate);
              items.push({
                id: `overdue-${inv.id}`,
                type: 'overdue',
                icon: (
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                ),
                title: t.overdueInvoices,
                description: `${inv.invoiceNumber} — ${inv.customerName}`,
                timeAgo: formatDistanceToNow(dueDate, { addSuffix: true, locale }),
                actionView: 'invoices',
                actionLabel: t.viewInvoices,
              });
            }

            // Summary notification if more than 3
            if (overdueInvoices.length > 3) {
              items.push({
                id: 'overdue-summary',
                type: 'overdue',
                icon: (
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                ),
                title: t.overdueInvoices,
                description: t.overdueDescMulti(overdueInvoices.length),
                timeAgo: formatDistanceToNow(new Date(overdueInvoices[overdueInvoices.length - 1].dueDate), {
                  addSuffix: true,
                  locale,
                }),
                actionView: 'invoices',
                actionLabel: t.viewInvoices,
              });
            }
          }
        }
      } catch {
        // Silently fail invoice fetch
      }

      // 2. VAT deadline notification
      const vatDeadline = computeVatDeadline();
      const daysUntilVat = Math.ceil(
        (vatDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      // Show if within 30 days
      if (daysUntilVat >= 0 && daysUntilVat <= 30) {
        items.push({
          id: 'vat-deadline',
          type: 'vat',
          icon: (
            <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
              <Calculator className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          ),
          title: t.vatDeadline,
          description:
            daysUntilVat <= 7
              ? `${language === 'da' ? 'Om' : 'In'} ${daysUntilVat} ${language === 'da' ? 'dage' : 'days'} — ${t.vatDesc}`
              : t.vatDesc,
          timeAgo: formatDistanceToNow(vatDeadline, { addSuffix: true, locale }),
          actionView: 'vat-report',
          actionLabel: t.viewVat,
        });
      }

      // 3. Bank reconciliation reminder
      try {
        const bankRes = await fetch('/api/bank-reconciliation?status=unmatched');
        if (bankRes.ok) {
          const bankData = await bankRes.json();
          const statements = bankData.bankStatements || [];
          if (statements.length > 0) {
            items.push({
              id: 'bank-recon-reminder',
              type: 'bank-recon',
              icon: (
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                  <Landmark className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              ),
              title: t.bankRecon,
              description: t.bankReconDesc,
              timeAgo: formatDistanceToNow(
                new Date(statements[0].importDate || statements[0].startDate),
                { addSuffix: true, locale }
              ),
              actionView: 'bank-recon',
              actionLabel: t.viewBankRecon,
            });
          }
        }
      } catch {
        // Silently fail bank fetch
      }

      // 4. Recent journal entries (last 3 posted)
      try {
        const journalRes = await fetch('/api/journal-entries?status=POSTED');
        if (journalRes.ok) {
          const journalData = await journalRes.json();
          const entries = (journalData.journalEntries || [])
            .filter((e: { cancelled: boolean }) => !e.cancelled)
            .slice(0, 3);

          for (const entry of entries) {
            items.push({
              id: `journal-${entry.id}`,
              type: 'journal',
              icon: (
                <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              ),
              title: t.recentJournal,
              description: t.recentJournalDesc(
                entry.reference || entry.id.slice(0, 8),
                entry.description || ''
              ),
              timeAgo: formatDistanceToNow(new Date(entry.createdAt), {
                addSuffix: true,
                locale,
              }),
              actionView: 'journal',
              actionLabel: t.viewJournal,
            });
          }
        }
      } catch {
        // Silently fail journal fetch
      }

      setNotifications(items);
    } finally {
      setIsLoading(false);
    }
  }, [t, locale, language, computeVatDeadline]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, FETCH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Persist read IDs to localStorage — skip the initial mount cycle to avoid
  // overwriting saved state with the empty default Set before the load effect runs.
  useEffect(() => {
    if (!hasLoadedFromStorage.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...readIds]));
    } catch {
      // Ignore localStorage errors
    }
  }, [readIds]);

  // Compute unread count
  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  }, [notifications]);

  // Handle notification click
  const handleNotificationClick = useCallback(
    (notification: NotificationItem) => {
      // Mark this notification as read
      setReadIds((prev) => new Set([...prev, notification.id]));
      setOpen(false);
      onNavigate(notification.actionView);
    },
    [onNavigate]
  );

  // Group notifications by type
  const groupedNotifications = useMemo(() => {
    const groups: { type: string; icon: React.ReactNode; items: NotificationItem[] }[] = [];
    const typeOrder = ['overdue', 'vat', 'bank-recon', 'journal'];

    for (const type of typeOrder) {
      const items = notifications.filter((n) => n.type === type);
      if (items.length > 0) {
        groups.push({
          type,
          icon: items[0].icon,
          items,
        });
      }
    }

    return groups;
  }, [notifications]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative text-gray-500 dark:text-gray-400 hover:text-[#0d9488] dark:hover:text-[#2dd4bf] transition-colors"
          aria-label={t.title}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            {t.title}
          </h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-auto px-2 py-1 text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/10 dark:hover:bg-[#2dd4bf]/10 transition-colors"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t.markAllRead}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-auto w-7 p-0 text-gray-400 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="max-h-80 overflow-y-auto scrollable-thin">
          {isLoading ? (
            // Loading skeleton
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="h-12 w-12 rounded-full bg-[#0d9488]/10 dark:bg-[#2dd4bf]/10 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {t.emptyTitle}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t.emptyDesc}
              </p>
            </div>
          ) : (
            // Grouped notifications
            <div className="divide-y divide-[var(--border)]">
              {groupedNotifications.map((group, groupIndex) => (
                <div key={group.type}>
                  {group.items.map((notification, itemIndex) => {
                    const isRead = readIds.has(notification.id);
                    const isFirstInGroup = itemIndex === 0;
                    const isLastInGroup =
                      itemIndex === group.items.length - 1;
                    const isLastGroup =
                      groupIndex === groupedNotifications.length - 1 &&
                      isLastInGroup;

                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className={`
                          w-full flex items-start gap-3 px-4 py-3 text-left
                          transition-colors cursor-pointer
                          hover:bg-[#f0fdf9]/60 dark:hover:bg-[#1a2e2b]/50
                          ${isFirstInGroup ? 'pt-3' : 'pt-2.5'}
                          ${isLastGroup ? 'pb-3' : 'pb-2.5'}
                          ${!isRead ? 'bg-[#0d9488]/[0.03] dark:bg-[#2dd4bf]/[0.03]' : ''}
                        `}
                      >
                        {/* Unread indicator dot */}
                        {!isRead && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-[#0d9488] dark:bg-[#2dd4bf]" />
                        )}

                        {/* Icon */}
                        <div className="relative shrink-0">{notification.icon}</div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-sm font-medium text-foreground truncate ${
                                !isRead ? '' : 'font-normal'
                              }`}
                            >
                              {notification.title}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {notification.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[11px] text-muted-foreground/70">
                              {notification.timeAgo}
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-4 px-1.5 text-[10px] font-normal"
                            >
                              {notification.actionLabel}
                            </Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && notifications.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-2.5 bg-muted/30">
              <p className="text-[11px] text-muted-foreground text-center">
                {language === 'da'
                  ? `${unreadCount} ulæst${unreadCount !== 1 ? 'e' : ''} af ${notifications.length}`
                  : `${unreadCount} unread of ${notifications.length}`}
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
