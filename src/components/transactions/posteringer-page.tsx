'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { useScannerStore } from '@/lib/scanner-store';
import { TransactionsPage } from '@/components/transactions/transactions-page';
import { RecurringEntriesPage } from '@/components/recurring-entries/recurring-entries-page';
import { PageHeader } from '@/components/shared/page-header';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Receipt, RefreshCw, Plus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PosteringerPageProps {
  user: any; // User type from auth-store
  defaultTab?: 'transactions' | 'recurring';
}

export function PosteringerPage({ user, defaultTab = 'transactions' }: PosteringerPageProps) {
  const { language } = useLanguageStore();
  const { t } = useTranslation();
  const isDa = language === 'da';
  const [activeTab, setActiveTab] = useState<'transactions' | 'recurring'>(defaultTab);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [recurringTrigger, setRecurringTrigger] = useState(0);

  // ── Standalone scanner flow (FAB → scan → form) ──
  // When the user captures a receipt via the standalone scanner (FAB "Scan bilag"),
  // the scanner stores the result in scannerStore.pendingResult and navigates here.
  //
  // We use a TWO-PRONGED approach to reliably catch the file:
  //   1. On mount, check if a result is already waiting in the store.
  //   2. Subscribe for future result changes (handles case where we're already mounted).
  //
  // A `lastConsumedId` ref prevents double-consumption if both paths fire.
  const [preloadedFile, setPreloadedFile] = useState<File | null>(null);
  const lastConsumedIdRef = useRef<number>(0);

  /**
   * Core handler: given a ScanResult, consume it and open the dialog.
   * Uses requestAnimationFrame to ensure the DOM is fully committed.
   */
  const openFormWithScan = useCallback((result: { file: File; id: number }) => {
    if (result.id === lastConsumedIdRef.current) return; // already consumed
    lastConsumedIdRef.current = result.id;
    // requestAnimationFrame guarantees the current paint/commit is done
    requestAnimationFrame(() => {
      setPreloadedFile(result.file);
      setIsTransactionDialogOpen(true);
    });
  }, []);

  useEffect(() => {
    // PRONG 1: Check if a result was already waiting when we mounted.
    const existing = useScannerStore.getState().pendingResult;
    if (existing && existing.id !== lastConsumedIdRef.current) {
      const claimed = useScannerStore.getState().consumeResult();
      if (claimed) {
        openFormWithScan(claimed);
      }
    }

    // PRONG 2: Subscribe for future results (handles already-mounted case).
    const unsubscribe = useScannerStore.subscribe((state, prevState) => {
      // Detect new result arrival: null → ScanResult
      if (state.pendingResult && !prevState.pendingResult) {
        const claimed = useScannerStore.getState().consumeResult();
        if (claimed) {
          openFormWithScan(claimed);
        }
      }
    });

    return () => unsubscribe();
  }, [openFormWithScan]);

  // ── Embedded scanner tracking (for Dialog protection) ──
  // When the scanner is opened from within the form (embedded mode),
  // we need to prevent Radix Dialog from closing on "outside clicks"
  // because the scanner portals to document.body.
  const isScannerActiveRef = useRef(false);

  const handleAddTransaction = useCallback(() => {
    setIsTransactionDialogOpen(false);
    setPreloadedFile(null);
  }, []);

  const handleOpenRecurringDialog = useCallback(() => {
    setRecurringTrigger((prev) => prev + 1);
  }, []);

  // Switch from transaction dialog to recurring entry: close dialog, switch tab, open recurring create
  const handleSwitchToRecurring = useCallback(() => {
    setIsTransactionDialogOpen(false);
    setActiveTab('recurring');
    // Small delay so the tab switch renders RecurringEntriesPage before triggering create
    setTimeout(() => setRecurringTrigger((prev) => prev + 1), 100);
  }, []);

  /**
   * CRITICAL FIX: Prevent Radix Dialog from closing when the embedded scanner is active.
   *
   * The ReceiptScanner renders via createPortal → document.body, which is outside
   * the Dialog's React tree. Radix treats any pointer-down on elements outside
   * DialogContent as an "outside click" and fires onOpenChange(false), which
   * closes the Dialog AND unmounts the scanner — making all scanner buttons
   * completely unresponsive.
   *
   * Note: This only applies to the embedded scanner (opened from within the form).
   * The standalone scanner (FAB "Scan bilag") is rendered outside any Dialog.
   */
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open && isScannerActiveRef.current) return; // embedded scanner is open — ignore
    setIsTransactionDialogOpen(open);
    if (!open) {
      setPreloadedFile(null);
    }
  }, []);

  const handlePointerDownOutside = useCallback((e: Event) => {
    if (isScannerActiveRef.current) {
      e.preventDefault();
    }
  }, []);

  // Callback from AddTransactionForm when it has consumed the preloaded file
  const handlePreloadedFileConsumed = useCallback(() => {
    setPreloadedFile(null);
  }, []);

  const tabs = [
    {
      id: 'transactions' as const,
      labelDa: 'Alle posteringer',
      labelEn: 'All Transactions',
      icon: Receipt,
    },
    {
      id: 'recurring' as const,
      labelDa: 'Gentagende posteringer',
      labelEn: 'Recurring Entries',
      icon: RefreshCw,
    },
  ];

  return (
    <div className="space-y-0">
      {/* Unified PageHeader with stacked action buttons */}
      <div className="p-3 lg:p-6 pb-0">
        <PageHeader
          title={isDa ? 'Indkøb & Kvittering' : 'Purchases & Receipts'}
          description={isDa
            ? 'Registrer køb og vedhæft kvitteringer'
            : 'Record purchases and attach receipts'}
          action={
            <Dialog open={isTransactionDialogOpen} onOpenChange={handleDialogOpenChange}>
              <Button
                onClick={() => setIsTransactionDialogOpen(true)}
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm text-sm font-medium transition-all"
              >
                <Plus className="h-4 w-4" />
                {isDa ? 'Tilføj indkøb' : 'Add Purchase'}
              </Button>
              <DialogContent
                className="max-w-md max-h-[90vh] overflow-y-auto dialog-bg-translucent backdrop-blur-md lg:backdrop-blur-none"
                onPointerDownOutside={handlePointerDownOutside}
              >
                <DialogHeader>
                  <DialogTitle className="dark:text-white flex items-center gap-2">
                    <Plus className="h-5 w-5 text-[#2dd4bf]" />
                    {isDa ? 'Tilføj indkøb' : 'Add Purchase'}
                  </DialogTitle>
                  <DialogDescription className="dark:text-gray-400">{isDa ? 'Vælg en omkostningskonto og bogfør købet i dobbelt-posteringsregnskabet' : 'Select an expense account and record the purchase in the double-entry ledger'}</DialogDescription>
                </DialogHeader>
                <AddTransactionForm
                  onSuccess={handleAddTransaction}
                  preloadedReceiptFile={preloadedFile}
                  onPreloadedFileConsumed={handlePreloadedFileConsumed}
                  onScannerActiveChange={(active) => {
                    isScannerActiveRef.current = active;
                  }}
                />
                <div className="pt-2 mt-2 border-t border-gray-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={handleSwitchToRecurring}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/5 dark:hover:bg-[#2dd4bf]/5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="flex-1 text-left font-medium">
                      {isDa ? 'Tilføj gentagende indkøb' : 'Add recurring purchase'}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-50" />
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />
      </div>

      {/* Tab bar */}
      <div className="px-4 lg:px-8">
        <div className="flex items-center gap-1 border-b border-[#e2e8e6] dark:border-[#2a3330]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px',
                  isActive
                    ? 'border-[#0d9488] text-[#0d9488] dark:border-[#2dd4bf] dark:text-[#2dd4bf]'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="h-4 w-4" />
                {isDa ? tab.labelDa : tab.labelEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — hideHeader since PosteringerPage owns the header */}
      <div className="mt-4">
        {activeTab === 'transactions' ? (
          <TransactionsPage user={user} hideHeader defaultTypeFilter="PURCHASE" />
        ) : (
          <RecurringEntriesPage user={user} hideHeader triggerCreate={recurringTrigger} />
        )}
      </div>
    </div>
  );
}
