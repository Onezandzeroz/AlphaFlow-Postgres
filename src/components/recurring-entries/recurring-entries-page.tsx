'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Plus,
  RefreshCw,
  Play,
  Pause,
  Pencil,
  Trash2,
  AlertTriangle,
  CalendarClock,
  Repeat,
  CheckCircle2,
  FileText,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

// ─── Types ────────────────────────────────────────────────────────

interface RecurringEntry {
  id: string;
  name: string;
  description: string;
  frequency: string;
  status: string;
  startDate: string;
  endDate: string | null;
  nextExecution: string;
  lastExecuted: string | null;
  lines: string;
  reference: string | null;
}

interface Account {
  id: string;
  number: string;
  name: string;
  type: string;
  isActive: boolean;
}

interface RecurringLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

// ─── Constants ────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<string, { da: string; en: string }> = {
  DAILY: { da: 'Daglig', en: 'Daily' },
  WEEKLY: { da: 'Ugentlig', en: 'Weekly' },
  MONTHLY: { da: 'Månedlig', en: 'Monthly' },
  QUARTERLY: { da: 'Kvartalsvis', en: 'Quarterly' },
  YEARLY: { da: 'Årlig', en: 'Yearly' },
};

const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

const STATUS_CONFIG: Record<string, { label_da: string; label_en: string; className: string }> = {
  ACTIVE: { label_da: 'Aktiv', label_en: 'Active', className: 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20' },
  PAUSED: { label_da: 'Pauset', label_en: 'Paused', className: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20' },
  COMPLETED: { label_da: 'Afsluttet', label_en: 'Completed', className: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20' },
};

// ─── Component ────────────────────────────────────────────────────

export function RecurringEntriesPage({ user, hideHeader, triggerCreate }: { user: User; hideHeader?: boolean; triggerCreate?: number }) {
  const { language, tc, td, t } = useTranslation();
  const [entries, setEntries] = useState<RecurringEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExecuteDialogOpen, setIsExecuteDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFrequency, setFormFrequency] = useState('MONTHLY');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formLines, setFormLines] = useState<RecurringLine[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ]);

  // ─── Fetch data ────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [entriesRes, accountsRes] = await Promise.all([
        fetch('/api/recurring-entries'),
        fetch('/api/accounts'),
      ]);

      if (!entriesRes.ok) throw new Error('Failed to fetch recurring entries');
      if (!accountsRes.ok) throw new Error('Failed to fetch accounts');

      const entriesData = await entriesRes.json();
      const accountsData = await accountsRes.json();

      setEntries(entriesData.recurringEntries || []);
      setAccounts((accountsData.accounts || []).filter((a: Account) => a.isActive));
    } catch (err) {
      console.error('Fetch error:', err);
      setError(language === 'da' ? 'Kunne ikke hente data' : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, [language]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── External trigger for create dialog (from parent PosteringerPage) ────
  useEffect(() => {
    if (triggerCreate && triggerCreate > 0) {
      resetForm();
      setIsDialogOpen(true);
    }
  }, [triggerCreate]);

  // ─── Form helpers ──────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormFrequency('MONTHLY');
    setFormStartDate('');
    setFormEndDate('');
    setFormReference('');
    setFormLines([
      { accountId: '', debit: 0, credit: 0, description: '' },
      { accountId: '', debit: 0, credit: 0, description: '' },
    ]);
  }, []);

  const totalDebit = formLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = formLines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const addLine = () => {
    setFormLines([...formLines, { accountId: '', debit: 0, credit: 0, description: '' }]);
  };

  const removeLine = (index: number) => {
    if (formLines.length <= 2) return;
    setFormLines(formLines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof RecurringLine, value: string | number) => {
    const updated = [...formLines];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    setFormLines(updated);
  };

  // ─── Open edit dialog ─────────────────────────────────────────

  const openEdit = (entry: RecurringEntry) => {
    setEditingId(entry.id);
    setFormName(entry.name);
    setFormDescription(entry.description);
    setFormFrequency(entry.frequency);
    setFormStartDate(entry.startDate.substring(0, 10));
    setFormEndDate(entry.endDate ? entry.endDate.substring(0, 10) : '');
    setFormReference(entry.reference || '');
    try {
      setFormLines(JSON.parse(entry.lines));
    } catch {
      setFormLines([
        { accountId: '', debit: 0, credit: 0, description: '' },
        { accountId: '', debit: 0, credit: 0, description: '' },
      ]);
    }
    setIsDialogOpen(true);
  };

  // ─── Save handler ─────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim() || !formStartDate) return;

    const validLines = formLines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) return;

    setIsSaving(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: formName.trim(),
        description: formDescription.trim(),
        frequency: formFrequency,
        startDate: formStartDate,
        endDate: formEndDate || null,
        reference: formReference.trim() || null,
        lines: validLines,
      };

      const res = await fetch('/api/recurring-entries', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Execute handler ──────────────────────────────────────────

  const handleExecute = async () => {
    if (!executingId) return;
    setIsExecuting(true);
    try {
      const res = await fetch('/api/recurring-entries/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: executingId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to execute');
      }

      setIsExecuteDialogOpen(false);
      setExecutingId(null);
      fetchData();
    } catch (err) {
      console.error('Execute error:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  // ─── Toggle pause ─────────────────────────────────────────────

  const handleTogglePause = async (entry: RecurringEntry) => {
    try {
      const newStatus = entry.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
      const res = await fetch('/api/recurring-entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: newStatus }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Toggle pause error:', err);
    }
  };

  // ─── Delete handler ───────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch('/api/recurring-entries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteId }),
      });
      if (res.ok) {
        setIsDeleteDialogOpen(false);
        setDeleteId(null);
        fetchData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────

  const isOverdue = (entry: RecurringEntry) => {
    return entry.status === 'ACTIVE' && new Date(entry.nextExecution) < new Date();
  };

  const getFrequencyLabel = (freq: string) => {
    const f = FREQUENCY_LABELS[freq];
    return f ? (language === 'da' ? f.da : f.en) : freq;
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status];
    if (!config) return null;
    return (
      <Badge variant="outline" className={config.className}>
        {language === 'da' ? config.label_da : config.label_en}
      </Badge>
    );
  };

  // ─── Loading skeleton ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {!hideHeader && (
      <PageHeader
        title={language === 'da' ? 'Gentagende Posteringer' : 'Recurring Entries'}
        description={language === 'da'
          ? 'Automatisér gentagende bilag som husleje, løn og abonnementer'
          : 'Automate recurring postings like rent, salaries, and subscriptions'}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={fetchData} className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm">
              <RefreshCw className="h-4 w-4" />
              {language === 'da' ? 'Opdater' : 'Refresh'}
            </Button>
            <Button
              onClick={() => { resetForm(); setIsDialogOpen(true); }}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
            >
              <Plus className="h-4 w-4" />
              {language === 'da' ? 'Opret ny' : 'Create New'}
            </Button>
          </div>
        }
      />
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData} className="ml-auto">
              {language === 'da' ? 'Prøv igen' : 'Retry'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {entries.length > 0 && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Aktive' : 'Active'}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {entries.filter((e) => e.status === 'ACTIVE').length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Pauset' : 'Paused'}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {entries.filter((e) => e.status === 'PAUSED').length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Forfaldne' : 'Overdue'}
            </p>
            <p className={`text-lg sm:text-2xl font-bold mt-0.5 ${entries.some((e) => isOverdue(e)) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {entries.filter((e) => isOverdue(e)).length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Afsluttede' : 'Completed'}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {entries.filter((e) => e.status === 'COMPLETED').length}
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Entries Table */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            {language === 'da' ? 'Skabeloner' : 'Templates'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <Repeat className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {language === 'da'
                  ? 'Ingen gentagende posteringer endnu'
                  : 'No recurring entries yet'}
              </p>
              <Button
                onClick={() => { resetForm(); setIsDialogOpen(true); }}
                className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white"
              >
                <Plus className="h-4 w-4" />
                {language === 'da' ? 'Opret den første' : 'Create the first one'}
              </Button>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-white/5">
                    <TableHead>{language === 'da' ? 'Navn' : 'Name'}</TableHead>
                    <TableHead>{language === 'da' ? 'Frekvens' : 'Frequency'}</TableHead>
                    <TableHead className="hidden sm:table-cell">{language === 'da' ? 'Næste' : 'Next'}</TableHead>
                    <TableHead>{language === 'da' ? 'Status' : 'Status'}</TableHead>
                    <TableHead className="text-right">{language === 'da' ? 'Handlinger' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className={isOverdue(entry) ? 'bg-red-50 dark:bg-red-500/5' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{entry.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                            {entry.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getFrequencyLabel(entry.frequency)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
                          <span className={`text-sm ${isOverdue(entry) ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                            {td(new Date(entry.nextExecution))}
                          </span>
                          {isOverdue(entry) && (
                            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                              {language === 'da' ? 'Forfalden' : 'Overdue'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {entry.status === 'ACTIVE' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                              onClick={() => { setExecutingId(entry.id); setIsExecuteDialogOpen(true); }}
                              title={language === 'da' ? 'Udfør nu' : 'Execute now'}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {(entry.status === 'ACTIVE' || entry.status === 'PAUSED') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700"
                              onClick={() => handleTogglePause(entry)}
                              title={entry.status === 'PAUSED' ? (language === 'da' ? 'Genoptag' : 'Resume') : (language === 'da' ? 'Pause' : 'Pause')}
                            >
                              {entry.status === 'PAUSED' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                            </Button>
                          )}
                          {entry.status !== 'COMPLETED' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openEdit(entry)}
                              title={language === 'da' ? 'Rediger' : 'Edit'}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {entry.status !== 'COMPLETED' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                              onClick={() => { setDeleteId(entry.id); setIsDeleteDialogOpen(true); }}
                              title={language === 'da' ? 'Annuller' : 'Cancel'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Create/Edit Dialog ═══ */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Repeat className="h-5 w-5 text-[#0d9488]" />
              {editingId
                ? (language === 'da' ? 'Rediger gentagende postering' : 'Edit Recurring Entry')
                : (language === 'da' ? 'Opret gentagende postering' : 'Create Recurring Entry')}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {language === 'da'
                ? 'Opret en skabelon der automatisk opretter journalposter'
                : 'Create a template that automatically generates journal entries'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name & Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{language === 'da' ? 'Navn *' : 'Name *'}</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={language === 'da' ? 'F.eks. Husleje, Løn' : 'E.g. Rent, Salary'}
                  className="bg-gray-50 dark:bg-white/5 border-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{language === 'da' ? 'Frekvens *' : 'Frequency *'}</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger className="bg-gray-50 dark:bg-white/5 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {getFrequencyLabel(f)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{language === 'da' ? 'Beskrivelse' : 'Description'}</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={language === 'da' ? 'Valgfri beskrivelse...' : 'Optional description...'}
                rows={2}
                className="bg-gray-50 dark:bg-white/5 border-0"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{language === 'da' ? 'Startdato *' : 'Start Date *'}</Label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="bg-gray-50 dark:bg-white/5 border-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{language === 'da' ? 'Slutdato' : 'End Date'}</Label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="bg-gray-50 dark:bg-white/5 border-0"
                />
              </div>
            </div>

            {/* Reference */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{language === 'da' ? 'Reference præfiks' : 'Reference Prefix'}</Label>
              <Input
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                placeholder={language === 'da' ? 'F.eks. HL-, LN-' : 'E.g. RENT-, SAL-'}
                className="bg-gray-50 dark:bg-white/5 border-0"
              />
            </div>

            {/* Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{language === 'da' ? 'Posteringslinjer *' : 'Entry Lines *'}</Label>
                <div className="flex items-center gap-3 text-xs">
                  <span className={isBalanced ? 'text-green-600' : 'text-red-600'}>
                    {language === 'da' ? 'Debet' : 'Debit'}: {tc(totalDebit)}
                  </span>
                  <span className={isBalanced ? 'text-green-600' : 'text-red-600'}>
                    {language === 'da' ? 'Kredit' : 'Credit'}: {tc(totalCredit)}
                  </span>
                  {isBalanced ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {formLines.map((line, index) => (
                  <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-white/5">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Select
                        value={line.accountId}
                        onValueChange={(v) => updateLine(index, 'accountId', v)}
                      >
                        <SelectTrigger className="text-xs bg-white dark:bg-white/5">
                          <SelectValue placeholder={language === 'da' ? 'Vælg konto' : 'Select account'} />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.number} — {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={language === 'da' ? 'Debet' : 'Debit'}
                        value={line.debit || ''}
                        onChange={(e) => updateLine(index, 'debit', parseFloat(e.target.value) || 0)}
                        className="text-xs bg-white dark:bg-white/5"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={language === 'da' ? 'Kredit' : 'Credit'}
                        value={line.credit || ''}
                        onChange={(e) => updateLine(index, 'credit', parseFloat(e.target.value) || 0)}
                        className="text-xs bg-white dark:bg-white/5"
                      />
                    </div>
                    {formLines.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 shrink-0"
                        onClick={() => removeLine(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={addLine} className="gap-1.5 w-full">
                <Plus className="h-3.5 w-3.5" />
                {language === 'da' ? 'Tilføj linje' : 'Add line'}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !formName.trim() || !formStartDate || formLines.filter((l) => l.accountId).length < 2 || !isBalanced}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {editingId ? (language === 'da' ? 'Gem ændringer' : 'Save Changes') : (language === 'da' ? 'Opret' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Execute Confirmation Dialog ═══ */}
      <AlertDialog open={isExecuteDialogOpen} onOpenChange={setIsExecuteDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-green-600" />
              {language === 'da' ? 'Udfør postering?' : 'Execute Entry?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'da'
                ? 'Dette opretter en ny bogført journalpost baseret på skabelonen. Handlingen kan ikke fortrydes.'
                : 'This will create a new posted journal entry based on the template. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecute}
              disabled={isExecuting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {language === 'da' ? 'Udfør' : 'Execute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ Delete Confirmation Dialog ═══ */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {language === 'da' ? 'Annuller gentagende postering?' : 'Cancel Recurring Entry?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'da'
                ? 'Skabelonen markeres som afsluttet. Allerede oprettede poster bevares.'
                : 'The template will be marked as completed. Already created entries are preserved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {language === 'da' ? 'Afslut skabelon' : 'Complete Template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
