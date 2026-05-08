'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Landmark,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  Link2,
  Unlink,
  CalendarDays,
  Loader2,
  Download,
  RefreshCw,
  Info,
  FileText,
  Search,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { OpenBankingSection } from '@/components/bank-reconciliation/open-banking-section';

// ──────────────── Types ────────────────

interface BankLine {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  balance: number;
  reconciliationStatus: 'MATCHED' | 'UNMATCHED' | 'MANUAL';
  matchedJournalLineId: string | null;
  matchedJournalEntry?: {
    id: string;
    date: string;
    description: string;
    accountNumber: string;
    accountName: string;
    amount: number;
  };
}

interface BankStatement {
  id: string;
  bankAccount: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  reconciled: boolean;
  lines: BankLine[];
}

interface CandidateJournalLine {
  id: string;
  journalEntryId: string;
  date: string;
  description: string;
  accountNumber: string;
  accountName: string;
  amount: number;
}

interface BankReconciliationData {
  bankStatements: BankStatement[];
}

interface ImportParsedLine {
  date: string;
  description: string;
  reference: string;
  amount: number;
  balance: number;
}

interface BankReconciliationPageProps {
  user: User;
}

// ──────────────── Component ────────────────

export function BankReconciliationPage({ user }: BankReconciliationPageProps) {
  const [data, setData] = useState<BankReconciliationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t, tc, language } = useTranslation();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCHED' | 'UNMATCHED'>('ALL');

  // Expanded statements
  const [expandedStatements, setExpandedStatements] = useState<Set<string>>(new Set());

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importBankAccount, setImportBankAccount] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importParsedLines, setImportParsedLines] = useState<ImportParsedLine[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Manual match dialog state
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedBankLine, setSelectedBankLine] = useState<BankLine | null>(null);
  const [candidateLines, setCandidateLines] = useState<CandidateJournalLine[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isMatching, setIsMatching] = useState(false);

  // Unmatch dialog
  const [unmatchDialogOpen, setUnmatchDialogOpen] = useState(false);
  const [bankLineToUnmatch, setBankLineToUnmatch] = useState<BankLine | null>(null);
  const [isUnmatching, setIsUnmatching] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ──────────────── Fetch data ────────────────

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/bank-reconciliation');
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch bank reconciliation:', err);
      setError(
        language === 'da'
          ? 'Kunne ikke hente bankafstemningsdata'
          : 'Failed to fetch bank reconciliation data'
      );
    }
  }, [language]);

  const fetchAndSetLoading = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    await fetchData();
    if (showRefreshing) {
      setIsRefreshing(false);
    } else {
      setIsLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchAndSetLoading();
  }, [fetchAndSetLoading]);

  // ──────────────── Computed stats ────────────────

  const stats = useMemo(() => {
    if (!data) return { totalStatements: 0, matchedCount: 0, unmatchedCount: 0, totalAmount: 0 };

    const allLines = data.bankStatements.flatMap((s) => s.lines);
    const matchedCount = allLines.filter((l) => l.reconciliationStatus === 'MATCHED' || l.reconciliationStatus === 'MANUAL').length;
    const unmatchedCount = allLines.filter((l) => l.reconciliationStatus === 'UNMATCHED').length;
    const totalAmount = allLines.reduce((sum, l) => sum + l.amount, 0);

    return {
      totalStatements: data.bankStatements.length,
      matchedCount,
      unmatchedCount,
      totalAmount,
    };
  }, [data]);

  // ──────────────── Filter logic ────────────────

  const filteredStatements = useMemo(() => {
    if (!data) return [];

    return data.bankStatements.map((statement) => {
      let filteredLines = [...statement.lines];

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredLines = filteredLines.filter(
          (line) =>
            line.description.toLowerCase().includes(q) ||
            line.reference.toLowerCase().includes(q)
        );
      }

      if (statusFilter !== 'ALL') {
        filteredLines = filteredLines.filter(
          (line) => statusFilter === 'MATCHED'
            ? line.reconciliationStatus === 'MATCHED' || line.reconciliationStatus === 'MANUAL'
            : line.reconciliationStatus === statusFilter
        );
      }

      return { ...statement, lines: filteredLines };
    });
  }, [data, searchQuery, statusFilter]);

  // ──────────────── Expand / collapse ────────────────

  const toggleStatement = useCallback((statementId: string) => {
    setExpandedStatements((prev) => {
      const next = new Set(prev);
      if (next.has(statementId)) {
        next.delete(statementId);
      } else {
        next.add(statementId);
      }
      return next;
    });
  }, []);

  // ──────────────── CSV parsing ────────────────

  const parseCSVFile = useCallback((file: File) => {
    setIsParsing(true);
    setImportParsedLines([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = text
          .split('\n')
          .map((r) => r.trim())
          .filter((r) => r.length > 0);

        if (rows.length === 0) {
          setIsParsing(false);
          return;
        }

        const parsed: ImportParsedLine[] = [];
        // Skip potential header row
        const startIdx = isNaN(Date.parse(rows[0].split(/[,;\t]/)[0])) ? 1 : 0;

        for (let i = startIdx; i < rows.length; i++) {
          const parts = rows[i].split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
          if (parts.length >= 5) {
            const dateStr = parts[0];
            const desc = parts[1] || '';
            const ref = parts[2] || '';
            const amount = parseFloat(parts[3].replace(',', '.')) || 0;
            const balance = parseFloat(parts[4].replace(',', '.')) || 0;

            // Validate date
            if (!isNaN(Date.parse(dateStr))) {
              parsed.push({ date: dateStr, description: desc, reference: ref, amount, balance });
            }
          } else if (parts.length >= 4) {
            const dateStr = parts[0];
            const desc = parts[1] || '';
            const ref = parts[2] || '';
            const amount = parseFloat(parts[3].replace(',', '.')) || 0;

            if (!isNaN(Date.parse(dateStr))) {
              const runningBalance = parsed.length > 0
                ? parsed[parsed.length - 1].balance + amount
                : amount;
              parsed.push({ date: dateStr, description: desc, reference: ref, amount, balance: runningBalance });
            }
          }
        }

        setImportParsedLines(parsed);
      } catch (err) {
        console.error('Failed to parse CSV:', err);
      } finally {
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
      setIsParsing(false);
    };

    reader.readAsText(file);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setImportFile(file);
        parseCSVFile(file);
      }
    },
    [parseCSVFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
        setImportFile(file);
        parseCSVFile(file);
      }
    },
    [parseCSVFile]
  );

  const resetImportDialog = useCallback(() => {
    setImportBankAccount('');
    setImportFile(null);
    setImportParsedLines([]);
    setSelectedCandidateId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleImportDialogClose = useCallback(
    (open: boolean) => {
      setImportDialogOpen(open);
      if (!open) {
        resetImportDialog();
      }
    },
    [resetImportDialog]
  );

  const handleImport = useCallback(async () => {
    if (!importBankAccount || importParsedLines.length === 0) return;

    setIsImporting(true);
    try {
      const response = await fetch('/api/bank-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccount: importBankAccount,
          lines: importParsedLines,
        }),
      });

      if (!response.ok) throw new Error('Import failed');

      const result = await response.json();
      setImportDialogOpen(false);
      resetImportDialog();
      await fetchAndSetLoading(true);
    } catch (err) {
      console.error('Failed to import:', err);
    } finally {
      setIsImporting(false);
    }
  }, [importBankAccount, importParsedLines, fetchAndSetLoading, resetImportDialog]);

  // ──────────────── Match / Unmatch ────────────────

  const openMatchDialog = useCallback(async (bankLine: BankLine) => {
    setSelectedBankLine(bankLine);
    setSelectedCandidateId(null);
    setMatchDialogOpen(true);
    setIsLoadingCandidates(true);

    try {
      const response = await fetch(
        `/api/bank-reconciliation?action=candidates&bankLineId=${bankLine.id}`
      );
      if (response.ok) {
        const result = await response.json();
        setCandidateLines(result.candidates || []);
      } else {
        setCandidateLines([]);
      }
    } catch (err) {
      console.error('Failed to load candidates:', err);
      setCandidateLines([]);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, []);

  const handleConfirmMatch = useCallback(async () => {
    if (!selectedBankLine || !selectedCandidateId) return;

    setIsMatching(true);
    try {
      const response = await fetch('/api/bank-reconciliation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankLineId: selectedBankLine.id,
          journalLineId: selectedCandidateId,
          action: 'match',
        }),
      });

      if (!response.ok) throw new Error('Match failed');

      setMatchDialogOpen(false);
      setSelectedBankLine(null);
      setSelectedCandidateId(null);
      await fetchAndSetLoading(true);
    } catch (err) {
      console.error('Failed to match:', err);
    } finally {
      setIsMatching(false);
    }
  }, [selectedBankLine, selectedCandidateId, fetchAndSetLoading]);

  const handleOpenUnmatch = useCallback((bankLine: BankLine) => {
    setBankLineToUnmatch(bankLine);
    setUnmatchDialogOpen(true);
  }, []);

  const handleConfirmUnmatch = useCallback(async () => {
    if (!bankLineToUnmatch) return;

    setIsUnmatching(true);
    try {
      const response = await fetch('/api/bank-reconciliation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankLineId: bankLineToUnmatch.id,
          action: 'unmatch',
        }),
      });

      if (!response.ok) throw new Error('Unmatch failed');

      setUnmatchDialogOpen(false);
      setBankLineToUnmatch(null);
      await fetchAndSetLoading(true);
    } catch (err) {
      console.error('Failed to unmatch:', err);
    } finally {
      setIsUnmatching(false);
    }
  }, [bankLineToUnmatch, fetchAndSetLoading]);

  // ──────────────── Loading skeleton ────────────────

  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>

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

        {/* Filter bar skeleton */}
        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>

        {/* Statements list skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ──────────────── Error state ────────────────

  if (error) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <PageHeader
          title={language === 'da' ? 'Bankafstemning' : 'Bank Reconciliation'}
          description={language === 'da'
            ? 'Match banktransaktioner med finansjournalen'
            : 'Match bank transactions against journal entries'}
        />
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 sm:p-6 text-center">
            <XCircle className="h-12 w-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
            <Button
              onClick={() => fetchAndSetLoading(true)}
              variant="outline"
              className="gap-2"
            >
              <Loader2 className="h-4 w-4" />
              {language === 'da' ? 'Prøv igen' : 'Try again'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ──────────────── Main render ────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title={language === 'da' ? 'Bankafstemning' : 'Bank Reconciliation'}
        description={language === 'da'
          ? 'Match banktransaktioner med finansjournalen'
          : 'Match bank transactions against journal entries'}
        action={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setImportDialogOpen(true)}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
            >
              <Upload className="h-4 w-4" />
              {language === 'da' ? 'Importer CSV' : 'Import CSV'}
            </Button>
            <Button
              onClick={() => fetchAndSetLoading(true)}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {language === 'da' ? 'Opdater' : 'Refresh'}
              </span>
            </Button>
          </div>
        }
      />

      {/* ── Summary Stats ── */}
      {data && data.bankStatements.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Statements */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Kontoudtog' : 'Statements'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {stats.totalStatements}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                  <FileText className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
              </div>
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                <Landmark className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {language === 'da'
                  ? `${data.bankStatements.length} udtræk`
                  : `${data.bankStatements.length} extracts`}
              </div>
            </CardContent>
          </Card>

          {/* Matched */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Matchet' : 'Matched'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-0.5 sm:mt-1">
                    {stats.matchedCount}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {language === 'da' ? 'Afstemte linjer' : 'Reconciled lines'}
              </div>
            </CardContent>
          </Card>

          {/* Unmatched */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Uafstemt' : 'Unmatched'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-0.5 sm:mt-1">
                    {stats.unmatchedCount}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-red flex items-center justify-center">
                  <XCircle className="h-4 w-4 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-red-600 dark:text-red-400">
                <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {language === 'da' ? 'Kræver handling' : 'Requires action'}
              </div>
            </CardContent>
          </Card>

          {/* Total Amount */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Total beløb' : 'Total Amount'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {tc(stats.totalAmount)}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                  <Landmark className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                <ArrowUpDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {language === 'da' ? 'Samlet bevægelse' : 'Total movement'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Open Banking Section ── */}
      <OpenBankingSection
        user={user}
        onSyncComplete={() => fetchAndSetLoading(true)}
      />

      {/* ── Filter Bar ── */}
      {data && data.bankStatements.length > 0 && (
      <Card className="stat-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  language === 'da'
                    ? 'Søg på tekst eller reference...'
                    : 'Search by description or reference...'
                }
                className="pl-9 bg-gray-50 dark:bg-white/5 border-0"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'ALL' | 'MATCHED' | 'UNMATCHED')}>
              <SelectTrigger className="shrink-0 w-auto min-w-[120px] bg-gray-50 dark:bg-white/5 border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">
                    {language === 'da' ? 'Alle' : 'All'}
                  </SelectItem>
                  <SelectItem value="UNMATCHED">
                    {language === 'da' ? 'Uafstemte' : 'Unmatched'}
                  </SelectItem>
                  <SelectItem value="MATCHED">
                    {language === 'da' ? 'Matchede' : 'Matched'}
                  </SelectItem>
                </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ── Empty state ── */}
      {data && data.bankStatements.length === 0 && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-12 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 dark:bg-white/5 mb-4">
              <Landmark className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {language === 'da'
                ? 'Ingen bankkontoudtog'
                : 'No bank statements'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
              {language === 'da'
                ? 'Importer dit første kontoudtog fra banken for at starte afstemningen. Understøtter CSV-format.'
                : 'Import your first bank statement to begin reconciliation. Supports CSV format.'}
            </p>
            <Button
              onClick={() => setImportDialogOpen(true)}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              <Upload className="h-4 w-4" />
              {language === 'da' ? 'Importer kontoudtog' : 'Import statement'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Bank Statements List ── */}
      {data && data.bankStatements.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#0d9488]" />
              {language === 'da' ? 'Bankkontoudtog' : 'Bank Statements'}
              <Badge variant="outline" className="text-xs font-normal">
                {filteredStatements.length}{' '}
                {language === 'da' ? 'udtræk' : 'extracts'}
              </Badge>
            </h2>
          </div>

          {filteredStatements.length === 0 && data.bankStatements.length > 0 && (
            <Card className="stat-card">
              <CardContent className="py-8 text-center">
                <Search className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  {language === 'da'
                    ? 'Ingen resultater matcher dine filtre'
                    : 'No results match your filters'}
                </p>
              </CardContent>
            </Card>
          )}

          {filteredStatements.map((statement) => {
            const isExpanded = expandedStatements.has(statement.id);
            const matchedLines = statement.lines.filter(
              (l) => l.reconciliationStatus === 'MATCHED' || l.reconciliationStatus === 'MANUAL'
            ).length;
            const totalLines = statement.lines.length;
            const allMatched = totalLines > 0 && matchedLines === totalLines;

            return (
              <Card
                key={statement.id}
                className="stat-card border-0 shadow-lg dark:border dark:border-white/5"
              >
                <Collapsible
                  open={isExpanded}
                  onOpenChange={() => toggleStatement(statement.id)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 rounded-t-lg transition-colors">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            allMatched
                              ? 'bg-green-500/10'
                              : matchedLines > 0
                                ? 'bg-amber-500/10'
                                : 'bg-gray-100 dark:bg-white/5'
                          }`}>
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                            )}
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-2 flex-wrap">
                              <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
                                {language === 'da' ? 'Konto' : 'Account'}{' '}
                                <span className="font-mono">{statement.bankAccount}</span>
                              </CardTitle>
                              <Badge
                                className={`text-[10px] ${
                                  allMatched
                                    ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20'
                                    : matchedLines > 0
                                      ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20'
                                      : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20'
                                }`}
                              >
                                {matchedLines}/{totalLines}{' '}
                                {language === 'da' ? 'afstemt' : 'matched'}
                              </Badge>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                              <CalendarDays className="h-3 w-3" />
                              {statement.startDate} — {statement.endDate}
                            </p>
                          </div>
                        </div>
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {language === 'da' ? 'Saldo' : 'Balance'}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white font-mono">
                            {tc(statement.openingBalance)} → {tc(statement.closingBalance)}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {statement.lines.length === 0 ? (
                        <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                          {language === 'da'
                            ? 'Ingen linjer matcher de valgte filtre'
                            : 'No lines match the selected filters'}
                        </div>
                      ) : (
                        <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10">
                                <TableHead className="w-[100px] sm:w-[110px]">
                                  {language === 'da' ? 'Dato' : 'Date'}
                                </TableHead>
                                <TableHead>
                                  {language === 'da' ? 'Tekst' : 'Description'}
                                </TableHead>
                                <TableHead className="hidden sm:table-cell w-[120px]">
                                  {language === 'da' ? 'Reference' : 'Reference'}
                                </TableHead>
                                <TableHead className="text-right w-[120px]">
                                  {language === 'da' ? 'Beløb' : 'Amount'}
                                </TableHead>
                                <TableHead className="text-right hidden md:table-cell w-[120px]">
                                  {language === 'da' ? 'Saldo' : 'Balance'}
                                </TableHead>
                                <TableHead className="w-[100px] text-center">
                                  {language === 'da' ? 'Status' : 'Status'}
                                </TableHead>
                                <TableHead className="w-[90px]" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {statement.lines.map((line) => (
                                <TableRow key={line.id}>
                                  <TableCell className="font-mono text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                    {line.date}
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                      {line.description}
                                    </div>
                                    {/* Show reference on mobile */}
                                    <span className="sm:hidden text-xs text-gray-500 dark:text-gray-400 font-mono">
                                      {line.reference}
                                    </span>
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell font-mono text-xs text-gray-500 dark:text-gray-400">
                                    {line.reference || '—'}
                                  </TableCell>
                                  <TableCell
                                    className={`text-right font-mono text-sm ${
                                      line.amount >= 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                    }`}
                                  >
                                    {line.amount >= 0 ? '+' : ''}
                                    {tc(line.amount)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
                                    {tc(line.balance)}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {line.reconciliationStatus === 'MATCHED' || line.reconciliationStatus === 'MANUAL' ? (
                                      <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1 text-[10px]">
                                        <CheckCircle2 className="h-3 w-3" />
                                        <span className="hidden sm:inline">
                                          {language === 'da' ? 'Matchet' : 'Matched'}
                                        </span>
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20 gap-1 text-[10px]">
                                        <XCircle className="h-3 w-3" />
                                        <span className="hidden sm:inline">
                                          {language === 'da' ? 'Uafstemt' : 'Unmatched'}
                                        </span>
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {line.reconciliationStatus === 'MATCHED' || line.reconciliationStatus === 'MANUAL' ? (
                                      <div className="flex items-center gap-1">
                                        {line.matchedJournalEntry && (
                                          <Badge
                                            variant="outline"
                                            className="hidden lg:inline-flex text-[9px] gap-1 border-green-500/20 text-green-600 dark:text-green-400"
                                          >
                                            <Link2 className="h-2.5 w-2.5" />
                                            {line.matchedJournalEntry.accountNumber}
                                          </Badge>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0 text-gray-400 dark:text-gray-500 hover:text-red-500"
                                          onClick={() => handleOpenUnmatch(line)}
                                          title={
                                            language === 'da'
                                              ? 'Fjern afstemning'
                                              : 'Remove match'
                                          }
                                        >
                                          <Unlink className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-[11px] gap-1 text-[#0d9488] hover:text-[#0f766e] hover:bg-[#0d9488]/10"
                                        onClick={() => openMatchDialog(line)}
                                      >
                                        <Link2 className="h-3 w-3" />
                                        {language === 'da' ? 'Match' : 'Match'}
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Import Dialog ── */}
      <Dialog open={importDialogOpen} onOpenChange={handleImportDialogClose}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-[#0d9488]" />
              {language === 'da'
                ? 'Importer bankkontoudtog'
                : 'Import Bank Statement'}
            </DialogTitle>
            <DialogDescription>
              {language === 'da'
                ? 'Upload en CSV-fil med banktransaktioner. Format: dato, tekst, reference, beløb, saldo.'
                : 'Upload a CSV file with bank transactions. Format: date, description, reference, amount, balance.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Bank account */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {language === 'da' ? 'Bankkonto (kontonr.)' : 'Bank Account (account no.)'}
              </Label>
              <Input
                value={importBankAccount}
                onChange={(e) => setImportBankAccount(e.target.value)}
                placeholder={language === 'da' ? 'f.eks. 1100' : 'e.g. 1100'}
                className="bg-gray-50 dark:bg-white/5 border-0"
              />
            </div>

            {/* File upload area */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {language === 'da' ? 'CSV-fil' : 'CSV File'}
              </Label>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-[#0d9488] dark:hover:border-[#2dd4bf] transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {isParsing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 text-[#0d9488] animate-spin" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Analyserer fil...' : 'Parsing file...'}
                    </p>
                  </div>
                ) : importFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-green-500" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {importFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {importParsedLines.length}{' '}
                      {language === 'da' ? 'linjer fundet' : 'lines found'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da'
                        ? 'Træk og slip CSV-fil her, eller klik for at vælge'
                        : 'Drag and drop CSV file here, or click to select'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview of parsed lines */}
            {importParsedLines.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  {language === 'da' ? 'Forhåndsvisning' : 'Preview'} ({importParsedLines.length}{' '}
                  {language === 'da' ? 'linjer' : 'lines'})
                </Label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10">
                        <TableHead className="w-[90px] text-xs">
                          {language === 'da' ? 'Dato' : 'Date'}
                        </TableHead>
                        <TableHead className="text-xs">
                          {language === 'da' ? 'Tekst' : 'Description'}
                        </TableHead>
                        <TableHead className="text-right text-xs w-[90px]">
                          {language === 'da' ? 'Beløb' : 'Amount'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importParsedLines.slice(0, 20).map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs text-gray-600 dark:text-gray-400">
                            {line.date}
                          </TableCell>
                          <TableCell className="text-xs text-gray-900 dark:text-white truncate max-w-[200px]">
                            {line.description}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs ${
                            line.amount >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {tc(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {importParsedLines.length > 20 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-xs text-gray-500 dark:text-gray-400 py-2">
                            ... {language === 'da' ? 'og' : 'and'}{' '}
                            {importParsedLines.length - 20}{' '}
                            {language === 'da' ? 'flere linjer' : 'more lines'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleImportDialogClose(false)}
            >
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importBankAccount || importParsedLines.length === 0 || isImporting}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {language === 'da' ? 'Importer' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual Match Dialog ── */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-[#0d9488]" />
              {language === 'da' ? 'Match banklinje' : 'Match Bank Line'}
            </DialogTitle>
            <DialogDescription>
              {language === 'da'
                ? 'Vælg en finansjournal-linje at matche med banktransaktionen.'
                : 'Select a journal entry line to match with the bank transaction.'}
            </DialogDescription>
          </DialogHeader>

          {selectedBankLine && (
            <div className="space-y-4">
              {/* Bank line details */}
              <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-4 space-y-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {language === 'da' ? 'Banktransaktion' : 'Bank Transaction'}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Dato' : 'Date'}:{' '}
                    </span>
                    <span className="text-gray-900 dark:text-white font-mono">
                      {selectedBankLine.date}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Beløb' : 'Amount'}:{' '}
                    </span>
                    <span
                      className={`font-mono font-medium ${
                        selectedBankLine.amount >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {tc(selectedBankLine.amount)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Tekst' : 'Description'}:{' '}
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {selectedBankLine.description}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Reference' : 'Reference'}:{' '}
                    </span>
                    <span className="text-gray-900 dark:text-white font-mono">
                      {selectedBankLine.reference || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Candidate lines */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <ArrowUpDown className="h-4 w-4 text-[#0d9488]" />
                  {language === 'da'
                    ? 'Forslag fra finansjournal'
                    : 'Journal Entry Candidates'}
                </h4>
                {isLoadingCandidates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-[#0d9488] animate-spin" />
                  </div>
                ) : candidateLines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da'
                        ? 'Ingen matchende finansposter fundet'
                        : 'No matching journal entries found'}
                    </p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10">
                          <TableHead className="w-[40px]" />
                          <TableHead className="w-[90px] text-xs">
                            {language === 'da' ? 'Dato' : 'Date'}
                          </TableHead>
                          <TableHead className="text-xs">
                            {language === 'da' ? 'Tekst' : 'Description'}
                          </TableHead>
                          <TableHead className="hidden sm:table-cell text-xs w-[80px]">
                            {language === 'da' ? 'Konto' : 'Account'}
                          </TableHead>
                          <TableHead className="text-right text-xs w-[100px]">
                            {language === 'da' ? 'Beløb' : 'Amount'}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {candidateLines.map((candidate) => (
                          <TableRow
                            key={candidate.id}
                            className={`cursor-pointer transition-colors ${
                              selectedCandidateId === candidate.id
                                ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10'
                                : 'hover:bg-gray-50 dark:hover:bg-white/5'
                            }`}
                            onClick={() => setSelectedCandidateId(candidate.id)}
                          >
                            <TableCell>
                              <div
                                className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                                  selectedCandidateId === candidate.id
                                    ? 'border-[#0d9488] bg-[#0d9488]'
                                    : 'border-gray-300 dark:border-white/20'
                                }`}
                              >
                                {selectedCandidateId === candidate.id && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-gray-600 dark:text-gray-400">
                              {candidate.date}
                            </TableCell>
                            <TableCell className="text-xs text-gray-900 dark:text-white">
                              {candidate.description}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {candidate.accountNumber}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-xs ${
                                candidate.amount >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {tc(candidate.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialogOpen(false)}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleConfirmMatch}
              disabled={!selectedCandidateId || isMatching}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isMatching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {language === 'da' ? 'Bekræft match' : 'Confirm Match'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unmatch Confirmation Dialog ── */}
      <AlertDialog open={unmatchDialogOpen} onOpenChange={setUnmatchDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlink className="h-5 w-5 text-red-500" />
              {language === 'da'
                ? 'Fjern afstemning?'
                : 'Remove reconciliation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'da'
                ? 'Er du sikker på, at du vil fjerne afstemningen af denne banktransaktion? Dette vil markere linjen som uafstemt igen.'
                : 'Are you sure you want to remove the reconciliation of this bank transaction? This will mark the line as unmatched again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bankLineToUnmatch && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 p-3 text-sm space-y-1">
              <p className="text-gray-900 dark:text-white">
                {bankLineToUnmatch.description}
              </p>
              <p className="text-gray-500 dark:text-gray-400 font-mono">
                {bankLineToUnmatch.date} · {tc(bankLineToUnmatch.amount)}
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnmatching}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUnmatch}
              disabled={isUnmatching}
              className="bg-red-500 hover:bg-red-600 text-white gap-2"
            >
              {isUnmatching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              {language === 'da' ? 'Fjern match' : 'Remove Match'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Info Box ── */}
      <Card className="info-box-primary">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p>
                {language === 'da'
                  ? 'Bankafstemning sikrer, at bankens kontoudtog stemmer overens med de finansielle poster i finansjournalen. Importer kontoudtog fra din bank i CSV-format, og match automatisk eller manuelt linjerne.'
                  : 'Bank reconciliation ensures that bank statements match the financial entries in the journal. Import statements from your bank in CSV format and match lines automatically or manually.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
