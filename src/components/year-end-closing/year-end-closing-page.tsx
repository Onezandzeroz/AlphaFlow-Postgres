'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CalendarDays,
  Lock,
  Unlock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Shield,
  ArrowRight,
  Download,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Scale,
  ClipboardCheck,
  FileText,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

// ─── Danish & English month names ─────────────────────────────────

const DANISH_MONTHS = [
  'Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'December',
];

const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── API Response Types (matching actual backend) ─────────────────

interface AccountBalance {
  id: string;
  number: string;
  name: string;
  type: string;
  group: string;
  debit: number;
  credit: number;
  naturalBalance: number;
}

interface ClosingEntryLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
}

interface FiscalPeriodItem {
  id: string;
  year: number;
  month: number;
  status: string;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
}

interface YearEndPreview {
  year: number;
  accounts: AccountBalance[];
  totalRevenue: number;
  totalExpenses: number;
  netResult: number;
  closingEntry: {
    description: string;
    date: string;
    lines: ClosingEntryLine[];
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  };
  fiscalPeriods: {
    periods: FiscalPeriodItem[];
    openCount: number;
    closedCount: number;
    missingMonths: number[];
  };
  resultAccount: { id: string; number: string; name: string } | null;
  isReadyToClose: boolean;
  warnings: string[];
}

interface JournalEntryLineResult {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
  account: {
    id: string;
    number: string;
    name: string;
    type: string;
    group: string;
  };
}

interface YearEndResult {
  journalEntry: {
    id: string;
    description: string;
    date: string;
    status: string;
    lines: JournalEntryLineResult[];
  };
  lockedPeriods: FiscalPeriodItem[];
  message: string;
}

// ─── Component ─────────────────────────────────────────────────────

export function YearEndClosingPage({ user }: { user: User }) {
  const { language, tc } = useTranslation();
  const isDanish = language === 'da';

  const monthNames = isDanish ? DANISH_MONTHS : ENGLISH_MONTHS;

  // ─── State ─────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [result, setResult] = useState<YearEndResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [yearEndTab, setYearEndTab] = useState('periods');

  // Available years for dropdown (2020–2030)
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = 2020; y <= 2030; y++) years.push(y);
    return years;
  }, []);

  // Revenue and expense accounts split from preview
  const revenueAccounts = useMemo(
    () => preview?.accounts.filter((a) => a.type === 'REVENUE') ?? [],
    [preview],
  );
  const expenseAccounts = useMemo(
    () => preview?.accounts.filter((a) => a.type === 'EXPENSE') ?? [],
    [preview],
  );

  // Fiscal period data mapped to 12 months
  const fiscalPeriodMap = useMemo(() => {
    const map = new Map<number, FiscalPeriodItem>();
    if (preview?.fiscalPeriods?.periods) {
      for (const p of preview.fiscalPeriods.periods) {
        map.set(p.month, p);
      }
    }
    return map;
  }, [preview]);

  // ─── Fetch preview ────────────────────────────────────────────
  const fetchPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/year-end-closing?year=${selectedYear}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setPreview(data);
    } catch (err) {
      console.error('Failed to fetch year-end closing preview:', err);
      setError(
        isDanish
          ? 'Kunne ikke hente forhåndsvisning af årsafslutning'
          : 'Failed to fetch year-end closing preview',
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [selectedYear, isDanish]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  // ─── Execute closing ──────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    setError(null);
    try {
      const response = await fetch('/api/year-end-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear, confirm: true }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setResult(data);
      setShowExecuteDialog(false);
      // Re-fetch preview to reflect updated state
      await fetchPreview();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to execute year-end closing:', err);
      setError(message);
      setShowExecuteDialog(false);
    } finally {
      setIsExecuting(false);
    }
  }, [selectedYear, fetchPreview]);

  // ─── Download closing report CSV ──────────────────────────────
  const handleDownloadCSV = useCallback(() => {
    if (!result) return;
    const je = result.journalEntry;

    const headers = isDanish
      ? ['Konto', 'Navn', 'Debet', 'Kredit']
      : ['Account', 'Name', 'Debit', 'Credit'];

    const rows: string[][] = [
      [isDanish ? 'ÅRSAFSLUTNING' : 'YEAR-END CLOSING', '', '', ''],
      [isDanish ? `Dato: ${je.date}` : `Date: ${je.date}`, '', '', ''],
      [je.description, '', '', ''],
      [],
      ...je.lines.map((line) => [
        line.account.number,
        line.account.name,
        line.debit > 0 ? line.debit.toFixed(2) : '',
        line.credit > 0 ? line.credit.toFixed(2) : '',
      ]),
      [],
      [
        isDanish ? 'TOTAL' : 'TOTAL',
        '',
        je.lines.reduce((s, l) => s + l.debit, 0).toFixed(2),
        je.lines.reduce((s, l) => s + l.credit, 0).toFixed(2),
      ],
    ];

    const bom = '\uFEFF';
    const csv = bom + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `year-end-closing-${selectedYear}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [result, selectedYear, isDanish]);

  // ─── Value color helper ───────────────────────────────────────
  function valueColor(value: number): string {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  }

  // ─── Loading skeleton ─────────────────────────────────────────
  if (isLoadingPreview && !preview) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Info card skeleton */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-4 sm:p-6">
            <div className="hidden sm:flex gap-2 mb-6">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-48" />
            </div>
            <div className="sm:hidden mb-6">
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────
  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={isDanish ? 'Årsafslutning' : 'Year-End Closing'}
        description={isDanish
          ? 'Gennemgå og luk regnskabsåret med automatisk resultatoverførsel til konto 3300'
          : 'Review and close the fiscal year with automatic result transfer to account 3300'}
        action={
          <Button
            onClick={fetchPreview}
            disabled={isLoadingPreview}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
          >
            {isLoadingPreview ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {isDanish ? 'Opdater' : 'Refresh'}
          </Button>
        }
      />

      {/* ──── Year Selector ──── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shrink-0 shadow-lg">
                <CalendarDays className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Vælg regnskabsår' : 'Select fiscal year'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {isDanish
                    ? 'Vælg det år, du ønsker at afslutte'
                    : 'Choose the year you want to close'}
                </p>
              </div>
            </div>
            <div className="flex-1 sm:ml-auto">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative flex-1 sm:max-w-[180px]">
                  <Input
                    type="number"
                    min={2020}
                    max={2030}
                    value={selectedYear}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 2020 && val <= 2030) {
                        setSelectedYear(val);
                      }
                    }}
                    className="pr-8 bg-gray-50 dark:bg-white/[0.04] border-0 text-lg font-semibold"
                  />
                </div>
                {/* Quick year buttons */}
                <div className="flex gap-1">
                  {[selectedYear - 1, selectedYear, selectedYear + 1]
                    .filter((y) => y >= 2020 && y <= 2030)
                    .map((y) => (
                      <Button
                        key={y}
                        variant={y === selectedYear ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedYear(y)}
                        className={
                          y === selectedYear
                            ? 'bg-[#0d9488] hover:bg-[#0f766e] text-white min-w-[48px]'
                            : 'min-w-[48px] dark:text-gray-300'
                        }
                      >
                        {y}
                      </Button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ──── Error Display ──── */}
      {error && (
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 sm:p-6 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {isDanish ? 'Fejl' : 'Error'}
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              {isDanish ? 'Luk' : 'Close'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ──── Result Card (shown after successful closing) ──── */}
      {result && (
        <Card className="relative overflow-hidden border-2 border-green-300 dark:border-green-800/50 shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-green-100/50 to-transparent rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
          <CardHeader className="relative pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                {isDanish
                  ? `${result.journalEntry.description} — fuldført!`
                  : `${result.journalEntry.description} — Complete!`}
              </CardTitle>
              <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isDanish ? 'Lukket' : 'Closed'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="relative">
            {/* Success message */}
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">
                {result.message}
              </p>
            </div>

            {/* Result stats */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Bogført dato' : 'Posted Date'}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                  {result.journalEntry.date}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Lukkede perioder' : 'Locked Periods'}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                  {result.lockedPeriods.length} / 12
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Posteringslinjer' : 'Entry Lines'}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                  {result.journalEntry.lines.length}
                </p>
              </div>
            </div>

            {/* Journal entry table */}
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <TableHead className="w-[100px]">
                      {isDanish ? 'Konto' : 'Account'}
                    </TableHead>
                    <TableHead>
                      {isDanish ? 'Navn' : 'Name'}
                    </TableHead>
                    <TableHead className="text-right w-[120px]">
                      {isDanish ? 'Debet' : 'Debit'}
                    </TableHead>
                    <TableHead className="text-right w-[120px]">
                      {isDanish ? 'Kredit' : 'Credit'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.journalEntry.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono text-sm text-gray-700 dark:text-gray-300">
                        {line.account.number}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                        {line.account.name}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.debit > 0 ? (
                          <span className="text-green-600 dark:text-green-400">
                            {tc(line.debit)}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.credit > 0 ? (
                          <span className="text-red-600 dark:text-red-400">
                            {tc(line.credit)}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-600">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                    <TableCell colSpan={2} className="text-gray-900 dark:text-white">
                      {isDanish ? 'TOTAL' : 'TOTAL'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                      {tc(result.journalEntry.lines.reduce((s, l) => s + l.debit, 0))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                      {tc(result.journalEntry.lines.reduce((s, l) => s + l.credit, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Download button */}
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleDownloadCSV}
                className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all"
              >
                <Download className="h-4 w-4" />
                {isDanish ? 'Download lukkerapport (CSV)' : 'Download closing report (CSV)'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ──── Preview Section ──── */}
      {preview && preview.fiscalPeriods.periods.length > 0 ? (
        <>
          {/* ──── Compliance Info Card ──── */}
          <Card className="relative overflow-hidden border-2 border-[#0d9488]/20 dark:border-[#0d9488]/30 shadow-xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#0d9488]/10 to-transparent rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
            <CardContent className="relative p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shrink-0 shadow-lg">
                  <Shield className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      {isDanish ? 'Årsafslutning' : 'Year-End Closing'}
                    </h3>
                    {preview.isReadyToClose ? (
                      <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isDanish ? 'Klar til lukning' : 'Ready to close'}
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20 gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {isDanish ? 'Ikke klar' : 'Not ready'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {isDanish
                      ? 'Årsafslutningen nulstiller alle indtægts- og omkostningskonti og overfører årets resultat til konto 3300 (Årets resultat). Alle 12 perioder låses. Denne handling er irreversibel.'
                      : 'The year-end closing zeros all revenue and expense accounts and transfers the net result to account 3300 (Annual Result). All 12 fiscal periods are locked. This action is irreversible.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ──── Warnings ──── */}
          {preview.warnings.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800/50">
              <CardContent className="p-4 sm:p-6 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {isDanish ? 'Advarsler' : 'Warnings'}
                  </h3>
                </div>
                {preview.warnings.map((warning, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400"
                  >
                    <span className="shrink-0 mt-0.5">•</span>
                    <span>{warning}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ──── Summary Stat Cards ──── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Revenue */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Total indtægter' : 'Total Revenue'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-0.5 sm:mt-1">
                      {tc(preview.totalRevenue)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {isDanish ? 'Indtægtskonti' : 'Revenue accounts'}
                </div>
              </CardContent>
            </Card>

            {/* Total Expenses */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Total omkostninger' : 'Total Expenses'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-0.5 sm:mt-1">
                      {tc(preview.totalExpenses)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-red flex items-center justify-center">
                    <TrendingDown className="h-4 w-4 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {isDanish ? 'Omkostningskonti' : 'Expense accounts'}
                </div>
              </CardContent>
            </Card>

            {/* Net Result */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Årets resultat' : 'Net Result'}
                    </p>
                    <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${valueColor(preview.netResult)}`}>
                      {tc(preview.netResult)}
                    </p>
                  </div>
                  <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                    preview.netResult >= 0 ? 'stat-icon-green' : 'stat-icon-red'
                  }`}>
                    <Scale className={`h-4 w-4 sm:h-6 sm:w-6 ${preview.netResult >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm">
                  {preview.netResult >= 0 ? (
                    <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1 text-red-600 dark:text-red-400" />
                  )}
                  <span className={preview.netResult >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {preview.netResult >= 0
                      ? (isDanish ? 'Overskud' : 'Profit')
                      : (isDanish ? 'Underskud' : 'Loss')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Periods Status */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Perioder' : 'Periods'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {preview.fiscalPeriods.closedCount}/12
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                    <ClipboardCheck className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <Lock className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {preview.fiscalPeriods.openCount > 0
                    ? (isDanish
                        ? `${preview.fiscalPeriods.openCount} åbne perioder`
                        : `${preview.fiscalPeriods.openCount} open periods`)
                    : (isDanish ? 'Alle lukket' : 'All closed')}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ──── Tabs: Fiscal Periods, P&L Summary, Closing Entry ──── */}
          <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="p-4 sm:p-6">
              <Tabs value={yearEndTab} onValueChange={setYearEndTab} className="space-y-4">
                {/* Mobile: Select dropdown */}
                <div className="sm:hidden space-y-3">
                  <Select value={yearEndTab} onValueChange={setYearEndTab}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="periods">
                        <span className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          {isDanish ? 'Regnskabsperioder' : 'Fiscal Periods'}
                        </span>
                      </SelectItem>
                      <SelectItem value="pnl">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {isDanish ? 'Resultatopgørelse' : 'P&L Summary'}
                        </span>
                      </SelectItem>
                      <SelectItem value="closing">
                        <span className="flex items-center gap-2">
                          <Scale className="h-4 w-4" />
                          {isDanish ? 'Lukkepostering' : 'Closing Entry'}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {!result && preview.isReadyToClose && (
                    <Button
                      onClick={() => setShowExecuteDialog(true)}
                      className="w-full gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all"
                    >
                      <Lock className="h-4 w-4" />
                      {isDanish ? 'Udfør årsafslutning' : 'Execute closing'}
                    </Button>
                  )}
                </div>
                {/* Desktop: Horizontal tabs */}
                <div className="hidden sm:flex items-center justify-between flex-wrap gap-2">
                  <TabsList className="bg-gray-100 dark:bg-gray-800 h-10">
                    <TabsTrigger value="periods" className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm">
                      <CalendarDays className="h-4 w-4" />
                      {isDanish ? 'Regnskabsperioder' : 'Fiscal Periods'}
                    </TabsTrigger>
                    <TabsTrigger value="pnl" className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm">
                      <FileText className="h-4 w-4" />
                      {isDanish ? 'Resultatopgørelse' : 'P&L Summary'}
                    </TabsTrigger>
                    <TabsTrigger value="closing" className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm">
                      <Scale className="h-4 w-4" />
                      {isDanish ? 'Lukkepostering' : 'Closing Entry'}
                    </TabsTrigger>
                  </TabsList>

                  {!result && preview.isReadyToClose && (
                    <Button
                      onClick={() => setShowExecuteDialog(true)}
                      className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all"
                    >
                      <Lock className="h-4 w-4" />
                      {isDanish ? 'Udfør årsafslutning' : 'Execute closing'}
                    </Button>
                  )}
                </div>

                {/* ──── Tab 1: Fiscal Period Status Grid ──── */}
                <TabsContent value="periods" className="mt-0">
                  {preview.fiscalPeriods.missingMonths.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg">
                      <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>
                          {isDanish
                            ? `Manglende perioder for ${selectedYear}: ${preview.fiscalPeriods.missingMonths.map((m) => monthNames[m - 1]).join(', ')}`
                            : `Missing periods for ${selectedYear}: ${preview.fiscalPeriods.missingMonths.map((m) => monthNames[m - 1]).join(', ')}`}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                      const period = fiscalPeriodMap.get(month);
                      const isClosed = period?.status === 'CLOSED';
                      const isMissing = !period;
                      const currentMonth = new Date().getMonth() + 1;
                      const isCurrentMonth = month === currentMonth && selectedYear === new Date().getFullYear();

                      return (
                        <div
                          key={month}
                          className={`relative rounded-xl border p-3 sm:p-4 transition-all ${
                            isMissing
                              ? 'border-dashed border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-white/5 opacity-60'
                              : isClosed
                                ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5'
                                : isCurrentMonth
                                  ? 'border-[#0d9488]/40 dark:border-[#0d9488]/50 bg-[#0d9488]/5 dark:bg-[#0d9488]/10 shadow-md shadow-[#0d9488]/10'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/15'
                          }`}
                        >
                          {isCurrentMonth && !isClosed && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                              <Badge className="bg-[#0d9488] text-white text-[10px] px-2 py-0 shadow-md">
                                {isDanish ? 'Nuværende' : 'Current'}
                              </Badge>
                            </div>
                          )}
                          <p className={`text-xs sm:text-sm font-semibold mb-2 ${
                            isMissing
                              ? 'text-gray-400 dark:text-gray-600'
                              : isCurrentMonth
                                ? 'text-[#0d9488] dark:text-[#2dd4bf]'
                                : 'text-gray-900 dark:text-white'
                          }`}>
                            {monthNames[month - 1]}
                          </p>
                          {isMissing ? (
                            <Badge variant="outline" className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 border-gray-300 dark:border-white/20">
                              {isDanish ? 'Mangler' : 'Missing'}
                            </Badge>
                          ) : isClosed ? (
                            <Badge className="badge-amber text-[10px] sm:text-xs gap-1">
                              <Lock className="h-3 w-3" />
                              {isDanish ? 'Lukket' : 'Closed'}
                            </Badge>
                          ) : (
                            <Badge className="badge-green text-[10px] sm:text-xs gap-1">
                              <Unlock className="h-3 w-3" />
                              {isDanish ? 'Åben' : 'Open'}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                {/* ──── Tab 2: P&L Account Summary ──── */}
                <TabsContent value="pnl" className="mt-0">
                  {preview.accounts.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {isDanish
                          ? `Ingen indtægts- eller omkostningsposter fundet for ${selectedYear}`
                          : `No revenue or expense entries found for ${selectedYear}`}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                            <TableHead className="w-[100px]">
                              {isDanish ? 'Konto' : 'Account'}
                            </TableHead>
                            <TableHead>
                              {isDanish ? 'Navn' : 'Name'}
                            </TableHead>
                            <TableHead className="w-[100px]">
                              {isDanish ? 'Type' : 'Type'}
                            </TableHead>
                            <TableHead className="text-right w-[140px]">
                              {isDanish ? 'Saldo' : 'Balance'}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Revenue accounts section header */}
                          <TableRow className="bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                            <TableCell
                              colSpan={4}
                              className="font-semibold text-gray-900 dark:text-white"
                            >
                              <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                <span className="w-2 h-2 rounded-full bg-current" />
                                {isDanish ? 'Indtægter (Revenue)' : 'Revenue'}
                              </span>
                            </TableCell>
                          </TableRow>
                          {revenueAccounts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">
                                {isDanish ? 'Ingen indtægter' : 'No revenue'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            revenueAccounts.map((account) => (
                              <TableRow key={account.id}>
                                <TableCell className="font-mono text-sm text-gray-700 dark:text-gray-300">
                                  {account.number}
                                </TableCell>
                                <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                                  {account.name}
                                </TableCell>
                                <TableCell>
                                  <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 text-[10px]">
                                    {isDanish ? 'Indtægt' : 'Rev.'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                                  {tc(account.naturalBalance)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}

                          {/* Revenue total */}
                          <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-semibold border-t border-gray-300 dark:border-white/20">
                            <TableCell colSpan={3} className="text-gray-900 dark:text-white">
                              {isDanish ? 'Total indtægter' : 'Total Revenue'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                              {tc(preview.totalRevenue)}
                            </TableCell>
                          </TableRow>

                          {/* Spacer row */}
                          <TableRow>
                            <TableCell colSpan={4} className="h-3" />
                          </TableRow>

                          {/* Expense accounts section header */}
                          <TableRow className="bg-red-50 dark:bg-red-500/10 hover:bg-red-50 dark:hover:bg-red-500/10">
                            <TableCell
                              colSpan={4}
                              className="font-semibold text-gray-900 dark:text-white"
                            >
                              <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                <span className="w-2 h-2 rounded-full bg-current" />
                                {isDanish ? 'Omkostninger (Expenses)' : 'Expenses'}
                              </span>
                            </TableCell>
                          </TableRow>
                          {expenseAccounts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">
                                {isDanish ? 'Ingen omkostninger' : 'No expenses'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            expenseAccounts.map((account) => (
                              <TableRow key={account.id}>
                                <TableCell className="font-mono text-sm text-gray-700 dark:text-gray-300">
                                  {account.number}
                                </TableCell>
                                <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                                  {account.name}
                                </TableCell>
                                <TableCell>
                                  <Badge className="bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20 text-[10px]">
                                    {isDanish ? 'Omkost.' : 'Exp.'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                                  {tc(account.naturalBalance)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}

                          {/* Expense total */}
                          <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-semibold border-t border-gray-300 dark:border-white/20">
                            <TableCell colSpan={3} className="text-gray-900 dark:text-white">
                              {isDanish ? 'Total omkostninger' : 'Total Expenses'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                              {tc(preview.totalExpenses)}
                            </TableCell>
                          </TableRow>

                          {/* Net result row */}
                          <TableRow className="bg-[#e6f7f3] dark:bg-[#0d9488]/10 hover:bg-[#e6f7f3] dark:hover:bg-[#0d9488]/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                            <TableCell colSpan={3} className="text-gray-900 dark:text-white text-sm sm:text-base">
                              <span className="flex items-center gap-2 text-[#0d9488] dark:text-[#2dd4bf]">
                                <span className="w-2 h-2 rounded-full bg-current" />
                                {isDanish ? 'Årets resultat (konto 3300)' : 'Net Result (account 3300)'}
                              </span>
                            </TableCell>
                            <TableCell className={`text-right font-mono text-sm sm:text-base ${valueColor(preview.netResult)}`}>
                              {tc(preview.netResult)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* ──── Tab 3: Closing Entry Preview ──── */}
                <TabsContent value="closing" className="mt-0">
                  {preview.closingEntry.lines.length === 0 ? (
                    <div className="text-center py-12">
                      <Scale className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {isDanish
                          ? 'Ingen lukkeposter at vise'
                          : 'No closing entries to display'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Entry header info */}
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <Badge variant="outline" className="text-xs">
                          {preview.closingEntry.description}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {preview.closingEntry.date}
                        </Badge>
                        {preview.closingEntry.balanced ? (
                          <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {isDanish ? 'I balance' : 'Balanced'}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20 gap-1">
                            <XCircle className="h-3.5 w-3.5" />
                            {isDanish ? 'Ikke i balance' : 'Not balanced'}
                          </Badge>
                        )}
                      </div>

                      {/* Closing entry table */}
                      <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                              <TableHead className="w-[100px]">
                                {isDanish ? 'Konto' : 'Account'}
                              </TableHead>
                              <TableHead>
                                {isDanish ? 'Navn' : 'Name'}
                              </TableHead>
                              <TableHead className="w-[80px]">
                                {isDanish ? 'Type' : 'Type'}
                              </TableHead>
                              <TableHead className="text-right w-[140px]">
                                {isDanish ? 'Debet' : 'Debit'}
                              </TableHead>
                              <TableHead className="text-right w-[140px]">
                                {isDanish ? 'Kredit' : 'Credit'}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.closingEntry.lines.map((line, idx) => {
                              const isResultAccount = line.accountNumber === '3300';
                              return (
                                <TableRow
                                  key={`${line.accountId}-${idx}`}
                                  className={isResultAccount ? 'bg-[#e6f7f3] dark:bg-[#0d9488]/10 hover:bg-[#e6f7f3] dark:hover:bg-[#0d9488]/10 font-semibold' : ''}
                                >
                                  <TableCell className="font-mono text-sm text-gray-700 dark:text-gray-300">
                                    {line.accountNumber}
                                  </TableCell>
                                  <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                                    {line.accountName}
                                    {isResultAccount && (
                                      <Badge className="ml-2 bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20 text-[10px]">
                                        3300
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={`text-[10px] ${
                                      line.accountType === 'REVENUE'
                                        ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20'
                                        : line.accountType === 'EXPENSE'
                                          ? 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20'
                                          : 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20'
                                    }`}>
                                      {line.accountType === 'REVENUE'
                                        ? (isDanish ? 'Indtægt' : 'Rev.')
                                        : line.accountType === 'EXPENSE'
                                          ? (isDanish ? 'Omkost.' : 'Exp.')
                                          : 'Eq.'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {line.debit > 0 ? (
                                      <span className={isResultAccount ? 'text-[#0d9488] dark:text-[#2dd4bf]' : 'text-green-600 dark:text-green-400'}>
                                        {tc(line.debit)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 dark:text-gray-600">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {line.credit > 0 ? (
                                      <span className={isResultAccount ? 'text-[#0d9488] dark:text-[#2dd4bf]' : 'text-red-600 dark:text-red-400'}>
                                        {tc(line.credit)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 dark:text-gray-600">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {/* Totals */}
                            <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                              <TableCell colSpan={3} className="text-gray-900 dark:text-white">
                                {isDanish ? 'TOTAL' : 'TOTAL'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                                {tc(preview.closingEntry.totalDebit)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                                {tc(preview.closingEntry.totalCredit)}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>

                      {/* Closing explanation */}
                      <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
                        <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                        <div className="space-y-1">
                          <p>
                            {isDanish
                              ? 'Denne postering nulstiller alle indtægts- og omkostningskonti ved at debitere indtægter (nulstille kreditbalancer) og krediterer omkostninger (nulstille debitbalancer).'
                              : 'This entry zeros all revenue and expense accounts by debiting revenue (zeroing credit balances) and crediting expenses (zeroing debit balances).'}
                          </p>
                          <p>
                            {preview.netResult >= 0
                              ? (isDanish
                                  ? `Årets overskud på ${tc(preview.netResult)} overføres til konto 3300 (Årets resultat) som kredit.`
                                  : `The year's profit of ${tc(preview.netResult)} is transferred to account 3300 (Annual Result) as credit.`)
                              : (isDanish
                                  ? `Årets underskud på ${tc(Math.abs(preview.netResult))} overføres til konto 3300 (Årets resultat) som debet.`
                                  : `The year's loss of ${tc(Math.abs(preview.netResult))} is transferred to account 3300 (Annual Result) as debit.`)}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>

              {/* ──── Execute button at bottom ──── */}
              {!result && (
                <>
                  <Separator className="my-4" />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" />
                      <p>
                        {isDanish
                          ? 'Advarsel: Årsafslutningen er irreversibel. Alle 12 perioder låses og der oprettes en bogført postering.'
                          : 'Warning: The year-end closing is irreversible. All 12 periods will be locked and a posted journal entry will be created.'}
                      </p>
                    </div>
                    <Button
                      onClick={() => setShowExecuteDialog(true)}
                      disabled={!preview.isReadyToClose}
                      className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      <Lock className="h-4 w-4" />
                      {isDanish ? 'Udfør årsafslutning' : 'Execute year-end closing'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        !isLoadingPreview && !error && !result && preview && preview.fiscalPeriods.periods.length === 0 && (
          <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="py-16 text-center">
              <div className="empty-state-container inline-flex flex-col items-center">
                <div className="empty-state-illustration inline-flex items-center justify-center h-20 w-20 rounded-2xl mb-4">
                  <CalendarDays className="h-10 w-10 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {isDanish ? 'Ingen finansielle perioder oprettet endnu' : 'No fiscal periods created yet'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  {isDanish
                    ? 'Opret regnskabsperioder under onboarding for at kunne bruge årsafslutning. Årsafslutningen kræver, at alle 12 perioder er oprettet for det valgte regnskabsår.'
                    : 'Create fiscal periods during onboarding to use year-end closing. The year-end closing requires all 12 periods to be created for the selected fiscal year.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      )}
      {/* end preview */}

      {/* ──── Execute Confirmation Dialog ──── */}
      <AlertDialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {isDanish
                ? `Bekræft årsafslutning for ${selectedYear}`
                : `Confirm year-end closing for ${selectedYear}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {isDanish
                    ? 'Er du sikker på, at du vil udføre årsafslutningen? Denne handling er irreversibel og vil:'
                    : 'Are you sure you want to execute the year-end closing? This action is irreversible and will:'}
                </p>

                {/* Warning details */}
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <Lock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? `Låse alle 12 regnskabsperioder for ${selectedYear}`
                        : `Lock all 12 fiscal periods for ${selectedYear}`}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? `Oprette en bogført postering med ${preview?.closingEntry.lines.length ?? 0} linjer der nulstiller alle indtægts- og omkostningskonti`
                        : `Create a posted journal entry with ${preview?.closingEntry.lines.length ?? 0} lines that zero all revenue and expense accounts`}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Scale className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? `Overføre årets resultat (${tc(preview?.netResult ?? 0)}) til konto 3300 (Årets resultat)`
                        : `Transfer the net result (${tc(preview?.netResult ?? 0)}) to account 3300 (Annual Result)`}
                    </p>
                  </div>
                </div>

                {/* Period details */}
                <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Regnskabsår' : 'Fiscal Year'}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedYear}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Åbne perioder' : 'Open Periods'}
                    </span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {preview?.fiscalPeriods.openCount ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Allerede lukket' : 'Already Closed'}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {preview?.fiscalPeriods.closedCount ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Konto 3300' : 'Account 3300'}
                    </span>
                    <span className={`font-medium ${preview?.resultAccount ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {preview?.resultAccount
                        ? (isDanish ? 'Fundet' : 'Found')
                        : (isDanish ? 'Mangler!' : 'Missing!')}
                    </span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              className="dark:bg-white/5 dark:text-gray-300"
              disabled={isExecuting}
            >
              {isDanish ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleExecute();
              }}
              disabled={isExecuting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isDanish ? 'Udfører...' : 'Executing...'}
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  {isDanish ? 'Bekræft og luk året' : 'Confirm & close year'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
