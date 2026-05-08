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
import { PageHeader } from '@/components/shared/page-header';
import {
  BookOpen,
  Download,
  TrendingUp,
  TrendingDown,
  Scale,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  ArrowUpDown,
  CalendarDays,
} from 'lucide-react';

interface LedgerAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

interface LedgerData {
  accounts: LedgerAccount[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

interface LedgerPageProps {
  user: User;
}

const ACCOUNT_TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

function getAccountTypeLabel(type: string, language: 'da' | 'en'): string {
  const labels: Record<string, { da: string; en: string }> = {
    ASSET: { da: 'Aktiver', en: 'Assets' },
    LIABILITY: { da: 'Passiver', en: 'Liabilities' },
    EQUITY: { da: 'Egenkapital', en: 'Equity' },
    REVENUE: { da: 'Indtægter', en: 'Revenue' },
    EXPENSE: { da: 'Udgifter', en: 'Expenses' },
  };
  return labels[type]?.[language] || type;
}

function getAccountTypeBadgeClass(type: string): string {
  switch (type) {
    case 'ASSET':
      return 'bg-[#7dabb5]/10 text-[#7dabb5] dark:bg-[#7dabb5]/20 dark:text-[#80c0cc] border-[#7dabb5]/20';
    case 'LIABILITY':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20';
    case 'EQUITY':
      return 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20';
    case 'REVENUE':
      return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20';
    case 'EXPENSE':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20';
    default:
      return '';
  }
}

function getAccountTypeHeaderBg(type: string): string {
  switch (type) {
    case 'ASSET':
      return 'bg-[#e8f2f4] dark:bg-[#7dabb5]/10';
    case 'LIABILITY':
      return 'bg-amber-50 dark:bg-amber-500/10';
    case 'EQUITY':
      return 'bg-[#e6f7f3] dark:bg-[#0d9488]/10';
    case 'REVENUE':
      return 'bg-emerald-50 dark:bg-emerald-500/10';
    case 'EXPENSE':
      return 'bg-red-50 dark:bg-red-500/10';
    default:
      return 'bg-gray-50 dark:bg-white/5';
  }
}

function getAccountTypeIconColor(type: string): string {
  switch (type) {
    case 'ASSET':
      return 'text-[#7dabb5] dark:text-[#80c0cc]';
    case 'LIABILITY':
      return 'text-amber-600 dark:text-amber-400';
    case 'EQUITY':
      return 'text-[#0d9488] dark:text-[#2dd4bf]';
    case 'REVENUE':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'EXPENSE':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-500 dark:text-gray-400';
  }
}

export function LedgerPage({ user }: LedgerPageProps) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t, tc, language } = useTranslation();

  const currentYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState(`${currentYear}-12-31`);

  const fetchLedger = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const response = await fetch(`/api/ledger?${params}`);
      if (!response.ok) throw new Error('Failed to fetch ledger data');
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
      setError(language === 'da' ? 'Kunne ikke hente hovedbogsdata' : 'Failed to fetch ledger data');
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate, language]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Group accounts by type
  const groupedAccounts = useMemo(() => {
    if (!data) return [];

    const groups: Record<string, LedgerAccount[]> = {};
    for (const type of ACCOUNT_TYPE_ORDER) {
      const accounts = data.accounts
        .filter((a) => a.accountType === type)
        .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
      if (accounts.length > 0) {
        groups[type] = accounts;
      }
    }

    return ACCOUNT_TYPE_ORDER
      .filter((type) => groups[type])
      .map((type) => ({
        type,
        label: getAccountTypeLabel(type, language),
        accounts: groups[type],
        debitTotal: groups[type].reduce((sum, a) => sum + a.debitTotal, 0),
        creditTotal: groups[type].reduce((sum, a) => sum + a.creditTotal, 0),
      }));
  }, [data, language]);

  // Check if there's any actual activity
  const hasActivity = useMemo(() => {
    if (!data) return false;
    return data.accounts.some((a) => a.debitTotal > 0 || a.creditTotal > 0);
  }, [data]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    if (!data) return;

    const headers = language === 'da'
      ? ['Kontonr', 'Kontonavn', 'Kontotype', 'Debet', 'Kredit', 'Saldo']
      : ['Account No', 'Account Name', 'Account Type', 'Debit', 'Credit', 'Balance'];

    const rows: string[][] = [];

    for (const group of groupedAccounts) {
      rows.push([]); // blank row before group
      rows.push([`--- ${group.label} ---`, '', '', '', '', '']);
      for (const account of group.accounts) {
        rows.push([
          account.accountNumber,
          `"${account.accountName.replace(/"/g, '""')}"`,
          getAccountTypeLabel(account.accountType, language),
          account.debitTotal.toFixed(2),
          account.creditTotal.toFixed(2),
          account.balance.toFixed(2),
        ]);
      }
      rows.push([
        '',
        language === 'da' ? `Subtotal ${group.label}` : `${group.label} Subtotal`,
        '',
        group.debitTotal.toFixed(2),
        group.creditTotal.toFixed(2),
        '',
      ]);
    }

    // Grand total
    rows.push([]);
    rows.push(['', language === 'da' ? 'TOTAL' : 'GRAND TOTAL', '', data.totalDebit.toFixed(2), data.totalCredit.toFixed(2), '']);
    rows.push([
      '',
      data.balanced
        ? (language === 'da' ? 'I balance' : 'Balanced')
        : (language === 'da' ? 'IKKE i balance' : 'NOT balanced'),
      '',
      '',
      '',
      Math.abs(data.totalDebit - data.totalCredit).toFixed(2),
    ]);

    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = language === 'da'
      ? `hovedbog-${fromDate}-${toDate}.csv`
      : `general-ledger-${fromDate}-${toDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [data, groupedAccounts, fromDate, toDate, language]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
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

        {/* Table skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
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

  // Error state
  if (error) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <PageHeader
          title={language === 'da' ? 'Hovedbog' : 'General Ledger'}
          description={language === 'da' ? 'Råbalance for finansielle poster' : 'Trial balance for financial entries'}
        />
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 sm:p-6 text-center">
            <XCircle className="h-12 w-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
            <Button onClick={fetchLedger} variant="outline" className="gap-2">
              <Loader2 className="h-4 w-4" />
              {language === 'da' ? 'Prøv igen' : 'Try again'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={language === 'da' ? 'Hovedbog' : 'General Ledger'}
        description={language === 'da'
          ? 'Råbalance (trial balance) for finansielle poster'
          : 'Trial balance for financial entries'}
        action={
          <Button onClick={handleExportCSV} className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm">
            <Download className="h-4 w-4" />
            {language === 'da' ? 'Eksporter CSV' : 'Export CSV'}
          </Button>
        }
      />

      {/* Date Range Filter */}
      {data && (data.totalDebit > 0 || data.totalCredit > 0) && (
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
                  className="bg-gray-50 dark:bg-white/5 border-0"
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
                  className="bg-gray-50 dark:bg-white/5 border-0"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Button
                  onClick={fetchLedger}
                  className="w-full gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpDown className="h-4 w-4" />
                  )}
                  {language === 'da' ? 'Opdater' : 'Refresh'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Summary Cards */}
      {data && (data.totalDebit > 0 || data.totalCredit > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Debit */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Total Debet' : 'Total Debit'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {tc(data.totalDebit)}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
              </div>
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                <ArrowUpDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {data.accounts.length} {language === 'da' ? 'konti' : 'accounts'}
              </div>
            </CardContent>
          </Card>

          {/* Total Credit */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Total Kredit' : 'Total Credit'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {tc(data.totalCredit)}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                <ArrowUpDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {groupedAccounts.length} {language === 'da' ? 'grupper' : 'groups'}
              </div>
            </CardContent>
          </Card>

          {/* Balance Difference */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Difference' : 'Difference'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {tc(Math.abs(data.totalDebit - data.totalCredit))}
                  </p>
                </div>
                <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                  data.balanced ? 'stat-icon-green' : 'stat-icon-red'
                }`}>
                  <Scale className={`h-4 w-4 sm:h-6 sm:w-6 ${
                    data.balanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`} />
                </div>
              </div>
              <div className={`mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm ${
                data.balanced
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                <Scale className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {data.balanced
                  ? (language === 'da' ? 'Balanceret' : 'Balanced')
                  : (language === 'da' ? 'Ubalance' : 'Unbalanced')}
              </div>
            </CardContent>
          </Card>

          {/* Balanced Indicator */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Status' : 'Status'}
                  </p>
                  <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                    data.balanced
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {data.balanced
                      ? (language === 'da' ? 'I balance' : 'Balanced')
                      : (language === 'da' ? 'Ikke i balance' : 'Unbalanced')}
                  </p>
                </div>
                <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                  data.balanced ? 'stat-icon-green' : 'stat-icon-red'
                }`}>
                  {data.balanced ? (
                    <CheckCircle2 className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
                  )}
                </div>
              </div>
              {data.balanced ? (
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Bogføringen er korrekt' : 'Entries are correct'}
                </div>
              ) : (
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-red-600 dark:text-red-400">
                  <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da'
                    ? `Forskel: ${tc(Math.abs(data.totalDebit - data.totalCredit))}`
                    : `Diff: ${tc(Math.abs(data.totalDebit - data.totalCredit))}`}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State — No accounts */}
      {data && data.accounts.length === 0 && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-12 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
              <BookOpen className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {language === 'da' ? 'Ingen konti fundet' : 'No accounts found'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {language === 'da'
                ? 'Der er ikke oprettet nogen konti i kontoplanen endnu. Opret en standard kontoplan for at komme i gang.'
                : 'No accounts have been created in the chart of accounts yet. Create a standard chart of accounts to get started.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty State — No activity in range */}
      {data && data.accounts.length > 0 && !hasActivity && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-12 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
              <CalendarDays className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {language === 'da' ? 'Ingen poster i perioden' : 'No entries in period'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {language === 'da'
                ? `Der er ikke bogført nogen poster mellem ${fromDate} og ${toDate}. Alle ${data.accounts.length} konti viser nul.`
                : `No entries have been posted between ${fromDate} and ${toDate}. All ${data.accounts.length} accounts show zero.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trial Balance Table */}
      {data && data.accounts.length > 0 && hasActivity && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#0d9488]" />
                {language === 'da' ? 'Råbalance' : 'Trial Balance'}
                <Badge variant="outline" className="text-xs font-normal">
                  {data.accounts.filter((a) => a.debitTotal > 0 || a.creditTotal > 0).length}{' '}
                  {language === 'da' ? 'aktive konti' : 'active accounts'}
                </Badge>
              </CardTitle>
              {/* Balancing indicator in card header */}
              <div className="flex items-center gap-2">
                {data.balanced ? (
                  <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {language === 'da' ? 'I balance' : 'Balanced'}
                    </span>
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20 gap-1">
                    <XCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {language === 'da' ? 'Ikke i balance' : 'Unbalanced'}
                    </span>
                    <span className="hidden md:inline">
                      ({tc(Math.abs(data.totalDebit - data.totalCredit))})
                    </span>
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <TableHead className="w-[100px] sm:w-[120px]">
                      {language === 'da' ? 'Kontonr' : 'Account No'}
                    </TableHead>
                    <TableHead>{language === 'da' ? 'Kontonavn' : 'Account Name'}</TableHead>
                    <TableHead className="hidden sm:table-cell w-[110px]">
                      {language === 'da' ? 'Kontotype' : 'Type'}
                    </TableHead>
                    <TableHead className="text-right w-[120px] sm:w-[140px]">
                      {language === 'da' ? 'Debet' : 'Debit'}
                    </TableHead>
                    <TableHead className="text-right w-[120px] sm:w-[140px]">
                      {language === 'da' ? 'Kredit' : 'Credit'}
                    </TableHead>
                    <TableHead className="text-right w-[120px] sm:w-[140px]">
                      {language === 'da' ? 'Saldo' : 'Balance'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedAccounts.map((group) => (
                    <React.Fragment key={group.type}>
                      {/* Group header row */}
                      <TableRow className={getAccountTypeHeaderBg(group.type)}>
                        <TableCell
                          colSpan={3}
                          className="font-semibold text-gray-900 dark:text-white"
                        >
                          <span className={`flex items-center gap-2 ${getAccountTypeIconColor(group.type)}`}>
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {group.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900 dark:text-white">
                          {tc(group.debitTotal)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900 dark:text-white">
                          {tc(group.creditTotal)}
                        </TableCell>
                        <TableCell />
                      </TableRow>

                      {/* Account rows */}
                      {group.accounts.map((account) => (
                        <TableRow key={account.accountId}>
                          <TableCell className="font-mono text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            {account.accountNumber}
                          </TableCell>
                          <TableCell className="font-medium text-gray-900 dark:text-white text-sm">
                            {account.accountName}
                            {/* Show type badge on mobile where column is hidden */}
                            <Badge className={`text-[9px] sm:hidden ml-2 px-1 py-0 ${getAccountTypeBadgeClass(account.accountType)}`}>
                              {getAccountTypeLabel(account.accountType, language)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge className={`text-[10px] ${getAccountTypeBadgeClass(account.accountType)}`}>
                              {getAccountTypeLabel(account.accountType, language)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                            {account.debitTotal > 0 ? tc(account.debitTotal) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                            {account.creditTotal > 0 ? tc(account.creditTotal) : '—'}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm font-medium ${
                            account.balance > 0
                              ? 'text-gray-900 dark:text-white'
                              : account.balance < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {account.balance !== 0 ? tc(account.balance) : '0,00'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}

                  {/* Grand total row */}
                  <TableRow className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-white/20">
                    <TableCell colSpan={3} className="text-gray-900 dark:text-white text-sm sm:text-base">
                      {language === 'da' ? 'TOTAL' : 'GRAND TOTAL'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm sm:text-base text-gray-900 dark:text-white">
                      {tc(data.totalDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm sm:text-base text-gray-900 dark:text-white">
                      {tc(data.totalCredit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm sm:text-base text-gray-900 dark:text-white">
                      {tc(Math.abs(data.totalDebit - data.totalCredit))}
                    </TableCell>
                  </TableRow>

                  {/* Balancing indicator row */}
                  <TableRow className={data.balanced ? 'bg-green-50 dark:bg-green-500/10' : 'bg-red-50 dark:bg-red-500/10'}>
                    <TableCell colSpan={6} className="text-center py-3">
                      {data.balanced ? (
                        <span className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold text-sm">
                          <CheckCircle2 className="h-5 w-5" />
                          {language === 'da' ? 'I balance — bogføringen er korrekt' : 'Balanced — entries are correct'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-sm">
                          <XCircle className="h-5 w-5" />
                          {language === 'da'
                            ? `Ikke i balance — forskel: ${tc(Math.abs(data.totalDebit - data.totalCredit))}`
                            : `Unbalanced — difference: ${tc(Math.abs(data.totalDebit - data.totalCredit))}`}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info box */}
      <Card className="info-box-primary">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p>
                {language === 'da'
                  ? 'En råbalance (trial balance) viser debit- og kreditsaldi for alle konti i en given periode. Bogføringen er i balance, når total debit er lig med total kredit.'
                  : 'A trial balance shows debit and credit balances for all accounts in a given period. The entries are balanced when total debits equal total credits.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
