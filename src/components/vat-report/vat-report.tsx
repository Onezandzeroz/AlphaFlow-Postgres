'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { getMonthNames } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { PageHeader } from '@/components/shared/page-header';
import {
  Download,
  Calculator,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';

interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE';
  amount: number;
  description: string;
  vatPercent: number;
  receiptImage: string | null;
  invoiceId?: string | null;
  journalVAT?: { amount: number; code: string | null; rate: number } | null;
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

interface VATReportProps {
  user: User;
}

const CHART_COLORS = ['#0d9488', '#7c9a82', '#c9a87c', '#9490e8', '#c9928f', '#7dabb5'];
const PURCHASE_COLORS = ['#c9a87c', '#5eead4', '#6a66d8', '#8a6644', '#0f766e', '#d4a574'];

interface VATRegisterData {
  outputVAT: Array<{ code: string; rate: number; netAmount: number; creditTotal: number; debitTotal: number }>;
  inputVAT: Array<{ code: string; rate: number; netAmount: number; creditTotal: number; debitTotal: number }>;
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
  totalRevenue?: number;
  totalExpenses?: number;
}

export function VATReport({ user }: VATReportProps) {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { t, tc, language } = useTranslation();
  const [vatRegisterData, setVatRegisterData] = useState<VATRegisterData | null>(null);
  const [companyYear, setCompanyYear] = useState<number | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState((currentDate.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());

  const monthNames = getMonthNames(language);

  // ─── Initial data load ─────────────────────────────────────────
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [txResponse, invResponse, companyRes] = await Promise.all([
          fetch('/api/transactions'),
          fetch('/api/invoices'),
          fetch('/api/company'),
        ]);

        if (!txResponse.ok) console.error('Transactions API error:', txResponse.status);
        if (!invResponse.ok) console.error('Invoices API error:', invResponse.status);

        const txData = txResponse.ok ? await txResponse.json() : {};
        const invData = invResponse.ok ? await invResponse.json() : {};
        const companyData = companyRes.ok ? await companyRes.json() : null;

        if (companyData?.companyInfo?.currentYear) {
          const cYear = companyData.companyInfo.currentYear;
          setCompanyYear(cYear);
          if (cYear !== currentDate.getFullYear()) {
            setSelectedYear(cYear.toString());
          }
        }

        const transactions: Transaction[] = txData.transactions || [];
        const invoices: Invoice[] = invData.invoices || [];

        const invoiceIdsWithTransactions = new Set(
          transactions.filter((tx) => tx.invoiceId).map((tx) => tx.invoiceId)
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

        setAllTransactions([...transactions, ...virtualTransactions]);
        setInitialLoadDone(true);
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // ─── Period-specific VAT register fetch ─────────────────────────
  useEffect(() => {
    if (!initialLoadDone) return;

    const fetchVATRegister = async () => {
      try {
        const monthStr = selectedMonth.padStart(2, '0');
        const lastDay = new Date(+selectedYear, +selectedMonth, 0).getDate();
        const from = `${selectedYear}-${monthStr}-01`;
        const to = `${selectedYear}-${monthStr}-${lastDay}`;

        const vatRes = await fetch(`/api/vat-register?from=${from}&to=${to}`);
        const vatData = vatRes.ok ? await vatRes.json() : null;

        if (vatData) {
          setVatRegisterData(vatData);
        }
      } catch (error) {
        console.error('Failed to fetch VAT register:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVATRegister();
  }, [selectedMonth, selectedYear, initialLoadDone]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = companyYear ? Math.min(currentYear, companyYear) : currentYear;
    return Array.from({ length: Math.max(4, currentYear - startYear + 2) }, (_, i) => currentYear - i);
  }, [companyYear]);

  const filteredTransactions = useMemo(() => {
    const monthStr = selectedMonth.padStart(2, '0');
    const filterPrefix = `${selectedYear}-${monthStr}`;
    return allTransactions.filter((t) => {
      const dateStr = t.date?.substring(0, 10) || '';
      return dateStr.startsWith(filterPrefix);
    });
  }, [allTransactions, selectedMonth, selectedYear]);

  const { sales, purchases } = useMemo(() => {
    const sales = filteredTransactions.filter((t) => t.type === 'SALE' || (t.type as string) === 'Z_REPORT' || !t.type);
    const purchases = filteredTransactions.filter((t) => t.type === 'PURCHASE');
    return { sales, purchases };
  }, [filteredTransactions]);

  const outputVATBreakdown = useMemo(() => {
    if (vatRegisterData) {
      return vatRegisterData.outputVAT.map((entry) => ({
        rate: entry.rate,
        count: 0,
        totalAmount: entry.netAmount,
        totalVAT: entry.netAmount,
        type: 'output' as const,
      }));
    }
    return [];
  }, [vatRegisterData]);

  const inputVATBreakdown = useMemo(() => {
    if (vatRegisterData) {
      return vatRegisterData.inputVAT.map((entry) => ({
        rate: entry.rate,
        count: 0,
        totalAmount: entry.netAmount,
        totalVAT: entry.netAmount,
        type: 'input' as const,
      }));
    }
    return [];
  }, [vatRegisterData]);

  const totals = useMemo(() => {
    const outputVAT = vatRegisterData?.totalOutputVAT || 0;
    const inputVAT = vatRegisterData?.totalInputVAT || 0;
    const netPayable = vatRegisterData?.netVATPayable || 0;
    const totalSalesAmount = vatRegisterData?.totalRevenue ?? sales.reduce((sum, t) => sum + t.amount, 0);
    const totalPurchasesAmount = vatRegisterData?.totalExpenses ?? purchases.reduce((sum, t) => sum + t.amount, 0);

    return {
      outputVAT,
      inputVAT,
      netPayable,
      totalSalesAmount,
      totalPurchasesAmount,
      salesCount: sales.length,
      purchasesCount: purchases.length,
      transactionCount: filteredTransactions.length,
    };
  }, [sales, purchases, filteredTransactions, vatRegisterData]);

  const outputPieData = useMemo(() => {
    return outputVATBreakdown.map((item, index) => ({
      name: `${item.rate}%`,
      value: item.totalVAT,
      count: item.count,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [outputVATBreakdown]);

  const inputPieData = useMemo(() => {
    return inputVATBreakdown.map((item, index) => ({
      name: `${item.rate}%`,
      value: item.totalVAT,
      count: item.count,
      fill: PURCHASE_COLORS[index % PURCHASE_COLORS.length],
    }));
  }, [inputVATBreakdown]);

  const handleExportCSV = useCallback(() => {
    const headers = language === 'da'
      ? ['Type', 'Dato', 'Beskrivelse', 'Beløb (kr)', 'Moms %', 'Moms (kr)']
      : ['Type', 'Date', 'Description', 'Amount (DKK)', 'VAT %', 'VAT (DKK)'];

    const rows = filteredTransactions.map((t) => {
      const vatRate = t.journalVAT?.rate ?? 0;
      const vatAmount = t.journalVAT?.amount ?? 0;
      return [
        t.type === 'PURCHASE' ? (language === 'da' ? 'Køb' : 'Purchase') : (language === 'da' ? 'Salg' : 'Sale'),
        format(new Date(t.date), 'dd/MM/yyyy'),
        `"${t.description.replace(/"/g, '""')}"`,
        t.amount.toFixed(2),
        vatRate.toFixed(1),
        vatAmount.toFixed(2),
      ];
    });

    rows.push([]);
    rows.push(['', language === 'da' ? 'TOTALER' : 'TOTALS', '', '', '', '']);
    rows.push(['', language === 'da' ? 'Salgsposteringer' : 'Sales transactions', totals.salesCount.toString(), '', '', '']);
    rows.push(['', language === 'da' ? 'Købsposteringer' : 'Purchase transactions', totals.purchasesCount.toString(), '', '', '']);
    rows.push(['', language === 'da' ? 'Samlet salg' : 'Total Sales', totals.totalSalesAmount.toFixed(2), '', '', '']);
    rows.push(['', language === 'da' ? 'Samlet køb' : 'Total Purchases', totals.totalPurchasesAmount.toFixed(2), '', '', '']);
    rows.push(['', language === 'da' ? 'Udgående moms (salg)' : 'Output VAT (Sales)', totals.outputVAT.toFixed(2), '', '', '']);
    rows.push(['', language === 'da' ? 'Indgående moms (køb)' : 'Input VAT (Purchases)', totals.inputVAT.toFixed(2), '', '', '']);
    rows.push(['', language === 'da' ? (totals.netPayable >= 0 ? 'At betale' : 'Til godtgørelse') : (totals.netPayable >= 0 ? 'To Pay' : 'To Refund'), Math.abs(totals.netPayable).toFixed(2), '', '', '']);

    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = language === 'da' ? `momsafregning-${selectedMonth}-${selectedYear}.csv` : `vat-report-${selectedMonth}-${selectedYear}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [filteredTransactions, totals, selectedMonth, selectedYear, language]);

  // ─── Shared tooltip style for charts ──────────────────────────
  const chartTooltipStyle = {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
  };

  // ─── Render ───────────────────────────────────────────────────
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

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={t('vatReport')}
        description={language === 'da' ? 'Momsrapport til Skattestyrelsen' : 'VAT report for Danish tax authorities'}
      />

      {/* Period Selector */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                  {t('month')}
                </label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="bg-gray-50 dark:bg-white/5 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                    {monthNames.map((month, index) => (
                      <SelectItem key={index} value={(index + 1).toString()}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                  {t('year')}
                </label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="bg-gray-50 dark:bg-white/5 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleExportCSV} className="gap-2 btn-primary">
              <Download className="h-4 w-4" />
              {t('exportCSV')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Combined VAT Cards: Output + Input side by side ═══ */}
      {(totals.salesCount > 0 || totals.purchasesCount > 0) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

        {/* ─── Output VAT (Sales) — Combined Card ─── */}
        <Card className="stat-card card-hover-lift overflow-hidden">
          {/* Header with total */}
          <div className="bg-gradient-to-r from-[#0d9488]/8 to-transparent dark:from-[#0d9488]/15 px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#0d9488]/10 flex items-center justify-center">
                  <ArrowUpCircle className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {language === 'da' ? 'Udgående moms' : 'Output VAT'}
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('salesVATCollected')}</p>
                </div>
              </div>
              <Badge className="status-badge status-badge-sent text-[10px] sm:text-xs">
                {totals.salesCount} {language === 'da' ? 'salg' : 'sales'}
              </Badge>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-[#0d9488] dark:text-[#2dd4bf] mt-2 tabular-nums">
              {tc(totals.outputVAT)}
            </p>
          </div>

          {/* Body: chart + table */}
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            {outputPieData.length > 0 ? (
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Pie chart */}
                <div className="w-full sm:w-[180px] shrink-0">
                  <div className="h-[160px] sm:h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={outputPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {outputPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => tc(value)}
                          contentStyle={chartTooltipStyle}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend below chart on mobile */}
                  <div className="flex flex-wrap gap-2 mt-1 sm:mt-2 justify-center">
                    {outputPieData.map((entry, index) => (
                      <span key={index} className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                        {entry.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Per-rate breakdown table */}
                <div className="flex-1 min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-200 dark:border-gray-700">
                        <TableHead className="py-2 text-xs">{t('vatRate')}</TableHead>
                        <TableHead className="text-right py-2 text-xs">{t('vatAmount')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outputVATBreakdown.map((item) => (
                        <TableRow key={`out-${item.rate}`} className="border-b border-gray-50 dark:border-gray-800/50">
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[#0d9488] border-[#0d9488]/30 bg-[#0d9488]/5 text-xs font-medium">
                              {item.rate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right py-2 font-medium text-[#0d9488] dark:text-[#2dd4bf] tabular-nums text-sm">
                            {tc(item.totalVAT)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                {t('noDataForPeriod')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Input VAT (Purchases) — Combined Card ─── */}
        <Card className="stat-card card-hover-lift overflow-hidden">
          {/* Header with total */}
          <div className="bg-gradient-to-r from-amber-500/8 to-transparent dark:from-amber-500/15 px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <ArrowDownCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {language === 'da' ? 'Indgående moms' : 'Input VAT'}
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('purchaseVATDeductible')}</p>
                </div>
              </div>
              <Badge className="status-badge status-badge-overdue text-[10px] sm:text-xs">
                {totals.purchasesCount} {language === 'da' ? 'køb' : 'purchases'}
              </Badge>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 mt-2 tabular-nums">
              {tc(totals.inputVAT)}
            </p>
          </div>

          {/* Body: chart + table */}
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            {inputPieData.length > 0 ? (
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Pie chart */}
                <div className="w-full sm:w-[180px] shrink-0">
                  <div className="h-[160px] sm:h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={inputPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {inputPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => tc(value)}
                          contentStyle={chartTooltipStyle}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend below chart on mobile */}
                  <div className="flex flex-wrap gap-2 mt-1 sm:mt-2 justify-center">
                    {inputPieData.map((entry, index) => (
                      <span key={index} className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                        {entry.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Per-rate breakdown table */}
                <div className="flex-1 min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-200 dark:border-gray-700">
                        <TableHead className="py-2 text-xs">{t('vatRate')}</TableHead>
                        <TableHead className="text-right py-2 text-xs">{t('vatAmount')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inputVATBreakdown.map((item) => (
                        <TableRow key={`in-${item.rate}`} className="border-b border-gray-50 dark:border-gray-800/50">
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5 text-xs font-medium">
                              {item.rate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right py-2 font-medium text-amber-600 dark:text-amber-400 tabular-nums text-sm">
                            {tc(item.totalVAT)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                {language === 'da' ? 'Ingen køb i perioden' : 'No purchases in period'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* ═══ Moms pr. sats (VAT Breakdown Tables) ═══ */}
      <Card className="stat-card card-hover-lift">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#0d9488]" />
            {language === 'da' ? 'Moms pr. sats' : 'VAT per Rate'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(outputVATBreakdown.length > 0 || inputVATBreakdown.length > 0) ? (
            <div className="space-y-4">
              {/* Output VAT Table */}
              {outputVATBreakdown.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-[#0d9488] dark:text-[#2dd4bf] mb-2 flex items-center gap-1">
                    <ArrowUpCircle className="h-4 w-4" />
                    {language === 'da' ? 'Udgående moms (salg)' : 'Output VAT (Sales)'}
                  </h4>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="border-b border-gray-200 dark:border-gray-700">
                        <TableHead className="py-2 w-[40%]">{t('vatRate')}</TableHead>
                        <TableHead className="text-right py-2 w-[30%]">{t('vatAmount')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outputVATBreakdown.map((item) => (
                        <TableRow key={`out-${item.rate}`} className="border-b border-gray-100 dark:border-gray-800 table-row-teal-hover">
                          <TableCell className="py-2 w-[40%]">
                            <Badge className="status-badge status-badge-sent">
                              {item.rate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right py-2 w-[30%] font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                            {tc(item.totalVAT)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Input VAT Table */}
              {inputVATBreakdown.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                    <ArrowDownCircle className="h-4 w-4" />
                    {language === 'da' ? 'Indgående moms (køb)' : 'Input VAT (Purchases)'}
                  </h4>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="border-b border-gray-200 dark:border-gray-700">
                        <TableHead className="py-2 w-[40%]">{t('vatRate')}</TableHead>
                        <TableHead className="text-right py-2 w-[30%]">{t('vatAmount')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inputVATBreakdown.map((item) => (
                        <TableRow key={`in-${item.rate}`} className="border-b border-gray-100 dark:border-gray-800 table-row-teal-hover">
                          <TableCell className="py-2 w-[40%]">
                            <Badge className="status-badge status-badge-overdue">
                              {item.rate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right py-2 w-[30%] font-medium text-amber-600 dark:text-amber-400">
                            {tc(item.totalVAT)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Totals */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('outputVAT')}:</span>
                  <span className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">{tc(totals.outputVAT)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('inputVAT')}:</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">-{tc(totals.inputVAT)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700 font-bold">
                  <span className="text-gray-900 dark:text-white">
                    {totals.netPayable >= 0 ? t('toPay') : t('toRefund')}:
                  </span>
                  <span className={totals.netPayable >= 0 ? 'text-green-600 dark:text-green-400' : 'text-[#0d9488] dark:text-[#2dd4bf]'}>
                    {tc(Math.abs(totals.netPayable))}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
              {t('noTransactionsPeriod')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="info-box-primary">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">ℹ️</span>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p><strong>{t('danishVATInfo')}</strong></p>
              <p><strong>{language === 'da' ? 'Udgående moms' : 'Output VAT'}</strong>: {t('outputVATInfo')}</p>
              <p><strong>{language === 'da' ? 'Indgående moms' : 'Input VAT'}</strong>: {t('inputVATInfo')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
