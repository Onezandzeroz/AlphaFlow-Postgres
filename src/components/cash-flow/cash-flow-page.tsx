'use client';

import { useState, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/shared/page-header';
import {
  Wallet,
  ArrowLeftRight,
  Download,
  Search,
  TrendingUp,
  TrendingDown,
  Building2,
  Landmark,
  PiggyBank,
  CircleDot,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

interface CashFlowReport {
  type: string;
  period: { from: string; to: string };
  operating: {
    netIncome: number;
    changesInWorkingCapital: {
      receivables: number;
      inventory: number;
      payables: number;
      otherCurrentAssets: number;
      otherLiabilities: number;
      shortTermDebt: number;
      totalWorkingCapital: number;
    };
    cashFromOperations: number;
  };
  investing: { fixedAssets: number; cashFromInvesting: number };
  financing: {
    longTermDebt: number;
    shareCapital: number;
    retainedEarnings: number;
    cashFromFinancing: number;
  };
  netChangeInCash: number;
  cashBeginning: number;
  cashEnding: number;
  balanced: boolean;
}

interface CashFlowPageProps {
  user: User;
}

export function CashFlowPage({ user }: CashFlowPageProps) {
  const { t, tc, language, isDanish } = useTranslation();

  const today = new Date();
  const currentYear = today.getFullYear();
  const defaultFrom = `${currentYear}-01-01`;
  const defaultTo = `${currentYear}-12-31`;

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!fromDate || !toDate) return;

    setIsLoading(true);
    setError(null);
    setHasFetched(false);

    try {
      const response = await fetch(
        `/api/cash-flow?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data: CashFlowReport = await response.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch report');
      setReport(null);
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [fromDate, toDate]);

  const handleExportCSV = useCallback(() => {
    if (!report) return;

    const isDA = isDanish;

    const rows: string[][] = [];

    // Header
    rows.push([
      isDA ? 'Likviditetsopgørelse' : 'Cash Flow Statement',
      '',
      '',
      report.period.from,
      report.period.to,
    ]);
    rows.push([]);

    // Operating Activities
    rows.push([
      isDA ? 'DRIFTSAKTIVITETER' : 'OPERATING ACTIVITIES',
      '',
      '',
      '',
      '',
    ]);

    rows.push([
      '',
      isDA ? 'Nettoindkomst' : 'Net Income',
      '',
      '',
      report.operating.netIncome.toFixed(2),
    ]);

    const wc = report.operating.changesInWorkingCapital;
    rows.push([
      '',
      isDA ? 'Ændring i tilgodehavender' : 'Change in receivables',
      '',
      '',
      wc.receivables.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Ændring i varelager' : 'Change in inventory',
      '',
      '',
      wc.inventory.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Ændring i leverandørgæld' : 'Change in payables',
      '',
      '',
      wc.payables.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Ændring i andre omsætningsaktiver' : 'Other current assets',
      '',
      '',
      wc.otherCurrentAssets.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Ændring i andre forpligtelser' : 'Other liabilities',
      '',
      '',
      wc.otherLiabilities.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Ændring i kortfristet gæld' : 'Short-term debt',
      '',
      '',
      wc.shortTermDebt.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Total driftsaktiviteter' : 'Cash from Operations',
      '',
      '',
      report.operating.cashFromOperations.toFixed(2),
    ]);

    rows.push([]);

    // Investing Activities
    rows.push([
      isDA ? 'INVESTERINGSaktiviteter' : 'INVESTING ACTIVITIES',
      '',
      '',
      '',
      '',
    ]);
    rows.push([
      '',
      isDA ? 'Anlægsaktiver' : 'Fixed assets',
      '',
      '',
      report.investing.fixedAssets.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Total investeringsaktiviteter' : 'Cash from Investing',
      '',
      '',
      report.investing.cashFromInvesting.toFixed(2),
    ]);

    rows.push([]);

    // Financing Activities
    rows.push([
      isDA ? 'FINANSIERINGSAKTIVITETER' : 'FINANCING ACTIVITIES',
      '',
      '',
      '',
      '',
    ]);
    rows.push([
      '',
      isDA ? 'Langfristet gæld' : 'Long-term debt',
      '',
      '',
      report.financing.longTermDebt.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Aktiekapital' : 'Share capital',
      '',
      '',
      report.financing.shareCapital.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Reserver' : 'Retained earnings',
      '',
      '',
      report.financing.retainedEarnings.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Total finansieringsaktiviteter' : 'Cash from Financing',
      '',
      '',
      report.financing.cashFromFinancing.toFixed(2),
    ]);

    rows.push([]);

    // Net Change
    rows.push([
      '',
      isDA ? 'Netto ændring i likvide beholdninger' : 'Net Change in Cash',
      '',
      '',
      report.netChangeInCash.toFixed(2),
    ]);

    rows.push([]);

    // Cash verification
    rows.push([
      isDA ? 'LIKVIDE BEHOLDNINGER PR.' : 'CASH AT',
      '',
      '',
      '',
      '',
    ]);
    rows.push([
      '',
      isDA ? 'Årsets begyndelse' : 'Beginning of period',
      '',
      '',
      report.cashBeginning.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Årsets slutning' : 'End of period',
      '',
      '',
      report.cashEnding.toFixed(2),
    ]);
    rows.push([
      '',
      isDA ? 'Balance check' : 'Balance check',
      '',
      '',
      report.balanced ? (isDA ? 'Balanceret' : 'Balanced') : (isDA ? 'Ubalanceret' : 'Not balanced'),
    ]);

    const bom = '\uFEFF';
    const csv = bom + rows.map((r) => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-flow-${fromDate}-to-${toDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [report, fromDate, toDate, isDanish]);

  // Helper for rendering value colors
  const valueColor = (value: number) => {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-900 dark:text-white';
  };

  const formatValue = (value: number) => tc(value);

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={isDanish ? 'Likviditetsopgørelse' : 'Cash Flow Statement'}
        description={isDanish
          ? 'Oversigt over virksomhedens likviditetsstrømme i den valgte periode'
          : 'Overview of the company\'s cash flows for the selected period'}
      />

      {/* Date Range Picker */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                  {t('from')}
                </label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-gray-50 dark:bg-white/5 border-0"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                  {t('to')}
                </label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-gray-50 dark:bg-white/5 border-0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={fetchReport} disabled={isLoading} className="gap-2 btn-primary">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {isLoading
                  ? (isDanish ? 'Henter...' : 'Fetching...')
                  : (isDanish ? 'Hent rapport' : 'Fetch Report')}
              </Button>
              {report && (
                <Button
                  onClick={handleExportCSV}
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  {t('exportCSV')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="stat-card card-hover-lift">
                <CardContent className="p-3 sm:p-6 space-y-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="stat-card card-hover-lift">
            <CardContent className="p-4 sm:p-6 space-y-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <Card className="border-red-200 dark:border-red-900/50">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <XCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!report && !isLoading && !error && hasFetched && (
        <Card className="stat-card card-hover-lift">
          <CardContent className="p-5 sm:p-8 flex flex-col items-center justify-center text-center">
            <ArrowLeftRight className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {isDanish ? 'Ingen data fundet' : 'No data found'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
              {isDanish
                ? 'Vælg en periode og klik på "Hent rapport" for at se likviditetsopgørelsen.'
                : 'Select a period and click "Fetch Report" to view the cash flow statement.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Initial State (no fetch yet) */}
      {!report && !isLoading && !error && !hasFetched && (
        <Card className="stat-card card-hover-lift">
          <CardContent className="p-5 sm:p-8 flex flex-col items-center justify-center text-center">
            <ArrowLeftRight className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {isDanish ? 'Vælg periode' : 'Select Period'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
              {isDanish
                ? 'Vælg start- og slutdato for perioden, og klik på "Hent rapport" for at generere likviditetsopgørelsen.'
                : 'Choose start and end dates for the period, then click "Fetch Report" to generate the cash flow statement.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Report Content */}
      {report && !isLoading && (
        <>
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Cash from Operations */}
            <Card className="stat-card card-hover-lift">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                  </div>
                  {report.operating.cashFromOperations >= 0 ? (
                    <Badge className="badge-green text-[10px] sm:text-xs">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      +
                    </Badge>
                  ) : (
                    <Badge className="badge-red text-[10px] sm:text-xs">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      -
                    </Badge>
                  )}
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium">
                  {isDanish ? 'Driftsaktiviteter' : 'Cash from Operations'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${valueColor(report.operating.cashFromOperations)}`}>
                  {formatValue(report.operating.cashFromOperations)}
                </p>
              </CardContent>
            </Card>

            {/* Cash from Investing */}
            <Card className="stat-card card-hover-lift">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-purple flex items-center justify-center">
                    <Building2 className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                  {report.investing.cashFromInvesting >= 0 ? (
                    <Badge className="badge-green text-[10px] sm:text-xs">+</Badge>
                  ) : (
                    <Badge className="badge-red text-[10px] sm:text-xs">-</Badge>
                  )}
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium">
                  {isDanish ? 'Investeringsaktiviteter' : 'Cash from Investing'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${valueColor(report.investing.cashFromInvesting)}`}>
                  {formatValue(report.investing.cashFromInvesting)}
                </p>
              </CardContent>
            </Card>

            {/* Cash from Financing */}
            <Card className="stat-card card-hover-lift">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                    <Landmark className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  {report.financing.cashFromFinancing >= 0 ? (
                    <Badge className="badge-green text-[10px] sm:text-xs">+</Badge>
                  ) : (
                    <Badge className="badge-red text-[10px] sm:text-xs">-</Badge>
                  )}
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium">
                  {isDanish ? 'Finansieringsaktiviteter' : 'Cash from Financing'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${valueColor(report.financing.cashFromFinancing)}`}>
                  {formatValue(report.financing.cashFromFinancing)}
                </p>
              </CardContent>
            </Card>

            {/* Net Change in Cash */}
            <Card className="stat-card card-hover-lift ring-2 ring-amber-400/30 dark:ring-amber-500/20">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                    <PiggyBank className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                  {report.netChangeInCash >= 0 ? (
                    <Badge className="badge-green text-[10px] sm:text-xs">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      +
                    </Badge>
                  ) : (
                    <Badge className="badge-red text-[10px] sm:text-xs">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      -
                    </Badge>
                  )}
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium">
                  {isDanish ? 'Netto ændring i likvide beholdninger' : 'Net Change in Cash'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${valueColor(report.netChangeInCash)}`}>
                  {formatValue(report.netChangeInCash)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Cash Flow Table */}
          <Card className="stat-card card-hover-lift bg-mesh">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-amber-500" />
                  {isDanish ? 'Likviditetsopgørelse' : 'Cash Flow Statement'}
                </CardTitle>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {report.period.from} — {report.period.to}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-200 dark:border-gray-700">
                      <TableHead className="py-3 px-4 w-12">{isDanish ? 'Sektion' : 'Section'}</TableHead>
                      <TableHead className="py-3 px-4">{isDanish ? 'Post' : 'Item'}</TableHead>
                      <TableHead className="py-3 px-4 text-right">{isDanish ? 'Beløb (kr)' : 'Amount (DKK)'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* ─── OPERATING ACTIVITIES ─── */}
                    <TableRow className="bg-green-50/50 dark:bg-green-900/10 border-b border-green-200 dark:border-green-800/30">
                      <TableCell colSpan={3} className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-5 rounded-full bg-green-500 dark:bg-green-400" />
                          <span className="font-semibold text-green-700 dark:text-green-400 text-sm">
                            {isDanish ? 'Driftsaktiviteter' : 'Operating Activities'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Nettoindkomst' : 'Net Income'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right font-medium ${valueColor(report.operating.netIncome)}`}>
                        {formatValue(report.operating.netIncome)}
                      </TableCell>
                    </TableRow>

                    {/* Working capital changes */}
                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-600 dark:text-gray-400 pl-8">
                        {isDanish ? 'Ændring i tilgodehavender' : 'Change in receivables'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right ${valueColor(report.operating.changesInWorkingCapital.receivables)}`}>
                        {formatValue(report.operating.changesInWorkingCapital.receivables)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-600 dark:text-gray-400 pl-8">
                        {isDanish ? 'Ændring i varelager' : 'Change in inventory'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right ${valueColor(report.operating.changesInWorkingCapital.inventory)}`}>
                        {formatValue(report.operating.changesInWorkingCapital.inventory)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-600 dark:text-gray-400 pl-8">
                        {isDanish ? 'Ændring i leverandørgæld' : 'Change in payables'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right ${valueColor(report.operating.changesInWorkingCapital.payables)}`}>
                        {formatValue(report.operating.changesInWorkingCapital.payables)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-600 dark:text-gray-400 pl-8">
                        {isDanish ? 'Ændring i andre omsætningsaktiver' : 'Other current assets'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right ${valueColor(report.operating.changesInWorkingCapital.otherCurrentAssets)}`}>
                        {formatValue(report.operating.changesInWorkingCapital.otherCurrentAssets)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-600 dark:text-gray-400 pl-8">
                        {isDanish ? 'Ændring i andre forpligtelser' : 'Other liabilities'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right ${valueColor(report.operating.changesInWorkingCapital.otherLiabilities)}`}>
                        {formatValue(report.operating.changesInWorkingCapital.otherLiabilities)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-600 dark:text-gray-400 pl-8">
                        {isDanish ? 'Ændring i kortfristet gæld' : 'Short-term debt'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right ${valueColor(report.operating.changesInWorkingCapital.shortTermDebt)}`}>
                        {formatValue(report.operating.changesInWorkingCapital.shortTermDebt)}
                      </TableCell>
                    </TableRow>

                    {/* Operating Total */}
                    <TableRow className="bg-green-50/80 dark:bg-green-900/15 border-b-2 border-green-300 dark:border-green-700/40">
                      <TableCell className="py-2.5 px-4" />
                      <TableCell className="py-2.5 px-4 font-bold text-green-700 dark:text-green-400">
                        {isDanish ? 'Total driftsaktiviteter' : 'Cash from Operations'}
                      </TableCell>
                      <TableCell className={`py-2.5 px-4 text-right font-bold ${valueColor(report.operating.cashFromOperations)}`}>
                        {formatValue(report.operating.cashFromOperations)}
                      </TableCell>
                    </TableRow>

                    {/* Spacer row */}
                    <TableRow>
                      <TableCell colSpan={3} className="py-2" />
                    </TableRow>

                    {/* ─── INVESTING ACTIVITIES ─── */}
                    <TableRow className="bg-[#e6f7f3]/50 dark:bg-[#302b26] border-b border-[#e2d8d0] dark:border-[#2dd4bf]/30">
                      <TableCell colSpan={3} className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-5 rounded-full bg-[#0d9488] dark:bg-[#2dd4bf]" />
                          <span className="font-semibold text-[#0d9488] dark:text-[#2dd4bf] text-sm">
                            {isDanish ? 'Investeringsaktiviteter' : 'Investing Activities'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Anlægsaktiver' : 'Fixed assets'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right font-medium ${valueColor(report.investing.fixedAssets)}`}>
                        {formatValue(report.investing.fixedAssets)}
                      </TableCell>
                    </TableRow>

                    {/* Investing Total */}
                    <TableRow className="bg-[#e6f7f3]/80 dark:bg-[#302b26] border-b-2 border-[#d8cfc5] dark:border-[#2dd4bf]/40">
                      <TableCell className="py-2.5 px-4" />
                      <TableCell className="py-2.5 px-4 font-bold text-[#0d9488] dark:text-[#2dd4bf]">
                        {isDanish ? 'Total investeringsaktiviteter' : 'Cash from Investing'}
                      </TableCell>
                      <TableCell className={`py-2.5 px-4 text-right font-bold ${valueColor(report.investing.cashFromInvesting)}`}>
                        {formatValue(report.investing.cashFromInvesting)}
                      </TableCell>
                    </TableRow>

                    {/* Spacer row */}
                    <TableRow>
                      <TableCell colSpan={3} className="py-2" />
                    </TableRow>

                    {/* ─── FINANCING ACTIVITIES ─── */}
                    <TableRow className="bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800/30">
                      <TableCell colSpan={3} className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-5 rounded-full bg-amber-500 dark:bg-amber-400" />
                          <span className="font-semibold text-amber-700 dark:text-amber-500 text-sm">
                            {isDanish ? 'Finansieringsaktiviteter' : 'Financing Activities'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Langfristet gæld' : 'Long-term debt'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right font-medium ${valueColor(report.financing.longTermDebt)}`}>
                        {formatValue(report.financing.longTermDebt)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Aktiekapital' : 'Share capital'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right font-medium ${valueColor(report.financing.shareCapital)}`}>
                        {formatValue(report.financing.shareCapital)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Reserver' : 'Retained earnings'}
                      </TableCell>
                      <TableCell className={`py-2 px-4 text-right font-medium ${valueColor(report.financing.retainedEarnings)}`}>
                        {formatValue(report.financing.retainedEarnings)}
                      </TableCell>
                    </TableRow>

                    {/* Financing Total */}
                    <TableRow className="bg-amber-50/80 dark:bg-amber-900/15 border-b-2 border-amber-300 dark:border-amber-700/40">
                      <TableCell className="py-2.5 px-4" />
                      <TableCell className="py-2.5 px-4 font-bold text-amber-700 dark:text-amber-500">
                        {isDanish ? 'Total finansieringsaktiviteter' : 'Cash from Financing'}
                      </TableCell>
                      <TableCell className={`py-2.5 px-4 text-right font-bold ${valueColor(report.financing.cashFromFinancing)}`}>
                        {formatValue(report.financing.cashFromFinancing)}
                      </TableCell>
                    </TableRow>

                    {/* Spacer row */}
                    <TableRow>
                      <TableCell colSpan={3} className="py-1" />
                    </TableRow>

                    {/* ─── NET CHANGE IN CASH ─── */}
                    <TableRow className="bg-gray-100 dark:bg-white/5 border-b-2 border-gray-300 dark:border-gray-600">
                      <TableCell className="py-3 px-4">
                        <CircleDot className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </TableCell>
                      <TableCell className="py-3 px-4 font-bold text-gray-900 dark:text-white">
                        {isDanish ? 'Netto ændring i likvide beholdninger' : 'Net Change in Cash'}
                      </TableCell>
                      <TableCell className={`py-3 px-4 text-right font-bold text-lg ${valueColor(report.netChangeInCash)}`}>
                        {formatValue(report.netChangeInCash)}
                      </TableCell>
                    </TableRow>

                    {/* Spacer row */}
                    <TableRow>
                      <TableCell colSpan={3} className="py-1" />
                    </TableRow>

                    {/* ─── CASH VERIFICATION ─── */}
                    <TableRow className="border-b border-gray-200 dark:border-gray-700">
                      <TableCell colSpan={3} className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-5 rounded-full bg-gray-400 dark:bg-gray-500" />
                          <span className="font-semibold text-gray-600 dark:text-gray-300 text-sm">
                            {isDanish ? 'Likvide beholdninger pr.' : 'Cash at'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Årsets begyndelse' : 'Beginning of period'}
                      </TableCell>
                      <TableCell className="py-2 px-4 text-right font-medium text-gray-900 dark:text-white">
                        {formatValue(report.cashBeginning)}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-b border-gray-100 dark:border-gray-800 table-row-hover">
                      <TableCell className="py-2 px-4" />
                      <TableCell className="py-2 px-4 text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Årsets slutning' : 'End of period'}
                      </TableCell>
                      <TableCell className="py-2 px-4 text-right font-medium text-gray-900 dark:text-white">
                        {formatValue(report.cashEnding)}
                      </TableCell>
                    </TableRow>

                    {/* Balance check row */}
                    <TableRow className="bg-gray-50/50 dark:bg-white/[0.02]">
                      <TableCell className="py-2.5 px-4" />
                      <TableCell className="py-2.5 px-4 font-medium text-gray-700 dark:text-gray-300">
                        {isDanish ? 'Balance check' : 'Balance check'}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right">
                        {report.balanced ? (
                          <Badge className="badge-green gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {isDanish ? 'Balanceret' : 'Balanced'}
                          </Badge>
                        ) : (
                          <Badge className="badge-red gap-1">
                            <XCircle className="h-3.5 w-3.5" />
                            {isDanish ? 'Ubalanceret' : 'Not balanced'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Export CSV Button (bottom) */}
          <div className="flex justify-end">
            <Button onClick={handleExportCSV} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              {t('exportCSV')}
            </Button>
          </div>

          {/* Info Box */}
          <Card className="info-box-primary">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">&#8505;&#65039;</span>
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <p>
                    <strong>{isDanish ? 'Om likviditetsopgørelsen' : 'About the Cash Flow Statement'}</strong>
                  </p>
                  <p>
                    {isDanish
                      ? 'Denne opgørelse viser virksomhedens likviditetsstrømme opdelt i drifts-, investerings- og finansieringsaktiviteter i den valgte periode.'
                      : 'This statement shows the company\'s cash flows divided into operating, investing, and financing activities for the selected period.'}
                  </p>
                  <p>
                    {isDanish
                      ? 'Balance check bekræfter, at det beregnede likviditetsflow svarer til den faktiske ændring i likvide beholdninger.'
                      : 'The balance check confirms that the computed cash flow matches the actual change in cash and bank balances.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
