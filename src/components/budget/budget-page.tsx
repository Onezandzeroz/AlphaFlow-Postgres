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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import {
  Target,
  Plus,
  Loader2,
  Trash2,
  XCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PiggyBank,
  Calendar,
  Info,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ──────────────────────────────────────────────────────────

interface BudgetListItem {
  id: string;
  name: string;
  year: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BudgetEntry {
  id: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  accountGroup: string;
  budget: Record<string, number>;
  actual: Record<string, number>;
  variance: Record<string, number>;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
}

interface BudgetSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  byType: Record<string, { budget: number; actual: number; variance: number }>;
}

interface BudgetDetail {
  budget: {
    id: string;
    name: string;
    year: number;
    notes: string | null;
    isActive: boolean;
  };
  entries: BudgetEntry[];
  summary: BudgetSummary;
}

interface AccountOption {
  id: string;
  number: string;
  name: string;
  type: string;
  group: string;
}

interface BudgetFormEntry {
  id?: string;
  accountId: string;
  january: number;
  february: number;
  march: number;
  april: number;
  may: number;
  june: number;
  july: number;
  august: number;
  september: number;
  october: number;
  november: number;
  december: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ACCOUNT_TYPE_ORDER = ['REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY'] as const;

// ─── Helpers ────────────────────────────────────────────────────────

function getAccountTypeLabel(type: string, language: 'da' | 'en'): string {
  const labels: Record<string, { da: string; en: string }> = {
    REVENUE: { da: 'Indtægter', en: 'Revenue' },
    EXPENSE: { da: 'Udgifter', en: 'Expenses' },
    ASSET: { da: 'Aktiver', en: 'Assets' },
    LIABILITY: { da: 'Passiver', en: 'Liabilities' },
    EQUITY: { da: 'Egenkapital', en: 'Equity' },
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
      return 'bg-gray-50 dark:bg-gray-800';
  }
}

function isFavorableVariance(variance: number, accountType: string): boolean {
  // Revenue: positive variance (actual > budget) is favorable
  // Expense: negative variance (actual < budget) is favorable
  if (accountType === 'REVENUE') return variance >= 0;
  return variance <= 0;
}

function fmtShort(value: number, language: 'da' | 'en'): string {
  if (value === 0) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return value.toFixed(0);
}

function createEmptyFormEntry(): BudgetFormEntry {
  return {
    accountId: '',
    january: 0,
    february: 0,
    march: 0,
    april: 0,
    may: 0,
    june: 0,
    july: 0,
    august: 0,
    september: 0,
    october: 0,
    november: 0,
    december: 0,
  };
}

// ─── Component ──────────────────────────────────────────────────────

export function BudgetPage({ user }: { user: User }) {
  const { t, tc, language } = useTranslation();
  const isDa = language === 'da';

  // ── State ──
  const [budgets, setBudgets] = useState<BudgetListItem[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [detail, setDetail] = useState<BudgetDetail | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formYear, setFormYear] = useState<number>(new Date().getFullYear());
  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formEntries, setFormEntries] = useState<BudgetFormEntry[]>([createEmptyFormEntry()]);

  // Accounts for dialog
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // ── Fetch budgets list ──
  const fetchBudgets = useCallback(async () => {
    setIsLoadingBudgets(true);
    try {
      const res = await fetch('/api/budgets');
      if (!res.ok) throw new Error('Failed to fetch budgets');
      const data = await res.json();
      setBudgets(data.budgets || []);
      // Auto-select first/active budget year
      const activeBudgets = (data.budgets || []).filter((b: BudgetListItem) => b.isActive);
      if (activeBudgets.length > 0 && !budgets.length) {
        setSelectedYear(activeBudgets[0].year);
      }
    } catch (err) {
      console.error('Failed to fetch budgets:', err);
      setError(isDa ? 'Kunne ikke hente budgetter' : 'Failed to fetch budgets');
    } finally {
      setIsLoadingBudgets(false);
    }
  }, [isDa, budgets.length]);

  // ── Fetch budget detail ──
  const fetchDetail = useCallback(async (year: number) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/budgets?year=${year}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to fetch budget detail');
      }
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      console.error('Failed to fetch budget detail:', err);
      setDetail(null);
      setError(err instanceof Error ? err.message : (isDa ? 'Kunne ikke hente budgetdetaljer' : 'Failed to fetch budget detail'));
    } finally {
      setIsLoadingDetail(false);
    }
  }, [isDa]);

  // ── Fetch accounts ──
  const fetchAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      const acctList = (data.accounts || []).map((a: { id: string; number: string; name: string; type: string; group: string }) => ({
        id: a.id,
        number: a.number,
        name: a.name,
        type: a.type,
        group: a.group,
      }));
      setAccounts(acctList);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  useEffect(() => {
    fetchDetail(selectedYear);
  }, [selectedYear, fetchDetail]);

  // ── Grouped entries ──
  const groupedEntries = useMemo(() => {
    if (!detail) return [];
    const groups: Record<string, BudgetEntry[]> = {};
    for (const type of ACCOUNT_TYPE_ORDER) {
      const entries = detail.entries
        .filter((e) => e.accountType === type)
        .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
      if (entries.length > 0) {
        groups[type] = entries;
      }
    }
    return ACCOUNT_TYPE_ORDER
      .filter((type) => groups[type])
      .map((type) => ({
        type,
        label: getAccountTypeLabel(type, language),
        entries: groups[type],
        totalBudget: groups[type].reduce((sum, e) => sum + e.totalBudget, 0),
        totalActual: groups[type].reduce((sum, e) => sum + e.totalActual, 0),
        totalVariance: groups[type].reduce((sum, e) => sum + e.totalVariance, 0),
      }));
  }, [detail, language]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (!detail) return [];
    return MONTH_LABELS.map((label, idx) => {
      const monthKey = MONTHS[idx];
      const budgetSum = detail.entries.reduce((s, e) => s + (e.budget[monthKey] || 0), 0);
      const actualSum = detail.entries.reduce((s, e) => s + (e.actual[monthKey] || 0), 0);
      return { month: label, budget: Math.round(budgetSum), actual: Math.round(actualSum) };
    });
  }, [detail]);

  // ── Variance color helper ──
  const varianceClass = (variance: number, accountType: string): string => {
    if (variance === 0) return 'text-gray-500 dark:text-gray-400';
    return isFavorableVariance(variance, accountType)
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';
  };

  // ── Create budget ──
  const handleCreate = async () => {
    if (!formName.trim() || !formYear) return;
    setSaving(true);
    try {
      const validEntries = formEntries.filter((e) => e.accountId);
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: formYear,
          name: formName.trim(),
          notes: formNotes.trim() || null,
          entries: validEntries,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to create budget');
      }
      setCreateDialogOpen(false);
      resetForm();
      await fetchBudgets();
      setSelectedYear(formYear);
    } catch (err) {
      console.error('Create budget error:', err);
      alert(err instanceof Error ? err.message : (isDa ? 'Fejl ved oprettelse' : 'Error creating budget'));
    } finally {
      setSaving(false);
    }
  };

  // ── Edit budget (update entries) ──
  const handleEditSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const validEntries = formEntries
        .filter((e) => e.accountId)
        .map((fe) => {
          // Match existing entry by accountId
          const existingEntry = detail.entries.find((de) => de.accountId === fe.accountId);
          return {
            ...(existingEntry ? { id: existingEntry.id } : {}),
            accountId: fe.accountId,
            january: fe.january,
            february: fe.february,
            march: fe.march,
            april: fe.april,
            may: fe.may,
            june: fe.june,
            july: fe.july,
            august: fe.august,
            september: fe.september,
            october: fe.october,
            november: fe.november,
            december: fe.december,
          };
        });
      const res = await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: detail.budget.id,
          name: formName.trim() || undefined,
          notes: formNotes.trim() || null,
          entries: validEntries,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to update budget');
      }
      setEditDialogOpen(false);
      resetForm();
      await fetchBudgets();
      await fetchDetail(selectedYear);
    } catch (err) {
      console.error('Update budget error:', err);
      alert(err instanceof Error ? err.message : (isDa ? 'Fejl ved opdatering' : 'Error updating budget'));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete budget ──
  const handleDelete = async () => {
    if (!detail) return;
    if (!confirm(isDa ? 'Er du sikker på, at du vil annullere dette budget?' : 'Are you sure you want to cancel this budget?')) return;
    try {
      const res = await fetch(`/api/budgets?id=${detail.budget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete budget');
      setDetail(null);
      await fetchBudgets();
    } catch (err) {
      console.error('Delete budget error:', err);
    }
  };

  // ── Open edit dialog ──
  const handleOpenEdit = async () => {
    if (!detail) return;
    setFormYear(detail.budget.year);
    setFormName(detail.budget.name);
    setFormNotes(detail.budget.notes || '');
    const existing: BudgetFormEntry[] = detail.entries.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      january: e.budget.january || 0,
      february: e.budget.february || 0,
      march: e.budget.march || 0,
      april: e.budget.april || 0,
      may: e.budget.may || 0,
      june: e.budget.june || 0,
      july: e.budget.july || 0,
      august: e.budget.august || 0,
      september: e.budget.september || 0,
      october: e.budget.october || 0,
      november: e.budget.november || 0,
      december: e.budget.december || 0,
    }));
    setFormEntries(existing.length > 0 ? existing : [createEmptyFormEntry()]);
    await fetchAccounts();
    setEditDialogOpen(true);
  };

  // ── Open create dialog ──
  const handleOpenCreate = async () => {
    resetForm();
    await fetchAccounts();
    setCreateDialogOpen(true);
  };

  const resetForm = () => {
    setFormYear(new Date().getFullYear());
    setFormName('');
    setFormNotes('');
    setFormEntries([createEmptyFormEntry()]);
  };

  // ── Form entry management ──
  const addFormEntry = () => {
    setFormEntries([...formEntries, createEmptyFormEntry()]);
  };

  const removeFormEntry = (index: number) => {
    setFormEntries(formEntries.filter((_, i) => i !== index));
  };

  const updateFormEntry = (index: number, field: keyof BudgetFormEntry, value: string | number) => {
    const updated = [...formEntries];
    if (field === 'accountId') {
      updated[index] = { ...updated[index], [field]: value as string };
    } else {
      const numVal = value === '' || value === undefined ? 0 : Number(value);
      updated[index] = { ...updated[index], [field]: isNaN(numVal) ? 0 : numVal };
    }
    setFormEntries(updated);
  };

  // ── Available accounts (not yet selected) ──
  const getAvailableAccounts = (currentEntryAccountId: string) => {
    const selectedIds = new Set(formEntries.map((e) => e.accountId).filter(Boolean));
    selectedIds.delete(currentEntryAccountId);
    return accounts.filter((a) => !selectedIds.has(a.id));
  };

  // ─── Loading skeleton ──
  if (isLoadingBudgets) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-4 sm:p-6">
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-7 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* ─── Header ─── */}
      <PageHeader
        title={isDa ? 'Budgetter' : 'Budgets'}
        description={isDa
          ? 'Budgetter og afvigelsesanalyse for din virksomhed'
          : 'Budgets and variance analysis for your business'}
        action={
          <Button
            onClick={handleOpenCreate}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
          >
            <Plus className="h-4 w-4" />
            {isDa ? 'Opret budget' : 'Create Budget'}
          </Button>
        }
      />

      {/* ─── Budget Year Selector (Tabs) ─── */}
      {budgets.length > 0 && (
        <Tabs value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <TabsList>
            {budgets
              .sort((a, b) => b.year - a.year)
              .map((b) => (
                <TabsTrigger key={b.year} value={String(b.year)} className="gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {b.year}
                  {!b.isActive && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 text-gray-400">
                      {isDa ? 'Inaktiv' : 'Inactive'}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
          </TabsList>
        </Tabs>
      )}

      {/* ─── No Budgets Empty State ─── */}
      {budgets.length === 0 && !isLoadingBudgets && (
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-16 text-center">
            <div className="empty-state-container inline-flex flex-col items-center">
              <div className="empty-state-illustration inline-flex items-center justify-center h-20 w-20 rounded-2xl mb-4">
                <Target className="h-10 w-10 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {isDa ? 'Ingen budgetter endnu' : 'No budgets yet'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
              {isDa
                ? 'Opret dit første budget for at planlægge og sammenligne dine økonomiske mål med faktiske tal.'
                : 'Create your first budget to plan and compare your financial goals with actual figures.'}
            </p>
            <Button onClick={handleOpenCreate} className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white">
              <Plus className="h-4 w-4" />
              {isDa ? 'Opret budget' : 'Create Budget'}
            </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Loading Detail ─── */}
      {isLoadingDetail && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="stat-card">
                <CardContent className="p-4 sm:p-6">
                  <Skeleton className="h-4 w-28 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Error State ─── */}
      {error && !isLoadingDetail && (
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 sm:p-6 text-center">
            <XCircle className="h-12 w-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
            <Button onClick={() => fetchDetail(selectedYear)} variant="outline" className="gap-2">
              <Loader2 className="h-4 w-4" />
              {isDa ? 'Prøv igen' : 'Try again'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Budget Detail ─── */}
      {detail && !isLoadingDetail && (
        <>
          {/* Budget info bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {detail.budget.name}
              </h2>
              {detail.budget.isActive ? (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20">
                  {isDa ? 'Aktiv' : 'Active'}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-400">
                  {isDa ? 'Inaktiv' : 'Inactive'}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenEdit} className="gap-1.5">
                {isDa ? 'Rediger' : 'Edit'}
              </Button>
              {detail.budget.isActive && (
                <Button variant="outline" size="sm" onClick={handleDelete} className="gap-1.5 text-red-500 hover:text-red-600 hover:border-red-300 dark:hover:border-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                  {isDa ? 'Annuller' : 'Cancel'}
                </Button>
              )}
            </div>
          </div>

          {/* ─── Summary Cards ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Total Budget */}
            <Card className="stat-card card-hover-lift">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDa ? 'Total Budget' : 'Total Budget'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(detail.summary.totalBudget)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                    <Target className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {detail.entries.length} {isDa ? 'konti' : 'accounts'}
                </div>
              </CardContent>
            </Card>

            {/* Total Actual */}
            <Card className="stat-card card-hover-lift">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDa ? 'Faktisk (realiseret)' : 'Actual (Realized)'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(detail.summary.totalActual)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDa ? 'Bogførte beløb i perioden' : 'Posted amounts in period'}
                </div>
              </CardContent>
            </Card>

            {/* Variance */}
            <Card className="stat-card card-hover-lift">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDa ? 'Afvigelse' : 'Variance'}
                    </p>
                    <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                      detail.summary.totalVariance >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {tc(detail.summary.totalVariance)}
                    </p>
                  </div>
                  <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                    detail.summary.totalVariance >= 0 ? 'stat-icon-green' : 'stat-icon-red'
                  }`}>
                    {detail.summary.totalVariance >= 0 ? (
                      <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                    ) : (
                      <TrendingDown className="h-4 w-4 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                </div>
                <div className={`mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm ${
                  detail.summary.totalVariance >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {detail.summary.totalVariance >= 0
                    ? (isDa ? 'Over budget forventet' : 'Above budget expectations')
                    : (isDa ? 'Under budget forventet' : 'Below budget expectations')}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Monthly Chart ─── */}
          {detail.entries.length > 0 && (
            <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#0d9488]" />
                  {isDa ? 'Månedlig sammenligning' : 'Monthly Comparison'}
                  <Badge variant="outline" className="text-xs font-normal">
                    DKK
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12 }}
                        className="text-gray-500 dark:text-gray-400"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => fmtShort(v, language)}
                        className="text-gray-500 dark:text-gray-400"
                      />
                      <Tooltip
                        formatter={(value: number) => [tc(value), '']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          color: 'hsl(var(--popover-foreground))',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 600 }}
                      />
                      <Legend />
                      <Bar
                        dataKey="budget"
                        name={isDa ? 'Budget' : 'Budget'}
                        fill="#94a3b8"
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        dataKey="actual"
                        name={isDa ? 'Faktisk' : 'Actual'}
                        fill="#0d9488"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Budget Detail Table ─── */}
          {detail.entries.length > 0 && (
            <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-[#0d9488]" />
                  {isDa ? 'Budgetdetaljer' : 'Budget Details'}
                  <Badge variant="outline" className="text-xs font-normal">
                    {detail.budget.year}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[500px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                        <TableHead className="w-[80px] sticky left-0 bg-gray-50 dark:bg-white/5 z-10">
                          #
                        </TableHead>
                        <TableHead className="min-w-[140px] sticky left-[80px] bg-gray-50 dark:bg-white/5 z-10">
                          {isDa ? 'Konto' : 'Account'}
                        </TableHead>
                        <TableHead className="hidden md:table-cell w-[80px]">
                          {isDa ? 'Type' : 'Type'}
                        </TableHead>
                        {MONTH_LABELS.map((ml) => (
                          <TableHead key={ml} className="text-center px-1 min-w-[90px]">
                            {ml}
                          </TableHead>
                        ))}
                        <TableHead className="text-right px-2 min-w-[100px]">
                          {isDa ? 'Budget' : 'Budget'}
                        </TableHead>
                        <TableHead className="text-right px-2 min-w-[100px]">
                          {isDa ? 'Faktisk' : 'Actual'}
                        </TableHead>
                        <TableHead className="text-right px-2 min-w-[100px]">
                          {isDa ? 'Afvigelse' : 'Var.'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedEntries.map((group) => (
                        <React.Fragment key={group.type}>
                          {/* Group header row */}
                          <TableRow className={getAccountTypeHeaderBg(group.type)}>
                            <TableCell
                              colSpan={3}
                              className="font-semibold text-gray-900 dark:text-white sticky left-0"
                              style={{ background: undefined }}
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-current" />
                                {group.label}
                              </span>
                            </TableCell>
                            {/* Month subtotals */}
                            {MONTH_LABELS.map((_, idx) => {
                              const monthKey = MONTHS[idx];
                              const budgetSum = group.entries.reduce((s, e) => s + (e.budget[monthKey] || 0), 0);
                              return (
                                <TableCell key={monthKey} className="text-center px-1 text-xs font-mono text-gray-600 dark:text-gray-400">
                                  {budgetSum !== 0 ? fmtShort(budgetSum, language) : '—'}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right px-2 text-xs font-mono font-semibold text-gray-900 dark:text-white">
                              {tc(group.totalBudget)}
                            </TableCell>
                            <TableCell className="text-right px-2 text-xs font-mono font-semibold text-gray-900 dark:text-white">
                              {tc(group.totalActual)}
                            </TableCell>
                            <TableCell className={`text-right px-2 text-xs font-mono font-semibold ${varianceClass(group.totalVariance, group.type)}`}>
                              {group.totalVariance !== 0 ? tc(group.totalVariance) : '—'}
                            </TableCell>
                          </TableRow>

                          {/* Account rows */}
                          {group.entries.map((entry) => (
                            <TableRow className="table-row-teal-hover" key={entry.id}>
                              <TableCell className="font-mono text-xs text-gray-500 dark:text-gray-400 sticky left-0 bg-background">
                                {entry.accountNumber}
                              </TableCell>
                              <TableCell className="font-medium text-gray-900 dark:text-white text-sm sticky left-[80px] bg-background">
                                {entry.accountName}
                                <Badge className={`text-[9px] md:hidden ml-2 px-1 py-0 ${getAccountTypeBadgeClass(entry.accountType)}`}>
                                  {getAccountTypeLabel(entry.accountType, language)}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge className={`text-[10px] ${getAccountTypeBadgeClass(entry.accountType)}`}>
                                  {getAccountTypeLabel(entry.accountType, language)}
                                </Badge>
                              </TableCell>
                              {/* Month cells */}
                              {MONTHS.map((monthKey) => {
                                const b = entry.budget[monthKey] || 0;
                                const a = entry.actual[monthKey] || 0;
                                const v = a - b;
                                return (
                                  <TableCell key={monthKey} className="text-center px-1 py-1.5">
                                    <div className="text-[11px] font-mono text-gray-600 dark:text-gray-400 leading-tight">
                                      {b !== 0 ? fmtShort(b, language) : '—'}
                                    </div>
                                    <div className={`text-[11px] font-mono leading-tight ${v !== 0 ? varianceClass(v, entry.accountType) : 'text-gray-400 dark:text-gray-500'}`}>
                                      {a !== 0 ? fmtShort(a, language) : ''}
                                    </div>
                                  </TableCell>
                                );
                              })}
                              {/* Totals */}
                              <TableCell className="text-right px-2 font-mono text-sm text-gray-700 dark:text-gray-300">
                                {entry.totalBudget !== 0 ? tc(entry.totalBudget) : '—'}
                              </TableCell>
                              <TableCell className="text-right px-2 font-mono text-sm text-gray-700 dark:text-gray-300">
                                {entry.totalActual !== 0 ? tc(entry.totalActual) : '—'}
                              </TableCell>
                              <TableCell className={`text-right px-2 font-mono text-sm font-medium ${varianceClass(entry.totalVariance, entry.accountType)}`}>
                                {entry.totalVariance !== 0 ? tc(entry.totalVariance) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      ))}

                      {/* Grand total row */}
                      <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                        <TableCell colSpan={3} className="text-gray-900 dark:text-white sticky left-0" style={{ background: undefined }}>
                          {isDa ? 'TOTAL' : 'GRAND TOTAL'}
                        </TableCell>
                        {MONTHS.map((monthKey) => {
                          const budgetSum = detail.entries.reduce((s, e) => s + (e.budget[monthKey] || 0), 0);
                          const actualSum = detail.entries.reduce((s, e) => s + (e.actual[monthKey] || 0), 0);
                          const varianceSum = actualSum - budgetSum;
                          return (
                            <TableCell key={monthKey} className="text-center px-1">
                              <div className="text-[11px] font-mono leading-tight">{fmtShort(budgetSum, language)}</div>
                              <div className={`text-[11px] font-mono leading-tight ${varianceSum !== 0 ? (varianceSum >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400') : 'text-gray-400'}`}>
                                {fmtShort(actualSum, language)}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right px-2 font-mono text-sm text-gray-900 dark:text-white">
                          {tc(detail.summary.totalBudget)}
                        </TableCell>
                        <TableCell className="text-right px-2 font-mono text-sm text-gray-900 dark:text-white">
                          {tc(detail.summary.totalActual)}
                        </TableCell>
                        <TableCell className={`text-right px-2 font-mono text-sm ${
                          detail.summary.totalVariance >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {tc(detail.summary.totalVariance)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Notes ─── */}
          {detail.budget.notes && (
            <Card className="info-box-primary">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <p className="font-medium mb-1">{isDa ? 'Noter' : 'Notes'}</p>
                    <p>{detail.budget.notes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Info box ─── */}
          <Card className="info-box-primary">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <p>
                    {isDa
                      ? 'Afvigelsesanalysen sammenligner budgetterede beløb med faktiske poster. Grøn farve betyder positiv afvigelse (indtægter over budget eller udgifter under budget). Rød farve betyder negativ afvigelse.'
                      : 'Variance analysis compares budgeted amounts with actual entries. Green indicates favorable variance (revenue above budget or expenses below budget). Red indicates unfavorable variance.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Create Budget Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#0d9488]" />
              {isDa ? 'Opret nyt budget' : 'Create New Budget'}
            </DialogTitle>
            <DialogDescription>
              {isDa
                ? 'Angiv år og tilføj konti med månedlige budgetbeløb.'
                : 'Enter the year and add accounts with monthly budget amounts.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Year & Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isDa ? 'År' : 'Year'} *</Label>
                <Input
                  type="number"
                  min={2020}
                  max={2030}
                  value={formYear}
                  onChange={(e) => setFormYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                />
              </div>
              <div className="space-y-2">
                <Label>{isDa ? 'Navn' : 'Name'} *</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={isDa ? 'f.eks. Budget 2025' : 'e.g. Budget 2025'}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{isDa ? 'Noter' : 'Notes'} ({isDa ? 'valgfrit' : 'optional'})</Label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={isDa ? 'Tilføj noter til budgettet...' : 'Add notes to the budget...'}
              />
            </div>

            <Separator />

            {/* Account Entries */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  {isDa ? 'Konti og månedlige beløb' : 'Accounts & Monthly Amounts'}
                </Label>
                <Button variant="outline" size="sm" onClick={addFormEntry} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  {isDa ? 'Tilføj konto' : 'Add Account'}
                </Button>
              </div>

              {isLoadingAccounts ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <div className="space-y-4 max-h-[300px] overflow-y-auto">
                  {formEntries.map((entry, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-3">
                        <Select
                          value={entry.accountId}
                          onValueChange={(val) => updateFormEntry(idx, 'accountId', val)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={isDa ? 'Vælg konto...' : 'Select account...'} />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableAccounts(entry.accountId).map((acct) => (
                              <SelectItem key={acct.id} value={acct.id}>
                                <span className="font-mono text-xs mr-2">{acct.number}</span>
                                {acct.name}
                                <Badge className={`text-[9px] ml-2 px-1 py-0 ${getAccountTypeBadgeClass(acct.type)}`}>
                                  {getAccountTypeLabel(acct.type, language)}
                                </Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {formEntries.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeFormEntry(idx)} className="text-red-500 hover:text-red-600 shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {/* 12-month grid */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {MONTH_LABELS.map((label, mi) => {
                          const monthKey = MONTHS[mi];
                          return (
                            <div key={monthKey} className="space-y-1">
                              <Label className="text-[10px] text-gray-500 dark:text-gray-400">{label}</Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                placeholder="0"
                                value={entry[monthKey] || ''}
                                onChange={(e) => updateFormEntry(idx, monthKey, e.target.value)}
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !formName.trim() || !formYear}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isDa ? 'Opret budget' : 'Create Budget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Budget Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-[#0d9488]" />
              {isDa ? 'Rediger budget' : 'Edit Budget'} — {formYear}
            </DialogTitle>
            <DialogDescription>
              {isDa
                ? 'Opdater navn, noter og budgetbeløb for konti.'
                : 'Update name, notes and budget amounts for accounts.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name & Notes */}
            <div className="space-y-2">
              <Label>{isDa ? 'Navn' : 'Name'}</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={isDa ? 'f.eks. Budget 2025' : 'e.g. Budget 2025'}
              />
            </div>
            <div className="space-y-2">
              <Label>{isDa ? 'Noter' : 'Notes'} ({isDa ? 'valgfrit' : 'optional'})</Label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={isDa ? 'Tilføj noter...' : 'Add notes...'}
              />
            </div>

            <Separator />

            {/* Account Entries */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  {isDa ? 'Konti og månedlige beløb' : 'Accounts & Monthly Amounts'}
                </Label>
                <Button variant="outline" size="sm" onClick={addFormEntry} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  {isDa ? 'Tilføj konto' : 'Add Account'}
                </Button>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto">
                {formEntries.map((entry, idx) => (
                  <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Select
                        value={entry.accountId}
                        onValueChange={(val) => updateFormEntry(idx, 'accountId', val)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={isDa ? 'Vælg konto...' : 'Select account...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableAccounts(entry.accountId).map((acct) => (
                            <SelectItem key={acct.id} value={acct.id}>
                              <span className="font-mono text-xs mr-2">{acct.number}</span>
                              {acct.name}
                              <Badge className={`text-[9px] ml-2 px-1 py-0 ${getAccountTypeBadgeClass(acct.type)}`}>
                                {getAccountTypeLabel(acct.type, language)}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formEntries.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeFormEntry(idx)} className="text-red-500 hover:text-red-600 shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {/* 12-month grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {MONTH_LABELS.map((label, mi) => {
                        const monthKey = MONTHS[mi];
                        return (
                          <div key={monthKey} className="space-y-1">
                            <Label className="text-[10px] text-gray-500 dark:text-gray-400">{label}</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              placeholder="0"
                              value={entry[monthKey] || ''}
                              onChange={(e) => updateFormEntry(idx, monthKey, e.target.value)}
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={saving}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isDa ? 'Gem ændringer' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
