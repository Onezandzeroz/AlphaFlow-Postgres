'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/shared/page-header';
import { MobileFilterDropdown } from '@/components/shared/mobile-filter-dropdown';
import {
  FileText,
  Plus,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  Scale,
  BookOpen,
  FileCheck,
  FilePen,
  ArrowRightLeft,
  Info,
  RotateCcw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AccountOption {
  id: string;
  number: string;
  name: string;
  type: string;
}

interface JournalLine {
  id?: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  account?: AccountOption;
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  cancelled: boolean;
  cancelReason: string | null;
  lines: JournalLine[];
}

interface JournalLineInput {
  _key: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
  warning?: string;
}

type StatusFilter = 'ALL' | 'DRAFT' | 'POSTED' | 'CANCELLED';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let lineKeyCounter = 0;
function generateLineKey(): string {
  lineKeyCounter += 1;
  return `line-${Date.now()}-${lineKeyCounter}`;
}

function createEmptyLine(): JournalLineInput {
  return {
    _key: generateLineKey(),
    accountId: '',
    debit: '',
    credit: '',
    description: '',
  };
}

function getStatusBadgeStyle(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20';
    case 'POSTED':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20';
    case 'CANCELLED':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20';
    default:
      return '';
  }
}

function getStatusLabel(status: string, isDanish: boolean): string {
  switch (status) {
    case 'DRAFT':
      return isDanish ? 'Kladde' : 'Draft';
    case 'POSTED':
      return isDanish ? 'Bogført' : 'Posted';
    case 'CANCELLED':
      return isDanish ? 'Annulleret' : 'Cancelled';
    default:
      return status;
  }
}

function formatDateStr(dateStr: string, language: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(
      language === 'da' ? 'da-DK' : 'en-GB',
      { day: '2-digit', month: '2-digit', year: 'numeric' }
    );
  } catch {
    return dateStr;
  }
}

function formatCurrencyValue(value: number, language: string): string {
  if (language === 'da') {
    return value.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface JournalEntriesPageProps {
  user: User;
}

export function JournalEntriesPage({ user }: JournalEntriesPageProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  // ─── State ──────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded entries
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<JournalEntry | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Dialog form fields
  const [formDate, setFormDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formLines, setFormLines] = useState<JournalLineInput[]>([createEmptyLine()]);

  // Account options
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const response = await fetch(`/api/journal-entries?${params.toString()}`);
      if (!response.ok) throw new Error(isDanish ? 'Kunne ikke hente journalposter' : 'Failed to fetch journal entries');
      const data = await response.json();
      setEntries(data.journalEntries || []);
    } catch (err) {
      console.error('Failed to fetch entries:', err);
      setError(err instanceof Error ? err.message : (isDanish ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, isDanish]);

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const response = await fetch('/api/accounts');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Client-side search filter
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.reference?.toLowerCase().includes(q) ||
        e.lines.some(
          (l) =>
            l.description?.toLowerCase().includes(q) ||
            l.account?.number.includes(q) ||
            l.account?.name.toLowerCase().includes(q)
        )
    );
  }, [entries, searchQuery]);

  // ─── Stats ──────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = entries.length;
    const posted = entries.filter((e) => e.status === 'POSTED').length;
    const draft = entries.filter((e) => e.status === 'DRAFT').length;
    const now = new Date();
    const thisMonth = entries.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { total, posted, draft, thisMonth };
  }, [entries]);

  // ─── Dialog Operations ──────────────────────────────────────────────────

  const openNewDialog = useCallback(() => {
    setEditingEntry(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormDescription('');
    setFormReference('');
    setFormLines([createEmptyLine(), createEmptyLine()]);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((entry: JournalEntry) => {
    setEditingEntry(entry);
    setFormDate(entry.date.split('T')[0]);
    setFormDescription(entry.description);
    setFormReference(entry.reference || '');
    setFormLines(
      entry.lines.map((l) => ({
        _key: generateLineKey(),
        accountId: l.accountId,
        debit: l.debit ? String(l.debit) : '',
        credit: l.credit ? String(l.credit) : '',
        description: l.description || '',
      }))
    );
    // Ensure at least 2 lines
    if (entry.lines.length < 2) {
      setFormLines((prev) => [...prev, createEmptyLine()]);
    }
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingEntry(null);
  }, []);

  // ─── Line Management ────────────────────────────────────────────────────

  const updateLine = useCallback((_key: string, field: keyof JournalLineInput, value: string) => {
    setFormLines((prev) =>
      prev.map((l) => {
        if (l._key !== _key) return l;
        const updated = { ...l, [field]: value };
        // Clear opposite field when entering debit/credit
        if (field === 'debit' && value && parseFloat(value) > 0) {
          updated.credit = '';
        }
        if (field === 'credit' && value && parseFloat(value) > 0) {
          updated.debit = '';
        }
        return updated;
      })
    );
  }, []);

  const addLine = useCallback(() => {
    setFormLines((prev) => [...prev, createEmptyLine()]);
  }, []);

  const removeLine = useCallback((_key: string) => {
    setFormLines((prev) => {
      if (prev.length <= 2) return prev; // Minimum 2 lines
      return prev.filter((l) => l._key !== _key);
    });
  }, []);

  // ─── Balance Calculation ───────────────────────────────────────────────

  const balanceInfo = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of formLines) {
      const d = parseFloat(line.debit) || 0;
      const c = parseFloat(line.credit) || 0;
      totalDebit += d;
      totalCredit += c;
    }
    const diff = Math.abs(totalDebit - totalCredit);
    const isBalanced = diff < 0.005;
    const hasBothFields = formLines.some(
      (l) => l.debit && parseFloat(l.debit) > 0 && l.credit && parseFloat(l.credit) > 0
    );
    return { totalDebit, totalCredit, isBalanced, hasBothFields, diff };
  }, [formLines]);

  const canSubmit = useMemo(() => {
    const hasDate = !!formDate;
    const hasDescription = formDescription.trim().length > 0;
    const validLines = formLines.filter(
      (l) => l.accountId && ((parseFloat(l.debit) > 0) || (parseFloat(l.credit) > 0))
    );
    return hasDate && hasDescription && validLines.length >= 2 && balanceInfo.isBalanced && !balanceInfo.hasBothFields;
  }, [formDate, formDescription, formLines, balanceInfo]);

  // ─── Submit ─────────────────────────────────────────────────────────────

  // ─── Post (bogfør) a draft directly from the list ─────────────────────
  const handlePostEntry = useCallback(async (entry: JournalEntry) => {
    try {
      const response = await fetch(`/api/journal-entries/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'POSTED' }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Post failed');
      }
      await fetchEntries();
    } catch (err) {
      console.error('Failed to post entry:', err);
    }
  }, [fetchEntries]);

  const handleSubmit = useCallback(async (asDraft: boolean) => {
    setDialogLoading(true);
    try {
      const payloadLines = formLines
        .filter((l) => l.accountId && ((parseFloat(l.debit) > 0) || (parseFloat(l.credit) > 0)))
        .map((l) => ({
          accountId: l.accountId,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description || undefined,
        }));

      if (payloadLines.length < 2) return;

      if (editingEntry) {
        // Update existing DRAFT entry
        const response = await fetch(`/api/journal-entries/${editingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: formDescription,
            reference: formReference || undefined,
            lines: payloadLines,
            status: asDraft ? undefined : 'POSTED',
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Update failed');
        }
      } else {
        // Create new entry
        const body: Record<string, unknown> = {
          date: formDate,
          description: formDescription,
          lines: payloadLines,
          status: asDraft ? 'DRAFT' : 'POSTED',
        };
        if (formReference.trim()) body.reference = formReference.trim();

        const response = await fetch('/api/journal-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Create failed');
        }
      }

      closeDialog();
      await fetchEntries();
    } catch (err) {
      console.error('Failed to save entry:', err);
    } finally {
      setDialogLoading(false);
    }
  }, [editingEntry, formDate, formDescription, formReference, formLines, closeDialog, fetchEntries]);

  // ─── Cancel Entry ──────────────────────────────────────────────────────

  const handleCancelEntry = useCallback(async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/journal-entries/${cancelTarget.id}?reason=${encodeURIComponent(cancelReason)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Cancel failed');
      setCancelTarget(null);
      setCancelReason('');
      await fetchEntries();
    } catch (err) {
      console.error('Failed to cancel entry:', err);
    } finally {
      setIsCancelling(false);
    }
  }, [cancelTarget, cancelReason, fetchEntries]);

  // ─── Expand/Collapse ───────────────────────────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  }, []);

  const hasActiveFilters = statusFilter !== 'ALL' || dateFrom || dateTo || searchQuery.trim() !== '';

  // ─── Loading Skeleton ───────────────────────────────────────────────────

  if (isLoading && entries.length === 0) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-56 mb-2" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-4">
                <Skeleton className="h-10 w-10 rounded-full mb-2" />
                <Skeleton className="h-3 w-24 mb-1" />
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters skeleton */}
        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-10 w-36" />
            </div>
          </CardContent>
        </Card>

        {/* List skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-0">
            <div className="p-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-100/50 last:border-0">
                  <Skeleton className="h-4 w-20 shrink-0" />
                  <Skeleton className="h-4 w-24 shrink-0" />
                  <Skeleton className="h-6 w-20 shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-8 w-8 shrink-0" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main Render ────────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={isDanish ? 'Finansjournal' : 'Journal Entries'}
        description={isDanish
          ? 'Dobbeltpostering — registrer bilag med debet og kredit'
          : 'Double-entry bookkeeping — record vouchers with debits and credits'}
        action={
          <Button
            onClick={openNewDialog}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] font-medium gap-2 transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
          >
            <Plus className="h-4 w-4" />
            {isDanish ? 'Ny postering' : 'New Entry'}
          </Button>
        }
      />

      {/* Summary Stats */}
      {entries.length > 0 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Entries */}
        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-[#0d9488]/10 flex items-center justify-center">
                <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
              <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] text-[10px] sm:text-xs">
                {stats.total}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'I alt' : 'Total'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          </CardContent>
        </Card>

        {/* Posted */}
        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <FileCheck className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 text-[10px] sm:text-xs">
                {stats.posted}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'Bogførte' : 'Posted'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.posted}</p>
          </CardContent>
        </Card>

        {/* Draft */}
        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <FilePen className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 text-[10px] sm:text-xs">
                {stats.draft}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'Kladder' : 'Drafts'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.draft}</p>
          </CardContent>
        </Card>

        {/* This Month */}
        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-sky-500/10 flex items-center justify-center">
                <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <Badge className="bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 text-[10px] sm:text-xs">
                {stats.thisMonth}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'Denne måned' : 'This Month'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.thisMonth}</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Filter Bar */}
      {entries.length > 0 && (
      <Card className="stat-card">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search - always visible */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                placeholder={
                  isDanish
                    ? 'Søg efter beskrivelse, bilagsnr. eller konto...'
                    : 'Search by description, reference, or account...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-white/5 border-0"
              />
            </div>

            {/* Filters - mobile dropdown / desktop inline */}
            <MobileFilterDropdown
              activeFilterCount={(statusFilter !== 'ALL' ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
              language={isDanish ? 'da' : 'en'}
              onClearFilters={clearFilters}
            >
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="shrink-0 w-auto min-w-[110px] bg-gray-50 dark:bg-white/5 border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                  <SelectItem value="ALL">{isDanish ? 'Alle' : 'All'}</SelectItem>
                  <SelectItem value="DRAFT">{isDanish ? 'Kladde' : 'Draft'}</SelectItem>
                  <SelectItem value="POSTED">{isDanish ? 'Bogført' : 'Posted'}</SelectItem>
                  <SelectItem value="CANCELLED">{isDanish ? 'Annulleret' : 'Cancelled'}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="shrink-0 w-auto min-w-[125px] bg-gray-50 dark:bg-white/5 border-0"
                aria-label={isDanish ? 'Fra dato' : 'From date'}
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="shrink-0 w-auto min-w-[125px] bg-gray-50 dark:bg-white/5 border-0"
                aria-label={isDanish ? 'Til dato' : 'To date'}
              />
            </MobileFilterDropdown>
          </div>

          {/* Results count */}
          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {isDanish ? 'Viser' : 'Showing'} {filteredEntries.length} {isDanish ? 'af' : 'of'} {entries.length} {isDanish ? 'poster' : 'entries'}
            {hasActiveFilters && (
              <span className="ml-2">
                ({isDanish ? 'filtret' : 'filtered'})
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Entries List */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-0">
          {error ? (
            <div className="text-center py-12 text-red-500 dark:text-red-400">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">{error}</p>
              <Button
                variant="link"
                onClick={() => fetchEntries()}
                className="text-[#0d9488] mt-2"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                {isDanish ? 'Prøv igen' : 'Try Again'}
              </Button>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="empty-state-container">
              <div className="empty-state-illustration">
                <div className="empty-state-icon h-16 w-16 rounded-2xl flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {hasActiveFilters
                  ? (isDanish ? 'Ingen poster fundet' : 'No entries found')
                  : (isDanish ? 'Ingen journalposter endnu' : 'No journal entries yet')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm mx-auto">
                {hasActiveFilters
                  ? (isDanish ? 'Prøv at ændre dine filtre' : 'Try adjusting your filters')
                  : (isDanish
                    ? 'Opret din første journalpost for at komme i gang med dobbeltpostering.'
                    : 'Create your first journal entry to get started with double-entry bookkeeping.')}
              </p>
              {!hasActiveFilters && (
                <Button
                  onClick={openNewDialog}
                  className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {isDanish ? 'Opret første postering' : 'Create First Entry'}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filteredEntries.map((entry) => {
                const isExpanded = expandedIds.has(entry.id);
                const entryTotalDebit = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
                const entryTotalCredit = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
                const isEntryBalanced = Math.abs(entryTotalDebit - entryTotalCredit) < 0.005;

                return (
                  <div key={entry.id}>
                    {/* Entry Header Row */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 table-row-teal-hover transition-colors cursor-pointer"
                      onClick={() => toggleExpand(entry.id)}
                    >
                      {/* Expand Toggle */}
                      <button className="shrink-0 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors" aria-label="Toggle">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </button>

                      {/* Date */}
                      <span className="text-sm font-medium text-gray-900 dark:text-white shrink-0 min-w-[90px]">
                        {formatDateStr(entry.date, language)}
                      </span>

                      {/* Reference */}
                      {entry.reference && (
                        <Badge variant="outline" className="text-xs font-mono bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300 shrink-0">
                          {entry.reference}
                        </Badge>
                      )}

                      {/* Description */}
                      <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate min-w-0">
                        {entry.description}
                      </span>

                      {/* Status Badge */}
                      <Badge
                        variant="outline"
                        className={`text-[10px] sm:text-xs font-medium shrink-0 ${getStatusBadgeStyle(entry.status)}`}
                      >
                        {getStatusLabel(entry.status, isDanish)}
                      </Badge>

                      {/* Balance Indicator */}
                      <div className="flex items-center gap-1 text-xs shrink-0">
                        {isEntryBalanced ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="hidden sm:inline text-gray-500 dark:text-gray-400">
                          {formatCurrencyValue(entryTotalDebit, language)} kr
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {entry.status === 'DRAFT' && (
                          <>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(entry)}
                                    className="text-gray-400 hover:text-[#0d9488] dark:hover:text-[#2dd4bf] h-8 w-8 p-0"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isDanish ? 'Rediger' : 'Edit'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePostEntry(entry)}
                                    className="text-gray-400 hover:text-green-600 dark:hover:text-green-400 h-8 w-8 p-0"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isDanish ? 'Bogfør' : 'Post'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setCancelTarget(entry)}
                                    className="text-gray-400 hover:text-red-500 h-8 w-8 p-0"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isDanish ? 'Annuller postering' : 'Cancel Entry'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded Lines */}
                    {isExpanded && (
                      <div className="px-4 pb-4 sm:px-14 journal-entry-expand">
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                          {/* Table Header */}
                          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50/50 dark:bg-white/5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <div className="col-span-4 sm:col-span-5">
                              {isDanish ? 'Konto' : 'Account'}
                            </div>
                            <div className="col-span-3 sm:col-span-2 text-right">
                              {isDanish ? 'Debet' : 'Debit'}
                            </div>
                            <div className="col-span-3 sm:col-span-2 text-right">
                              {isDanish ? 'Kredit' : 'Credit'}
                            </div>
                            <div className="col-span-2 sm:col-span-3 hidden sm:block">
                              {isDanish ? 'Beskrivelse' : 'Description'}
                            </div>
                          </div>

                          {/* Lines */}
                          {entry.lines.map((line, idx) => (
                            <div
                              key={line.id || idx}
                              className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-t border-gray-100/50 dark:border-gray-800"
                            >
                              {/* Account */}
                              <div className="col-span-4 sm:col-span-5">
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {line.account?.number || '—'}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 ml-1.5 text-xs">
                                  {line.account?.name || ''}
                                </span>
                              </div>
                              {/* Debit */}
                              <div className="col-span-3 sm:col-span-2 text-right font-mono text-gray-900 dark:text-white">
                                {line.debit ? formatCurrencyValue(line.debit, language) : ''}
                              </div>
                              {/* Credit */}
                              <div className="col-span-3 sm:col-span-2 text-right font-mono text-gray-900 dark:text-white">
                                {line.credit ? formatCurrencyValue(line.credit, language) : ''}
                              </div>
                              {/* Description */}
                              <div className="col-span-2 sm:col-span-3 text-xs text-gray-500 dark:text-gray-400 hidden sm:block truncate">
                                {line.description || ''}
                              </div>
                            </div>
                          ))}

                          {/* Totals */}
                          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50/30 dark:bg-white/5 border-t border-gray-200 dark:border-gray-700 font-semibold text-sm">
                            <div className="col-span-4 sm:col-span-5 text-gray-700 dark:text-gray-300">
                              {isDanish ? 'I alt' : 'Total'}
                            </div>
                            <div className="col-span-3 sm:col-span-2 text-right font-mono text-gray-900 dark:text-white">
                              {entryTotalDebit > 0 ? formatCurrencyValue(entryTotalDebit, language) : ''}
                            </div>
                            <div className="col-span-3 sm:col-span-2 text-right font-mono text-gray-900 dark:text-white">
                              {entryTotalCredit > 0 ? formatCurrencyValue(entryTotalCredit, language) : ''}
                            </div>
                            <div className="col-span-2 sm:col-span-3 hidden sm:flex items-center justify-end gap-1">
                              {isEntryBalanced ? (
                                <span className="text-green-600 dark:text-green-400 text-xs flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {isDanish ? 'I balance' : 'Balanced'}
                                </span>
                              ) : (
                                <span className="text-red-500 text-xs flex items-center gap-1">
                                  <XCircle className="h-3.5 w-3.5" />
                                  {isDanish ? 'Ikke i balance' : 'Not balanced'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Cancel reason */}
                        {entry.cancelled && entry.cancelReason && (
                          <div className="mt-2 flex items-start gap-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/5 rounded-lg p-2.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>
                              {isDanish ? 'Annulleringsårsag: ' : 'Cancel reason: '}
                              {entry.cancelReason}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── New/Edit Journal Entry Dialog ───────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              <div className="h-9 w-9 rounded-xl bg-[#0d9488]/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
              {editingEntry
                ? (isDanish ? 'Rediger journalpost' : 'Edit Journal Entry')
                : (isDanish ? 'Ny journalpost' : 'New Journal Entry')}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {isDanish
                ? 'Opret en dobbeltpostering med mindst to linjer. Total debet skal være lig med total kredit.'
                : 'Create a double-entry posting with at least two lines. Total debit must equal total credit.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-4 py-4">
              {/* Form Header Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Date */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isDanish ? 'Dato' : 'Date'} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="bg-gray-50 dark:bg-white/5"
                  />
                </div>

                {/* Reference */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isDanish ? 'Bilagsnummer' : 'Reference'}
                    <span className="text-gray-400 dark:text-gray-500 ml-1">({isDanish ? 'valgfrit' : 'optional'})</span>
                  </Label>
                  <Input
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    placeholder={isDanish ? 'f.eks. KE-001' : 'e.g. KE-001'}
                    className="bg-gray-50 dark:bg-white/5"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isDanish ? 'Beskrivelse' : 'Description'} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={isDanish ? 'f.eks. Betaling til leverandør' : 'e.g. Payment to supplier'}
                    className="bg-gray-50 dark:bg-white/5"
                  />
                </div>
              </div>

              <Separator className="dark:bg-gray-800" />

              {/* Lines Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-[#0d9488]" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {isDanish ? 'Posteringslinjer' : 'Entry Lines'}
                  </span>
                  <Badge variant="outline" className="text-xs font-normal">
                    {formLines.length} {isDanish ? 'linjer' : 'lines'}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                  className="gap-1 text-[#0d9488] border-[#0d9488]/20 hover:bg-[#0d9488]/5 dark:border-[#0d9488]/30 dark:text-[#2dd4bf]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isDanish ? 'Tilføj linje' : 'Add Line'}
                </Button>
              </div>

              {/* Double-entry info box */}
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-[#0d9488]/5 dark:bg-[#0d9488]/10 rounded-lg p-2.5 border border-[#0d9488]/10 dark:border-[#0d9488]/20">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                <p>
                  {isDanish
                    ? 'Hver linje skal have enten debet eller kredit (ikke begge). Mindst to linjer er påkrævet, og total debet skal være lig med total kredit.'
                    : 'Each line should have either debit or credit (not both). At least two lines are required, and total debit must equal total credit.'}
                </p>
              </div>

              {/* Lines */}
              <div className="space-y-2">
                {/* Desktop header */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/50 dark:bg-white/5 rounded-md">
                  <div className="col-span-5">
                    {isDanish ? 'Konto' : 'Account'} <span className="text-red-500">*</span>
                  </div>
                  <div className="col-span-2 text-right">
                    {isDanish ? 'Debet' : 'Debit'}
                  </div>
                  <div className="col-span-2 text-right">
                    {isDanish ? 'Kredit' : 'Credit'}
                  </div>
                  <div className="col-span-2">
                    {isDanish ? 'Tekst' : 'Note'}
                  </div>
                  <div className="col-span-1" />
                </div>

                {formLines.map((line, idx) => {
                  const hasBoth = line.debit && parseFloat(line.debit) > 0 && line.credit && parseFloat(line.credit) > 0;
                  return (
                    <div
                      key={line._key}
                      className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-2 p-2 sm:p-0 rounded-lg sm:rounded-none transition-colors ${
                        hasBoth
                          ? 'bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20'
                          : 'bg-gray-50 dark:bg-white/5 sm:bg-transparent sm:dark:bg-transparent'
                      }`}
                    >
                      {/* Account Select */}
                      <div className="sm:col-span-5 sm:px-1">
                        {idx === 0 && (
                          <Label className="sm:hidden text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">
                            {isDanish ? 'Konto' : 'Account'} <span className="text-red-500">*</span>
                          </Label>
                        )}
                        <Select
                          value={line.accountId}
                          onValueChange={(v) => updateLine(line._key, 'accountId', v)}
                        >
                          <SelectTrigger className="bg-white dark:bg-[#1a1f1e] text-sm h-9">
                            <SelectValue placeholder={accountsLoading
                              ? (isDanish ? 'Indlæser...' : 'Loading...')
                              : (isDanish ? 'Vælg konto...' : 'Select account...')
                            } />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-[#1a1f1e] max-h-60">
                            {accounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                <span className="font-mono text-xs mr-2 text-gray-500 dark:text-gray-400">{acc.number}</span>
                                {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Debit */}
                      <div className="sm:col-span-2 sm:px-1">
                        {idx === 0 && (
                          <Label className="sm:hidden text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">
                            {isDanish ? 'Debet' : 'Debit'}
                          </Label>
                        )}
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit}
                          onChange={(e) => updateLine(line._key, 'debit', e.target.value)}
                          placeholder="0,00"
                          className="bg-white dark:bg-[#1a1f1e] text-sm h-9 text-right font-mono"
                        />
                      </div>

                      {/* Credit */}
                      <div className="sm:col-span-2 sm:px-1">
                        {idx === 0 && (
                          <Label className="sm:hidden text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">
                            {isDanish ? 'Kredit' : 'Credit'}
                          </Label>
                        )}
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.credit}
                          onChange={(e) => updateLine(line._key, 'credit', e.target.value)}
                          placeholder="0,00"
                          className="bg-white dark:bg-[#1a1f1e] text-sm h-9 text-right font-mono"
                        />
                      </div>

                      {/* Description */}
                      <div className="sm:col-span-2 sm:px-1">
                        {idx === 0 && (
                          <Label className="sm:hidden text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">
                            {isDanish ? 'Tekst' : 'Note'}
                          </Label>
                        )}
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line._key, 'description', e.target.value)}
                          placeholder={isDanish ? 'Valgfrit' : 'Optional'}
                          className="bg-white dark:bg-[#1a1f1e] text-sm h-9"
                        />
                      </div>

                      {/* Remove Button */}
                      <div className="sm:col-span-1 flex items-center justify-end sm:justify-center">
                        {formLines.length > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(line._key)}
                            className="text-gray-400 hover:text-red-500 h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Warning: both debit and credit filled */}
                      {hasBoth && (
                        <div className="col-span-full sm:col-span-12 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 px-1">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {isDanish
                            ? 'Advarsel: Både debet og kredit er udfyldt. Normalt skal kun ét felt have et beløb.'
                            : 'Warning: Both debit and credit are filled. Usually only one field should have an amount.'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Separator className="dark:bg-gray-800" />

              {/* Balance Indicator */}
              <div className={`rounded-lg border p-4 space-y-2 ${
                balanceInfo.isBalanced && !balanceInfo.hasBothFields
                  ? 'border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5'
                  : 'border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {isDanish ? 'Balancekontrol' : 'Balance Check'}
                    </span>
                  </div>
                  {balanceInfo.isBalanced && !balanceInfo.hasBothFields ? (
                    <span className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {isDanish ? 'I balance' : 'Balanced'}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-red-500 flex items-center gap-1">
                      <XCircle className="h-4 w-4" />
                      {isDanish ? 'Ikke i balance' : 'Not balanced'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-right">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Total Debet' : 'Total Debit'}
                    </span>
                    <p className={`text-lg font-bold font-mono ${
                      balanceInfo.isBalanced && !balanceInfo.hasBothFields
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {formatCurrencyValue(balanceInfo.totalDebit, language)} kr
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Total Kredit' : 'Total Credit'}
                    </span>
                    <p className={`text-lg font-bold font-mono ${
                      balanceInfo.isBalanced && !balanceInfo.hasBothFields
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {formatCurrencyValue(balanceInfo.totalCredit, language)} kr
                    </p>
                  </div>
                </div>
                {!balanceInfo.isBalanced && (balanceInfo.totalDebit > 0 || balanceInfo.totalCredit > 0) && (
                  <p className="text-xs text-red-500 text-center">
                    {isDanish
                      ? `Forskel: ${formatCurrencyValue(balanceInfo.diff, language)} kr`
                      : `Difference: ${formatCurrencyValue(balanceInfo.diff, language)} kr`}
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={dialogLoading}
              className="dark:bg-white/5 dark:text-gray-300"
            >
              {isDanish ? 'Annuller' : 'Cancel'}
            </Button>

            {/* Save as Draft — always visible */}
            <Button
              variant="outline"
              onClick={() => handleSubmit(true)}
              disabled={dialogLoading || formLines.filter((l) => l.accountId).length < 2}
              className="gap-1 dark:text-gray-300"
            >
              {dialogLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FilePen className="h-4 w-4" />
              )}
              {editingEntry
                ? (isDanish ? 'Opdater kladde' : 'Update Draft')
                : (isDanish ? 'Gem som kladde' : 'Save as Draft')}
            </Button>

            {/* Post (Bogfør) — creates or updates as POSTED */}
            <Button
              onClick={() => handleSubmit(false)}
              disabled={!canSubmit || dialogLoading}
              className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-1"
            >
              {dialogLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileCheck className="h-4 w-4" />
              )}
              {isDanish ? 'Bogfør' : 'Post Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) { setCancelTarget(null); setCancelReason(''); } }}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {isDanish ? 'Annuller journalpost?' : 'Cancel Journal Entry?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {isDanish
                    ? 'Er du sikker på, at du vil annullere denne journalpost? I henhold til bogføringsloven slettes data ikke — posteringen markeres som annulleret og bevares i revisionsloggen.'
                    : 'Are you sure you want to cancel this journal entry? Per the Bookkeeping Act, data is never deleted — the entry is marked as cancelled and preserved in the audit log.'}
                </p>

                {cancelTarget && (
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Dato' : 'Date'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatDateStr(cancelTarget.date, language)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Beskrivelse' : 'Description'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                        {cancelTarget.description}
                      </span>
                    </div>
                  </div>
                )}

                {/* Reason input */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isDanish ? 'Årsag til annullering' : 'Reason for cancellation'} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder={isDanish ? 'Angiv årsag...' : 'Enter reason...'}
                    className="bg-gray-50 dark:bg-white/5"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="dark:bg-white/5 dark:text-gray-300" onClick={() => { setCancelTarget(null); setCancelReason(''); }}>
              {isDanish ? 'Tilbage' : 'Back'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelEntry}
              disabled={!cancelReason.trim() || isCancelling}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isDanish ? 'Annullerer...' : 'Cancelling...'}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDanish ? 'Annuller postering' : 'Cancel Entry'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
