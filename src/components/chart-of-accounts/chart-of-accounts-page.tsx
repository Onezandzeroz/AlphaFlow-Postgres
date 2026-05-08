'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/page-header';
import { MobileFilterDropdown } from '@/components/shared/mobile-filter-dropdown';
import {
  BookOpen,
  Search,
  Plus,
  Pencil,
  Trash2,
  Lock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wallet,
  Landmark,
  CreditCard,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  RotateCcw,
  Filter,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  number: string;
  name: string;
  nameEn: string | null;
  type: string;
  group: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

const ACCOUNT_GROUPS_BY_TYPE: Record<string, string[]> = {
  ASSET: ['CASH', 'BANK', 'RECEIVABLES', 'INVENTORY', 'FIXED_ASSETS', 'OTHER_ASSETS'],
  LIABILITY: ['PAYABLES', 'SHORT_TERM_DEBT', 'LONG_TERM_DEBT', 'OTHER_LIABILITIES'],
  EQUITY: ['SHARE_CAPITAL', 'RETAINED_EARNINGS'],
  REVENUE: ['SALES_REVENUE', 'OTHER_REVENUE'],
  EXPENSE: ['COST_OF_GOODS', 'PERSONNEL', 'OTHER_OPERATING', 'FINANCIAL_EXPENSE', 'FINANCIAL_INCOME', 'TAX'],
};

const TYPE_BORDER_COLOR: Record<string, string> = {
  ASSET: 'border-l-[#7dabb5]',
  LIABILITY: 'border-l-amber-500',
  EQUITY: 'border-l-[#0d9488]',
  REVENUE: 'border-l-green-500',
  EXPENSE: 'border-l-red-500',
};

const TYPE_BORDER_DARK: Record<string, string> = {
  ASSET: 'dark:border-l-[#80c0cc]',
  LIABILITY: 'dark:border-l-amber-400',
  EQUITY: 'dark:border-l-[#2dd4bf]',
  REVENUE: 'dark:border-l-green-400',
  EXPENSE: 'dark:border-l-red-400',
};

const TYPE_BG_LIGHT: Record<string, string> = {
  ASSET: 'bg-[#7dabb5]/10',
  LIABILITY: 'bg-amber-500/10',
  EQUITY: 'bg-[#0d9488]/10',
  REVENUE: 'bg-green-500/10',
  EXPENSE: 'bg-red-500/10',
};

const TYPE_TEXT_LIGHT: Record<string, string> = {
  ASSET: 'text-[#7dabb5] dark:text-[#80c0cc]',
  LIABILITY: 'text-amber-600 dark:text-amber-400',
  EQUITY: 'text-[#0d9488] dark:text-[#2dd4bf]',
  REVENUE: 'text-green-600 dark:text-green-400',
  EXPENSE: 'text-red-600 dark:text-red-400',
};

const TYPE_ROW_BORDER: Record<string, string> = {
  ASSET: 'border-l-[#7dabb5] dark:border-l-[#80c0cc]',
  LIABILITY: 'border-l-amber-500 dark:border-l-amber-400',
  EQUITY: 'border-l-[#0d9488] dark:border-l-[#2dd4bf]',
  REVENUE: 'border-l-green-500 dark:border-l-green-400',
  EXPENSE: 'border-l-red-500 dark:border-l-red-400',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTypeBadgeStyle(type: string): string {
  switch (type) {
    case 'ASSET':
      return 'bg-[#7dabb5]/10 text-[#7dabb5] dark:bg-[#7dabb5]/20 dark:text-[#80c0cc] border-[#7dabb5]/20';
    case 'LIABILITY':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20';
    case 'EQUITY':
      return 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20';
    case 'REVENUE':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20';
    case 'EXPENSE':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20';
    default:
      return '';
  }
}

function getTypeLabel(type: string, isDanish: boolean): string {
  const labels: Record<string, { da: string; en: string }> = {
    ASSET: { da: 'Aktiver', en: 'Assets' },
    LIABILITY: { da: 'Gæld', en: 'Liabilities' },
    EQUITY: { da: 'Egenkapital', en: 'Equity' },
    REVENUE: { da: 'Indtægter', en: 'Revenue' },
    EXPENSE: { da: 'Omkostninger', en: 'Expenses' },
  };
  return labels[type]?.[isDanish ? 'da' : 'en'] || type;
}

function getTypeHeader(type: string, isDanish: boolean): string {
  const headers: Record<string, { da: string; en: string }> = {
    ASSET: { da: 'Aktiver (1xxx)', en: 'Assets (1xxx)' },
    LIABILITY: { da: 'Gæld (2xxx)', en: 'Liabilities (2xxx)' },
    EQUITY: { da: 'Egenkapital (3xxx)', en: 'Equity (3xxx)' },
    REVENUE: { da: 'Indtægter (4xxx-5xxx)', en: 'Revenue (4xxx-5xxx)' },
    EXPENSE: { da: 'Omkostninger (6xxx-9xxx)', en: 'Expenses (6xxx-9xxx)' },
  };
  return headers[type]?.[isDanish ? 'da' : 'en'] || type;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'ASSET':
      return Wallet;
    case 'LIABILITY':
      return CreditCard;
    case 'EQUITY':
      return PiggyBank;
    case 'REVENUE':
      return TrendingUp;
    case 'EXPENSE':
      return TrendingDown;
    default:
      return Landmark;
  }
}

function getGroupLabel(group: string, isDanish: boolean): string {
  const labels: Record<string, { da: string; en: string }> = {
    CASH: { da: 'Likvide beholdninger', en: 'Cash' },
    BANK: { da: 'Bank', en: 'Bank' },
    RECEIVABLES: { da: 'Tilgodehavender', en: 'Receivables' },
    INVENTORY: { da: 'Varelager', en: 'Inventory' },
    FIXED_ASSETS: { da: 'Anlægsaktiver', en: 'Fixed Assets' },
    OTHER_ASSETS: { da: 'Andre aktiver', en: 'Other Assets' },
    PAYABLES: { da: 'Kreditorer', en: 'Payables' },
    SHORT_TERM_DEBT: { da: 'Kortfristet gæld', en: 'Short-term Debt' },
    LONG_TERM_DEBT: { da: 'Langfristet gæld', en: 'Long-term Debt' },
    OTHER_LIABILITIES: { da: 'Andre forpligtelser', en: 'Other Liabilities' },
    SHARE_CAPITAL: { da: 'Aktiekapital', en: 'Share Capital' },
    RETAINED_EARNINGS: { da: 'Årets resultat', en: 'Retained Earnings' },
    SALES_REVENUE: { da: 'Salgsindtægter', en: 'Sales Revenue' },
    OTHER_REVENUE: { da: 'Andre indtægter', en: 'Other Revenue' },
    COST_OF_GOODS: { da: 'Vareforbrug', en: 'Cost of Goods' },
    PERSONNEL: { da: 'Personaleomkostninger', en: 'Personnel' },
    OTHER_OPERATING: { da: 'Andre driftsomkostninger', en: 'Other Operating' },
    FINANCIAL_EXPENSE: { da: 'Finansielle omkostninger', en: 'Financial Expense' },
    FINANCIAL_INCOME: { da: 'Finansielle indtægter', en: 'Financial Income' },
    TAX: { da: 'Skat', en: 'Tax' },
  };
  return labels[group]?.[isDanish ? 'da' : 'en'] || group;
}

function getGroupBadgeStyle(group: string): string {
  switch (group) {
    case 'CASH':
    case 'BANK':
      return 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/20';
    case 'RECEIVABLES':
    case 'PAYABLES':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20';
    case 'INVENTORY':
    case 'FIXED_ASSETS':
      return 'bg-[#14b8a6]/10 text-[#0d9488] dark:bg-[#14b8a6]/20 dark:text-[#99f6e4] border-[#14b8a6]/20';
    case 'OTHER_ASSETS':
    case 'OTHER_LIABILITIES':
    case 'OTHER_OPERATING':
      return 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20';
    case 'SHORT_TERM_DEBT':
    case 'LONG_TERM_DEBT':
      return 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-500/20';
    case 'SHARE_CAPITAL':
    case 'RETAINED_EARNINGS':
      return 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20';
    case 'SALES_REVENUE':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20';
    case 'OTHER_REVENUE':
    case 'FINANCIAL_INCOME':
      return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20';
    case 'COST_OF_GOODS':
      return 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border-rose-500/20';
    case 'PERSONNEL':
      return 'bg-[#7dabb5]/10 text-[#7dabb5] dark:bg-[#7dabb5]/20 dark:text-[#80c0cc] border-[#7dabb5]/20';
    case 'FINANCIAL_EXPENSE':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20';
    case 'TAX':
      return 'bg-pink-500/10 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400 border-pink-500/20';
    default:
      return '';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ChartOfAccountsPageProps {
  user: User;
  onNavigate?: (view: string) => void;
}

interface AccountFormData {
  number: string;
  name: string;
  nameEn: string;
  type: string;
  group: string;
  description: string;
}

const EMPTY_FORM: AccountFormData = {
  number: '',
  name: '',
  nameEn: '',
  type: '',
  group: '',
  description: '',
};

export function ChartOfAccountsPage({ user, onNavigate }: ChartOfAccountsPageProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  // ─── State ──────────────────────────────────────────────────────────────

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Collapsible groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(ACCOUNT_TYPES));

  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  // Form
  const [formData, setFormData] = useState<AccountFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ─── Data Fetching ────────────────────────────────────────────────────

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/accounts');
      if (!response.ok) {
        throw new Error(isDanish ? 'Kunne ikke hente konti' : 'Failed to fetch accounts');
      }
      const data = await response.json();
      setAccounts(data.accounts || []);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setError(err instanceof Error ? err.message : (isDanish ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [isDanish]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // ─── Seed Standard Accounts ───────────────────────────────────────────

  const handleSeed = useCallback(async () => {
    setIsSeeding(true);
    try {
      const response = await fetch('/api/accounts/seed', { method: 'POST' });
      if (!response.ok) {
        throw new Error(isDanish ? 'Kunne ikke oprette standardkonti' : 'Failed to seed accounts');
      }
      await fetchAccounts();
      toast.success(isDanish ? 'Kontoplan oprettet!' : 'Chart of accounts created!', {
        description: isDanish ? 'Standard dansk kontoplan er nu klar.' : 'Standard Danish chart of accounts is ready.',
      });
      // Return to dashboard (onboarding scene) after a short delay
      setTimeout(() => onNavigate?.('dashboard'), 800);
    } catch (err) {
      console.error('Seed error:', err);
    } finally {
      setIsSeeding(false);
    }
  }, [fetchAccounts, isDanish]);

  // ─── Filtered & Grouped Data ───────────────────────────────────────────

  const filteredAccounts = useMemo(() => {
    let result = accounts;

    if (typeFilter !== 'ALL') {
      result = result.filter((a) => a.type === typeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.number.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.nameEn && a.nameEn.toLowerCase().includes(q))
      );
    }

    return result;
  }, [accounts, typeFilter, searchQuery]);

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};

    for (const type of ACCOUNT_TYPES) {
      const typeAccounts = filteredAccounts
        .filter((a) => a.type === type)
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      if (typeAccounts.length > 0) {
        groups[type] = typeAccounts;
      }
    }

    return groups;
  }, [filteredAccounts]);

  // ─── Stats ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.isActive).length;
    const assets = accounts.filter((a) => a.type === 'ASSET').length;
    const liabilities = accounts.filter((a) => a.type === 'LIABILITY').length;
    return { total, active, assets, liabilities };
  }, [accounts]);

  // ─── Toggle Group ──────────────────────────────────────────────────────

  const toggleGroup = (type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // ─── Form Handling ─────────────────────────────────────────────────────

  const openAddDialog = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setShowAddDialog(true);
  };

  const openEditDialog = (account: Account) => {
    setFormData({
      number: account.number,
      name: account.name,
      nameEn: account.nameEn || '',
      type: account.type,
      group: account.group,
      description: account.description || '',
    });
    setFormErrors({});
    setEditAccount(account);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.number.trim()) {
      errors.number = isDanish ? 'Kontonummer er påkrævet' : 'Account number is required';
    } else if (!/^\d{1,6}$/.test(formData.number.trim())) {
      errors.number = isDanish ? 'Kontonummer skal være tal (1-6 cifre)' : 'Account number must be numeric (1-6 digits)';
    } else {
      // Number uniqueness validation
      const existing = accounts.find(
        (a) => a.number === formData.number.trim() && (!editAccount || a.id !== editAccount.id)
      );
      if (existing) {
        errors.number = isDanish
          ? `Kontonummer ${formData.number.trim()} er allerede brugt af "${existing.name}"`
          : `Account number ${formData.number.trim()} is already used by "${existing.name}"`;
      }
    }

    if (!formData.name.trim()) {
      errors.name = isDanish ? 'Kontonavn er påkrævet' : 'Account name is required';
    }

    if (!formData.type) {
      errors.type = isDanish ? 'Kontotype er påkrævet' : 'Account type is required';
    }

    if (!formData.group) {
      errors.group = isDanish ? 'Kontogruppe er påkrævet' : 'Account group is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveNew = async () => {
    if (!validateForm()) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: formData.number.trim(),
          name: formData.name.trim(),
          nameEn: formData.nameEn.trim() || undefined,
          type: formData.type,
          group: formData.group,
          description: formData.description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || (isDanish ? 'Kunne ikke oprette konto' : 'Failed to create account'));
      }

      setShowAddDialog(false);
      await fetchAccounts();
    } catch (err) {
      console.error('Create account error:', err);
      setFormErrors({ _general: err instanceof Error ? err.message : (isDanish ? 'Ukendt fejl' : 'Unknown error') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editAccount || !validateForm()) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/accounts/${editAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          nameEn: formData.nameEn.trim() || null,
          type: formData.type,
          group: formData.group,
          description: formData.description.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || (isDanish ? 'Kunne ikke opdatere konto' : 'Failed to update account'));
      }

      setEditAccount(null);
      await fetchAccounts();
    } catch (err) {
      console.error('Update account error:', err);
      setFormErrors({ _general: err instanceof Error ? err.message : (isDanish ? 'Ukendt fejl' : 'Unknown error') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/accounts/${deleteTarget.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || (isDanish ? 'Kunne ikke slette konto' : 'Failed to delete account'));
      }
      setDeleteTarget(null);
      await fetchAccounts();
    } catch (err) {
      console.error('Delete account error:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setTypeFilter('ALL');
    setSearchQuery('');
  };

  const hasActiveFilters = typeFilter !== 'ALL' || searchQuery.trim() !== '';

  // Available groups for selected type
  const availableGroups = useMemo(() => {
    if (!formData.type) return [];
    return ACCOUNT_GROUPS_BY_TYPE[formData.type] || [];
  }, [formData.type]);

  // ─── Loading Skeleton ─────────────────────────────────────────────────

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
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>

        {/* Stats skeleton — 4 cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3 w-16 sm:w-20" />
                    <Skeleton className="h-6 sm:h-7 w-10" />
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
            <div className="flex flex-col lg:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-48" />
            </div>
          </CardContent>
        </Card>

        {/* Group skeletons with colored borders */}
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="stat-card border-0 shadow-lg dark:border dark:border-white/5 border-l-4 border-l-[#7dabb5] overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4">
                  <Skeleton className="h-7 w-48 mb-4" />
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-gray-100/50 last:border-0">
                      <Skeleton className="h-4 w-12 shrink-0" />
                      <Skeleton className="h-4 w-32 shrink-0" />
                      <Skeleton className="h-5 w-24 shrink-0" />
                      <Skeleton className="h-5 w-16 shrink-0" />
                      <div className="flex-1" />
                      <div className="flex gap-1">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ─── Main Render ───────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={isDanish ? 'Kontoplan' : 'Chart of Accounts'}
        description={isDanish
          ? 'Oversigt over alle finanskonti i henhold til Bogføringslovens §4-5'
          : 'Overview of all financial accounts per Danish Bookkeeping Act §4-5'}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/20 dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] dark:border-[#0d9488]/30 gap-1">
              <Shield className="h-3 w-3" />
              §4-5
            </Badge>
            <Button
              onClick={handleSeed}
              disabled={isSeeding || stats.total > 0}
              variant="outline"
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 border border-gray-300 lg:bg-white/10 lg:hover:bg-white/20 lg:text-white lg:border-white/20 gap-2"
            >
              {isSeeding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {isDanish ? 'Standardkonti' : 'Seed Accounts'}
            </Button>
            <Button
              onClick={openAddDialog}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
            >
              <Plus className="h-4 w-4" />
              {isDanish ? 'Ny konto' : 'New Account'}
            </Button>
          </div>
        }
      />

      {/* Empty State — no accounts at all */}
      {accounts.length === 0 && !error ? (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-[#0d9488]/10 to-[#0d9488]/5 mb-6">
              <BookOpen className="h-10 w-10 text-[#0d9488] dark:text-[#2dd4bf]" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {isDanish ? 'Ingen konti endnu' : 'No accounts yet'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-2 max-w-md mx-auto">
              {isDanish
                ? 'Opret en standard dansk kontoplan med 42 FSR-standardkonti for hurtigt at komme i gang med dit regnskab.'
                : 'Set up a standard Danish chart of accounts with 42 FSR standard accounts to quickly get started with your bookkeeping.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
              <Button
                onClick={handleSeed}
                disabled={isSeeding}
                className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-2 shadow-lg shadow-[#0d9488]/20 transition-all px-6 py-6 text-base"
              >
                {isSeeding ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <BookOpen className="h-5 w-5" />
                )}
                {isDanish ? 'Opret standard dansk kontoplan' : 'Seed Standard Danish Chart of Accounts'}
              </Button>
              <Button
                onClick={openAddDialog}
                variant="outline"
                className="gap-2 dark:text-gray-300"
              >
                <Plus className="h-4 w-4" />
                {isDanish ? 'Opret manuelt' : 'Create Manually'}
              </Button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              {isDanish
                ? 'Anbefales af FSR (Foreningen af Statsautoriserede Revisorer) og opfylder kravene i Bogføringslovens §4-5.'
                : 'Recommended by FSR (Danish Institute of State Authorized Public Accountants) and meets the requirements of the Danish Bookkeeping Act §4-5.'}
            </p>
          </CardContent>
        </Card>
      ) : error ? (
        /* Error State */
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="py-12 text-center text-red-500 dark:text-red-400">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">{error}</p>
            <Button
              variant="link"
              onClick={fetchAccounts}
              className="text-[#0d9488] mt-2"
            >
              {isDanish ? 'Prøv igen' : 'Try Again'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Stats Cards — 4 cards */}
          {accounts.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'I alt' : 'Total'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {stats.total}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Aktive' : 'Active'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {stats.active}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assets */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Aktiver' : 'Assets'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {stats.assets}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-blue flex items-center justify-center">
                    <Wallet className="h-4 w-4 sm:h-6 sm:w-6 text-[#7dabb5] dark:text-[#80c0cc]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Liabilities */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Gæld' : 'Liabilities'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {stats.liabilities}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                    <CreditCard className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {/* Filter Bar */}
          {accounts.length > 0 && (
          <Card className="stat-card">
            <CardContent className="p-4 pb-2 lg:pb-4">
              <div className="flex flex-wrap gap-2 items-center">
                {/* Search - always visible */}
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={isDanish ? 'Søg efter kontonummer eller navn...' : 'Search by account number or name...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0"
                  />
                </div>

                {/* Type filter - mobile dropdown / desktop inline */}
                <MobileFilterDropdown
                  activeFilterCount={(typeFilter !== 'ALL' ? 1 : 0) + (searchQuery.trim() ? 1 : 0)}
                  language={isDanish ? 'da' : 'en'}
                  onClearFilters={clearFilters}
                >
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="shrink-0 w-auto min-w-[120px] bg-gray-50 dark:bg-white/[0.04] border-0">
                      <SelectValue placeholder={isDanish ? 'Kontotype' : 'Account Type'} />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                      <SelectItem value="ALL">
                        {isDanish ? 'Alle typer' : 'All Types'}
                      </SelectItem>
                      {ACCOUNT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {getTypeLabel(type, isDanish)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MobileFilterDropdown>

                {/* Clear filters - desktop only */}
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="hidden lg:flex text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  >
                    <X className="h-4 w-4 mr-1" />
                    {isDanish ? 'Ryd filtre' : 'Clear Filters'}
                  </Button>
                )}
              </div>

              {/* Results count */}
              <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {isDanish ? 'Viser' : 'Showing'} {filteredAccounts.length} {isDanish ? 'af' : 'of'} {stats.total} {isDanish ? 'konti' : 'accounts'}
                {hasActiveFilters && (
                  <span className="ml-2">
                    ({isDanish ? 'filtret' : 'filtered'})
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* No filtered results */}
          {filteredAccounts.length === 0 ? (
            <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
              <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">
                  {isDanish ? 'Ingen konti fundet' : 'No accounts found'}
                </p>
                <p className="text-sm mt-1">
                  {isDanish ? 'Prøv at ændre dine filtre' : 'Try adjusting your filters'}
                </p>
                <Button
                  variant="link"
                  onClick={clearFilters}
                  className="text-[#0d9488] mt-2"
                >
                  {isDanish ? 'Ryd filtre' : 'Clear Filters'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* Account Groups with type-colored left borders */
            <div className="space-y-4">
              {ACCOUNT_TYPES.filter((type) => groupedAccounts[type]).map((type) => {
                const typeAccounts = groupedAccounts[type];
                const isExpanded = expandedGroups.has(type);
                const activeCount = typeAccounts.filter((a) => a.isActive).length;
                const inactiveCount = typeAccounts.length - activeCount;
                const TypeIcon = getTypeIcon(type);

                return (
                  <Collapsible
                    key={type}
                    open={isExpanded}
                    onOpenChange={() => toggleGroup(type)}
                  >
                    <Card className={`stat-card border-0 shadow-lg dark:border dark:border-white/5 overflow-hidden border-l-4 ${TYPE_BORDER_COLOR[type] || ''} ${TYPE_BORDER_DARK[type] || ''}`}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full">
                          <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors" style={{ background: isExpanded ? 'rgba(13, 148, 136, 0.02)' : undefined }}>
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${TYPE_BG_LIGHT[type] || ''}`}>
                                <TypeIcon className={`h-5 w-5 ${TYPE_TEXT_LIGHT[type] || ''}`} />
                              </div>
                              <div className="text-left">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
                                    {getTypeHeader(type, isDanish)}
                                  </h3>
                                  <Badge variant="outline" className="text-[10px] sm:text-xs font-normal">
                                    {typeAccounts.length}
                                  </Badge>
                                  {inactiveCount > 0 && (
                                    <Badge variant="outline" className="text-[10px] sm:text-xs font-normal text-gray-400 border-gray-200 dark:border-gray-700">
                                      <XCircle className="h-3 w-3 mr-0.5" />
                                      {inactiveCount}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                  {activeCount} {isDanish ? 'aktive' : 'active'}
                                </p>
                              </div>
                            </div>
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-gray-100/50 table-zebra">
                          {/* Desktop table header */}
                          <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-2.5 bg-gray-50/50 dark:bg-white/[0.03] text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <div className="col-span-1">{isDanish ? 'Nr.' : 'No.'}</div>
                            <div className="col-span-3">{isDanish ? 'Navn' : 'Name'}</div>
                            <div className="col-span-2">{isDanish ? 'Gruppe' : 'Group'}</div>
                            <div className="col-span-2">{isDanish ? 'Status' : 'Status'}</div>
                            <div className="col-span-4 text-right">{isDanish ? 'Handlinger' : 'Actions'}</div>
                          </div>
                          {/* Account rows */}
                          <div className="max-h-96 overflow-y-auto">
                            {typeAccounts.map((account) => (
                              <div
                                key={account.id}
                                className={`border-l-4 ${TYPE_ROW_BORDER[account.type] || ''} grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 border-b border-gray-50/30 last:border-b-0 table-row-teal-hover transition-colors ${
                                  !account.isActive ? 'opacity-60' : ''
                                }`}
                              >
                                {/* ── Mobile card layout ── */}
                                <div className="md:hidden space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-mono text-sm font-bold text-gray-900 dark:text-white shrink-0">
                                        {account.number}
                                      </span>
                                      {account.isSystem && (
                                        <Lock className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                                      )}
                                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {account.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {account.isActive ? (
                                        <Badge className="badge-green text-[10px] gap-1">
                                          <CheckCircle2 className="h-2.5 w-2.5" />
                                          {isDanish ? 'Aktiv' : 'Active'}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] gap-1 text-gray-400 border-gray-200 dark:border-gray-700">
                                          <XCircle className="h-2.5 w-2.5" />
                                          {isDanish ? 'Inaktiv' : 'Inactive'}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  {account.nameEn && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate pl-[calc(theme(spacing.12)+theme(spacing.2))]">
                                      {account.nameEn}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between pl-[calc(theme(spacing.12)+theme(spacing.2))]">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${getGroupBadgeStyle(account.group)}`}
                                    >
                                      {getGroupLabel(account.group, isDanish)}
                                    </Badge>
                                    <div className="flex items-center gap-1">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => openEditDialog(account)}
                                              className="h-8 w-8 p-0 text-gray-400 hover:text-[#0d9488] dark:hover:text-[#2dd4bf]"
                                            >
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{isDanish ? 'Rediger konto' : 'Edit account'}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      {!account.isSystem && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setDeleteTarget(account)}
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{isDanish ? 'Deaktiver konto' : 'Deactivate account'}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {account.isSystem && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className="h-8 w-8 flex items-center justify-center">
                                                <Lock className="h-3.5 w-3.5 text-gray-400 dark:text-gray-600" />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{isDanish ? 'Systemkonto kan ikke slettes' : 'System account cannot be deleted'}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* ── Desktop table layout ── */}
                                {/* Number + System lock */}
                                <div className="hidden md:col-span-1 md:flex md:items-center md:gap-1.5">
                                  <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                    {account.number}
                                  </span>
                                  {account.isSystem && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Lock className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{isDanish ? 'Systemkonto — kan ikke slettes' : 'System account — cannot be deleted'}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>

                                {/* Name + English name */}
                                <div className="hidden md:col-span-3 md:flex md:items-center md:gap-2 md:min-w-0">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {account.name}
                                  </span>
                                  {account.nameEn && (
                                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                      — {account.nameEn}
                                    </span>
                                  )}
                                </div>

                                {/* Group badge */}
                                <div className="hidden md:col-span-2 md:flex md:items-center">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] sm:text-xs ${getGroupBadgeStyle(account.group)}`}
                                  >
                                    {getGroupLabel(account.group, isDanish)}
                                  </Badge>
                                </div>

                                {/* Status */}
                                <div className="hidden md:col-span-2 md:flex md:items-center">
                                  {account.isActive ? (
                                    <Badge className="badge-green text-[10px] sm:text-xs gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {isDanish ? 'Aktiv' : 'Active'}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] sm:text-xs gap-1 text-gray-400 border-gray-200 dark:border-gray-700">
                                      <XCircle className="h-3 w-3" />
                                      {isDanish ? 'Inaktiv' : 'Inactive'}
                                    </Badge>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="hidden md:col-span-4 md:flex md:items-center md:gap-1 md:justify-end">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => openEditDialog(account)}
                                          className="text-gray-400 hover:text-[#0d9488] dark:hover:text-[#2dd4bf]"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{isDanish ? 'Rediger konto' : 'Edit account'}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>

                                  {!account.isSystem ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDeleteTarget(account)}
                                            className="text-gray-400 hover:text-red-500"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{isDanish ? 'Deaktiver konto' : 'Deactivate account'}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled
                                            className="text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{isDanish ? 'Systemkonto kan ikke slettes' : 'System account cannot be deleted'}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Account Form Dialog (Add & Edit) ──────────────────────────── */}
      <AccountFormDialog
        isOpen={showAddDialog || !!editAccount}
        mode={editAccount ? 'edit' : 'add'}
        formData={formData}
        formErrors={formErrors}
        isSaving={isSaving}
        isDanish={isDanish}
        editAccount={editAccount}
        availableGroups={availableGroups}
        onClose={() => {
          setShowAddDialog(false);
          setEditAccount(null);
        }}
        onChangeFormData={setFormData}
        onSave={editAccount ? handleUpdate : handleSaveNew}
      />

      {/* ─── Delete Confirmation Dialog ────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {isDanish ? 'Deaktiver konto?' : 'Deactivate Account?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {isDanish
                    ? 'Er du sikker på, at du vil deaktivere denne konto? Kontoen markeres som inaktiv og kan ikke bruges i nye posteringer.'
                    : 'Are you sure you want to deactivate this account? The account will be marked as inactive and cannot be used in new postings.'}
                </p>

                {deleteTarget && (
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Konto' : 'Account'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {deleteTarget.number} — {deleteTarget.name}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isDanish ? 'Type' : 'Type'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {getTypeLabel(deleteTarget.type, isDanish)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg p-3">
                  <Shield className="h-4 w-4 shrink-0 mt-0.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                  <p>
                    {isDanish
                      ? 'I henhold til Bogføringslovens §5 bevares deaktiverede konti i revisionsloggen.'
                      : 'Per the Danish Bookkeeping Act §5, deactivated accounts are preserved in the audit log.'}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="dark:bg-white/5 dark:text-gray-300" onClick={() => setDeleteTarget(null)}>
              {isDanish ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isDanish ? 'Deaktiver konto' : 'Deactivate Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Account Form Dialog (reusable for Add & Edit) ─────────────────────────

interface AccountFormDialogProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  formData: AccountFormData;
  formErrors: Record<string, string>;
  isSaving: boolean;
  isDanish: boolean;
  editAccount: Account | null;
  availableGroups: string[];
  onClose: () => void;
  onChangeFormData: React.Dispatch<React.SetStateAction<AccountFormData>>;
  onSave: () => void;
}

function AccountFormDialog({
  isOpen,
  mode,
  formData,
  formErrors,
  isSaving,
  isDanish,
  editAccount,
  availableGroups,
  onClose,
  onChangeFormData,
  onSave,
}: AccountFormDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2 text-xl">
            <div className="h-10 w-10 rounded-xl bg-[#0d9488]/10 flex items-center justify-center shrink-0">
              {mode === 'add' ? (
                <Plus className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
              ) : (
                <Pencil className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
              )}
            </div>
            {mode === 'add'
              ? (isDanish ? 'Opret ny konto' : 'Create New Account')
              : (isDanish ? 'Rediger konto' : 'Edit Account')}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {mode === 'add'
              ? (isDanish
                ? 'Tilføj en ny finanskonto til din kontoplan.'
                : 'Add a new financial account to your chart of accounts.')
              : (editAccount && (
                <>
                  {isDanish ? 'Konto' : 'Account'} {editAccount.number} — {editAccount.name}
                </>
              ))}
          </DialogDescription>
        </DialogHeader>

        {formErrors._general && (
          <div className="flex items-center gap-2 text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>{formErrors._general}</p>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Account Number */}
          <div className="space-y-2">
            <Label htmlFor={`${mode}-number`} className="dark:text-gray-300">
              {isDanish ? 'Kontonummer' : 'Account Number'} <span className="text-red-500">*</span>
            </Label>
            {mode === 'edit' ? (
              <div className="flex items-center gap-2">
                <Input
                  id={`${mode}-number`}
                  value={formData.number}
                  disabled
                  className="bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0 cursor-default">
                        <Lock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isDanish ? 'Kontonummer kan ikke ændres' : 'Account number cannot be changed'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <>
                <Input
                  id={`${mode}-number`}
                  placeholder={isDanish ? 'f.eks. 1000' : 'e.g. 1000'}
                  value={formData.number}
                  onChange={(e) => onChangeFormData((f) => ({ ...f, number: e.target.value }))}
                  className={formErrors.number ? 'border-red-500 dark:border-red-500' : ''}
                />
                {formErrors.number && (
                  <p className="text-xs text-red-500">{formErrors.number}</p>
                )}
              </>
            )}
          </div>

          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor={`${mode}-name`} className="dark:text-gray-300">
              {isDanish ? 'Kontonavn (dansk)' : 'Account Name (Danish)'} <span className="text-red-500">*</span>
            </Label>
            <Input
              id={`${mode}-name`}
              placeholder={isDanish ? 'f.eks. Likvide beholdninger' : 'e.g. Cash and cash equivalents'}
              value={formData.name}
              onChange={(e) => onChangeFormData((f) => ({ ...f, name: e.target.value }))}
              className={formErrors.name ? 'border-red-500 dark:border-red-500' : ''}
            />
            {formErrors.name && (
              <p className="text-xs text-red-500">{formErrors.name}</p>
            )}
          </div>

          {/* English Name */}
          <div className="space-y-2">
            <Label htmlFor={`${mode}-nameEn`} className="dark:text-gray-300">
              {isDanish ? 'Engelsk navn' : 'English Name'}
            </Label>
            <Input
              id={`${mode}-nameEn`}
              placeholder={isDanish ? 'f.eks. Cash and cash equivalents' : 'e.g. Cash and cash equivalents'}
              value={formData.nameEn}
              onChange={(e) => onChangeFormData((f) => ({ ...f, nameEn: e.target.value }))}
            />
          </div>

          {/* Type + Group row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">
                {isDanish ? 'Kontotype' : 'Account Type'} <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.type}
                onValueChange={(val) => onChangeFormData((f) => ({ ...f, type: val, group: '' }))}
              >
                <SelectTrigger className={formErrors.type ? 'border-red-500 dark:border-red-500' : ''}>
                  <SelectValue placeholder={isDanish ? 'Vælg type' : 'Select type'} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getTypeLabel(type, isDanish)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.type && (
                <p className="text-xs text-red-500">{formErrors.type}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">
                {isDanish ? 'Kontogruppe' : 'Account Group'} <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.group}
                onValueChange={(val) => onChangeFormData((f) => ({ ...f, group: val }))}
                disabled={!formData.type}
              >
                <SelectTrigger className={formErrors.group ? 'border-red-500 dark:border-red-500' : ''}>
                  <SelectValue placeholder={isDanish ? 'Vælg gruppe' : 'Select group'} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                  {availableGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {getGroupLabel(group, isDanish)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.group && (
                <p className="text-xs text-red-500">{formErrors.group}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor={`${mode}-desc`} className="dark:text-gray-300">
              {isDanish ? 'Beskrivelse' : 'Description'}
            </Label>
            <Textarea
              id={`${mode}-desc`}
              placeholder={isDanish ? 'Valgfri beskrivelse af kontoen...' : 'Optional description for the account...'}
              value={formData.description}
              onChange={(e) => onChangeFormData((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="bg-gray-50 dark:bg-white/5"
            />
          </div>

          {/* System account warning for edit */}
          {mode === 'edit' && editAccount?.isSystem && (
            <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {isDanish
                  ? 'Dette er en systemkonto. Den kan ikke deaktiveres, men du kan ændre navn og beskrivelse.'
                  : 'This is a system account. It cannot be deactivated, but you can change the name and description.'}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="dark:bg-white/5 dark:text-gray-300"
          >
            {isDanish ? 'Annuller' : 'Cancel'}
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'add' ? (
              <Plus className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {mode === 'add'
              ? (isDanish ? 'Opret konto' : 'Create Account')
              : (isDanish ? 'Gem ændringer' : 'Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
