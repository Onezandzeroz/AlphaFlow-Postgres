'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import {
  Loader2,
  Download,
  TrendingUp,
  TrendingDown,
  BarChart3,
  BookOpen,
  PieChart,
  Scale,
  CalendarDays,
  ArrowUpDown,
  Info,
  FileText,
} from 'lucide-react';

// ─── API Response Types ────────────────────────────────────────────

interface IncomeStatementData {
  type: 'income-statement';
  period: { from: string; to: string };
  grossProfit: {
    revenue: number;
    costOfGoods: number;
    grossProfit: number;
  };
  operatingExpenses: {
    personnel: number;
    otherOperating: number;
    total: number;
  };
  operatingResult: number;
  financialItems: {
    financialIncome: number;
    financialExpenses: number;
    net: number;
  };
  netResult: number;
}

interface BalanceSheetData {
  type: 'balance-sheet';
  asOf: string;
  assets: {
    currentAssets: {
      cash: number;
      bank: number;
      receivables: number;
      inventory: number;
      otherCurrentAssets: number;
      total: number;
    };
    fixedAssets: {
      total: number;
    };
    totalAssets: number;
  };
  liabilities: {
    shortTerm: {
      payables: number;
      shortTermDebt: number;
      otherLiabilities: number;
      total: number;
    };
    longTerm: {
      bankLoan: number;
      total: number;
    };
    totalLiabilities: number;
  };
  equity: {
    shareCapital: number;
    retainedEarnings: number;
    currentYearResult: number;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

interface ReportsPageProps {
  user: User;
}

// ─── Helper: value color class ─────────────────────────────────────

function valueColor(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

// ─── Component ─────────────────────────────────────────────────────

export function ReportsPage({ user }: ReportsPageProps) {
  const [activeTab, setActiveTab] = useState<string>('income-statement');
  const [incomeData, setIncomeData] = useState<IncomeStatementData | null>(null);
  const [balanceData, setBalanceData] = useState<BalanceSheetData | null>(null);
  const [isLoadingIncome, setIsLoadingIncome] = useState(true);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [errorIncome, setErrorIncome] = useState<string | null>(null);
  const [errorBalance, setErrorBalance] = useState<string | null>(null);
  const { tc, language } = useTranslation();

  const currentYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  // ─── Fetch Income Statement ────────────────────────────────────
  const fetchIncomeStatement = useCallback(async () => {
    setIsLoadingIncome(true);
    setErrorIncome(null);
    try {
      const params = new URLSearchParams({
        type: 'income-statement',
        from: fromDate,
        to: toDate,
      });
      const response = await fetch(`/api/reports?${params}`);
      if (!response.ok) throw new Error('Failed to fetch income statement');
      const result = await response.json();
      setIncomeData(result);
    } catch (err) {
      console.error('Failed to fetch income statement:', err);
      setErrorIncome(
        language === 'da'
          ? 'Kunne ikke hente resultatopgørelse'
          : 'Failed to fetch income statement'
      );
    } finally {
      setIsLoadingIncome(false);
    }
  }, [fromDate, toDate, language]);

  // ─── Fetch Balance Sheet ───────────────────────────────────────
  const fetchBalanceSheet = useCallback(async () => {
    setIsLoadingBalance(true);
    setErrorBalance(null);
    try {
      const params = new URLSearchParams({
        type: 'balance-sheet',
        to: toDate,
      });
      const response = await fetch(`/api/reports?${params}`);
      if (!response.ok) throw new Error('Failed to fetch balance sheet');
      const result = await response.json();
      setBalanceData(result);
    } catch (err) {
      console.error('Failed to fetch balance sheet:', err);
      setErrorBalance(
        language === 'da'
          ? 'Kunne ikke hente balance'
          : 'Failed to fetch balance sheet'
      );
    } finally {
      setIsLoadingBalance(false);
    }
  }, [toDate, language]);

  useEffect(() => {
    fetchIncomeStatement();
  }, [fetchIncomeStatement]);

  useEffect(() => {
    fetchBalanceSheet();
  }, [fetchBalanceSheet]);

  // ─── Export CSV — Income Statement ─────────────────────────────
  const handleExportIncomeCSV = useCallback(() => {
    if (!incomeData) return;

    const headers =
      language === 'da'
        ? ['Post', 'Beloeb (DKK)']
        : ['Item', 'Amount (DKK)'];

    const rows: string[][] = [
      [language === 'da' ? 'RESULTATOPGORELSE' : 'INCOME STATEMENT', ''],
      [language === 'da' ? `Periode: ${fromDate} - ${toDate}` : `Period: ${fromDate} - ${toDate}`, ''],
      [],
      [language === 'da' ? 'Nettoomsaetning' : 'Net Revenue', incomeData.grossProfit.revenue.toFixed(2)],
      [(language === 'da' ? 'Vareforbrug' : 'Cost of Goods'), `(${incomeData.grossProfit.costOfGoods.toFixed(2)})`],
      [language === 'da' ? 'Bruttofortjeneste' : 'Gross Profit', incomeData.grossProfit.grossProfit.toFixed(2)],
      [],
      [language === 'da' ? 'Driftsomkostninger:' : 'Operating Expenses:', ''],
      [language === 'da' ? '  Personaleomkostninger' : '  Personnel', `(${incomeData.operatingExpenses.personnel.toFixed(2)})`],
      [language === 'da' ? '  Andre driftsomkostninger' : '  Other Operating', `(${incomeData.operatingExpenses.otherOperating.toFixed(2)})`],
      [language === 'da' ? '  Total driftsomkostninger' : '  Total Operating', `(${incomeData.operatingExpenses.total.toFixed(2)})`],
      [],
      [language === 'da' ? 'Driftsresultat' : 'Operating Result', incomeData.operatingResult.toFixed(2)],
      [],
      [language === 'da' ? 'Finansielle poster:' : 'Financial Items:', ''],
      [language === 'da' ? '  Finansielle indtaegter' : '  Financial Income', incomeData.financialItems.financialIncome.toFixed(2)],
      [language === 'da' ? '  Finansielle omkostninger' : '  Financial Expenses', `(${incomeData.financialItems.financialExpenses.toFixed(2)})`],
      [language === 'da' ? '  Netto finansielle poster' : '  Net Financial', incomeData.financialItems.net.toFixed(2)],
      [],
      [language === 'da' ? 'Aarets resultat' : 'Net Result', incomeData.netResult.toFixed(2)],
    ];

    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      language === 'da'
        ? `resultatopgoerelse-${fromDate}-${toDate}.csv`
        : `income-statement-${fromDate}-${toDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [incomeData, fromDate, toDate, language]);

  // ─── Export CSV — Balance Sheet ────────────────────────────────
  const handleExportBalanceCSV = useCallback(() => {
    if (!balanceData) return;

    const headers =
      language === 'da'
        ? ['Post', 'Beloeb (DKK)']
        : ['Item', 'Amount (DKK)'];

    const rows: string[][] = [
      [language === 'da' ? 'BALANCE' : 'BALANCE SHEET', ''],
      [language === 'da' ? `Praesentation: ${balanceData.asOf}` : `As of: ${balanceData.asOf}`, ''],
      [],
      [language === 'da' ? 'AKTIVER' : 'ASSETS', ''],
      [language === 'da' ? '  Omsaetningsaktiver' : '  Current Assets', ''],
      [language === 'da' ? '    Likvide beholdninger' : '    Cash', balanceData.assets.currentAssets.cash.toFixed(2)],
      [language === 'da' ? '    Bank' : '    Bank', balanceData.assets.currentAssets.bank.toFixed(2)],
      [language === 'da' ? '    Tilgodehavender' : '    Receivables', balanceData.assets.currentAssets.receivables.toFixed(2)],
      [language === 'da' ? '    Varelager' : '    Inventory', balanceData.assets.currentAssets.inventory.toFixed(2)],
      [language === 'da' ? '    Andre omsaetningsaktiver' : '    Other Current', balanceData.assets.currentAssets.otherCurrentAssets.toFixed(2)],
      [language === 'da' ? '  Total omsaetningsaktiver' : '  Total Current Assets', balanceData.assets.currentAssets.total.toFixed(2)],
      [language === 'da' ? '  Anlaegsaktiver' : '  Fixed Assets', balanceData.assets.fixedAssets.total.toFixed(2)],
      [language === 'da' ? 'TOTAL AKTIVER' : 'TOTAL ASSETS', balanceData.assets.totalAssets.toFixed(2)],
      [],
      [language === 'da' ? 'PASSIVER' : 'LIABILITIES', ''],
      [language === 'da' ? '  Kortfristet gaeld' : '  Short-term', ''],
      [language === 'da' ? '    Leverandoergaeld' : '    Payables', balanceData.liabilities.shortTerm.payables.toFixed(2)],
      [language === 'da' ? '    Kortfristet gaeld i alt' : '    Short-term Debt', balanceData.liabilities.shortTerm.shortTermDebt.toFixed(2)],
      [language === 'da' ? '    Andre kortfriste forpligtelser' : '    Other Liabilities', balanceData.liabilities.shortTerm.otherLiabilities.toFixed(2)],
      [language === 'da' ? '  Total kortfristet gaeld' : '  Total Short-term', balanceData.liabilities.shortTerm.total.toFixed(2)],
      [language === 'da' ? '  Langfristet gaeld' : '  Long-term', ''],
      [language === 'da' ? '    Banklaan' : '    Bank Loan', balanceData.liabilities.longTerm.bankLoan.toFixed(2)],
      [language === 'da' ? '  Total langfristet gaeld' : '  Total Long-term', balanceData.liabilities.longTerm.total.toFixed(2)],
      [language === 'da' ? 'TOTAL PASSIVER' : 'TOTAL LIABILITIES', balanceData.liabilities.totalLiabilities.toFixed(2)],
      [],
      [language === 'da' ? 'EGENKAPITAL' : 'EQUITY', ''],
      [language === 'da' ? '  Aktiekapital' : '  Share Capital', balanceData.equity.shareCapital.toFixed(2)],
      [language === 'da' ? '  Reserver' : '  Retained Earnings', balanceData.equity.retainedEarnings.toFixed(2)],
      [language === 'da' ? '  Overfoert resultat' : '  Current Year Result', balanceData.equity.currentYearResult.toFixed(2)],
      [language === 'da' ? 'TOTAL EGENKAPITAL' : 'TOTAL EQUITY', balanceData.equity.totalEquity.toFixed(2)],
      [],
      [language === 'da' ? 'TOTAL PASSIVER + EGENKAPITAL' : 'TOTAL LIABILITIES + EQUITY', balanceData.totalLiabilitiesAndEquity.toFixed(2)],
      [],
      [
        balanceData.balanced
          ? (language === 'da' ? 'I BALANCE' : 'BALANCED')
          : (language === 'da' ? 'IKKE I BALANCE' : 'NOT BALANCED'),
        balanceData.balanced
          ? ''
          : Math.abs(balanceData.assets.totalAssets - balanceData.totalLiabilitiesAndEquity).toFixed(2),
      ],
    ];

    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      language === 'da'
        ? `balance-${balanceData.asOf}.csv`
        : `balance-sheet-${balanceData.asOf}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [balanceData, language]);

  // ─── Handle refresh ────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    fetchIncomeStatement();
    fetchBalanceSheet();
  }, [fetchIncomeStatement, fetchBalanceSheet]);

  // ─── Check if there is any real financial data ──────────────
  const hasFinancialData = useMemo(() => {
    if (!incomeData && !balanceData) return false;
    // Income statement: check if any revenue, expenses, or financial items exist
    if (incomeData) {
      const { revenue, costOfGoods, grossProfit } = incomeData.grossProfit;
      const { personnel, otherOperating } = incomeData.operatingExpenses;
      const { financialIncome, financialExpenses } = incomeData.financialItems;
      if (revenue !== 0 || costOfGoods !== 0 || grossProfit !== 0 ||
          personnel !== 0 || otherOperating !== 0 ||
          financialIncome !== 0 || financialExpenses !== 0) return true;
    }
    // Balance sheet: check if any assets, liabilities, or equity exist
    if (balanceData) {
      if (balanceData.assets.totalAssets !== 0) return true;
      if (balanceData.liabilities.totalLiabilities !== 0) return true;
      if (balanceData.equity.totalEquity !== 0) return true;
    }
    return false;
  }, [incomeData, balanceData]);

  // ─── Loading skeleton ──────────────────────────────────────────
  if (isLoadingIncome && isLoadingBalance) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>

        {/* Date filter skeleton */}
        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
              <Skeleton className="h-10 w-36" />
            </div>
          </CardContent>
        </Card>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-20" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-4">
            <div className="hidden sm:flex gap-2 mb-6">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-40" />
            </div>
            <div className="sm:hidden mb-6">
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────
  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={language === 'da' ? 'Finansielle Rapporter' : 'Financial Reports'}
        description={language === 'da'
          ? 'Resultatopgørelse og balance for din virksomhed'
          : 'Income statement and balance sheet for your business'}
        action={
          <Button
            onClick={handleRefresh}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
          >
            {isLoadingIncome || isLoadingBalance ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpDown className="h-4 w-4" />
            )}
            {language === 'da' ? 'Opdater' : 'Refresh'}
          </Button>
        }
      />

      {/* Date Range Filter — only when there is financial data */}
      {hasFinancialData && (
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {language === 'da' ? 'Fra dato' : 'From date'}
                </Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-gray-50 dark:bg-white/[0.04] border-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {language === 'da' ? 'Til dato' : 'To date'}
                </Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-gray-50 dark:bg-white/[0.04] border-0"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Button
                  onClick={handleRefresh}
                  className="w-full gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
                >
                  {isLoadingIncome || isLoadingBalance ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpDown className="h-4 w-4" />
                  )}
                  {language === 'da' ? 'Hent data' : 'Fetch data'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Summary Stats Cards — only when there is financial data */}
      {hasFinancialData && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Net Revenue */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Nettoomsætning' : 'Net Revenue'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {incomeData ? tc(incomeData.grossProfit.revenue) : '—'}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {language === 'da' ? 'Driftsindtægter' : 'Operating income'}
            </div>
          </CardContent>
        </Card>

        {/* Operating Result */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Driftsresultat' : 'Operating Result'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                  incomeData ? valueColor(incomeData.operatingResult) : 'text-gray-900 dark:text-white'
                }`}>
                  {incomeData ? tc(incomeData.operatingResult) : '—'}
                </p>
              </div>
              <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                incomeData && incomeData.operatingResult >= 0 ? 'stat-icon-green' : 'stat-icon-red'
              }`}>
                <BarChart3 className={`h-4 w-4 sm:h-6 sm:w-6 ${
                  incomeData && incomeData.operatingResult >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`} />
              </div>
            </div>
            <div className={`mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm ${
              incomeData && incomeData.operatingResult >= 0
                ? 'text-green-600 dark:text-green-400'
                : incomeData && incomeData.operatingResult < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
            }`}>
              {incomeData && incomeData.operatingResult >= 0 ? (
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              ) : incomeData && incomeData.operatingResult < 0 ? (
                <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              ) : null}
              {incomeData && incomeData.operatingResult >= 0
                ? (language === 'da' ? 'Positivt resultat' : 'Positive result')
                : incomeData && incomeData.operatingResult < 0
                  ? (language === 'da' ? 'Negativt resultat' : 'Negative result')
                  : '—'}
            </div>
          </CardContent>
        </Card>

        {/* Net Result */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Årets resultat' : 'Net Result'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                  incomeData ? valueColor(incomeData.netResult) : 'text-gray-900 dark:text-white'
                }`}>
                  {incomeData ? tc(incomeData.netResult) : '—'}
                </p>
              </div>
              <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                incomeData && incomeData.netResult >= 0 ? 'stat-icon-blue' : 'stat-icon-red'
              }`}>
                <Scale className={`h-4 w-4 sm:h-6 sm:w-6 ${
                  incomeData && incomeData.netResult >= 0
                    ? 'text-[#7dabb5] dark:text-[#80c0cc]'
                    : 'text-red-600 dark:text-red-400'
                }`} />
              </div>
            </div>
            <div className={`mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm ${
              incomeData && incomeData.netResult >= 0
                ? 'text-green-600 dark:text-green-400'
                : incomeData && incomeData.netResult < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
            }`}>
              <PieChart className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {language === 'da' ? 'Efter finansielle poster' : 'After financial items'}
            </div>
          </CardContent>
        </Card>

        {/* Equity */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Egenkapital' : 'Equity'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                  balanceData && balanceData.equity.totalEquity >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : balanceData
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-900 dark:text-white'
                }`}>
                  {balanceData ? tc(balanceData.equity.totalEquity) : '—'}
                </p>
              </div>
              <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                balanceData && balanceData.equity.totalEquity >= 0 ? 'stat-icon-amber' : 'stat-icon-red'
              }`}>
                <BookOpen className={`h-4 w-4 sm:h-6 sm:w-6 ${
                  balanceData && balanceData.equity.totalEquity >= 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
                }`} />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {language === 'da' ? 'Egenkapital pr. balance' : 'Equity per balance sheet'}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Tabs: Income Statement & Balance Sheet — only when there is data */}
      {hasFinancialData && (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Mobile: Select dropdown */}
        <div className="sm:hidden space-y-3">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income-statement">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {language === 'da' ? 'Resultatopgørelse' : 'Income Statement'}
                </span>
              </SelectItem>
              <SelectItem value="balance-sheet">
                <span className="flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  {language === 'da' ? 'Balance' : 'Balance Sheet'}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          {activeTab === 'income-statement' && incomeData && (
            <Button onClick={handleExportIncomeCSV} className="w-full gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all">
              <Download className="h-4 w-4" />
              {language === 'da' ? 'Eksporter CSV' : 'Export CSV'}
            </Button>
          )}
          {activeTab === 'balance-sheet' && balanceData && (
            <Button onClick={handleExportBalanceCSV} className="w-full gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all">
              <Download className="h-4 w-4" />
              {language === 'da' ? 'Eksporter CSV' : 'Export CSV'}
            </Button>
          )}
        </div>
        {/* Desktop: Horizontal tabs */}
        <div className="hidden sm:flex items-center justify-between flex-wrap gap-2">
          <TabsList className="bg-gray-100 dark:bg-gray-800 h-10">
            <TabsTrigger value="income-statement" className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm">
              <FileText className="h-4 w-4" />
              {language === 'da' ? 'Resultatopgørelse' : 'Income Statement'}
            </TabsTrigger>
            <TabsTrigger value="balance-sheet" className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm">
              <Scale className="h-4 w-4" />
              {language === 'da' ? 'Balance' : 'Balance Sheet'}
            </TabsTrigger>
          </TabsList>
          {activeTab === 'income-statement' && incomeData && (
            <Button onClick={handleExportIncomeCSV} className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all">
              <Download className="h-4 w-4" />
              {language === 'da' ? 'Eksporter CSV' : 'Export CSV'}
            </Button>
          )}
          {activeTab === 'balance-sheet' && balanceData && (
            <Button onClick={handleExportBalanceCSV} className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all">
              <Download className="h-4 w-4" />
              {language === 'da' ? 'Eksporter CSV' : 'Export CSV'}
            </Button>
          )}
        </div>

        {/* ─── Tab 1: Income Statement ─────────────────────────── */}
        <TabsContent value="income-statement" className="mt-0">
          {!incomeData && !isLoadingIncome && !errorIncome ? (
            <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
              <CardContent className="p-0">
                <div className="text-center py-20 px-4">
                  <div className="relative mx-auto w-40 h-32 mb-6">
                    <div className="absolute bottom-0 left-2 w-28 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transform -rotate-3" />
                    <div className="absolute bottom-1 left-4 w-28 h-20 rounded-lg bg-gray-150 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 transform rotate-1" />
                    <div className="absolute bottom-2 left-6 w-28 h-20 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                      <div className="p-2.5">
                        <div className="w-12 h-1.5 rounded bg-[#0d9488]/30 mb-2" />
                        <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                        <div className="w-14 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                        <div className="w-full h-px bg-gray-100 dark:bg-gray-700 my-1.5" />
                        <div className="flex justify-end">
                          <div className="w-8 h-1.5 rounded bg-[#0d9488]/40" />
                        </div>
                      </div>
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shadow-lg">
                      <FileText className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1.5">
                    {language === 'da' ? 'Ingen resultatopgørelse endnu' : 'No income statement yet'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    {language === 'da'
                      ? 'Bogfør indtægter og udgifter i finansjournalen for at generere en resultatopgørelse.'
                      : 'Post revenues and expenses in the journal to generate an income statement.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : errorIncome ? (
            <Card className="border-red-200 dark:border-red-800/50">
              <CardContent className="p-4 sm:p-6 text-center">
                <TrendingDown className="h-12 w-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
                <p className="text-gray-700 dark:text-gray-300 mb-4">{errorIncome}</p>
                <Button onClick={fetchIncomeStatement} variant="outline" className="gap-2">
                  <Loader2 className="h-4 w-4" />
                  {language === 'da' ? 'Prøv igen' : 'Try again'}
                </Button>
              </CardContent>
            </Card>
          ) : isLoadingIncome ? (
            <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-56" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : incomeData ? (
            <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <FileText className="h-5 w-5 text-[#0d9488]" />
                    {language === 'da' ? 'Resultatopgørelse' : 'Income Statement'}
                    <Badge variant="outline" className="text-xs font-normal">
                      {incomeData.period.from} — {incomeData.period.to}
                    </Badge>
                  </CardTitle>
                  <Badge className={`gap-1 shrink-0 ${incomeData.netResult >= 0
                    ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20'
                    : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20'
                  }`}>
                    {incomeData.netResult >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {language === 'da' ? 'Årets resultat' : 'Net Result'}: {tc(incomeData.netResult)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[600px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                        <TableHead>
                          {language === 'da' ? 'Post' : 'Item'}
                        </TableHead>
                        <TableHead className="text-right w-[160px] sm:w-[200px]">
                          {language === 'da' ? 'Beloeb (DKK)' : 'Amount (DKK)'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* ── Gross Profit Section ── */}
                      <TableRow className="bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                        <TableCell
                          colSpan={2}
                          className="font-semibold text-gray-900 dark:text-white"
                        >
                          <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {language === 'da' ? 'Nettoomsætning (Net Revenue)' : 'Net Revenue'}
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-8">
                          {language === 'da' ? 'Salgsindtægter' : 'Sales Revenue'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                          {tc(incomeData.grossProfit.revenue)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-emerald-50/50 dark:bg-emerald-500/5 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5">
                        <TableCell
                          colSpan={2}
                          className="font-semibold text-gray-900 dark:text-white"
                        >
                          <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {language === 'da' ? 'Vareforbrug (Cost of Goods)' : 'Cost of Goods'}
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-8">
                          {language === 'da' ? 'Vareforbrug i alt' : 'Total Cost of Goods'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                          ({tc(incomeData.grossProfit.costOfGoods)})
                        </TableCell>
                      </TableRow>
                      {/* Gross Profit Total */}
                      <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                        <TableCell className="text-gray-900 dark:text-white">
                          {language === 'da' ? 'Bruttofortjeneste (Gross Profit)' : 'Gross Profit'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm sm:text-base ${valueColor(incomeData.grossProfit.grossProfit)}`}>
                          {tc(incomeData.grossProfit.grossProfit)}
                        </TableCell>
                      </TableRow>

                      {/* Spacer */}
                      <TableRow>
                        <TableCell colSpan={2} className="h-4" />
                      </TableRow>

                      {/* ── Operating Expenses Section ── */}
                      <TableRow className="bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                        <TableCell
                          colSpan={2}
                          className="font-semibold text-gray-900 dark:text-white"
                        >
                          <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {language === 'da' ? 'Driftsomkostninger (Operating Expenses)' : 'Operating Expenses'}
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-8">
                          {language === 'da' ? 'Personaleomkostninger' : 'Personnel'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                          ({tc(incomeData.operatingExpenses.personnel)})
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-8">
                          {language === 'da' ? 'Andre driftsomkostninger' : 'Other Operating'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                          ({tc(incomeData.operatingExpenses.otherOperating)})
                        </TableCell>
                      </TableRow>
                      {/* Operating Expenses Total */}
                      <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                        <TableCell className="text-gray-900 dark:text-white">
                          {language === 'da' ? 'Total driftsomkostninger' : 'Total Operating Expenses'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                          ({tc(incomeData.operatingExpenses.total)})
                        </TableCell>
                      </TableRow>

                      {/* Spacer */}
                      <TableRow>
                        <TableCell colSpan={2} className="h-4" />
                      </TableRow>

                      {/* ── Operating Result ── */}
                      <TableRow className="bg-[#e6f7f3] dark:bg-[#0d9488]/10 hover:bg-[#e6f7f3] dark:hover:bg-[#0d9488]/10">
                        <TableCell className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">
                          <span className="flex items-center gap-2 text-[#0d9488] dark:text-[#2dd4bf]">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {language === 'da' ? 'Driftsresultat (EBIT)' : 'Operating Result (EBIT)'}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm sm:text-base font-bold ${valueColor(incomeData.operatingResult)}`}>
                          {tc(incomeData.operatingResult)}
                        </TableCell>
                      </TableRow>

                      {/* Spacer */}
                      <TableRow>
                        <TableCell colSpan={2} className="h-4" />
                      </TableRow>

                      {/* ── Financial Items Section ── */}
                      <TableRow className="bg-[#e8f2f4] dark:bg-[#7dabb5]/10 hover:bg-[#e8f2f4] dark:hover:bg-[#7dabb5]/10">
                        <TableCell
                          colSpan={2}
                          className="font-semibold text-gray-900 dark:text-white"
                        >
                          <span className="flex items-center gap-2 text-[#7dabb5] dark:text-[#80c0cc]">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {language === 'da' ? 'Finansielle poster (Financial Items)' : 'Financial Items'}
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-8">
                          {language === 'da' ? 'Finansielle indtægter' : 'Financial Income'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                          {tc(incomeData.financialItems.financialIncome)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-8">
                          {language === 'da' ? 'Finansielle omkostninger' : 'Financial Expenses'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                          ({tc(incomeData.financialItems.financialExpenses)})
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                        <TableCell className="text-gray-900 dark:text-white">
                          {language === 'da' ? 'Netto finansielle poster' : 'Net Financial Items'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${valueColor(incomeData.financialItems.net)}`}>
                          {tc(incomeData.financialItems.net)}
                        </TableCell>
                      </TableRow>

                      {/* ── Net Result (grand total) ── */}
                      <TableRow className={`font-bold border-t-2 border-gray-300 dark:border-white/20 ${
                        incomeData.netResult >= 0
                          ? 'bg-green-50 dark:bg-green-500/10'
                          : 'bg-red-50 dark:bg-red-500/10'
                      }`}>
                        <TableCell className="text-gray-900 dark:text-white text-sm sm:text-base">
                          <span className="flex items-center gap-2">
                            <Scale className="h-5 w-5" />
                            {language === 'da' ? 'Årets resultat (Net Result)' : 'Net Result'}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm sm:text-base ${valueColor(incomeData.netResult)}`}>
                          {tc(incomeData.netResult)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ─── Tab 2: Balance Sheet ─────────────────────────────── */}
        <TabsContent value="balance-sheet" className="mt-0">
          {!balanceData && !isLoadingBalance && !errorBalance ? (
            <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
              <CardContent className="p-0">
                <div className="text-center py-20 px-4">
                  <div className="relative mx-auto w-40 h-32 mb-6">
                    <div className="absolute bottom-0 left-2 w-28 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transform -rotate-3" />
                    <div className="absolute bottom-1 left-4 w-28 h-20 rounded-lg bg-gray-150 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 transform rotate-1" />
                    <div className="absolute bottom-2 left-6 w-28 h-20 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                      <div className="p-2.5">
                        <div className="w-12 h-1.5 rounded bg-[#0d9488]/30 mb-2" />
                        <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                        <div className="w-14 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                        <div className="w-full h-px bg-gray-100 dark:bg-gray-700 my-1.5" />
                        <div className="flex justify-end">
                          <div className="w-8 h-1.5 rounded bg-[#0d9488]/40" />
                        </div>
                      </div>
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shadow-lg">
                      <Scale className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1.5">
                    {language === 'da' ? 'Ingen balance endnu' : 'No balance sheet yet'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    {language === 'da'
                      ? 'Bogfør posteringer i finansjournalen for at generere en balance.'
                      : 'Post journal entries to generate a balance sheet.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : errorBalance ? (
            <Card className="border-red-200 dark:border-red-800/50">
              <CardContent className="p-4 sm:p-6 text-center">
                <TrendingDown className="h-12 w-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
                <p className="text-gray-700 dark:text-gray-300 mb-4">{errorBalance}</p>
                <Button onClick={fetchBalanceSheet} variant="outline" className="gap-2">
                  <Loader2 className="h-4 w-4" />
                  {language === 'da' ? 'Prøv igen' : 'Try again'}
                </Button>
              </CardContent>
            </Card>
          ) : isLoadingBalance ? (
            <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : balanceData ? (
            <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Scale className="h-5 w-5 text-[#0d9488]" />
                    {language === 'da' ? 'Balance' : 'Balance Sheet'}
                    <Badge variant="outline" className="text-xs font-normal">
                      {language === 'da' ? 'Pr.' : 'As of'} {balanceData.asOf}
                    </Badge>
                  </CardTitle>
                  <Badge className={`gap-1 ${balanceData.balanced
                    ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20'
                    : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20'
                  }`}>
                    {balanceData.balanced ? (
                      <Scale className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {balanceData.balanced
                      ? (language === 'da' ? 'I balance' : 'Balanced')
                      : (language === 'da' ? 'Ikke i balance' : 'Unbalanced')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[600px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                        <TableHead>
                          {language === 'da' ? 'Post' : 'Item'}
                        </TableHead>
                        <TableHead className="text-right w-[160px] sm:w-[200px]">
                          {language === 'da' ? 'Beloeb (DKK)' : 'Amount (DKK)'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* ── AKTIVER (Assets) ── */}
                      <TableRow className="bg-[#e8f2f4] dark:bg-[#7dabb5]/10 hover:bg-[#e8f2f4] dark:hover:bg-[#7dabb5]/10">
                        <TableCell
                          colSpan={2}
                          className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base"
                        >
                          <span className="flex items-center gap-2 text-[#7dabb5] dark:text-[#80c0cc]">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            AKTIVER — {language === 'da' ? 'Aktiver' : 'Assets'}
                          </span>
                        </TableCell>
                      </TableRow>

                      {/* Current Assets */}
                      <TableRow className="bg-[#e8f2f4]/30 dark:bg-[#7dabb5]/5 hover:bg-[#e8f2f4]/30 dark:hover:bg-[#7dabb5]/5">
                        <TableCell className="font-semibold text-gray-900 dark:text-white pl-6">
                          {language === 'da' ? 'Omsætningsaktiver (Current Assets)' : 'Current Assets'}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                          {language === 'da' ? 'Kasse & kontanter' : 'Cash'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.assets.currentAssets.cash)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                          {language === 'da' ? 'Bank' : 'Bank'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.assets.currentAssets.bank)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                          {language === 'da' ? 'Tilgodehavender' : 'Receivables'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.assets.currentAssets.receivables)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                          {language === 'da' ? 'Varelager' : 'Inventory'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.assets.currentAssets.inventory)}
                        </TableCell>
                      </TableRow>
                      {balanceData.assets.currentAssets.otherCurrentAssets !== 0 && (
                        <TableRow>
                          <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                            {language === 'da' ? 'Andre omsætningsaktiver' : 'Other Current Assets'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                            {tc(balanceData.assets.currentAssets.otherCurrentAssets)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5 font-semibold">
                        <TableCell className="text-gray-900 dark:text-white pl-8">
                          {language === 'da' ? 'Total omsætningsaktiver' : 'Total Current Assets'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-900 dark:text-white">
                          {tc(balanceData.assets.currentAssets.total)}
                        </TableCell>
                      </TableRow>

                      {/* Fixed Assets */}
                      <TableRow className="bg-[#e8f2f4]/30 dark:bg-[#7dabb5]/5 hover:bg-[#e8f2f4]/30 dark:hover:bg-[#7dabb5]/5">
                        <TableCell className="font-semibold text-gray-900 dark:text-white pl-6">
                          {language === 'da' ? 'Anlægsaktiver (Fixed Assets)' : 'Fixed Assets'}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                          {language === 'da' ? 'Maskiner & IT-udstyr' : 'Machinery & IT Equipment'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.assets.fixedAssets.total)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5 font-semibold">
                        <TableCell className="text-gray-900 dark:text-white pl-8">
                          {language === 'da' ? 'Total anlægsaktiver' : 'Total Fixed Assets'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-900 dark:text-white">
                          {tc(balanceData.assets.fixedAssets.total)}
                        </TableCell>
                      </TableRow>

                      {/* Total Assets */}
                      <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                        <TableCell className="text-gray-900 dark:text-white text-sm sm:text-base">
                          {language === 'da' ? 'TOTAL AKTIVER' : 'TOTAL ASSETS'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm sm:text-base text-gray-900 dark:text-white">
                          {tc(balanceData.assets.totalAssets)}
                        </TableCell>
                      </TableRow>

                      {/* Spacer */}
                      <TableRow>
                        <TableCell colSpan={2} className="h-4" />
                      </TableRow>

                      {/* ── PASSIVER (Liabilities) ── */}
                      <TableRow className="bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                        <TableCell
                          colSpan={2}
                          className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base"
                        >
                          <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            PASSIVER — {language === 'da' ? 'Gæld' : 'Liabilities'}
                          </span>
                        </TableCell>
                      </TableRow>

                      {/* Short-term */}
                      <TableRow className="bg-amber-50/30 dark:bg-amber-500/5 hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
                        <TableCell className="font-semibold text-gray-900 dark:text-white pl-6">
                          {language === 'da' ? 'Kortfristet gæld (Short-term)' : 'Short-term Liabilities'}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                          {language === 'da' ? 'Leverandørgæld' : 'Payables'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.liabilities.shortTerm.payables)}
                        </TableCell>
                      </TableRow>
                      {balanceData.liabilities.shortTerm.shortTermDebt !== 0 && (
                        <TableRow>
                          <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                            {language === 'da' ? 'Kortfristet gæld' : 'Short-term Debt'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                            {tc(balanceData.liabilities.shortTerm.shortTermDebt)}
                          </TableCell>
                        </TableRow>
                      )}
                      {balanceData.liabilities.shortTerm.otherLiabilities !== 0 && (
                        <TableRow>
                          <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                            {language === 'da' ? 'Andre kortfriste forpligtelser' : 'Other Liabilities'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                            {tc(balanceData.liabilities.shortTerm.otherLiabilities)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5 font-semibold">
                        <TableCell className="text-gray-900 dark:text-white pl-8">
                          {language === 'da' ? 'Total kortfristet gæld' : 'Total Short-term'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-900 dark:text-white">
                          {tc(balanceData.liabilities.shortTerm.total)}
                        </TableCell>
                      </TableRow>

                      {/* Long-term */}
                      <TableRow className="bg-amber-50/30 dark:bg-amber-500/5 hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
                        <TableCell className="font-semibold text-gray-900 dark:text-white pl-6">
                          {language === 'da' ? 'Langfristet gæld (Long-term)' : 'Long-term Liabilities'}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-10">
                          {language === 'da' ? 'Banklån' : 'Bank Loan'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.liabilities.longTerm.bankLoan)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5 font-semibold">
                        <TableCell className="text-gray-900 dark:text-white pl-8">
                          {language === 'da' ? 'Total langfristet gæld' : 'Total Long-term'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-900 dark:text-white">
                          {tc(balanceData.liabilities.longTerm.total)}
                        </TableCell>
                      </TableRow>

                      {/* Total Liabilities */}
                      <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                        <TableCell className="text-gray-900 dark:text-white text-sm sm:text-base">
                          {language === 'da' ? 'TOTAL PASSIVER' : 'TOTAL LIABILITIES'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm sm:text-base text-gray-900 dark:text-white">
                          {tc(balanceData.liabilities.totalLiabilities)}
                        </TableCell>
                      </TableRow>

                      {/* Spacer */}
                      <TableRow>
                        <TableCell colSpan={2} className="h-4" />
                      </TableRow>

                      {/* ── EGENKAPITAL (Equity) ── */}
                      <TableRow className="bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                        <TableCell
                          colSpan={2}
                          className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base"
                        >
                          <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-current" />
                            EGENKAPITAL — {language === 'da' ? 'Egenkapital' : 'Equity'}
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-6">
                          {language === 'da' ? 'Aktiekapital + Overkurs' : 'Share Capital + Premium'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.equity.shareCapital)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-6">
                          {language === 'da' ? 'Reserver' : 'Retained Earnings (Reserves)'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {tc(balanceData.equity.retainedEarnings)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-gray-700 dark:text-gray-300 pl-6">
                          {language === 'da' ? 'Overført resultat' : 'Current Year Result'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${valueColor(balanceData.equity.currentYearResult)}`}>
                          {tc(balanceData.equity.currentYearResult)}
                        </TableCell>
                      </TableRow>
                      {/* Total Equity */}
                      <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                        <TableCell className="text-gray-900 dark:text-white text-sm sm:text-base">
                          {language === 'da' ? 'TOTAL EGENKAPITAL' : 'TOTAL EQUITY'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm sm:text-base text-gray-900 dark:text-white">
                          {tc(balanceData.equity.totalEquity)}
                        </TableCell>
                      </TableRow>

                      {/* ── Total Liabilities + Equity ── */}
                      <TableRow className="bg-[#e6f7f3] dark:bg-[#0d9488]/10 hover:bg-[#e6f7f3] dark:hover:bg-[#0d9488]/10 font-bold">
                        <TableCell className="text-gray-900 dark:text-white text-sm sm:text-base">
                          <span className="flex items-center gap-2 text-[#0d9488] dark:text-[#2dd4bf]">
                            {language === 'da' ? 'TOTAL PASSIVER + EGENKAPITAL' : 'TOTAL LIABILITIES + EQUITY'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm sm:text-base text-gray-900 dark:text-white">
                          {tc(balanceData.totalLiabilitiesAndEquity)}
                        </TableCell>
                      </TableRow>

                      {/* ── Balance Check ── */}
                      <TableRow className={balanceData.balanced
                        ? 'bg-green-50 dark:bg-green-500/10'
                        : 'bg-red-50 dark:bg-red-500/10'
                      }>
                        <TableCell colSpan={2} className="text-center py-3">
                          {balanceData.balanced ? (
                            <span className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold text-sm">
                              <Scale className="h-5 w-5" />
                              {language === 'da'
                                ? 'I balance — aktiver = passiver + egenkapital'
                                : 'Balanced — assets = liabilities + equity'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-sm">
                              <TrendingDown className="h-5 w-5" />
                              {language === 'da'
                                ? `Ikke i balance — forskel: ${tc(Math.abs(balanceData.assets.totalAssets - balanceData.totalLiabilitiesAndEquity))}`
                                : `Unbalanced — difference: ${tc(Math.abs(balanceData.assets.totalAssets - balanceData.totalLiabilitiesAndEquity))}`}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
      )}

      {/* Info box — only when there is financial data */}
      {hasFinancialData && (
      <Card className="info-box-primary">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p>
                {language === 'da'
                  ? 'Resultatopgørelsen viser virksomhedens indtægter og udgifter i en given periode. Balancen viser virksomhedens aktiver, passiver og egenkapital på et givet tidspunkt. Balancen er i balance, når total aktiver er lig med total passiver + egenkapital.'
                  : 'The income statement shows the company\'s revenues and expenses over a given period. The balance sheet shows assets, liabilities, and equity at a specific point in time. The balance sheet is balanced when total assets equal total liabilities + equity.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Empty state cover — shown when no financial data at all */}
      {!hasFinancialData && !isLoadingIncome && !isLoadingBalance && (
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-0">
          <div className="text-center py-20 px-4">
            <div className="relative mx-auto w-40 h-32 mb-6">
              <div className="absolute bottom-0 left-2 w-28 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transform -rotate-3" />
              <div className="absolute bottom-1 left-4 w-28 h-20 rounded-lg bg-gray-150 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 transform rotate-1" />
              <div className="absolute bottom-2 left-6 w-28 h-20 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="p-2.5">
                  <div className="w-12 h-1.5 rounded bg-[#0d9488]/30 mb-2" />
                  <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                  <div className="w-14 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                  <div className="w-full h-px bg-gray-100 dark:bg-gray-700 my-1.5" />
                  <div className="flex justify-end">
                    <div className="w-8 h-1.5 rounded bg-[#0d9488]/40" />
                  </div>
                </div>
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shadow-lg">
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1.5">
              {language === 'da' ? 'Ingen finansielle rapporter endnu' : 'No financial reports yet'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              {language === 'da'
                ? 'Bogfør posteringer i finansjournalen for at generere resultatopgørelse og balance.'
                : 'Post journal entries to generate income statement and balance sheet.'}
            </p>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
