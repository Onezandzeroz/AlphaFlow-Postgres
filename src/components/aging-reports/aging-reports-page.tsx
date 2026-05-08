'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Clock,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

// ─── Types ─────────────────────────────────────────────────────────

interface AgingEntry {
  journalEntryId: string;
  date: string;
  description: string;
  amount: number;
  daysOld: number;
}

interface AccountAging {
  accountId: string;
  accountNumber: string;
  accountName: string;
  current: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  days120plus: number;
  total: number;
  entries: AgingEntry[];
}

interface AgingBucketSummary {
  current: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  days120plus: number;
  total: number;
}

interface AgingReport {
  type: string;
  asOf: string;
  summary: AgingBucketSummary;
  accounts: AccountAging[];
}

// ─── Helper: today as YYYY-MM-DD ──────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Component ─────────────────────────────────────────────────────

export function AgingReportsPage({ user }: { user: User }) {
  const { language, tc } = useTranslation();
  const isDanish = language === 'da';

  // ── State ──
  const [activeTab, setActiveTab] = useState<string>('receivables');
  const [asOfDate, setAsOfDate] = useState(todayStr);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AgingReport | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // ── Fetch aging report ──
  const fetchReport = useCallback(async (type: string, date: string) => {
    setIsLoading(true);
    setError(null);
    setReport(null);
    setExpandedAccounts(new Set());
    try {
      const params = new URLSearchParams({ type, asOf: date });
      const response = await fetch(`/api/aging-reports?${params}`);
      if (!response.ok) throw new Error('Failed to fetch aging report');
      const data = await response.json();
      setReport(data);
    } catch (err) {
      console.error('Aging report fetch error:', err);
      setError(
        isDanish
          ? 'Kunne ikke hente aldersopdeling'
          : 'Failed to fetch aging report'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isDanish]);

  // ── Load on tab or date change ──
  useEffect(() => {
    fetchReport(activeTab, asOfDate);
  }, [activeTab, asOfDate, fetchReport]);

  // ── Toggle expand ──
  const toggleExpand = useCallback((accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }, []);

  // ── Export CSV ──
  const handleExportCSV = useCallback(() => {
    if (!report) return;

    const headers = isDanish
      ? ['Konto', 'Navn', '0-30 dage', '31-60 dage', '61-90 dage', '91-120 dage', '120+ dage', 'Total']
      : ['Account', 'Name', '0-30 days', '31-60 days', '61-90 days', '91-120 days', '120+ days', 'Total'];

    const rows: string[][] = [
      [report.type === 'receivables' ? (isDanish ? 'DEBITORRAPPORT' : 'RECEIVABLES AGING') : (isDanish ? 'KREDITORRAPPORT' : 'PAYABLES AGING'), '', '', '', '', '', '', ''],
      [`${isDanish ? 'Praesentation' : 'As of'}: ${report.asOf}`, '', '', '', '', '', '', ''],
      [],
      headers,
    ];

    for (const acc of report.accounts) {
      rows.push([
        acc.accountNumber,
        acc.accountName,
        acc.current.toFixed(2),
        acc.days31to60.toFixed(2),
        acc.days61to90.toFixed(2),
        acc.days91to120.toFixed(2),
        acc.days120plus.toFixed(2),
        acc.total.toFixed(2),
      ]);
      // Include detail entries
      if (expandedAccounts.has(acc.accountId)) {
        for (const entry of acc.entries) {
          const colAmounts = [
            '', // Account column
            `  ${entry.date} — ${entry.description}`,
            '', // Account number column
            '', // Account name column
          ];
          // Place amount in correct aging bucket column
          if (entry.daysOld <= 30) {
            colAmounts.push(entry.amount.toFixed(2), '', '', '', '');
          } else if (entry.daysOld <= 60) {
            colAmounts.push('', entry.amount.toFixed(2), '', '', '');
          } else if (entry.daysOld <= 90) {
            colAmounts.push('', '', entry.amount.toFixed(2), '', '');
          } else if (entry.daysOld <= 120) {
            colAmounts.push('', '', '', entry.amount.toFixed(2), '');
          } else {
            colAmounts.push('', '', '', '', entry.amount.toFixed(2));
          }
          colAmounts.push(`${isDanish ? 'dage' : 'days'}: ${entry.daysOld}`, entry.amount.toFixed(2));
          rows.push(colAmounts);
        }
      }
    }

    // Summary row
    rows.push([]);
    rows.push([
      isDanish ? 'TOTAL' : 'TOTAL',
      '',
      report.summary.current.toFixed(2),
      report.summary.days31to60.toFixed(2),
      report.summary.days61to90.toFixed(2),
      report.summary.days91to120.toFixed(2),
      report.summary.days120plus.toFixed(2),
      report.summary.total.toFixed(2),
    ]);

    const bom = '\uFEFF';
    const csv = bom + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aging-${report.type}-${report.asOf}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [report, isDanish, expandedAccounts]);

  // ── Aging bucket metadata for summary cards ──
  const bucketCards = useMemo(() => [
    {
      key: 'current' as const,
      label: isDanish ? '0-30 dage' : '0-30 days',
      sublabel: isDanish ? 'Aktuel' : 'Current',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-500/10 dark:bg-green-500/20',
      borderColor: 'border-green-500/20',
      iconBg: 'stat-icon-green',
      icon: ArrowDownLeft,
    },
    {
      key: 'days31to60' as const,
      label: isDanish ? '31-60 dage' : '31-60 days',
      sublabel: isDanish ? 'Forsinket' : 'Late',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500/10 dark:bg-amber-500/20',
      borderColor: 'border-amber-500/20',
      iconBg: 'stat-icon-amber',
      icon: Clock,
    },
    {
      key: 'days61to90' as const,
      label: isDanish ? '61-90 dage' : '61-90 days',
      sublabel: isDanish ? 'Overdue' : 'Overdue',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-500/10 dark:bg-orange-500/20',
      borderColor: 'border-orange-500/20',
      iconBg: 'stat-icon-amber',
      icon: AlertCircle,
    },
    {
      key: 'days91to120' as const,
      label: isDanish ? '91-120 dage' : '91-120 days',
      sublabel: isDanish ? 'Kritisk' : 'Critical',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-500/10 dark:bg-red-500/20',
      borderColor: 'border-red-500/20',
      iconBg: 'stat-icon-red',
      icon: AlertCircle,
    },
    {
      key: 'days120plus' as const,
      label: isDanish ? '120+ dage' : '120+ days',
      sublabel: isDanish ? 'Meget kritisk' : 'Severe',
      color: 'text-red-800 dark:text-red-500',
      bgColor: 'bg-red-800/10 dark:bg-red-500/20',
      borderColor: 'border-red-800/20',
      iconBg: 'stat-icon-red',
      icon: AlertCircle,
    },
    {
      key: 'total' as const,
      label: isDanish ? 'Total' : 'Total',
      sublabel: isDanish ? 'Alle aldre' : 'All ages',
      color: 'text-gray-900 dark:text-white',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      borderColor: 'border-gray-200 dark:border-gray-700',
      iconBg: 'stat-icon-primary',
      icon: FileSpreadsheet,
    },
  ], [isDanish]);

  // ─── Loading skeleton ──────────────────────────────────────────
  if (isLoading && !report) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>

        {/* Date picker skeleton */}
        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2 w-full sm:w-48">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-36" />
            </div>
          </CardContent>
        </Card>

        {/* Summary cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <Skeleton className="h-9 w-9 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-4">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Check if there is any real aging data ─────────────────
  const hasAnyData = report !== null && report.accounts.length > 0;

  // ─── Main render ───────────────────────────────────────────────
  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={isDanish ? 'Aldersopdeling' : 'Aging Reports'}
        description={isDanish
          ? 'Debitor- og kreditorrapport med aldersfordeling'
          : 'Accounts receivable and payable aging analysis'}
        action={
          <Button
            onClick={() => fetchReport(activeTab, asOfDate)}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isDanish ? 'Opdater' : 'Refresh'}
          </Button>
        }
      />

      {/* Cover card: no transactions yet */}
      {!isLoading && !hasAnyData && !error && (
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-16 text-center">
            <div className="empty-state-container inline-flex flex-col items-center">
              <div className="empty-state-illustration inline-flex items-center justify-center h-20 w-20 rounded-2xl mb-4">
                <Clock className="h-10 w-10 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {isDanish ? 'Ingen poster til aldersopdeling endnu' : 'No entries for aging analysis yet'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                {isDanish
                  ? 'Aldersopdelingen viser tilgodehavender og kreditorer opdelt efter alder. Opret din første postering for at se data her.'
                  : 'The aging analysis shows receivables and payables broken down by age. Create your first transaction to see data here.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabs: Receivables / Payables (hidden until data exists) ── */}
      {(isLoading || hasAnyData || !!error) && (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Mobile: Select dropdown */}
        <div className="sm:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="receivables">
                <span className="flex items-center gap-2">
                  <ArrowDownLeft className="h-4 w-4" />
                  {isDanish ? 'Tilgodehavender' : 'Receivables'}
                </span>
              </SelectItem>
              <SelectItem value="payables">
                <span className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  {isDanish ? 'Kreditorer' : 'Payables'}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Desktop: Horizontal tabs */}
        <div className="hidden sm:flex items-center justify-between flex-wrap gap-2">
          <TabsList className="bg-gray-100 dark:bg-gray-800 h-10">
            <TabsTrigger
              value="receivables"
              className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm"
            >
              <ArrowDownLeft className="h-4 w-4" />
              {isDanish ? 'Tilgodehavender' : 'Receivables'}
            </TabsTrigger>
            <TabsTrigger
              value="payables"
              className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm"
            >
              <ArrowUpRight className="h-4 w-4" />
              {isDanish ? 'Kreditorer' : 'Payables'}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="mt-0">
          {/* ── Date Picker ── */}
          <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5 mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="space-y-1.5 w-full sm:w-auto">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {isDanish ? 'Præsentation pr.' : 'As of'}
                  </Label>
                  <Input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="bg-gray-50 dark:bg-white/[0.04] border-0 w-full sm:w-48"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setAsOfDate(todayStr())}
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                  >
                    {isDanish ? 'I dag' : 'Today'}
                  </Button>
                  <Button
                    onClick={() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() - 1);
                      setAsOfDate(
                        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      );
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                  >
                    {isDanish ? '1 måned siden' : '1 month ago'}
                  </Button>
                  <Button
                    onClick={() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() - 3);
                      setAsOfDate(
                        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      );
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                  >
                    {isDanish ? '3 måneder siden' : '3 months ago'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Error State ── */}
          {error ? (
            <Card className="border-red-200 dark:border-red-800/50">
              <CardContent className="p-4 sm:p-6 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
                <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
                <Button
                  onClick={() => fetchReport(activeTab, asOfDate)}
                  variant="outline"
                  className="gap-2"
                >
                  <Loader2 className="h-4 w-4" />
                  {isDanish ? 'Prøv igen' : 'Try again'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── Summary Cards ── */}
              {report && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
                  {bucketCards.map((bucket) => {
                    const value = report.summary[bucket.key];
                    const Icon = bucket.icon;
                    const isTotal = bucket.key === 'total';

                    return (
                      <Card
                        key={bucket.key}
                        className={`stat-card ${isTotal ? 'border-2' : ''}`}
                        style={{
                          borderColor: isTotal
                            ? undefined
                            : undefined,
                        }}
                      >
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1 flex-1 min-w-0">
                              <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                                {bucket.label}
                              </p>
                              <p
                                className={`text-base sm:text-xl font-bold truncate ${bucket.color}`}
                              >
                                {tc(value)}
                              </p>
                            </div>
                            <div
                              className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full ${bucket.iconBg} flex items-center justify-center shrink-0 ml-2`}
                            >
                              <Icon
                                className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${bucket.color}`}
                              />
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1">
                            <Badge
                              className={`text-[10px] font-normal px-1.5 py-0 ${bucket.bgColor} ${bucket.color} border ${bucket.borderColor}`}
                            >
                              {bucket.sublabel}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* ── Export & Info bar ── */}
              {report && (
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Badge variant="outline" className="text-xs font-normal">
                      {report.asOf}
                    </Badge>
                    <span>
                      {report.accounts.length}{' '}
                      {report.accounts.length === 1
                        ? isDanish
                          ? 'konto'
                          : 'account'
                        : isDanish
                          ? 'konti'
                          : 'accounts'}
                    </span>
                  </div>
                  <Button
                    onClick={handleExportCSV}
                    className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium shadow-lg shadow-[#0d9488]/20 transition-all text-sm"
                  >
                    <Download className="h-4 w-4" />
                    {isDanish ? 'Eksporter CSV' : 'Export CSV'}
                  </Button>
                </div>
              )}

              {/* ── Accounts Table ── */}
              {report && report.accounts.length > 0 ? (
                <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      {activeTab === 'receivables' ? (
                        <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      )}
                      {activeTab === 'receivables'
                        ? isDanish
                          ? 'Debitorrapport'
                          : 'Receivables Aging'
                        : isDanish
                          ? 'Kreditorrapport'
                          : 'Payables Aging'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                            <TableHead className="w-[32px]">
                              <span className="sr-only">Expand</span>
                            </TableHead>
                            <TableHead>
                              {isDanish ? 'Konto' : 'Account'}
                            </TableHead>
                            <TableHead className="hidden sm:table-cell">
                              {isDanish ? 'Navn' : 'Name'}
                            </TableHead>
                            <TableHead className="text-right">
                              <span className="text-green-600 dark:text-green-400">
                                {isDanish ? '0-30' : '0-30'}
                              </span>
                            </TableHead>
                            <TableHead className="text-right hidden md:table-cell">
                              <span className="text-amber-600 dark:text-amber-400">
                                {isDanish ? '31-60' : '31-60'}
                              </span>
                            </TableHead>
                            <TableHead className="text-right hidden md:table-cell">
                              <span className="text-orange-600 dark:text-orange-400">
                                {isDanish ? '61-90' : '61-90'}
                              </span>
                            </TableHead>
                            <TableHead className="text-right hidden lg:table-cell">
                              <span className="text-red-600 dark:text-red-400">
                                {isDanish ? '91-120' : '91-120'}
                              </span>
                            </TableHead>
                            <TableHead className="text-right hidden lg:table-cell">
                              <span className="text-red-800 dark:text-red-500">
                                120+
                              </span>
                            </TableHead>
                            <TableHead className="text-right font-semibold">
                              {isDanish ? 'Total' : 'Total'}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.accounts.map((acc) => {
                            const isExpanded = expandedAccounts.has(acc.accountId);
                            return (
                              <React.Fragment key={acc.accountId}>
                                {/* ── Account row (collapsible trigger) ── */}
                                <Collapsible
                                  open={isExpanded}
                                  onOpenChange={() => toggleExpand(acc.accountId)}
                                >
                                  <CollapsibleTrigger asChild>
                                    <TableRow className="cursor-pointer table-row-hover">
                                      <TableCell className="w-[32px] p-1">
                                        {isExpanded ? (
                                          <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                        )}
                                      </TableCell>
                                      <TableCell className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                                        {acc.accountNumber}
                                      </TableCell>
                                      <TableCell className="hidden sm:table-cell text-gray-700 dark:text-gray-300">
                                        {acc.accountName}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                                        {acc.current > 0 ? tc(acc.current) : '—'}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-amber-600 dark:text-amber-400 hidden md:table-cell">
                                        {acc.days31to60 > 0 ? tc(acc.days31to60) : '—'}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-orange-600 dark:text-orange-400 hidden md:table-cell">
                                        {acc.days61to90 > 0 ? tc(acc.days61to90) : '—'}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400 hidden lg:table-cell">
                                        {acc.days91to120 > 0 ? tc(acc.days91to120) : '—'}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-red-800 dark:text-red-500 hidden lg:table-cell">
                                        {acc.days120plus > 0 ? tc(acc.days120plus) : '—'}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                        {tc(acc.total)}
                                      </TableCell>
                                    </TableRow>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    {/* ── Expanded entries ── */}
                                    {acc.entries.length > 0 ? (
                                      <>
                                        <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                                          <TableCell colSpan={9}>
                                            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 pl-6">
                                              <Separator className="flex-1" />
                                              <span>
                                                {acc.entries.length}{' '}
                                                {acc.entries.length === 1
                                                  ? isDanish
                                                    ? 'postering'
                                                    : 'entry'
                                                  : isDanish
                                                    ? 'posteringer'
                                                    : 'entries'}
                                              </span>
                                              <Separator className="flex-1" />
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                        {acc.entries.map((entry) => (
                                          <TableRow
                                            key={entry.journalEntryId}
                                            className="bg-gray-50/50 dark:bg-white/[0.02] hover:bg-gray-100/70 dark:hover:bg-white/[0.04]"
                                          >
                                            <TableCell />
                                            <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                                              {entry.date}
                                            </TableCell>
                                            <TableCell
                                              className="text-xs text-gray-700 dark:text-gray-300 sm:table-cell"
                                              colSpan={2}
                                            >
                                              {entry.description}
                                            </TableCell>
                                            <TableCell
                                              className="text-right font-mono text-xs text-gray-700 dark:text-gray-300 hidden md:table-cell"
                                              colSpan={3}
                                            >
                                              <Badge
                                                className={`text-[10px] font-normal ${
                                                  entry.daysOld <= 30
                                                    ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20'
                                                    : entry.daysOld <= 60
                                                      ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20'
                                                      : entry.daysOld <= 90
                                                        ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-500/20'
                                                        : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20'
                                                }`}
                                              >
                                                {entry.daysOld}{' '}
                                                {isDanish ? 'dage' : 'days'}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs font-medium text-gray-900 dark:text-white hidden lg:table-cell">
                                              {tc(entry.amount)}
                                            </TableCell>
                                            <TableCell />
                                          </TableRow>
                                        ))}
                                      </>
                                    ) : (
                                      <TableRow className="bg-gray-50/50 dark:bg-white/[0.02] hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                                        <TableCell colSpan={9}>
                                          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">
                                            {isDanish
                                              ? 'Ingen posteringer fundet'
                                              : 'No entries found'}
                                          </p>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </CollapsibleContent>
                                </Collapsible>
                              </React.Fragment>
                            );
                          })}

                          {/* ── Summary row ── */}
                          <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                            <TableCell />
                            <TableCell className="font-semibold text-gray-900 dark:text-white">
                              {isDanish ? 'TOTAL' : 'TOTAL'}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-gray-900 dark:text-white">
                              ({report.accounts.length})
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                              {tc(report.summary.current)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-amber-600 dark:text-amber-400 hidden md:table-cell">
                              {tc(report.summary.days31to60)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-orange-600 dark:text-orange-400 hidden md:table-cell">
                              {tc(report.summary.days61to90)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400 hidden lg:table-cell">
                              {tc(report.summary.days91to120)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-800 dark:text-red-500 hidden lg:table-cell">
                              {tc(report.summary.days120plus)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                              {tc(report.summary.total)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : report && report.accounts.length === 0 ? (
                <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
                  <CardContent className="p-12 text-center">
                    <Clock className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {isDanish
                        ? 'Ingen data fundet'
                        : 'No data found'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {isDanish
                        ? `Der er ingen ${activeTab === 'receivables' ? 'tilgodehavender' : 'kreditorer'} pr. ${asOfDate}`
                        : `No ${activeTab === 'receivables' ? 'receivables' : 'payables'} found as of ${asOfDate}`}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
