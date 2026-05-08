'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import {
  Plus,
  Calculator,
  TrendingUp,
  TrendingDown,
  FileText,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Shield,
  Scale,
  BookOpen,
  Landmark,
  AlertTriangle,
  PenLine,
  BarChart3,
  ChevronRight,
  ArrowRight,
  ArrowDownLeft,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  CheckCircle,
  Clock,
  Wand2,
  Building2,
  ListChecks,
  FilePlus2,
  Eye,
  EyeOff,
  FlaskConical,
  Wallet,
  PiggyBank,
  Activity,
  Gauge,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Minus,
  CircleDot,
  Settings2,
  Check,
  Play,
  Video,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatsCard } from '@/components/shared/stats-card';
import { DateRangeFilter } from '@/components/shared/date-range-filter';
import { useDashboardWidgets, DASHBOARD_WIDGETS } from '@/lib/dashboard-widgets';
import { ExpenseAnalysis } from '@/components/expense-analysis/expense-analysis';
import { ProfitLossWaterfall } from '@/components/profit-loss-waterfall/profit-loss-waterfall';
import { FinancialHealthWidget } from '@/components/financial-health/financial-health-widget';
import { BudgetVsActualWidget } from '@/components/budget-vs-actual/budget-vs-actual-widget';
import { CashFlowForecast } from '@/components/cash-flow-forecast/cash-flow-forecast';
import { CategorizationSuggestionsList } from '@/components/transaction/categorization-badge';
import { OnboardingCompleteOverlay } from '@/components/dashboard/onboarding-complete-overlay';
import { format, subMonths, startOfYear, startOfMonth, addMonths } from 'date-fns';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE' | 'SALARY' | 'BANK' | 'Z_REPORT' | 'PRIVATE' | 'ADJUSTMENT';
  amount: number;
  description: string;
  vatPercent: number;
  receiptImage: string | null;
  invoiceId?: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: string;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
  customerName: string;
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  status: string;
  cancelled: boolean;
  lines: Array<{
    id: string;
    debit: number;
    credit: number;
    description: string | null;
    account: {
      number: string;
      name: string;
      type: string;
    };
  }>;
}

interface LedgerAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

interface IncomeStatement {
  grossProfit: { revenue: number; costOfGoods: number; grossProfit: number };
  operatingExpenses: { personnel: number; otherOperating: number; total: number };
  operatingResult: number;
  financialItems: { financialIncome: number; financialExpenses: number; net: number };
  netResult: number;
}

interface BalanceSheet {
  assets: { totalAssets: number };
  liabilities: { totalLiabilities: number };
  equity: { totalEquity: number; currentYearResult: number };
}

interface DashboardProps {
  user: User;
  onNavigate?: (view: string) => void;
  onboardingStepJustDone?: number;
  onOnboardingStepDoneConsumed?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────

const COLORS = ['#0d9488', '#7c9a82', '#d4915c', '#6366f1', '#c9928f', '#7dabb5'];


// ─── Component ────────────────────────────────────────────────────

export function Dashboard({ user, onNavigate, onboardingStepJustDone, onOnboardingStepDoneConsumed }: DashboardProps) {
  const { setUser } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t, tc, td, tm, language } = useTranslation();

  // Double-entry state
  const [hasDoubleEntryData, setHasDoubleEntryData] = useState(false);
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [allPostedJournalEntries, setAllPostedJournalEntries] = useState<JournalEntry[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [vatRegister, setVatRegister] = useState<{
    totalOutputVAT?: number;
    totalInputVAT?: number;
    netVAT?: number;
    outputVAT?: Array<{ code: string; rate: number; netAmount: number }>;
    inputVAT?: Array<{ code: string; rate: number; netAmount: number }>;
  } | null>(null);

  // Onboarding state
  const [isSeeding, setIsSeeding] = useState(false);
  const [hasCompanyInfo, setHasCompanyInfo] = useState(false);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [onboardingVideoExists, setOnboardingVideoExists] = useState(true);
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const { isWidgetVisible, toggleWidget, resetWidgets, isAppOwner, widgetOrder, moveWidgetUp, moveWidgetDown, getWidgetOrderIndex } = useDashboardWidgets();

  const widgetOrderMap = useMemo(() => {
    const map: Record<string, number> = {};
    widgetOrder.forEach((id, idx) => { map[id] = idx; });
    return map;
  }, [widgetOrder]);

  // ─── Date helpers ───────────────────────────────────────────────

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const yearStart = useMemo(() => format(startOfYear(new Date()), 'yyyy-MM-dd'), []);
  const sixMonthsAgo = useMemo(() => format(subMonths(new Date(), 5), 'yyyy-MM-01'), []);
  // Wide range for "All time" — ensures we capture all data including historical demo data
  const allTimeFrom = '2000-01-01';
  const allTimeTo = '2099-12-31';

  // ─── Fetch legacy data ──────────────────────────────────────────

  const fetchLegacyData = useCallback(async () => {
    try {
      const [txResponse, invResponse] = await Promise.all([
        fetch('/api/transactions'),
        fetch('/api/invoices'),
      ]);

      if (!txResponse.ok) console.error('Transactions API error:', txResponse.status);
      if (!invResponse.ok) console.error('Invoices API error:', invResponse.status);

      const txData = txResponse.ok ? await txResponse.json() : {};
      const invData = invResponse.ok ? await invResponse.json() : {};

      const allTransactions: Transaction[] = txData.transactions || [];
      const invoices: Invoice[] = invData.invoices || [];

      const invoiceIdsWithTransactions = new Set(
        allTransactions
          .filter((tx) => tx.invoiceId)
          .map((tx) => tx.invoiceId)
      );

      const virtualTransactions: Transaction[] = [];

      for (const invoice of invoices) {
        if (invoice.status === 'CANCELLED' || invoice.status === 'DRAFT') continue;
        if (invoiceIdsWithTransactions.has(invoice.id)) continue;

        try {
          const lineItems = JSON.parse(invoice.lineItems) as Array<{
            description: string;
            quantity: number;
            unitPrice: number;
            vatPercent: number;
          }>;

          for (const item of lineItems) {
            if (!item.description?.trim() || item.unitPrice <= 0) continue;

            const lineTotal = item.quantity * item.unitPrice;
            virtualTransactions.push({
              id: `inv-${invoice.id}-${item.description.slice(0, 20)}`,
              date: invoice.issueDate,
              type: 'SALE',
              amount: lineTotal,
              description: `${invoice.invoiceNumber} - ${item.description}`,
              vatPercent: item.vatPercent,
              receiptImage: null,
              invoiceId: invoice.id,
            });
          }
        } catch {
          console.warn(`Could not parse lineItems for invoice ${invoice.id}`);
        }
      }

      setTransactions([...allTransactions, ...virtualTransactions]);
      setInvoices(invoices);
    } catch (error) {
      console.error('Failed to fetch legacy data:', error);
    }
  }, []);

  // ─── Fetch double-entry data ────────────────────────────────────

  const fetchDoubleEntryData = useCallback(async () => {
    try {
      // When "Altid" (All Time) is selected (dateRange is null), use a wide range
      const from = dateRange ? format(dateRange.from, 'yyyy-MM-dd') : allTimeFrom;
      const to = dateRange ? format(dateRange.to, 'yyyy-MM-dd') : allTimeTo;

      // Always fetch ALL posted journal entries (no date filter) to determine if double-entry data exists
      const [isRes, bsRes, jeRes, allJeRes, ledgerRes, vatRes] = await Promise.all([
        fetch(`/api/reports?type=income-statement&from=${from}&to=${to}`),
        fetch(`/api/reports?type=balance-sheet&to=${to}`),
        fetch(`/api/journal-entries?status=POSTED&from=${from}&to=${to}`),
        fetch(`/api/journal-entries?status=POSTED`), // All entries regardless of date range
        fetch(`/api/ledger?from=${from}&to=${to}`),
        fetch(`/api/vat-register?from=${from}&to=${to}`),
      ]);

      const [isData, bsData, jeData, allJeData, ledgerData, vatData] = await Promise.all([
        isRes.ok ? isRes.json() : null,
        bsRes.ok ? bsRes.json() : null,
        jeRes.ok ? jeRes.json() : null,
        allJeRes.ok ? allJeRes.json() : null,
        ledgerRes.ok ? ledgerRes.json() : null,
        vatRes.ok ? vatRes.json() : null,
      ]);

      // Use ALL entries (no date filter) to determine if double-entry data exists
      const allPostedEntries: JournalEntry[] = (allJeData?.journalEntries || []).filter(
        (e: JournalEntry) => !e.cancelled
      );
      const hasData = allPostedEntries.length > 0;
      setHasDoubleEntryData(hasData);

      // Filtered entries for the selected date range
      const postedEntries: JournalEntry[] = (jeData?.journalEntries || []).filter(
        (e: JournalEntry) => !e.cancelled
      );

      if (hasData) {
        setIncomeStatement(isData);
        setBalanceSheet(bsData);
        // Keep first 5 for recent display, but store all for chart aggregation
        setJournalEntries(postedEntries.slice(0, 5));
        setAllPostedJournalEntries(postedEntries);
        setLedgerAccounts(ledgerData?.accounts || []);
        setVatRegister(vatData);
      }
    } catch (error) {
      console.error('Failed to fetch double-entry data:', error);
    }
  }, [dateRange]);

  // ─── Fetch onboarding data ──────────────────────────────────────

  const fetchOnboardingData = useCallback(async () => {
    try {
      const [companyRes, accountsRes, demoModeRes] = await Promise.all([
        fetch('/api/company'),
        fetch('/api/accounts'),
        fetch('/api/demo-mode'),
      ]);

      if (companyRes.ok) {
        const companyData = await companyRes.json();
        // Consider "Company Info" step done only when the user has actually
        // filled in meaningful data — not just the auto-generated name from registration.
        // A properly configured company should have at least a CVR number or address.
        const info = companyData.companyInfo;
        if (info) {
          const hasCvr = !!info.cvrNumber?.trim();
          const hasAddress = !!info.address?.trim();
          const hasBank = !!info.bankName?.trim() || !!info.bankAccount?.trim();
          setHasCompanyInfo(hasCvr || hasAddress || hasBank);
        } else {
          setHasCompanyInfo(false);
        }
      }

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setHasAccounts(Array.isArray(accountsData) ? accountsData.length > 0 : Array.isArray(accountsData.accounts) ? accountsData.accounts.length > 0 : false);
      }

      if (demoModeRes.ok) {
        const demoData = await demoModeRes.json();
        const isDemo = demoData.isDemoCompany === true;
        setDemoModeEnabled(isDemo);
        setUser({ ...user, demoModeEnabled: isDemo, isDemoCompany: isDemo });
      }
    } catch (error) {
      console.error('Failed to fetch onboarding data:', error);
    }
  }, []);

  // ─── Master fetch ───────────────────────────────────────────────

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchLegacyData(), fetchDoubleEntryData(), fetchOnboardingData()]);
    setIsLoading(false);
  }, [fetchLegacyData, fetchDoubleEntryData, fetchOnboardingData]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleAddTransaction = useCallback(() => {
    setIsDialogOpen(false);
    fetchAllData();
  }, [fetchAllData]);

  const handleLoadDemoData = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enter' }),
      });
      if (res.ok) {
        const data = await res.json();
        setDemoModeEnabled(true);
        setUser({ ...user, demoModeEnabled: true, isDemoCompany: true, activeCompanyId: data.activeCompanyId, activeCompanyName: data.activeCompanyName });
        // Reload page to refresh all data with the new company context
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Failed to load demo data:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleToggleDemoMode = async () => {
    try {
      const action = demoModeEnabled ? 'exit' : 'enter';
      const res = await fetch('/api/demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        // Reload to refresh all data with the new company context
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Failed to toggle demo mode:', error);
    }
  };

  // ─── Invoice stats ───────────────────────────────────────────
  // Invoice counts come from the Invoice table (document-level status).
  // Financial amounts come from the double-entry ledger (RECEIVABLES accounts)
  // to ensure consistency with the journal as single source of truth.

  const invoiceStats = useMemo(() => {
    const now = new Date();
    const activeInvoices = invoices.filter((inv) => inv.status !== 'CANCELLED' && inv.status !== 'DRAFT');
    const outstandingInvoices = activeInvoices.filter((inv) => inv.status !== 'PAID');
    const paidInvoices = activeInvoices.filter((inv) => inv.status === 'PAID');
    const overdueInvoices = outstandingInvoices.filter((inv) => new Date(inv.dueDate) < now);

    // Get receivable balance from the ledger (double-entry journal)
    // RECEIVABLES accounts (e.g., 1200 Debitorer) have debit natural balance
    const receivableBalance = ledgerAccounts
      .filter((acc) => acc.accountType === 'ASSET' && acc.balance > 0 &&
        // Match receivable accounts (1200 series in Danish chart of accounts)
        acc.accountNumber.startsWith('12'))
      .reduce((sum, acc) => sum + acc.balance, 0);

    // Paid total from ledger: sum of bank account credits from invoice cash receipts
    // For simplicity, derive paid total as total invoiced minus outstanding receivable
    const totalInvoiced = activeInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const paidFromJournal = Math.max(0, totalInvoiced - receivableBalance);

    return {
      outstandingCount: outstandingInvoices.length,
      outstandingTotal: receivableBalance, // From journal (receivable balance)
      paidCount: paidInvoices.length,
      paidTotal: paidFromJournal, // Derived: total invoiced − receivable balance
      overdueCount: overdueInvoices.length,
      overdueTotal: overdueInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0), // Document-level estimate
    };
  }, [invoices, ledgerAccounts]);

  // ─── Onboarding / empty state ──────────────────────────────────

  // Use useEffect to read localStorage after mount to avoid hydration mismatch
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('alphaflow-onboarding-dismissed') === 'true';
    setOnboardingDismissed(stored);
  }, []);

  // Re-fetch onboarding data when the browser tab regains visibility.
  // This catches the case where another device (same account) completes
  // onboarding while this tab was in the background.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !onboardingDismissed) {
        fetchOnboardingData();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchOnboardingData, onboardingDismissed]);

  // Auto-reset onboarding if it was dismissed but never actually completed
  // (no company info AND no accounts = fresh/incomplete state)
  useEffect(() => {
    if (!isLoading && onboardingDismissed && !hasCompanyInfo && !hasAccounts && !hasDoubleEntryData) {
      setOnboardingDismissed(false);
      localStorage.removeItem('alphaflow-onboarding-dismissed');
    }
  }, [isLoading, onboardingDismissed, hasCompanyInfo, hasAccounts, hasDoubleEntryData]);

  const isEmptyState = !isLoading && !hasDoubleEntryData && !onboardingDismissed;

  const onboardingSteps = useMemo(() => [
    {
      step: 1,
      key: 'company',
      title: language === 'da' ? 'Virksomhedsoplysninger' : 'Company Info',
      description: language === 'da' ? 'Tilf\u00f8j virksomhedsnavn, adresse, CVR og bankoplysninger' : 'Add business name, address, CVR and bank details',
      detail: language === 'da'
        ? 'Virksomhedsoplysningerne bruges som udgangspunkt n\u00e5r du opretter fakturaer, forbinder til din bank, foretager bankafstemning og udf\u00e6rdiger rapporter. Indtast dem pr\u00e6cist som de fremg\u00e5r p\u00e5 dine officielle dokumenter.'
        : 'Company details serve as the foundation when creating invoices, connecting to your bank, performing bank reconciliation, and generating reports. Enter them exactly as they appear on your official documents.',
      bgImage: '/VidClips/Onboarding/CompInfo02.png',
      icon: Building2,
      done: hasCompanyInfo,
      action: () => onNavigate?.('settings-company'),
      gradient: 'from-[#14b8a6] to-[#99f6e4]',
      iconBg: 'bg-[#f0fdf9] dark:bg-[#1a2e2b]',
      iconColor: 'text-[#14b8a6] dark:text-[#99f6e4]',
      completeGradient: 'from-[#22c55e] to-[#4ade80]',
    },
    {
      step: 2,
      key: 'accounts',
      title: language === 'da' ? 'Opret kontoplan' : 'Chart of Accounts',
      description: language === 'da' ? 'Opret standard danske konti' : 'Create standard Danish accounts',
      detail: language === 'da'
        ? 'Kontoplanen er hjertet i dit regnskab. Den definerer de kategorier, som alle posteringer f\u00f8res p\u00e5 \u2014 fra oms\u00e6tning og omkostninger til moms og bank. Uden en kontoplan kan du ikke bogf\u00f8re.'
        : 'The chart of accounts is the backbone of your accounting. It defines the categories all transactions are posted to \u2014 from revenue and expenses to VAT and bank. Without it, you cannot record entries.',
      bgImage: '/VidClips/Onboarding/Kontoplan01.png',
      icon: ListChecks,
      done: hasAccounts,
      action: () => onNavigate?.('accounts'),
      gradient: 'from-[#10b981] to-[#34d399]',
      iconBg: 'bg-[#edf5ef] dark:bg-[#242e26]',
      iconColor: 'text-[#10b981] dark:text-[#34d399]',
      completeGradient: 'from-[#22c55e] to-[#4ade80]',
    },
  ], [hasCompanyInfo, hasAccounts, onNavigate, language]);

  const completedSteps = onboardingSteps.filter(s => s.done).length;

  // Auto-dismiss onboarding when all server-side steps are complete.
  // This is the key cross-device sync mechanism: if another device
  // completes the steps and this device fetches updated data,
  // onboarding is dismissed automatically without requiring the user
  // to manually interact or refresh.
  //
  // We skip when onboardingStepJustDone > 0 because the local-device
  // completion effect (below) already handles that path with the
  // onOnboardingStepDoneConsumed callback.
  useEffect(() => {
    if (
      !isLoading &&
      !onboardingDismissed &&
      onboardingStepJustDone === 0 &&
      completedSteps === onboardingSteps.length &&
      onboardingSteps.length > 0
    ) {
      // All onboarding steps are done according to server data —
      // e.g. completed on another device or page was refreshed.
      // Show the completion overlay then dismiss.
      setShowCompletionOverlay(true);
      const timer = setTimeout(() => {
        setShowCompletionOverlay(false);
        setOnboardingDismissed(true);
        localStorage.setItem('alphaflow-onboarding-dismissed', 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, onboardingDismissed, onboardingStepJustDone, completedSteps, onboardingSteps.length]);

  // ── Onboarding completion handler ─────────────────────────────
  //
  //  When the user completes the final onboarding step and returns
  //  to the dashboard, we show a confirmation (animated overlay on
  //  mobile, inline card on desktop) then dismiss onboarding.
  //
  //  On mobile the overlay handles its own timing — it plays a
  //  circle + checkmark animation, holds briefly, fades out, then
  //  calls onComplete which dismisses onboarding and reveals the
  //  dashboard.  On desktop we use a simpler 2.5 s timer.

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingDismissed(true);
    localStorage.setItem('alphaflow-onboarding-dismissed', 'true');
    onOnboardingStepDoneConsumed?.();
  }, [onOnboardingStepDoneConsumed]);

  useEffect(() => {
    if (onboardingStepJustDone === 2 && completedSteps === onboardingSteps.length && !isLoading) {
      // Show the mobile overlay (desktop ignores it via lg:hidden)
      setShowCompletionOverlay(true);
      // Desktop fallback: dismiss after 2.5 s if the overlay hasn't fired
      const timer = setTimeout(() => {
        setShowCompletionOverlay(false);
        handleOnboardingComplete();
      }, 3000);
      return () => clearTimeout(timer);
    }
    // Consume the flag if step 1 was done (no auto-dismiss needed)
    if (onboardingStepJustDone === 1 && !isLoading) {
      onOnboardingStepDoneConsumed?.();
    }
  }, [onboardingStepJustDone, completedSteps, onboardingSteps.length, isLoading, onOnboardingStepDoneConsumed, handleOnboardingComplete]);

  // ─── VAT breakdown for pie chart ─────────────────────────────

  const currentMonth = format(new Date(), 'yyyy-MM');
  const thisMonthTransactions = transactions.filter((t) => {
    const dateStr = t.date?.substring(0, 7) || '';
    return dateStr.startsWith(currentMonth);
  });

  const salesThisMonth = useMemo(() => {
    return thisMonthTransactions.filter((t) => t.type === 'SALE' || !t.type);
  }, [thisMonthTransactions]);

  const vatBreakdown = useMemo(() => {
    // Use the per-code VAT breakdown from the register (single source of truth).
    // Each entry already has the actual VAT amount — no estimation needed.
    if (vatRegister?.outputVAT && vatRegister.outputVAT.length > 0) {
      return vatRegister.outputVAT.map((entry) => ({
        name: `${entry.rate}%`,
        rate: entry.rate,
        amount: 0,
        vat: entry.netAmount,
        count: 0,
      }));
    }
    // No output VAT breakdown available — return empty
    return [];
  }, [vatRegister]);

  // ─── Double-entry derived data ──────────────────────────────────

  const outputVAT = useMemo(() => {
    // Use VAT register data if available (real VAT from journal entry lines)
    if (vatRegister?.totalOutputVAT !== undefined) {
      return Math.round(vatRegister.totalOutputVAT * 100) / 100;
    }
    // Fallback: estimate output VAT as 25% of revenue
    if (!incomeStatement) return 0;
    return Math.round(incomeStatement.grossProfit.revenue * 0.25 * 100) / 100;
  }, [vatRegister, incomeStatement]);

  const inputVAT = useMemo(() => {
    // Use VAT register data if available
    if (vatRegister?.totalInputVAT !== undefined) {
      return Math.round(vatRegister.totalInputVAT * 100) / 100;
    }
    // Fallback: estimate input VAT as 25% of expenses
    if (!incomeStatement) return 0;
    const totalExpenses = incomeStatement.operatingExpenses.total + incomeStatement.financialItems.financialExpenses;
    return Math.round(totalExpenses * 0.25 * 100) / 100;
  }, [vatRegister, incomeStatement]);

  const netVAT = useMemo(() => {
    return Math.round((outputVAT - inputVAT) * 100) / 100;
  }, [outputVAT, inputVAT]);

  // Monthly revenue/expense chart from ledger data
  const monthlyRevenueChart = useMemo(() => {
    if (!hasDoubleEntryData) return [];
    const now = dateRange ? dateRange.to : new Date();
    const months: Record<string, { month: string; revenue: number; expenses: number; net: number }> = {};

    // Initialize months based on date range (or default 6 months)
    const rangeStart = dateRange ? dateRange.from : subMonths(new Date(), 5);
    let d = startOfMonth(rangeStart);
    const endMonth = startOfMonth(now);
    while (d <= endMonth) {
      const key = format(d, 'yyyy-MM');
      months[key] = { month: key, revenue: 0, expenses: 0, net: 0 };
      d = addMonths(d, 1);
    }

    // Aggregate from ALL journal entries (not just the 5 recent ones)
    allPostedJournalEntries.forEach((entry) => {
      const month = entry.date.substring(0, 7);
      if (!months[month]) return;

      entry.lines.forEach((line) => {
        const amt = line.debit - line.credit;
        if (line.account.type === 'REVENUE') {
          // Revenue normal balance is credit, so credit is positive revenue
          months[month].revenue += line.credit - line.debit;
        } else if (line.account.type === 'EXPENSE') {
          // Expense normal balance is debit
          months[month].expenses += line.debit - line.credit;
        }
      });
    });

    return Object.values(months).map((m) => ({
      ...m,
      revenue: Math.round(m.revenue * 100) / 100,
      expenses: Math.round(m.expenses * 100) / 100,
      net: Math.round((m.revenue - m.expenses) * 100) / 100,
      label: format(new Date(m.month + '-01'), 'MMM'),
    }));
  }, [hasDoubleEntryData, allPostedJournalEntries, dateRange]);

  // Top 5 accounts by activity
  const topAccounts = useMemo(() => {
    if (!ledgerAccounts || ledgerAccounts.length === 0) return [];
    return [...ledgerAccounts]
      .filter((a) => a.debitTotal !== 0 || a.creditTotal !== 0)
      .sort((a, b) => (Math.abs(b.debitTotal) + Math.abs(b.creditTotal)) - (Math.abs(a.debitTotal) + Math.abs(a.creditTotal)))
      .slice(0, 5);
  }, [ledgerAccounts]);

  // ─── Account type badge helper ──────────────────────────────────

  const getAccountTypeBadge = (type: string) => {
    const map: Record<string, { label: string; className: string }> = {
      ASSET: {
        label: language === 'da' ? 'Aktiv' : 'Asset',
        className: 'bg-[#e8f2f4] text-[#7dabb5] dark:bg-[#1e2e32] dark:text-[#80c0cc]',
      },
      LIABILITY: {
        label: language === 'da' ? 'Gæld' : 'Liability',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      },
      EQUITY: {
        label: language === 'da' ? 'Egenkapital' : 'Equity',
        className: 'bg-[#e6f7f3] text-[#0d9488] dark:bg-[#1a2e2b] dark:text-[#2dd4bf]',
      },
      REVENUE: {
        label: language === 'da' ? 'Indtægt' : 'Revenue',
        className: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      },
      EXPENSE: {
        label: language === 'da' ? 'Omkostning' : 'Expense',
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
      },
    };
    return map[type] || { label: type, className: 'bg-gray-100 text-gray-700 dark:text-gray-300' };
  };

  // ─── Journal entry total helper ─────────────────────────────────

  const getJournalEntryTotal = (entry: JournalEntry) => {
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  };

  // ─── Relative time helper ──────────────────────────────────────

  const getRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);

    if (diffMins < 1) return language === 'da' ? 'Lige nu' : 'Just now';
    if (diffMins < 60) return language === 'da' ? `${diffMins} min siden` : `${diffMins}m ago`;
    if (diffHours < 24) return language === 'da' ? `${diffHours} timer siden` : `${diffHours}h ago`;
    if (diffDays < 7) return language === 'da' ? `${diffDays} dage siden` : `${diffDays}d ago`;
    if (diffWeeks < 4) return language === 'da' ? `${diffWeeks} uger siden` : `${diffWeeks}w ago`;
    return td(date);
  };

  // ─── Financial Health Score ────────────────────────────────────

  const financialHealthScore = useMemo(() => {
    if (!incomeStatement || !balanceSheet) return null;

    const revenue = incomeStatement.grossProfit.revenue;
    const expenses = incomeStatement.operatingExpenses.total + incomeStatement.financialItems.financialExpenses;
    const netResult = incomeStatement.netResult;

    // Revenue trend score (0-25): Is revenue growing?
    const revenueTrendScore = revenue > 0 ? Math.min(25, Math.round((netResult / Math.max(revenue, 1)) * 100 * 0.5 + 15)) : 5;

    // Expense ratio score (0-25): Are expenses manageable?
    const expenseRatio = revenue > 0 ? expenses / revenue : 1;
    const expenseRatioScore = expenseRatio < 0.6 ? 25 : expenseRatio < 0.8 ? 20 : expenseRatio < 1 ? 12 : 5;

    // VAT compliance score (0-25): Based on VAT register data
    const vatComplianceScore = vatRegister ? (vatRegister.totalOutputVAT !== undefined && vatRegister.totalInputVAT !== undefined ? 25 : 15) : 10;

    // Cash flow score (0-25): Based on equity ratio
    const equityRatio = balanceSheet.assets.totalAssets > 0 ? balanceSheet.equity.totalEquity / balanceSheet.assets.totalAssets : 0;
    const cashFlowScore = equityRatio > 0.5 ? 25 : equityRatio > 0.3 ? 18 : equityRatio > 0.1 ? 10 : 3;

    const total = Math.min(100, Math.max(0, revenueTrendScore + expenseRatioScore + vatComplianceScore + cashFlowScore));

    return {
      score: total,
      revenueTrendScore,
      expenseRatioScore,
      vatComplianceScore,
      cashFlowScore,
      color: total >= 80 ? '#16a34a' : total >= 50 ? '#d97706' : '#dc2626',
      label: total >= 80
        ? (language === 'da' ? 'Sund' : 'Healthy')
        : total >= 50
          ? (language === 'da' ? 'Moderat' : 'Moderate')
          : (language === 'da' ? 'Advarsel' : 'At Risk'),
    };
  }, [incomeStatement, balanceSheet, vatRegister, language]);

  // ─── Monthly Comparison Data ───────────────────────────────────

  const monthlyComparison = useMemo(() => {
    if (!hasDoubleEntryData || monthlyRevenueChart.length < 2) return null;

    const current = monthlyRevenueChart[monthlyRevenueChart.length - 1];
    const previous = monthlyRevenueChart[monthlyRevenueChart.length - 2];

    const revenueChange = current.revenue - previous.revenue;
    const revenueChangePct = previous.revenue !== 0 ? (revenueChange / Math.abs(previous.revenue)) * 100 : 0;

    const expenseChange = current.expenses - previous.expenses;
    const expenseChangePct = previous.expenses !== 0 ? (expenseChange / Math.abs(previous.expenses)) * 100 : 0;

    const currentNet = current.revenue - current.expenses;
    const previousNet = previous.revenue - previous.expenses;
    const netProfitChange = currentNet - previousNet;

    return {
      revenueChange,
      revenueChangePct,
      expenseChange,
      expenseChangePct,
      netProfitChange,
      currentMonth: current.label,
      previousMonth: previous.label,
    };
  }, [hasDoubleEntryData, monthlyRevenueChart, language]);

  // ─── Custom chart tooltip component ────────────────────────────

  const CustomTooltip = ({ active, payload, label: tooltipLabel }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 min-w-[140px]">
        {tooltipLabel && (
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tooltipLabel}</p>
        )}
        {payload.map((item, idx) => {
          const nameMap: Record<string, string> = {
            revenue: language === 'da' ? 'Indtægter' : 'Revenue',
            expenses: language === 'da' ? 'Omkostninger' : 'Expenses',
            net: language === 'da' ? 'Netto' : 'Net',
            outputVat: language === 'da' ? 'Udgående moms' : 'Output VAT',
            inputVat: language === 'da' ? 'Indgående moms' : 'Input VAT',
            netVat: language === 'da' ? 'Net moms' : 'Net VAT',
            vat: language === 'da' ? 'Moms' : 'VAT',
            amount: language === 'da' ? 'Beløb' : 'Amount',
          };
          return (
            <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                {nameMap[item.name] || item.name}
              </span>
              <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                {tc(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Loading state ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#0d9488]" />
          <p className="text-gray-500 dark:text-gray-400">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // ─── Quick Actions Widget ─────────────────────────────────────

  const quickActions = [
    {
      key: 'transactions',
      titleDa: 'Ny postering',
      titleEn: 'New Transaction',
      descDa: 'Registrér salg eller køb',
      descEn: 'Record a sale or purchase',
      icon: ArrowDownLeft,
      color: 'text-[#0d9488] dark:text-[#2dd4bf]',
      bgColor: 'bg-white dark:bg-[#1a2e2b]',
      iconBgColor: 'bg-[#ccfbf1] dark:bg-[#134e4a]',
      hoverGradient: 'hover:from-[#0d9488] hover:to-[#0f766e] hover:text-white hover:border-[#0d9488]/50 dark:hover:from-[#2dd4bf] dark:hover:to-[#0d9488] dark:hover:border-[#2dd4bf]/50',
    },
    {
      key: 'invoices',
      titleDa: 'Ny faktura',
      titleEn: 'New Invoice',
      descDa: 'Opret og send faktura',
      descEn: 'Create and send an invoice',
      icon: FilePlus2,
      color: 'text-[#7c9a82] dark:text-[#8cc492]',
      bgColor: 'bg-white dark:bg-[#242e26]',
      iconBgColor: 'bg-[#dcfce7] dark:bg-[#14532d]',
      hoverGradient: 'hover:from-[#10b981] hover:to-[#059669] hover:text-white hover:border-[#10b981]/50 dark:hover:from-[#34d399] dark:hover:to-[#10b981] dark:hover:border-[#34d399]/50',
    },
    {
      key: 'journal',
      titleDa: 'Ny journalpost',
      titleEn: 'New Journal Entry',
      descDa: 'Dobbelt bogføring',
      descEn: 'Double-entry bookkeeping',
      icon: PenLine,
      color: 'text-[#7dabb5] dark:text-[#80c0cc]',
      bgColor: 'bg-white dark:bg-[#242c30]',
      iconBgColor: 'bg-[#dbeafe] dark:bg-[#172554]',
      hoverGradient: 'hover:from-[#0891b2] hover:to-[#0e7490] hover:text-white hover:border-[#0891b2]/50 dark:hover:from-[#22d3ee] dark:hover:to-[#0891b2] dark:hover:border-[#22d3ee]/50',
    },
    {
      key: 'vat-report',
      titleDa: 'Momsafregning',
      titleEn: 'VAT Report',
      descDa: 'Indberet moms til SKAT',
      descEn: 'Submit VAT to tax authority',
      icon: Calculator,
      color: 'text-[#d4915c] dark:text-[#e0a476]',
      bgColor: 'bg-white dark:bg-[#302a22]',
      iconBgColor: 'bg-[#fef3c7] dark:bg-[#451a03]',
      hoverGradient: 'hover:from-[#d4915c] hover:to-[#c07a44] hover:text-white hover:border-[#d4915c]/50 dark:hover:from-[#e0a476] dark:hover:to-[#d4915c] dark:hover:border-[#e0a476]/50',
    },
    {
      key: 'accounts',
      titleDa: 'Kontoplan',
      titleEn: 'Chart of Accounts',
      descDa: 'Administrer konti',
      descEn: 'Manage your accounts',
      icon: BookOpen,
      color: 'text-[#c9928f] dark:text-[#d4a5a2]',
      bgColor: 'bg-white dark:bg-[#2e2524]',
      iconBgColor: 'bg-[#ffe4e6] dark:bg-[#4c0519]',
      hoverGradient: 'hover:from-[#e8755a] hover:to-[#dc5a3c] hover:text-white hover:border-[#e8755a]/50 dark:hover:from-[#f09a82] dark:hover:to-[#e8755a] dark:hover:border-[#f09a82]/50',
    },
    {
      key: 'exports',
      titleDa: 'Eksporter',
      titleEn: 'Export',
      descDa: 'SAF-T, OIOUBL m.m.',
      descEn: 'SAF-T, OIOUBL and more',
      icon: FileText,
      color: 'text-[#6b7280] dark:text-[#9ca3af]',
      bgColor: 'bg-white dark:bg-[#1f2937]',
      iconBgColor: 'bg-[#f3f4f6] dark:bg-[#111827]',
      hoverGradient: 'hover:from-[#374151] hover:to-[#1f2937] hover:text-white hover:border-[#374151]/50 dark:hover:from-[#6b7280] dark:hover:to-[#374151] dark:hover:border-[#6b7280]/50',
    },
  ];

  // ─── Widget Picker ─────────────────────────────────────────────

  const WidgetPicker = () => (
    <Dialog open={widgetPickerOpen} onOpenChange={setWidgetPickerOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-white/80 hover:text-white hover:bg-white/10 text-xs font-medium">
          <Settings2 className="h-3.5 w-3.5" />
          {language === 'da' ? 'Tilpas' : 'Customize'}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-[#0d9488]" />
            {language === 'da' ? 'Tilpas kontrolpanel' : 'Customize Dashboard'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {language === 'da'
              ? 'Vælg hvilke widgets der skal vises på kontrolpanelet.'
              : 'Choose which widgets to show on the dashboard.'}
          </DialogDescription>
        </DialogHeader>

        {/* AppOwner notice */}
        {isAppOwner && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              {language === 'da'
                ? 'Dine valg her gælder som standard for alle nye virksomheder, der oprettes i systemet. Eksisterende virksomheder beholder deres egne indstillinger.'
                : 'Your choices here become the default for all new companies created in the system. Existing companies keep their own settings.'}
            </p>
          </div>
        )}

        <div className="space-y-4 mt-2">
          {/* Sections — widgets grouped visually but ordered across all sections */}
          {(['indicators', 'charts', 'details'] as const).map((section) => {
            const sectionWidgets = DASHBOARD_WIDGETS
              .filter((w) => w.section === section)
              .sort((a, b) => (widgetOrderMap[a.id] ?? 999) - (widgetOrderMap[b.id] ?? 999));
            if (sectionWidgets.length === 0) return null;
            const sectionLabel = section === 'indicators'
              ? (language === 'da' ? 'Indikatorer' : 'Indicators')
              : section === 'charts'
                ? (language === 'da' ? 'Diagrammer' : 'Charts')
                : (language === 'da' ? 'Detaljer' : 'Details');
            return (
              <div key={section}>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  {sectionLabel}
                </p>
                <div className="space-y-1">
                  {sectionWidgets.map((w) => {
                    const orderIdx = widgetOrder.indexOf(w.id);
                    const isFirst = orderIdx <= 0;
                    const isLast = orderIdx < 0 || orderIdx >= widgetOrder.length - 1;
                    return (
                      <div
                        key={w.id}
                        className={`flex items-center gap-1 px-3 py-2.5 rounded-lg border transition-all duration-150 ${
                          isWidgetVisible(w.id)
                            ? 'border-[#0d9488]/30 bg-[#f0fdf9]/50 dark:bg-[#0d9488]/10 dark:border-[#2dd4bf]/30'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 opacity-60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleWidget(w.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                            isWidgetVisible(w.id)
                              ? 'bg-[#0d9488] border-[#0d9488] dark:bg-[#2dd4bf] dark:border-[#2dd4bf]'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isWidgetVisible(w.id) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className={`text-sm font-medium truncate ${
                            isWidgetVisible(w.id)
                              ? 'text-gray-900 dark:text-white'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {language === 'da' ? w.labelDa : w.labelEn}
                          </span>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); moveWidgetUp(w.id); }}
                            disabled={isFirst}
                            className={`p-1 rounded-md transition-colors ${
                              isFirst
                                ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700/60'
                            }`}
                            aria-label={language === 'da' ? 'Flyt op' : 'Move up'}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); moveWidgetDown(w.id); }}
                            disabled={isLast}
                            className={`p-1 rounded-md transition-colors ${
                              isLast
                                ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700/60'
                            }`}
                            aria-label={language === 'da' ? 'Flyt ned' : 'Move down'}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Reset */}
          <button
            type="button"
            onClick={() => { resetWidgets(); }}
            className="w-full text-center text-xs font-medium text-[#0d9488] dark:text-[#2dd4bf] hover:underline mt-2"
          >
            {language === 'da' ? 'Nulstil til standard' : 'Reset to defaults'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* ── Mobile completion overlay (animated teal + checkmark) ── */}
      <OnboardingCompleteOverlay
        visible={showCompletionOverlay}
        onDismiss={handleOnboardingComplete}
      />

      {/* ═══════════════════════════════════════════════════════════
          ONBOARDING (Empty State) — Banner first
          ═══════════════════════════════════════════════════════════ */}
      {isEmptyState && (
        <div className="space-y-4 sm:space-y-6">
          {/* Hero Section — welcome text + ambient video + demo button */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0d9488] via-[#14b8a6] to-[#5eead4] dark:from-[#0f766e] dark:via-[#0d6058] dark:to-[#0d9488] min-h-[180px] sm:min-h-[220px] text-white">
            {/* Background video — right half of banner, left edge faded to 0% */}
            <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden rounded-r-2xl">
              {onboardingVideoExists && (
                <video
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 60%)',
                    maskImage: 'linear-gradient(to right, transparent 0%, black 60%)',
                  }}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onError={() => setOnboardingVideoExists(false)}
                >
                  <source src="/VidClips/Onboarding/onboarding.mp4" type="video/mp4" />
                </video>
              )}
            </div>
            {/* Dot pattern */}
            <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-[#5eead4]/10 rounded-full blur-2xl" />

            {/* Content layer */}
            <div className="relative flex flex-col sm:flex-row items-start sm:items-stretch justify-between gap-4 p-6 sm:p-8">
              {/* Left — welcome text */}
              <div className="flex-1 text-center sm:text-left flex flex-col justify-center">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {language === 'da' ? 'Velkommen til AlphaFlow regnskab' : 'Welcome to AlphaFlow Accounting'}
                </h2>
                <p className="mt-2 text-[#ccfbef] max-w-xl text-sm sm:text-base opacity-90">
                  {language === 'da'
                    ? 'Kom i gang med din bogføring på få minutter. Følg trinene nedenfor eller prøv appen med demo-data.'
                    : 'Get started with your bookkeeping in minutes. Follow the steps below or try the app with demo data.'}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 max-w-[200px] h-2.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-white to-[#ccfbef] rounded-full transition-all duration-500 ease-out shadow-sm"
                      style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-[#99f6e4]">
                    {completedSteps} / {onboardingSteps.length}
                  </span>
                </div>
              </div>

              {/* Right — demo button aligned bottom-right */}
              <div className="shrink-0 flex items-end justify-center sm:justify-end pb-0">
                <Button
                  variant="outline"
                  className="gap-2 px-5 py-2.5 border-2 border-[#0d9488] bg-[#0d9488] hover:bg-[#0f766e] text-white font-semibold rounded-xl transition-all duration-300 lg:border-white/40 lg:bg-white/15 lg:backdrop-blur-md lg:hover:bg-white/25 lg:hover:border-white/60 shadow-lg shadow-black/20"
                  onClick={handleLoadDemoData}
                  disabled={isSeeding}
                >
                  {isSeeding ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FlaskConical className="h-5 w-5" />
                  )}
                  <span className="text-sm">
                    {isSeeding
                      ? (language === 'da' ? 'Opretter demo...' : 'Creating demo...')
                      : (language === 'da' ? 'Prøv demo-virksomhed' : 'Try Demo Company')
                    }
                  </span>
                </Button>
              </div>
            </div>

            {/* No-video hint (tiny, bottom-left) */}
            {!onboardingVideoExists && (
              <p className="absolute bottom-1.5 left-3 text-[9px] text-white/20 leading-none">
                public/VidClips/Onboarding/onboarding.mp4
              </p>
            )}
          </div>

          {/* All Steps Complete — desktop only (mobile uses the animated overlay) */}
          {completedSteps === onboardingSteps.length && (
            <Card className="hidden lg:block border-2 border-[#7c9a82] dark:border-[#5a8a5e] bg-gradient-to-r from-[#edf5ef] to-[#f0f5f0] dark:from-[#1e2e22] dark:to-[#1a2820]">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="h-14 w-14 mx-auto rounded-full bg-[#edf5ef] dark:bg-[#1e2e22] flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-7 w-7 text-[#7c9a82] dark:text-[#8cc492]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {language === 'da' ? 'Alle trin er gennemført!' : 'All steps complete!'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {language === 'da' ? 'Du er klar til at bruge AlphaFlow regnskab' : 'You\'re ready to use AlphaFlow Accounting'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Setup Step Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {onboardingSteps.map((step) => {
              const StepIcon = step.icon;
              return (
                <Card
                  key={step.key}
                  className={`relative overflow-hidden rounded-2xl sm:rounded-xl border-2 transition-all duration-300 group cursor-pointer hover:shadow-lg hover:-translate-y-0.5 aspect-[4/3.5] sm:aspect-square ${
                    step.done
                      ? 'border-[#22c55e]/60 dark:border-[#22c55e]/40 bg-[#f0fdf4]/50 dark:bg-[#14532d]/10 hover:border-[#22c55e] dark:hover:border-[#22c55e]'
                      : 'border-[#ef4444]/60 dark:border-[#ef4444]/40 bg-white dark:bg-gray-900 hover:border-[#ef4444] dark:hover:border-[#ef4444]'
                  }`}
                  onClick={step.action}
                >
                  {/* Background image — fills card, edges faded */}
                  {step.bgImage && (
                    <div
                      className="absolute inset-0 bg-center bg-no-repeat"
                      style={{
                        backgroundImage: `url(${step.bgImage})`,
                        backgroundSize: 'var(--onboarding-bg-size, 95% 90%)',
                        WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 100%)',
                        maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 100%)',
                        opacity: 0.45,
                      }}
                    />
                  )}
                  {/* Top gradient bar — above background */}
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r z-20 ${step.done ? step.completeGradient : 'from-[#ef4444] to-[#f87171]'}`} />
                  {/* Semi-transparent overlay under text for readability */}
                  <CardContent className="relative z-10 p-4 sm:p-5 pt-[65px] h-full flex flex-col">
                    <div className="relative flex items-start gap-4 rounded-lg bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm p-3 -m-1">
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className={`h-10 w-10 rounded-xl ${step.iconBg} flex items-center justify-center transition-all duration-300`}>
                          {step.done ? (
                            <CheckCircle2 className="h-5 w-5 text-[#22c55e] dark:text-[#4ade80]" />
                          ) : (
                            <StepIcon className={`h-5 w-5 ${step.iconColor}`} />
                          )}
                        </div>
                        <span className={`text-xs font-bold ${step.done ? 'text-[#22c55e] dark:text-[#4ade80]' : 'text-[#ef4444] dark:text-[#f87171]'}`}>
                          {step.done ? (language === 'da' ? 'Færdig' : 'Done') : `${step.step}/2`}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-sm sm:text-base ${
                          step.done
                            ? 'text-gray-500 dark:text-gray-400 line-through decoration-[#22c55e]'
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {step.title}
                        </h3>
                        <p className={`text-xs sm:text-sm mt-1 ${
                          step.done ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {step.description}
                        </p>
                        {step.detail && (
                          <p className={`text-base font-semibold mt-3 leading-relaxed hidden lg:block ${
                            step.done ? 'text-gray-400 dark:text-gray-400' : 'text-gray-800 dark:text-white'
                          }`}>
                            {step.detail}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 mt-1">
                        {step.done ? (
                          <Badge className="bg-[#f0fdf4] text-[#22c55e] dark:bg-[#14532d]/30 dark:text-[#4ade80] text-xs font-medium px-2 py-0.5">
                            {language === 'da' ? 'Færdig' : 'Done'}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className={`gap-1.5 text-xs bg-gradient-to-r ${step.gradient} text-white border-0 shadow-sm hover:opacity-90 transition-opacity`}
                            onClick={(e) => { e.stopPropagation(); step.action(); }}
                          >
                            {language === 'da' ? 'Start' : 'Get Started'}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Main Dashboard (hidden during onboarding) ─── */}
      {!isEmptyState && (
      <>
      <PageHeader
        title={t('dashboard')}
        description={language === 'da'
          ? `Regnskabsoversigt for ${tm(new Date())}`
          : `Accounting overview for ${tm(new Date())}`
        }
        action={
          <div className="flex items-center gap-1.5">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 transition-all duration-200 lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm">
                  <Plus className="h-4 w-4" />
                  {t('addTransaction')}
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="dark:text-white flex items-center gap-2">
                    <Plus className="h-5 w-5 text-[#0d9488]" />
                    {t('addTransaction')}
                  </DialogTitle>
                  <DialogDescription className="dark:text-gray-400">
                    {t('recordNewTransaction')}
                  </DialogDescription>
                </DialogHeader>
                <AddTransactionForm onSuccess={handleAddTransaction} />
              </DialogContent>
            </Dialog>
            <WidgetPicker />
          </div>
        }
      />

      {/* ─── Date Range Filter ────────────────────────────────── */}
      <div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Demo Mode Banner */}
      {demoModeEnabled && !isLoading && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800/50">
          <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
            <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {language === 'da' ? 'Demo-virksomhed: Nordisk Erhverv ApS' : 'Demo Company: Nordisk Erhverv ApS'}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {language === 'da'
                ? 'Du ser en skrivebeskyttet demo-virksomhed. Klik for at vende tilbage til din egen data.'
                : 'You are viewing a read-only demo company. Click to return to your own data.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            onClick={handleToggleDemoMode}
          >
            <EyeOff className="h-4 w-4" />
            {language === 'da' ? 'Tilbage til min data' : 'Back to My Data'}
          </Button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODE: Double-Entry Dashboard
          ═══════════════════════════════════════════════════════════ */}

        <div className="flex flex-col gap-4 lg:gap-6">
          {/* ─── KPI Stat Cards ──────────────────────────────── */}
          <div style={{ order: widgetOrderMap['kpi-cards'] ?? 999 }}>
          {isWidgetVisible('kpi-cards') && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-children">
            <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
              <StatsCard
                icon={TrendingUp}
                label={language === 'da' ? 'Omsætning' : 'Revenue'}
                value={incomeStatement?.grossProfit.revenue || 0}
                variant="green"
                sparklineData={monthlyRevenueChart.slice(-6).map(m => m.revenue)}
              />
            </div>
            <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
              <StatsCard
                icon={Scale}
                label={language === 'da' ? 'Driftsresultat' : 'Operating Result'}
                value={incomeStatement?.operatingResult || 0}
                variant={incomeStatement && incomeStatement.operatingResult >= 0 ? 'primary' : 'red'}
                trend={incomeStatement ? { direction: incomeStatement.operatingResult >= 0 ? 'up' : 'down', value: incomeStatement.grossProfit.revenue > 0 ? Math.abs(Math.round((incomeStatement.operatingResult / incomeStatement.grossProfit.revenue) * 100)) : 0 } : undefined}
                sparklineData={monthlyRevenueChart.slice(-6).map(m => m.net)}
              />
            </div>
            <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
              <StatsCard
                icon={ArrowUpRight}
                label={t('outputVAT')}
                value={outputVAT}
                variant="turquoise"
                sparklineData={monthlyRevenueChart.slice(-6).map(m => m.revenue * 0.25)}
              />
            </div>
            <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
              <StatsCard
                icon={ArrowDownRight}
                label={t('inputVAT')}
                value={inputVAT}
                variant="purple"
                sparklineData={monthlyRevenueChart.slice(-6).map(m => m.expenses * 0.25)}
              />
            </div>
          </div>
          )}
          </div>

          {/* ─── P&L Summary + Cash Position ────────────────────── */}
          <div style={{ order: widgetOrderMap['pnl-cash'] ?? 999 }}>
          {isWidgetVisible('pnl-cash') && incomeStatement && balanceSheet && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* P&L Trend Indicator Card */}
              <Card className={`hover-lift overflow-hidden rounded-2xl sm:rounded-xl border-0 ${
                incomeStatement.netResult >= 0
                  ? 'bg-gradient-to-br from-[#edf5ef] to-[#f0fdf9] dark:from-[#142e24] dark:to-[#1a2e2b]'
                  : 'bg-gradient-to-br from-[#fef2f2] to-[#fff1f2] dark:from-[#2e1c1c] dark:to-[#2e2024]'
              }`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                        incomeStatement.netResult >= 0
                          ? 'bg-green-100 dark:bg-green-900/40'
                          : 'bg-red-100 dark:bg-red-900/40'
                      }`}>
                        {incomeStatement.netResult >= 0
                          ? <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                          : <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                        }
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {dateRange
                            ? (language === 'da' ? 'Resultat for periode' : 'Result for Period')
                            : (language === 'da' ? 'Årets resultat' : 'YTD Net Result')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {language === 'da' ? 'Indtægter − Omkostninger' : 'Revenue − Expenses'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      incomeStatement.netResult >= 0
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                    }`}>
                      {incomeStatement.netResult >= 0
                        ? (language === 'da' ? 'Overskud' : 'Profit')
                        : (language === 'da' ? 'Underskud' : 'Loss')
                      }
                    </span>
                  </div>

                  <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${
                    incomeStatement.netResult >= 0
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-red-700 dark:text-red-300'
                  }`}>
                    {tc(incomeStatement.netResult)}
                  </p>

                  {/* Profit Margin Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Overskudsgrad' : 'Profit Margin'}
                      </span>
                      <span className={`font-semibold ${
                        incomeStatement.netResult >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {incomeStatement.grossProfit.revenue > 0
                          ? `${((incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100).toFixed(1)}%`
                          : '0.0%'
                        }
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200/60 dark:bg-gray-700/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          incomeStatement.netResult >= 0
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500 dark:from-green-500 dark:to-emerald-400'
                            : 'bg-gradient-to-r from-red-400 to-rose-500 dark:from-red-500 dark:to-rose-400'
                        }`}
                        style={{
                          width: `${Math.min(
                            Math.max(
                              incomeStatement.grossProfit.revenue > 0
                                ? Math.abs((incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100)
                                : 0,
                              0
                            ),
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cash Position Quick View Card */}
              <Card className="hover-lift rounded-2xl sm:rounded-xl bg-gradient-to-br from-[#f0fdf9] to-[#edf4f7] dark:from-[#1a2e2b] dark:to-[#1e2e32] border border-[#d1e7dd]/50 dark:border-[#2a3e38]/50">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-[#e8f2f4] dark:bg-[#1e2e32] flex items-center justify-center">
                        <Wallet className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {language === 'da' ? 'Likviditetsoversigt' : 'Cash Position'}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {dateRange
                            ? (language === 'da' ? 'Resultat for periode' : 'Result for Period')
                            : (language === 'da' ? 'Egenkapital (Aktiver − Gæld)' : 'Equity (Assets − Liabilities)')}
                        </p>
                      </div>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-[#f0fdf9] dark:bg-[#1a2e2b] flex items-center justify-center">
                      <PiggyBank className="h-5 w-5 text-[#7c9a82] dark:text-[#8cc492]" />
                    </div>
                  </div>

                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0d9488] dark:text-[#2dd4bf]">
                    {dateRange
                      ? tc(incomeStatement?.netResult ?? 0)
                      : tc(balanceSheet.equity.totalEquity)}
                  </p>

                  {/* Progress Bar — period: profit margin | all time: equity ratio */}
                  {dateRange ? (
                    incomeStatement && incomeStatement.grossProfit.revenue > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-gray-500 dark:text-gray-400">
                            {language === 'da' ? 'Overskudsgrad' : 'Profit Margin'}
                          </span>
                          <span className={`font-semibold ${
                              (incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100 > 10
                                ? 'text-green-600 dark:text-green-400'
                                : (incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100 > 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400'
                            }`}>
                            {((incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-200/60 dark:bg-gray-700/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ease-out ${
                              (incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100 > 10
                                ? 'bg-gradient-to-r from-emerald-400 to-[#0d9488] dark:from-emerald-500 dark:to-[#2dd4bf]'
                                : (incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100 > 0
                                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-400'
                                  : 'bg-gradient-to-r from-red-400 to-rose-500 dark:from-red-500 dark:to-rose-400'
                            }`}
                            style={{
                              width: `${Math.min(
                                Math.max(
                                  Math.abs((incomeStatement.netResult / incomeStatement.grossProfit.revenue) * 100),
                                  0
                                ),
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                          <span>
                            {language === 'da' ? 'Indtægter' : 'Revenue'}: {tc(incomeStatement.grossProfit.revenue)}
                          </span>
                          <span>
                            {language === 'da' ? 'Omkostninger' : 'Expenses'}: {tc(incomeStatement.operatingExpenses.total + incomeStatement.financialItems.financialExpenses)}
                          </span>
                        </div>
                      </div>
                    )
                  ) : (
                    balanceSheet.assets.totalAssets > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-gray-500 dark:text-gray-400">
                            {language === 'da' ? 'Egenkapitalandel' : 'Equity Ratio'}
                          </span>
                          <span className={`font-semibold ${
                            (balanceSheet.equity.totalEquity / balanceSheet.assets.totalAssets) * 100 > 50
                              ? 'text-green-600 dark:text-green-400'
                              : (balanceSheet.equity.totalEquity / balanceSheet.assets.totalAssets) * 100 > 30
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}>
                            {((balanceSheet.equity.totalEquity / balanceSheet.assets.totalAssets) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-200/60 dark:bg-gray-700/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ease-out ${
                              (balanceSheet.equity.totalEquity / balanceSheet.assets.totalAssets) * 100 > 50
                                ? 'bg-gradient-to-r from-emerald-400 to-[#0d9488] dark:from-emerald-500 dark:to-[#2dd4bf]'
                                : (balanceSheet.equity.totalEquity / balanceSheet.assets.totalAssets) * 100 > 30
                                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-400'
                                  : 'bg-gradient-to-r from-red-400 to-rose-500 dark:from-red-500 dark:to-rose-400'
                            }`}
                            style={{
                              width: `${Math.min(
                                Math.max(
                                  (balanceSheet.equity.totalEquity / balanceSheet.assets.totalAssets) * 100,
                                  0
                                ),
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                          <span>
                            {language === 'da' ? 'Aktiver' : 'Assets'}: {tc(balanceSheet.assets.totalAssets)}
                          </span>
                          <span>
                            {language === 'da' ? 'Gæld' : 'Liab.'}: {tc(balanceSheet.liabilities.totalLiabilities)}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          </div>

          {/* ─── Financial Health Score ────────────────────── */}
          <div style={{ order: widgetOrderMap['financial-health-score'] ?? 999 }}>
          {isWidgetVisible('financial-health-score') && financialHealthScore && (
            <Card className="hover-lift overflow-hidden border-0 bg-gradient-to-br from-white to-[#f0fdf9] dark:from-gray-900 dark:to-[#1a2e2b]">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-[#f0fdf9] dark:bg-[#1a2e2b] flex items-center justify-center">
                      <Gauge className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {language === 'da' ? 'Økonomisk sundhed' : 'Financial Health'}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {language === 'da' ? 'Samlet score 0-100' : 'Overall score 0-100'}
                      </p>
                    </div>
                  </div>

                  {/* SVG Circular Progress Ring */}
                  <div className="flex items-center justify-center mb-4">
                    <div className="relative">
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        {/* Background circle */}
                        <circle
                          cx="60" cy="60" r="50"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          className="text-gray-200 dark:text-gray-700"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="60" cy="60" r="50"
                          fill="none"
                          stroke={financialHealthScore.color}
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${(financialHealthScore.score / 100) * 314.16} 314.16`}
                          transform="rotate(-90 60 60)"
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                          {financialHealthScore.score}
                        </span>
                        <span
                          className="text-xs font-semibold mt-0.5"
                          style={{ color: financialHealthScore.color }}
                        >
                          {financialHealthScore.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="space-y-2">
                    {[
                      { label: language === 'da' ? 'Omsætnings-trend' : 'Revenue Trend', score: financialHealthScore.revenueTrendScore, max: 25 },
                      { label: language === 'da' ? 'Omkostningsratio' : 'Expense Ratio', score: financialHealthScore.expenseRatioScore, max: 25 },
                      { label: language === 'da' ? 'Moms-compliance' : 'VAT Compliance', score: financialHealthScore.vatComplianceScore, max: 25 },
                      { label: language === 'da' ? 'Likviditet' : 'Cash Flow', score: financialHealthScore.cashFlowScore, max: 25 },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{item.score}/{item.max}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200/60 dark:bg-gray-700/60 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${(item.score / item.max) * 100}%`,
                              backgroundColor: (item.score / item.max) >= 0.8 ? '#16a34a' : (item.score / item.max) >= 0.5 ? '#d97706' : '#dc2626',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
          )}
          </div>

          {/* ─── Monthly Comparison ────────────────────── */}
          <div style={{ order: widgetOrderMap['monthly-comparison'] ?? 999 }}>
          {isWidgetVisible('monthly-comparison') && monthlyComparison && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Revenue Change */}
            <Card className="hover-lift overflow-hidden border-0 bg-gradient-to-br from-white to-[#edf5ef] dark:from-gray-900 dark:to-[#242e26]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {language === 'da' ? 'Omsætningsændring' : 'Revenue Change'}
                  </p>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center ${
                    monthlyComparison.revenueChange >= 0
                      ? 'bg-green-100 dark:bg-green-900/40'
                      : 'bg-red-100 dark:bg-red-900/40'
                  }`}>
                    {monthlyComparison.revenueChange >= 0
                      ? <ArrowUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      : <ArrowDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    }
                  </div>
                </div>
                <p className={`text-xl font-bold tabular-nums ${
                  monthlyComparison.revenueChange >= 0
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  {monthlyComparison.revenueChange >= 0 ? '+' : ''}{tc(monthlyComparison.revenueChange)}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    monthlyComparison.revenueChangePct >= 0
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}>
                    {monthlyComparison.revenueChangePct >= 0 ? '+' : ''}{monthlyComparison.revenueChangePct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    vs {monthlyComparison.previousMonth}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Expense Change */}
            <Card className="hover-lift overflow-hidden border-0 bg-gradient-to-br from-white to-[#faf5ee] dark:from-gray-900 dark:to-[#302a22]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {language === 'da' ? 'Omkostningsændring' : 'Expense Change'}
                  </p>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center ${
                    monthlyComparison.expenseChange <= 0
                      ? 'bg-green-100 dark:bg-green-900/40'
                      : 'bg-amber-100 dark:bg-amber-900/40'
                  }`}>
                    {monthlyComparison.expenseChange <= 0
                      ? <ArrowDown className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      : <ArrowUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    }
                  </div>
                </div>
                <p className={`text-xl font-bold tabular-nums ${
                  monthlyComparison.expenseChange <= 0
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-amber-700 dark:text-amber-300'
                }`}>
                  {monthlyComparison.expenseChange >= 0 ? '+' : ''}{tc(monthlyComparison.expenseChange)}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    monthlyComparison.expenseChangePct <= 0
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}>
                    {monthlyComparison.expenseChangePct >= 0 ? '+' : ''}{monthlyComparison.expenseChangePct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    vs {monthlyComparison.previousMonth}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Net Profit Change */}
            <Card className={`hover-lift overflow-hidden border-0 bg-gradient-to-br ${
                  monthlyComparison.netProfitChange >= 0
                    ? 'from-white to-[#f0fdf9] dark:from-gray-900 dark:to-[#1a2e2b]'
                    : 'from-white to-[#fef2f2] dark:from-gray-900 dark:to-[#2e2024]'
                }`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {language === 'da' ? 'Nettoresultat ændring' : 'Net Profit Change'}
                  </p>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center ${
                    monthlyComparison.netProfitChange >= 0
                      ? 'bg-green-100 dark:bg-green-900/40'
                      : 'bg-red-100 dark:bg-red-900/40'
                  }`}>
                    {monthlyComparison.netProfitChange >= 0
                      ? <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      : <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    }
                  </div>
                </div>
                <p className={`text-xl font-bold tabular-nums ${
                  monthlyComparison.netProfitChange >= 0
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  {monthlyComparison.netProfitChange >= 0 ? '+' : ''}{tc(monthlyComparison.netProfitChange)}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    monthlyComparison.netProfitChange >= 0
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}>
                    {monthlyComparison.netProfitChange >= 0
                      ? (language === 'da' ? 'Forbedring' : 'Improvement')
                      : (language === 'da' ? 'Tilbagegang' : 'Decline')
                    }
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    vs {monthlyComparison.previousMonth}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
          )}
          </div>

          {/* ─── Cash Flow Trend Mini Chart ────────────────────────── */}
          <div style={{ order: widgetOrderMap['cash-flow-trend'] ?? 999 }}>
          {isWidgetVisible('cash-flow-trend') && monthlyRevenueChart.length > 0 && (
            <Card className="stat-card overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-[#f0fdf9] dark:bg-[#1a2e2b] flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {language === 'da' ? 'Indtægter vs Omkostninger' : 'Revenue vs Expenses'}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {language === 'da' ? 'Månedlig udvikling' : 'Monthly development'} · 6m
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#7c9a82] dark:bg-[#8cc492]" />
                      <span className="text-gray-500 dark:text-gray-400">{language === 'da' ? 'Indtægt' : 'Rev.'}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#c9928f] dark:bg-[#d4a5a2]" />
                      <span className="text-gray-500 dark:text-gray-400">{language === 'da' ? 'Omkost.' : 'Exp.'}</span>
                    </span>
                  </div>
                </div>
                <div className="h-28 sm:h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyRevenueChart.slice(-6)} barGap={3} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 124, 86, 0.08)" vertical={false} />
                      <XAxis dataKey="label" stroke="#b0a89e" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#b0a89e" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} width={40} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Bar dataKey="revenue" fill="#7c9a82" radius={[3, 3, 0, 0]} name="revenue" />
                      <Bar dataKey="expenses" fill="#c9928f" radius={[3, 3, 0, 0]} name="expenses" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
          </div>

          {/* ─── Quick Actions Widget ──────────────────────────────── */}
          <div style={{ order: widgetOrderMap['quick-actions'] ?? 999 }}>
          {isWidgetVisible('quick-actions') && (
          <Card className="stat-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Zap className="h-4.5 w-4.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                {language === 'da' ? 'Hurtige handlinger' : 'Quick Actions'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {quickActions.map((action) => {
                  const ActionIcon = action.icon;
                  return (
                    <button
                      key={action.key}
                      onClick={() => {
                        if (action.key === 'transactions') {
                          setIsDialogOpen(true);
                        } else {
                          onNavigate?.(action.key);
                        }
                      }}
                      className={`relative flex items-center gap-3 p-4 sm:p-5 min-h-[80px] rounded-2xl sm:rounded-xl
                        bg-gradient-to-br ${action.bgColor}
                        border border-gray-200/60 dark:border-gray-700/40
                        backdrop-blur-sm
                        transition-all duration-300 ease-out
                        hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02]
                        group cursor-pointer
                        ${action.hoverGradient}
                      `}
                    >
                      <div className={`h-10 w-10 rounded-xl ${action.iconBgColor} flex items-center justify-center shrink-0 transition-all duration-300 group-hover:bg-white/20 dark:group-hover:bg-white/10`}
                        style={{ backdropFilter: 'blur(8px)' }}
                      >
                        <ActionIcon className={`h-5 w-5 transition-colors duration-300 ${action.color} group-hover:text-white`} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white transition-colors duration-300 group-hover:text-white">
                          {language === 'da' ? action.titleDa : action.titleEn}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 transition-colors duration-300 group-hover:text-white/70">
                          {language === 'da' ? action.descDa : action.descEn}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          )}
          </div>

          {/* ─── SAF-T Export Widget ────────────────────────────── */}
          <div style={{ order: widgetOrderMap['saft-export'] ?? 999 }}>
          {isWidgetVisible('saft-export') && (
          <Card className="stat-card cursor-pointer hover:shadow-lg transition-all" onClick={() => onNavigate?.('exports')}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0d9488] to-[#0f766e] flex items-center justify-center shrink-0 shadow-md">
                  <Shield className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                    {t('saftExport')}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {language === 'da'
                      ? 'Generer Skattestyrelsen-kompatibel revisionsfil'
                      : 'Generate Danish Tax Authority compliant audit file'}
                  </p>
                </div>
                <div className="shrink-0">
                  <Button variant="outline" size="sm" className="gap-2 border-[#e2d8d0] text-[#0d9488] hover:bg-[#e6f7f3] dark:border-[#2dd4bf] dark:text-[#2dd4bf] dark:hover:bg-[#302b26]">
                    <FileText className="h-4 w-4" />
                    {language === 'da' ? 'Generer' : 'Generate'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          )}
          </div>

          {/* ─── Invoice Overview Widget ────────────────────────── */}
          <div style={{ order: widgetOrderMap['invoice-overview'] ?? 999 }}>
          {isWidgetVisible('invoice-overview') && invoices.length > 0 && (
            <Card className="stat-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                    {language === 'da' ? 'Fakturaoversigt' : 'Invoice Overview'}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/10 dark:hover:bg-[#2dd4bf]/10"
                    onClick={() => onNavigate?.('invoices')}
                  >
                    {language === 'da' ? 'Vis alle' : 'View all'}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Outstanding */}
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-[10px] uppercase tracking-wider font-medium text-amber-600 dark:text-amber-400">
                        {language === 'da' ? 'Udestående' : 'Outstanding'}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                      {invoiceStats.outstandingCount}
                    </p>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                      {tc(invoiceStats.outstandingTotal)}
                    </p>
                  </div>

                  {/* Overdue */}
                  <div className={`rounded-xl p-3 ${invoiceStats.overdueCount > 0
                    ? 'bg-red-50 dark:bg-red-500/10 border border-red-200/60 dark:border-red-500/20'
                    : 'bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/10'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className={`h-3.5 w-3.5 ${invoiceStats.overdueCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`} />
                      <span className={`text-[10px] uppercase tracking-wider font-medium ${invoiceStats.overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {language === 'da' ? 'Forfaldne' : 'Overdue'}
                      </span>
                    </div>
                    <p className={`text-lg font-bold tabular-nums ${invoiceStats.overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                      {invoiceStats.overdueCount}
                    </p>
                    <p className={`text-xs font-semibold tabular-nums ${invoiceStats.overdueCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}>
                      {tc(invoiceStats.overdueTotal)}
                    </p>
                  </div>

                  {/* Paid */}
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[10px] uppercase tracking-wider font-medium text-emerald-600 dark:text-emerald-400">
                        {language === 'da' ? 'Betalte' : 'Paid'}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                      {invoiceStats.paidCount}
                    </p>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {tc(invoiceStats.paidTotal)}
                    </p>
                  </div>

                  {/* Total */}
                  <div className="rounded-xl bg-[#0d9488]/5 dark:bg-[#2dd4bf]/10 border border-[#0d9488]/20 dark:border-[#2dd4bf]/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="h-3.5 w-3.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                      <span className="text-[10px] uppercase tracking-wider font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                        {language === 'da' ? 'Total' : 'Total'}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                      {invoices.filter(i => i.status !== 'CANCELLED' && i.status !== 'DRAFT').length}
                    </p>
                    <p className="text-xs font-semibold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">
                      {tc(invoiceStats.outstandingTotal + invoiceStats.paidTotal)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          </div>

          {/* ─── Charts Row ─────────────────────────────────────── */}
          <div style={{ order: widgetOrderMap['vat-charts'] ?? 999 }}>
          {isWidgetVisible('vat-charts') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* VAT Breakdown Pie Chart */}
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-[#0d9488]" />
                    {t('vatBreakdown')}
                  </CardTitle>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                    {format(new Date(), 'MMM yyyy')}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {vatBreakdown.length > 0 ? (
                  <div className="h-64 min-h-[200px] sm:min-h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={vatBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="vat"
                        >
                          {vatBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 min-h-[200px] sm:min-h-[250px] flex flex-col items-center justify-center gap-3">
                    <div className="h-14 w-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Calculator className="h-6 w-6 text-gray-400 dark:text-gray-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Ingen salg denne måned' : 'No sales this month'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {language === 'da' ? 'Opret en postering for at se VAT-fordeling' : 'Create a transaction to see VAT breakdown'}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Revenue vs Expenses Chart */}
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[#0d9488]" />
                    {language === 'da' ? 'Omsætning vs Omkostninger' : 'Revenue vs Expenses'}
                  </CardTitle>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                    {monthlyRevenueChart.length > 0 ? `${monthlyRevenueChart[0]?.label}–${monthlyRevenueChart[monthlyRevenueChart.length - 1]?.label}` : ''}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {monthlyRevenueChart.length > 0 ? (
                  <div className="h-64 min-h-[200px] sm:min-h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyRevenueChart} barGap={2} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 124, 86, 0.1)" />
                        <XAxis dataKey="label" stroke="#b0a89e" fontSize={12} />
                        <YAxis stroke="#b0a89e" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend
                          formatter={(value) => {
                            if (value === 'revenue') return language === 'da' ? 'Omsætning' : 'Revenue';
                            if (value === 'expenses') return language === 'da' ? 'Omkostninger' : 'Expenses';
                            return value;
                          }}
                          wrapperStyle={{ fontSize: '12px', color: '#b0a89e' }}
                        />
                        <Bar dataKey="revenue" fill="#7c9a82" radius={[4, 4, 0, 0]} name="revenue" />
                        <Bar dataKey="expenses" fill="#c9928f" radius={[4, 4, 0, 0]} name="expenses" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 min-h-[200px] sm:min-h-[250px] flex flex-col items-center justify-center gap-3">
                    <div className="h-14 w-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-gray-400 dark:text-gray-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Ingen dobbeltposteringsdata' : 'No double-entry data'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {language === 'da' ? 'Opret journalposter for at se diagrammer' : 'Create journal entries to see charts'}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}
          </div>

          {/* ─── Net Revenue Area Chart ─────────────────────────── */}
          <div style={{ order: widgetOrderMap['net-result-chart'] ?? 999 }}>
          {isWidgetVisible('net-result-chart') && monthlyRevenueChart.some((m) => m.revenue !== 0 || m.expenses !== 0) && (
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[#0d9488]" />
                    {language === 'da' ? 'Netto resultat pr. måned' : 'Net Result by Month'}
                  </CardTitle>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                    6m
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-56 min-h-[200px] sm:min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyRevenueChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 124, 86, 0.1)" />
                      <XAxis dataKey="label" stroke="#b0a89e" fontSize={12} />
                      <YAxis stroke="#b0a89e" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <defs>
                        <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="net"
                        stroke="#0d9488"
                        fill="url(#netGradient)"
                        strokeWidth={2}
                        name="net"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
          </div>

          {/* ─── Expense Category Analysis ──────────────────────── */}
          <div style={{ order: widgetOrderMap['expense-analysis'] ?? 999 }}>
          {isWidgetVisible('expense-analysis') && <ExpenseAnalysis dateRange={dateRange} />}
          </div>

          {/* ─── Profit & Loss Waterfall ────────────────────────── */}
          <div style={{ order: widgetOrderMap['profit-loss-waterfall'] ?? 999 }}>
          {isWidgetVisible('profit-loss-waterfall') && <ProfitLossWaterfall dateRange={dateRange} />}
          </div>

          {/* ─── Financial Health Detail ────────────────────── */}
          <div style={{ order: widgetOrderMap['financial-health-detail'] ?? 999 }}>
          {isWidgetVisible('financial-health-detail') && (
            <FinancialHealthWidget dateRange={dateRange} />
          )}
          </div>

          {/* ─── Cash Flow Forecast ──────────────────────────────── */}
          <div style={{ order: widgetOrderMap['cash-flow-forecast'] ?? 999 }}>
          {isWidgetVisible('cash-flow-forecast') && <CashFlowForecast dateRange={dateRange} />}
          </div>

          {/* ─── Budget vs Actual ──────────────────────────────── */}
          <div style={{ order: widgetOrderMap['budget-vs-actual'] ?? 999 }}>
          {isWidgetVisible('budget-vs-actual') && <BudgetVsActualWidget user={user} />}
          </div>

          {/* ─── AI Categorization Suggestions ──────────────────── */}
          <div style={{ order: widgetOrderMap['ai-categorization'] ?? 999 }}>
          {isWidgetVisible('ai-categorization') && transactions.length > 0 && (
            <Card className="stat-card">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-[#edf4f7] dark:bg-[#242c30] flex items-center justify-center">
                      <Wand2 className="h-4 w-4 text-[#7dabb5] dark:text-[#80c0cc]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                        {language === 'da' ? 'AI-kategorisering' : 'AI Categorization'}
                        <Sparkles className="h-3 w-3 text-[#0d9488] dark:text-[#2dd4bf]" />
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {language === 'da' ? 'Automatisk forslag til konti' : 'Automatic account suggestions'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/10 dark:hover:bg-[#2dd4bf]/10"
                    onClick={() => onNavigate?.('transactions')}
                  >
                    {language === 'da' ? 'Vis alle' : 'View all'}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                <CategorizationSuggestionsList
                  descriptions={transactions.slice(0, 10).map(t => t.description).filter(Boolean)}
                />
              </CardContent>
            </Card>
          )}
          </div>

          {/* ─── Recent Journal Entries + Activity Feed ──────────── */}
          <div style={{ order: widgetOrderMap['recent-activity'] ?? 999 }}>
          {isWidgetVisible('recent-activity') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Journal Entries */}
            <Card className="stat-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <PenLine className="h-5 w-5 text-[#0d9488]" />
                    {language === 'da' ? 'Seneste journalposter' : 'Recent Journal Entries'}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/10 dark:hover:bg-[#2dd4bf]/10"
                    onClick={() => onNavigate?.('journal')}
                  >
                    {language === 'da' ? 'Vis alle' : 'View all'}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {journalEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <PenLine className="h-5 w-5 text-gray-400 dark:text-gray-600" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Ingen journalposter endnu' : 'No journal entries yet'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {journalEntries.map((entry) => {
                      const total = getJournalEntryTotal(entry);
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 cursor-pointer group hover:shadow-sm"
                          onClick={() => onNavigate?.('journal')}
                        >
                          <div className="h-9 w-9 rounded-lg bg-[#e6f7f3] dark:bg-[#1a2e2b] flex items-center justify-center shrink-0 group-hover:bg-[#0d9488]/10 dark:group-hover:bg-[#2dd4bf]/10 transition-colors">
                            <PenLine className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                              {entry.description}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {getRelativeTime(entry.date)}
                              </span>
                              {entry.reference && (
                                <span className="text-[10px] bg-gray-200 dark:bg-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded font-mono">
                                  {entry.reference}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                                {tc(total)}
                              </p>
                            </div>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 ${
                                entry.status === 'POSTED'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                              }`}
                            >
                              {entry.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity Feed */}
            <Card className="stat-card">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Activity className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                      {language === 'da' ? 'Seneste aktivitet' : 'Recent Activity'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {language === 'da' ? 'Posteringer og journalposter' : 'Transactions and journal entries'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate?.('journal')}
                    className="gap-1.5 text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#f0fdf9] dark:hover:bg-[#1a2e2b]"
                  >
                    {language === 'da' ? 'Vis alle' : 'View All'}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {/* Journal entries in activity feed */}
                  {journalEntries.slice(0, 5).map((entry) => {
                    const total = getJournalEntryTotal(entry);
                    return (
                      <div
                        key={`je-${entry.id}`}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e2a28] transition-all duration-200 group cursor-pointer"
                        onClick={() => onNavigate?.('journal')}
                      >
                        <div className="h-8 w-8 rounded-lg bg-[#f0fdf9] dark:bg-[#1a2e2b] flex items-center justify-center shrink-0">
                          <PenLine className="h-3.5 w-3.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {entry.description || (language === 'da' ? 'Uden beskrivelse' : 'No description')}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{getRelativeTime(entry.date)}</span>
                            <Badge
                              className={`text-[8px] px-1 py-0 h-4 ${
                                entry.status === 'POSTED'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                              }`}
                            >
                              {entry.status}
                            </Badge>
                          </div>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${
                          total >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {tc(total)}
                        </span>
                      </div>
                    );
                  })}

                  {/* Recent transactions in activity feed */}
                  {transactions.slice(0, 5).map((tx) => (
                    <div
                      key={`tx-${tx.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e2a28] transition-all duration-200 group cursor-pointer"
                    >
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        tx.type === 'PURCHASE'
                          ? 'bg-amber-50 dark:bg-amber-900/20'
                          : 'bg-[#f0fdf9] dark:bg-[#1a2e2b]'
                      }`}>
                        {tx.type === 'PURCHASE' ? (
                          <ArrowDownRight className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {tx.description}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{getRelativeTime(tx.date)}</span>
                          <Badge
                            className={`text-[8px] px-1 py-0 h-4 ${
                              tx.type === 'PURCHASE'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                : tx.type === 'SALARY'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                : tx.type === 'BANK'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                : tx.type === 'Z_REPORT'
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
                                : tx.type === 'ADJUSTMENT'
                                ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                            }`}
                          >
                            {tx.type === 'PURCHASE'
                              ? (language === 'da' ? 'Køb' : 'Purchase')
                              : tx.type === 'SALARY'
                              ? (language === 'da' ? 'Løn' : 'Salary')
                              : tx.type === 'BANK'
                              ? (language === 'da' ? 'Bank' : 'Bank')
                              : tx.type === 'Z_REPORT'
                              ? (language === 'da' ? 'Moms' : 'VAT')
                              : tx.type === 'ADJUSTMENT'
                              ? (language === 'da' ? 'Justering' : 'Adjustment')
                              : (language === 'da' ? 'Salg' : 'Sale')
                            }
                          </Badge>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${
                        tx.type === 'PURCHASE' ? 'text-amber-600 dark:text-amber-400' : tx.type === 'SALARY' ? 'text-purple-600 dark:text-purple-400' : tx.type === 'BANK' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'
                      }`}>
                        {tx.type === 'PURCHASE' ? '-' : tx.type === 'SALE' ? '+' : ''}{tc(tx.amount)}
                      </span>
                    </div>
                  ))}

                  {journalEntries.length === 0 && transactions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                      <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-gray-400 dark:text-gray-600" />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Ingen aktivitet endnu' : 'No activity yet'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          )}
          </div>

          {/* ─── Account Balance Overview ───────────────────────── */}
          <div style={{ order: widgetOrderMap['active-accounts'] ?? 999 }}>
          {isWidgetVisible('active-accounts') && topAccounts.length > 0 && (
            <Card className="stat-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#0d9488]" />
                  {language === 'da' ? 'Mest aktive konti' : 'Most Active Accounts'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Konto' : 'Account'}
                        </th>
                        <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Navn' : 'Name'}
                        </th>
                        <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Saldo' : 'Balance'}
                        </th>
                        <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Type' : 'Type'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topAccounts.map((acc) => {
                        const badgeInfo = getAccountTypeBadge(acc.accountType);
                        return (
                          <tr
                            key={acc.accountId}
                            className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                          >
                            <td className="py-2.5 px-3 font-mono text-gray-900 dark:text-white">
                              {acc.accountNumber}
                            </td>
                            <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">
                              {acc.accountName}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-semibold ${
                              acc.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {tc(acc.balance)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${badgeInfo.className}`}>
                                {badgeInfo.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
              </CardContent>
            </Card>
          )}
          </div>
        </div>
      </>
      )}
    </div>
  );
}
