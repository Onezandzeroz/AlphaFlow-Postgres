'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Calendar,
  Lock,
  Unlock,
  Loader2,
  Plus,
  CheckCircle2,
  XCircle,
  Info,
  Shield,
  AlertTriangle,
  RotateCcw,
  CalendarDays,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { format, formatDistanceToNow } from 'date-fns';
import { da, enGB } from 'date-fns/locale';

// Danish month names (lowercase as specified)
const DANISH_MONTH_NAMES = [
  'januar', 'februar', 'marts', 'april', 'maj', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'december',
];

interface FiscalPeriod {
  id: string;
  year: number;
  month: number;
  status: 'OPEN' | 'CLOSED';
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
}

interface FiscalPeriodsPageProps {
  user: User;
}

function getMonthName(month: number): string {
  return DANISH_MONTH_NAMES[month - 1] || '';
}

function formatLockedDate(dateStr: string, language: 'da' | 'en'): string {
  try {
    const date = new Date(dateStr);
    if (language === 'da') {
      return format(date, 'dd.MM.yyyy HH:mm', { locale: da });
    }
    return format(date, 'dd/MM/yyyy HH:mm', { locale: enGB });
  } catch {
    return dateStr;
  }
}

export function FiscalPeriodsPage({ user }: FiscalPeriodsPageProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  // State
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isCreatingYear, setIsCreatingYear] = useState(false);
  const [lockTarget, setLockTarget] = useState<FiscalPeriod | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<FiscalPeriod | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);

  // Available years based on existing data
  const availableYears = useMemo(() => {
    const years = new Set(periods.map((p) => p.year));
    // Always include current year
    years.add(new Date().getFullYear());
    // Include last year
    years.add(new Date().getFullYear() - 1);
    // Include next year
    years.add(new Date().getFullYear() + 1);
    return Array.from(years).sort((a, b) => b - a);
  }, [periods]);

  // Filter periods for selected year
  const yearPeriods = useMemo(() => {
    return periods
      .filter((p) => p.year === selectedYear)
      .sort((a, b) => a.month - b.month);
  }, [periods, selectedYear]);

  // Year summary
  const yearSummary = useMemo(() => {
    const openCount = yearPeriods.filter((p) => p.status === 'OPEN').length;
    const closedCount = yearPeriods.filter((p) => p.status === 'CLOSED').length;
    return { openCount, closedCount, total: yearPeriods.length };
  }, [yearPeriods]);

  // Current month/year
  const currentMonth = new Date().getMonth() + 1; // 1-indexed
  const currentYear = new Date().getFullYear();

  // Fetch periods
  const fetchPeriods = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/fiscal-periods?year=${selectedYear}&status=OPEN`);
      if (response.ok) {
        const data = await response.json();
        // If we only got OPEN periods, also fetch CLOSED ones
        const openPeriods = data.fiscalPeriods || [];
        const responseClosed = await fetch(`/api/fiscal-periods?year=${selectedYear}&status=CLOSED`);
        if (responseClosed.ok) {
          const closedData = await responseClosed.json();
          const closedPeriods = closedData.fiscalPeriods || [];
          // Merge and deduplicate
          const allPeriods = [...openPeriods];
          for (const cp of closedPeriods) {
            if (!allPeriods.find((p) => p.id === cp.id)) {
              allPeriods.push(cp);
            }
          }
          setPeriods((prev) => {
            // Merge with existing periods from other years
            const otherYears = prev.filter((p) => p.year !== selectedYear);
            return [...otherYears, ...allPeriods];
          });
        } else {
          setPeriods((prev) => {
            const otherYears = prev.filter((p) => p.year !== selectedYear);
            return [...otherYears, ...openPeriods];
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch fiscal periods:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  // Create year
  const handleCreateYear = useCallback(async () => {
    setIsCreatingYear(true);
    try {
      const response = await fetch('/api/fiscal-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear }),
      });
      if (response.ok) {
        await fetchPeriods();
      }
    } catch (error) {
      console.error('Failed to create fiscal periods:', error);
    } finally {
      setIsCreatingYear(false);
    }
  }, [selectedYear, fetchPeriods]);

  // Lock period
  const handleLock = useCallback(async () => {
    if (!lockTarget) return;
    setIsToggling(lockTarget.id);
    try {
      const response = await fetch(`/api/fiscal-periods/${lockTarget.id}?action=lock`, {
        method: 'PUT',
      });
      if (response.ok) {
        setLockTarget(null);
        await fetchPeriods();
      }
    } catch (error) {
      console.error('Failed to lock period:', error);
    } finally {
      setIsToggling(null);
    }
  }, [lockTarget, fetchPeriods]);

  // Unlock period
  const handleUnlock = useCallback(async () => {
    if (!unlockTarget) return;
    setIsToggling(unlockTarget.id);
    try {
      const response = await fetch(`/api/fiscal-periods/${unlockTarget.id}?action=unlock`, {
        method: 'PUT',
      });
      if (response.ok) {
        setUnlockTarget(null);
        await fetchPeriods();
      }
    } catch (error) {
      console.error('Failed to unlock period:', error);
    } finally {
      setIsToggling(null);
    }
  }, [unlockTarget, fetchPeriods]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>

        {/* Compliance card skeleton */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-12" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={isDanish ? 'Årsafslutning' : 'Fiscal Periods'}
        description={isDanish
          ? 'Håndtering af regnskabsperioder i henhold til §7-8 i Bogføringsloven'
          : 'Manage fiscal periods compliant with §7-8 of the Danish Bookkeeping Act'}
      />
      {/* Year Selector + Create Year Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Year Selector */}
        <Select
          value={String(selectedYear)}
          onValueChange={(value) => setSelectedYear(Number(value))}
        >
          <SelectTrigger className="w-full sm:w-32">
            <CalendarDays className="h-4 w-4 mr-1.5 text-[#0d9488]" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Create Year Button */}
        <Button
          onClick={handleCreateYear}
          disabled={isCreatingYear || yearSummary.total === 12}
          className="w-full sm:w-auto bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium gap-2 shadow-lg shadow-[#0d9488]/20 transition-all"
        >
          {isCreatingYear ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {isDanish ? 'Opret år' : 'Create Year'}
          </span>
        </Button>
      </div>

      {/* Compliance Info Card */}
      <Card className="relative overflow-hidden border-2 border-[#0d9488]/20 dark:border-[#0d9488]/30 shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#0d9488]/10 to-transparent rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
        <CardContent className="relative p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shrink-0 shadow-lg">
              <Shield className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  {isDanish ? 'Bogføringsloven §7-8' : 'Danish Bookkeeping Act §7-8'}
                </h3>
                <Badge className="bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/20 dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] dark:border-[#0d9488]/30">
                  {isDanish ? 'Lovkrav' : 'Legal Requirement'}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isDanish
                  ? 'Når en regnskabsperiode er lukket, kan der ikke bogføres nye poster i perioden. Dette sikrer integriteten af det bogholderimæssige materiale og overholdelse af bogføringslovens krav om uændrlighed.'
                  : 'Once a fiscal period is closed, no new journal entries can be posted for that period. This ensures the integrity of accounting records and compliance with the Bookkeeping Act\'s immutability requirements.'}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <div className="text-center px-4 py-2 rounded-lg bg-[#0d9488]/5 dark:bg-[#0d9488]/10">
                <Lock className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf] mx-auto mb-0.5" />
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {isDanish ? 'Periodelåsning' : 'Period Locking'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Year Summary Stats */}
      {yearPeriods.length > 0 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Periods */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Total perioder' : 'Total Periods'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {yearSummary.total}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                <Calendar className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {selectedYear}
            </div>
          </CardContent>
        </Card>

        {/* Open Periods */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Åbne perioder' : 'Open Periods'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-0.5 sm:mt-1">
                  {yearSummary.openCount}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                <Unlock className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {isDanish ? 'Klar til bogføring' : 'Ready for posting'}
            </div>
          </CardContent>
        </Card>

        {/* Closed Periods */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Lukkede perioder' : 'Closed Periods'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-1">
                  {yearSummary.closedCount}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                <Lock className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-amber-600 dark:text-amber-400">
              <Lock className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {isDanish ? 'Låst og skrivebeskyttet' : 'Locked & read-only'}
            </div>
          </CardContent>
        </Card>

        {/* Year Completion */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Årsafslutning' : 'Year Closure'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                  yearSummary.closedCount === 12
                    ? 'text-green-600 dark:text-green-400'
                    : yearSummary.closedCount > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {yearSummary.total === 0
                    ? '—'
                    : `${Math.round((yearSummary.closedCount / 12) * 100)}%`}
                </p>
              </div>
              <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                yearSummary.closedCount === 12
                  ? 'stat-icon-green'
                  : yearSummary.closedCount > 0
                    ? 'stat-icon-amber'
                    : 'stat-icon-primary'
              }`}>
                <Shield className={`h-4 w-4 sm:h-6 sm:w-6 ${
                  yearSummary.closedCount === 12
                    ? 'text-green-600 dark:text-green-400'
                    : yearSummary.closedCount > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-[#0d9488] dark:text-[#2dd4bf]'
                }`} />
              </div>
            </div>
            <div className={`mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm ${
              yearSummary.closedCount === 12
                ? 'text-green-600 dark:text-green-400'
                : yearSummary.closedCount > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 dark:text-gray-400'
            }`}>
              {yearSummary.closedCount === 12 ? (
                <>
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {isDanish ? 'Fuldt afsluttet' : 'Fully closed'}
                </>
              ) : yearSummary.closedCount > 0 ? (
                <>
                  <Info className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {isDanish
                    ? `${12 - yearSummary.closedCount} perioder tilbage`
                    : `${12 - yearSummary.closedCount} periods remaining`}
                </>
              ) : (
                <>
                  <Info className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {isDanish ? 'Ikke påbegyndt' : 'Not started'}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Period Grid or Empty State */}
      {yearSummary.total === 0 ? (
        /* Empty State */
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-16">
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                <Calendar className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {isDanish
                  ? `Ingen regnskabsperioder for ${selectedYear}`
                  : `No fiscal periods for ${selectedYear}`}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                {isDanish
                  ? `Opret regnskabsperioder for ${selectedYear} for at kunne bogføre poster og låse perioder i henhold til bogføringsloven.`
                  : `Create fiscal periods for ${selectedYear} to post journal entries and lock periods in compliance with the Bookkeeping Act.`}
              </p>
              <Button
                onClick={handleCreateYear}
                disabled={isCreatingYear}
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium gap-2 shadow-lg shadow-[#0d9488]/20"
              >
                {isCreatingYear ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {isDanish
                  ? `Opret perioder for ${selectedYear}`
                  : `Create periods for ${selectedYear}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Period Grid */
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#0d9488]" />
                {selectedYear}
                <Badge variant="outline" className="text-xs font-normal">
                  {yearSummary.total} {isDanish ? 'perioder' : 'periods'}
                </Badge>
              </CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchPeriods}
                      className="gap-1 text-gray-500 hover:text-[#0d9488] dark:text-gray-400"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {isDanish ? 'Opdater' : 'Refresh'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isDanish ? 'Opdater perioder' : 'Refresh periods'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
              {yearPeriods.map((period) => {
                const isCurrentMonth = period.month === currentMonth && period.year === currentYear;
                const isLocked = period.status === 'CLOSED';
                const monthName = getMonthName(period.month);

                return (
                  <div
                    key={period.id}
                    className={`relative rounded-xl border p-4 transition-all ${
                      isCurrentMonth
                        ? 'border-[#0d9488]/40 dark:border-[#0d9488]/50 bg-[#0d9488]/5 dark:bg-[#0d9488]/10 shadow-md shadow-[#0d9488]/10'
                        : isLocked
                          ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/15'
                    }`}
                  >
                    {/* Current month indicator */}
                    {isCurrentMonth && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <Badge className="bg-[#0d9488] text-white text-[10px] px-2 py-0 shadow-md">
                          {isDanish ? 'Nuværende' : 'Current'}
                        </Badge>
                      </div>
                    )}

                    {/* Month name */}
                    <p className={`text-sm font-semibold capitalize mb-2 ${isCurrentMonth ? 'text-[#0d9488] dark:text-[#2dd4bf]' : 'text-gray-900 dark:text-white'}`}>
                      {monthName}
                    </p>

                    {/* Status badge */}
                    {isLocked ? (
                      <Badge className="badge-amber text-[10px] sm:text-xs gap-1 mb-3">
                        <Lock className="h-3 w-3" />
                        {isDanish ? 'Lukket' : 'Closed'}
                      </Badge>
                    ) : (
                      <Badge className="badge-green text-[10px] sm:text-xs gap-1 mb-3">
                        <Unlock className="h-3 w-3" />
                        {isDanish ? 'Åben' : 'Open'}
                      </Badge>
                    )}

                    {/* Locked date (for closed periods) */}
                    {isLocked && period.lockedAt && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">
                        {formatDistanceToNow(new Date(period.lockedAt), { addSuffix: true })}
                      </p>
                    )}

                    {/* Action button */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isToggling === period.id}
                      onClick={() => isLocked ? setUnlockTarget(period) : setLockTarget(period)}
                      className={`w-full text-xs gap-1.5 transition-all ${
                        isLocked
                          ? 'text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          : 'text-red-600 border-red-200 dark:text-red-400 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-900/20'
                      }`}
                    >
                      {isToggling === period.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isLocked ? (
                        <Unlock className="h-3.5 w-3.5" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      {isToggling === period.id
                        ? (isDanish ? 'Behandler...' : 'Processing...')
                        : isLocked
                          ? (isDanish ? 'Lås op' : 'Unlock')
                          : (isDanish ? 'Luk periode' : 'Lock period')
                      }
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Info box */}
            <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
              <p>
                {isDanish
                  ? 'Når du lukker en periode, vil systemet kontrollere, at der ikke er ulagte kladder. Alle handlinger logges i revisionsloggen.'
                  : 'When you close a period, the system will verify there are no unposted drafts. All actions are recorded in the audit log.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lock Confirmation Dialog */}
      <AlertDialog open={!!lockTarget} onOpenChange={(open) => { if (!open) setLockTarget(null); }}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {isDanish ? 'Luk periode?' : 'Lock Period?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {isDanish
                    ? `Er du sikker på, at du vil lukke ${lockTarget ? getMonthName(lockTarget.month) : ''} ${lockTarget?.year || ''}? Efter lukning kan der ikke bogføres nye poster for denne periode.`
                    : `Are you sure you want to lock ${lockTarget ? getMonthName(lockTarget.month) : ''} ${lockTarget?.year || ''}? After locking, no new journal entries can be posted for this period.`}
                </p>

                {/* Warning details */}
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? 'Advarsel: Når perioden er låst, vil alle eksisterende ulagte kladder (DRAFT) forhindre lukning.'
                        : 'Warning: When the period is locked, any existing unposted drafts (DRAFT) will prevent locking.'}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Shield className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? 'Alle låsehandlinger registreres i revisionsloggen med timestamp og brugeroplysninger.'
                        : 'All locking actions are recorded in the audit log with timestamp and user details.'}
                    </p>
                  </div>
                </div>

                {/* Period details */}
                {lockTarget && (
                  <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Periode' : 'Period'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white capitalize">
                        {getMonthName(lockTarget.month)} {lockTarget.year}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Status' : 'Status'}:
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {isDanish ? 'Åben' : 'Open'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Handling' : 'Action'}:
                      </span>
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {isDanish ? 'Lås periode' : 'Lock period'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="dark:bg-white/5 dark:text-gray-300" onClick={() => setLockTarget(null)}>
              {isDanish ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLock}
              disabled={isToggling !== null}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isToggling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isDanish ? 'Lukker...' : 'Locking...'}
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  {isDanish ? 'Luk periode' : 'Lock Period'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlock Confirmation Dialog */}
      <AlertDialog open={!!unlockTarget} onOpenChange={(open) => { if (!open) setUnlockTarget(null); }}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Unlock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              {isDanish ? 'Lås periode op?' : 'Unlock Period?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {isDanish
                    ? `Er du sikker på, at du vil låse ${unlockTarget ? getMonthName(unlockTarget.month) : ''} ${unlockTarget?.year || ''} op? Efter oplåsning vil det være muligt at bogføre nye poster for denne periode.`
                    : `Are you sure you want to unlock ${unlockTarget ? getMonthName(unlockTarget.month) : ''} ${unlockTarget?.year || ''}? After unlocking, new journal entries can be posted for this period.`}
                </p>

                {/* Warning details */}
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? 'Bemærk: Oplåsning af en periode bør kun ske i undtagelsestilfælde og bør dokumenteres.'
                        : 'Note: Unlocking a period should only be done in exceptional circumstances and should be documented.'}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Shield className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? 'Alle oplåsningshandlinger registreres i revisionsloggen i henhold til bogføringsloven.'
                        : 'All unlock actions are recorded in the audit log per the Bookkeeping Act.'}
                    </p>
                  </div>
                </div>

                {/* Period details */}
                {unlockTarget && (
                  <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Periode' : 'Period'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white capitalize">
                        {getMonthName(unlockTarget.month)} {unlockTarget.year}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Låst den' : 'Locked on'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {unlockTarget.lockedAt ? formatLockedDate(unlockTarget.lockedAt, language) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Handling' : 'Action'}:
                      </span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {isDanish ? 'Lås op' : 'Unlock'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="dark:bg-white/5 dark:text-gray-300" onClick={() => setUnlockTarget(null)}>
              {isDanish ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlock}
              disabled={isToggling !== null}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {isToggling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isDanish ? 'Låser op...' : 'Unlocking...'}
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 mr-2" />
                  {isDanish ? 'Lås op' : 'Unlock'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
