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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/page-header';
import { MobileFilterDropdown } from '@/components/shared/mobile-filter-dropdown';
import {
  Users,
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Loader2,
  UserCheck,
  UserMinus,
  ArrowRightLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  StickyNote,
  RotateCcw,
  FileText,
  ArrowRight,
  Receipt,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  cvrNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  type: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

type ContactTypeFilter = 'ALL' | 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

interface ContactFormData {
  name: string;
  cvrNumber: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  type: string;
  notes: string;
}

const EMPTY_FORM: ContactFormData = {
  name: '',
  cvrNumber: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'Danmark',
  type: 'CUSTOMER',
  notes: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTypeBadgeStyle(type: string): string {
  switch (type) {
    case 'CUSTOMER':
      return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20';
    case 'SUPPLIER':
      return 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/20';
    case 'BOTH':
      return 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20';
    default:
      return '';
  }
}

function getTypeLabel(type: string, language: string): string {
  const labels: Record<string, { da: string; en: string }> = {
    CUSTOMER: { da: 'Kunde', en: 'Customer' },
    SUPPLIER: { da: 'Leverandør', en: 'Supplier' },
    BOTH: { da: 'Begge', en: 'Both' },
  };
  return labels[type]?.[language === 'da' ? 'da' : 'en'] || type;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'CUSTOMER':
      return UserCheck;
    case 'SUPPLIER':
      return UserMinus;
    case 'BOTH':
      return ArrowRightLeft;
    default:
      return Users;
  }
}

function formatDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleDateString(
      language === 'da' ? 'da-DK' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' }
    );
  } catch {
    return iso;
  }
}

// Avatar gradient colors based on name
const AVATAR_GRADIENTS = [
  'from-[#0d9488] to-[#2dd4bf]',
  'from-[#059669] to-[#34d399]',
  'from-[#0891b2] to-[#22d3ee]',
  'from-[#7c3aed] to-[#a78bfa]',
  'from-[#db2777] to-[#f472b6]',
  'from-[#ea580c] to-[#fb923c]',
  'from-[#ca8a04] to-[#facc15]',
  'from-[#dc2626] to-[#f87171]',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ContactsPageProps {
  user: User;
  autoOpenCreate?: boolean;
  onAutoCreateConsumed?: () => void;
}

export function ContactsPage({ user, autoOpenCreate, onAutoCreateConsumed }: ContactsPageProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  // Data state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<ContactTypeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const response = await fetch(`/api/contacts?${params.toString()}`);
      if (!response.ok) {
        throw new Error(isDanish ? 'Kunne ikke hente kontakter' : 'Failed to fetch contacts');
      }
      const data = await response.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      setError(err instanceof Error ? err.message : (isDanish ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter, searchQuery, isDanish]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Auto-open create dialog when navigated from mobile FAB
  useEffect(() => {
    if (autoOpenCreate) {
      openCreateDialog();
      onAutoCreateConsumed?.();
    }
  }, [autoOpenCreate, onAutoCreateConsumed]);

  // ─── Computed Values ────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const allActive = contacts.filter((c) => c.isActive);
    // Count contacts with outstanding balance (those with type CUSTOMER or BOTH who have active invoices)
    // For now we approximate by counting contacts that are customers or both since we don't have invoice data here
    const withOutstanding = allActive.filter((c) => c.type === 'CUSTOMER' || c.type === 'BOTH').length;
    return {
      total: allActive.length,
      customers: allActive.filter((c) => c.type === 'CUSTOMER').length,
      suppliers: allActive.filter((c) => c.type === 'SUPPLIER').length,
      both: allActive.filter((c) => c.type === 'BOTH').length,
      withOutstanding,
    };
  }, [contacts]);

  const hasActiveFilters = typeFilter !== 'ALL' || searchQuery.trim() !== '';

  const typeFilterPills = useMemo(() => [
    { value: 'ALL', label: isDanish ? 'Alle' : 'All', count: stats.total },
    { value: 'CUSTOMER', label: isDanish ? 'Kunder' : 'Customers', count: stats.customers },
    { value: 'SUPPLIER', label: isDanish ? 'Leverandører' : 'Suppliers', count: stats.suppliers },
    { value: 'BOTH', label: isDanish ? 'Begge' : 'Both', count: stats.both },
  ], [stats, isDanish]);

  const clearFilters = () => {
    setTypeFilter('ALL');
    setSearchQuery('');
  };

  // ─── Form Handlers ──────────────────────────────────────────────────────

  const openCreateDialog = () => {
    setEditingContact(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      cvrNumber: contact.cvrNumber || '',
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
      city: contact.city || '',
      postalCode: contact.postalCode || '',
      country: contact.country || 'Danmark',
      type: contact.type,
      notes: contact.notes || '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      setFormError(isDanish ? 'Navn er påkrævet' : 'Name is required');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const body = {
        name: formData.name.trim(),
        cvrNumber: formData.cvrNumber.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        postalCode: formData.postalCode.trim() || undefined,
        country: formData.country.trim() || 'Danmark',
        type: formData.type,
        notes: formData.notes.trim() || undefined,
      };

      const url = editingContact
        ? `/api/contacts/${editingContact.id}`
        : '/api/contacts';
      const method = editingContact ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || (isDanish ? 'Kunne ikke gemme kontakt' : 'Failed to save contact'));
      }

      setIsFormOpen(false);
      fetchContacts();
    } catch (err) {
      console.error('Save contact error:', err);
      setFormError(err instanceof Error ? err.message : (isDanish ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  }, [formData, editingContact, isDanish, fetchContacts]);

  // ─── Delete Handler ─────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/contacts/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(isDanish ? 'Kunne ikke slette kontakt' : 'Failed to delete contact');
      }
      setDeleteTarget(null);
      fetchContacts();
    } catch (err) {
      console.error('Delete contact error:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, isDanish, fetchContacts]);

  // ─── Loading Skeleton ───────────────────────────────────────────────────

  if (isLoading && contacts.length === 0) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-44" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-12" />
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
            <div className="flex flex-col sm:flex-row gap-3">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>

        {/* Contact cards skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                    <div className="flex flex-wrap gap-4">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
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
        title={isDanish ? 'Kontakter' : 'Contacts'}
        description={isDanish
          ? 'Administrer dine kunder og leverandører'
          : 'Manage your customers and suppliers'}
        action={
          <Button
            onClick={openCreateDialog}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] font-medium gap-2 transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
          >
            <Plus className="h-4 w-4" />
            {isDanish ? 'Ny kontakt' : 'New Contact'}
          </Button>
        }
      />

      {/* Summary Stats */}
      {contacts.length > 0 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Contacts */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'I alt' : 'Total Contacts'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {stats.total}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                <Users className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customers */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Kunder' : 'Customers'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {stats.customers}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                <UserCheck className="h-4 w-4 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suppliers */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Leverandører' : 'Suppliers'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {stats.suppliers}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-turquoise flex items-center justify-center">
                <UserMinus className="h-4 w-4 sm:h-6 sm:w-6 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* With Outstanding Balance */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isDanish ? 'Udestående saldo' : 'Outstanding'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {stats.withOutstanding}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                <AlertCircle className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Filter Bar */}
      {contacts.length > 0 && (
      <Card className="stat-card">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search input - always visible */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={
                  isDanish
                    ? 'Søg efter navn, CVR, e-mail eller by...'
                    : 'Search by name, CVR, email or city...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0"
              />
            </div>

            {/* Mobile: Popover dropdown with type filter options */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden h-9 gap-1.5 shrink-0 border-gray-200 dark:border-gray-700">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">
                    {typeFilterPills.find(p => p.value === typeFilter)?.label || (isDanish ? 'Alle' : 'All')}
                  </span>
                  {(typeFilter !== 'ALL' ? 1 : 0) + (searchQuery.trim() ? 1 : 0) > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] font-bold bg-[#0d9488] text-white">
                      {(typeFilter !== 'ALL' ? 1 : 0) + (searchQuery.trim() ? 1 : 0)}
                    </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-1" align="end">
                <div className="space-y-0.5">
                  {typeFilterPills.map((pill) => (
                    <button
                      key={pill.value}
                      onClick={() => setTypeFilter(pill.value as ContactTypeFilter)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                        typeFilter === pill.value
                          ? 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {pill.value === 'CUSTOMER' && <UserCheck className="h-3.5 w-3.5" />}
                        {pill.value === 'SUPPLIER' && <UserMinus className="h-3.5 w-3.5" />}
                        {pill.value === 'BOTH' && <ArrowRightLeft className="h-3.5 w-3.5" />}
                        {pill.value === 'ALL' && <Users className="h-3.5 w-3.5" />}
                        {pill.label}
                      </span>
                      <span className={`
                        inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold
                        ${typeFilter === pill.value
                          ? 'bg-[#0d9488]/20 text-[#0d9488] dark:bg-[#2dd4bf]/20 dark:text-[#2dd4bf]'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                        }
                      `}>
                        {pill.count}
                      </span>
                    </button>
                  ))}
                </div>
                {hasActiveFilters && (
                  <>
                    <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                    <button
                      onClick={clearFilters}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      {isDanish ? 'Ryd filtre' : 'Clear filters'}
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>

            {/* Desktop: inline pills */}
            <MobileFilterDropdown
              activeFilterCount={(typeFilter !== 'ALL' ? 1 : 0) + (searchQuery.trim() ? 1 : 0)}
              language={isDanish ? 'da' : 'en'}
              onClearFilters={clearFilters}
            >
              <div className="hidden lg:flex flex-wrap gap-2">
                {typeFilterPills.map((pill) => (
                  <button
                    key={pill.value}
                    onClick={() => setTypeFilter(pill.value as ContactTypeFilter)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                      ${typeFilter === pill.value
                        ? pill.value === 'CUSTOMER'
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
                          : pill.value === 'SUPPLIER'
                            ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/25'
                            : pill.value === 'BOTH'
                              ? 'bg-[#0d9488] text-white shadow-sm shadow-[#0d9488]/25'
                              : 'bg-gray-600 text-white shadow-sm shadow-gray-600/25'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    {pill.value === 'CUSTOMER' && <UserCheck className="h-3.5 w-3.5" />}
                    {pill.value === 'SUPPLIER' && <UserMinus className="h-3.5 w-3.5" />}
                    {pill.value === 'BOTH' && <ArrowRightLeft className="h-3.5 w-3.5" />}
                    {pill.value === 'ALL' && <Users className="h-3.5 w-3.5" />}
                    {pill.label}
                    <span className={`
                      inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold
                      ${typeFilter === pill.value
                        ? 'text-white/80'
                        : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }
                    `}>
                      {pill.count}
                    </span>
                  </button>
                ))}
              </div>
            </MobileFilterDropdown>
          </div>

          {/* Results count */}
          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {isDanish ? 'Viser' : 'Showing'} {contacts.length} {isDanish ? 'kontakter' : 'contacts'}
            {hasActiveFilters && (
              <span className="ml-1">
                ({isDanish ? 'filtret' : 'filtered'})
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Contacts List */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4 sm:p-6">
          {error ? (
            <div className="text-center py-12 text-red-500 dark:text-red-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">{error}</p>
              <Button
                variant="link"
                onClick={fetchContacts}
                className="text-[#0d9488] mt-2"
              >
                {isDanish ? 'Prøv igen' : 'Try Again'}
              </Button>
            </div>
          ) : contacts.length === 0 ? (
            <div className="empty-state-container">
              <div className="empty-state-illustration">
                <div className="empty-state-icon h-16 w-16 rounded-2xl flex items-center justify-center">
                  <Users className="h-8 w-8 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {hasActiveFilters
                  ? (isDanish ? 'Ingen kontakter fundet' : 'No contacts found')
                  : (isDanish ? 'Ingen kontakter endnu' : 'No contacts yet')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm mx-auto">
                {hasActiveFilters
                  ? (isDanish
                    ? 'Prøv at ændre dine filtre for at finde det, du leder efter.'
                    : 'Try adjusting your filters to find what you are looking for.')
                  : (isDanish
                    ? 'Opret din første kontakt for at komme i gang med at holde styr på dine kunder og leverandører.'
                    : 'Create your first contact to start keeping track of your customers and suppliers.')}
              </p>
              {hasActiveFilters ? (
                <Button variant="link" onClick={clearFilters} className="text-[#0d9488]">
                  {isDanish ? 'Ryd filtre' : 'Clear Filters'}
                </Button>
              ) : (
                <Button
                  onClick={openCreateDialog}
                  className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {isDanish ? 'Opret kontakt' : 'Create Contact'}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {contacts.map((contact) => {
                const initials = getInitials(contact.name);
                const gradient = getAvatarGradient(contact.name);
                return (
                  <div
                    key={contact.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl bg-gray-50 dark:bg-white/5 contact-card-hover group"
                  >
                    {/* Left: Avatar with initials */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                        <span className="text-white text-sm font-bold select-none">{initials}</span>
                      </div>
                      {/* Type badge (mobile only) */}
                      <div className="sm:hidden">
                        <Badge className={`text-[10px] px-1.5 border ${getTypeBadgeStyle(contact.type)}`}>
                          {getTypeLabel(contact.type, language)}
                        </Badge>
                      </div>
                    </div>

                    {/* Middle: Contact info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Name row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">
                          {contact.name}
                        </h3>
                        {/* CVR badge */}
                        {contact.cvrNumber && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs font-normal bg-gray-100 text-gray-600 dark:text-gray-400 border-0 gap-1">
                            <Building2 className="h-3 w-3" />
                            {contact.cvrNumber}
                          </Badge>
                        )}
                        {/* Type badge (desktop) */}
                        <Badge className={`text-[10px] sm:text-xs px-1.5 sm:px-2 border hidden sm:inline-flex ${getTypeBadgeStyle(contact.type)}`}>
                          {getTypeLabel(contact.type, language)}
                        </Badge>
                      </div>

                      {/* Contact details */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {contact.email && (
                          <span className="flex items-center gap-1.5 truncate max-w-[240px]">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            {contact.phone}
                          </span>
                        )}
                      </div>

                      {/* Location */}
                      {(contact.city || contact.postalCode || contact.country) && (
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {[contact.address, contact.postalCode, contact.city, contact.country !== 'Danmark' ? contact.country : null]
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      )}

                      {/* Notes preview */}
                      {contact.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 max-w-md">
                          <StickyNote className="h-3 w-3 inline mr-1 -mt-0.5" />
                          {contact.notes}
                        </p>
                      )}

                      {/* Created date */}
                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {isDanish ? 'Oprettet' : 'Created'} {formatDate(contact.createdAt, language)}
                      </p>
                    </div>

                    {/* Right: Quick Actions */}
                    <div className="flex items-center gap-1 shrink-0 self-start">
                      {/* Create Invoice quick action */}
                      {(contact.type === 'CUSTOMER' || contact.type === 'BOTH') && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-gray-500 hover:text-[#0d9488] dark:text-gray-400 dark:hover:text-[#2dd4bf]"
                                onClick={() => {
                                  // Navigate to invoices page - we just show a toast for now
                                  toast.info(isDanish ? 'Opret faktura for denne kontakt' : 'Create invoice for this contact', {
                                    description: contact.name,
                                  });
                                }}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{isDanish ? 'Opret faktura' : 'Create Invoice'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* View Transactions quick action */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-500 hover:text-[#0d9488] dark:text-gray-400 dark:hover:text-[#2dd4bf]"
                              onClick={() => {
                                toast.info(isDanish ? 'Vis posteringer' : 'View transactions', {
                                  description: contact.name,
                                });
                              }}
                            >
                              <Receipt className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{isDanish ? 'Vis posteringer' : 'View Transactions'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Edit */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(contact)}
                              className="text-gray-500 hover:text-[#0d9488] dark:text-gray-400 dark:hover:text-[#2dd4bf]"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{isDanish ? 'Rediger' : 'Edit'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Delete */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(contact)}
                              className="text-gray-500 hover:text-red-500 dark:text-gray-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{isDanish ? 'Slet kontakt' : 'Delete Contact'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Contact Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) setIsFormOpen(false); }}>
        <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              {editingContact ? (
                <>
                  <Pencil className="h-5 w-5 text-[#0d9488]" />
                  {isDanish ? 'Rediger kontakt' : 'Edit Contact'}
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5 text-[#0d9488]" />
                  {isDanish ? 'Ny kontakt' : 'New Contact'}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {editingContact
                ? (isDanish
                  ? 'Opdater kontaktoplysningerne.'
                  : 'Update the contact details.')
                : (isDanish
                  ? 'Opret en ny kunde eller leverandør.'
                  : 'Create a new customer or supplier.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Error message */}
            {formError && (
              <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            {/* Name (required) */}
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">
                {isDanish ? 'Navn' : 'Name'} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="contact-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={isDanish ? 'Firma- eller personnavn' : 'Business or person name'}
                className="bg-gray-50 dark:bg-white/5"
                autoFocus
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label htmlFor="contact-type">
                {isDanish ? 'Type' : 'Type'}
              </Label>
              <Select
                value={formData.type}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, type: val }))}
              >
                <SelectTrigger id="contact-type" className="bg-gray-50 dark:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                  <SelectItem value="CUSTOMER">
                    <span className="flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                      {isDanish ? 'Kunde' : 'Customer'}
                    </span>
                  </SelectItem>
                  <SelectItem value="SUPPLIER">
                    <span className="flex items-center gap-2">
                      <UserMinus className="h-3.5 w-3.5 text-sky-600" />
                      {isDanish ? 'Leverandør' : 'Supplier'}
                    </span>
                  </SelectItem>
                  <SelectItem value="BOTH">
                    <span className="flex items-center gap-2">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-[#0d9488]" />
                      {isDanish ? 'Kunde & Leverandør' : 'Customer & Supplier'}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* CVR Number */}
            <div className="space-y-1.5">
              <Label htmlFor="contact-cvr">
                {isDanish ? 'CVR-nr.' : 'CVR Number'} <span className="text-gray-400 text-xs">({isDanish ? 'valgfrit' : 'optional'})</span>
              </Label>
              <Input
                id="contact-cvr"
                value={formData.cvrNumber}
                onChange={(e) => setFormData((prev) => ({ ...prev, cvrNumber: e.target.value }))}
                placeholder={isDanish ? 'fx 12345678' : 'e.g. 12345678'}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>

            {/* Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">
                  {isDanish ? 'E-mail' : 'Email'} <span className="text-gray-400 text-xs">({isDanish ? 'valgfrit' : 'optional'})</span>
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-phone">
                  {isDanish ? 'Telefon' : 'Phone'} <span className="text-gray-400 text-xs">({isDanish ? 'valgfrit' : 'optional'})</span>
                </Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+45 12 34 56 78"
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label htmlFor="contact-address">
                {isDanish ? 'Adresse' : 'Address'} <span className="text-gray-400 text-xs">({isDanish ? 'valgfrit' : 'optional'})</span>
              </Label>
              <Input
                id="contact-address"
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                placeholder={isDanish ? 'Gadenavn og husnummer' : 'Street name and number'}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>

            {/* City, Postal Code, Country */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-postal">
                  {isDanish ? 'Postnr.' : 'Postal Code'}
                </Label>
                <Input
                  id="contact-postal"
                  value={formData.postalCode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, postalCode: e.target.value }))}
                  placeholder={isDanish ? '1234' : '1234'}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="contact-city">
                  {isDanish ? 'By' : 'City'}
                </Label>
                <Input
                  id="contact-city"
                  value={formData.city}
                  onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder={isDanish ? 'København' : 'Copenhagen'}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label htmlFor="contact-country">
                  {isDanish ? 'Land' : 'Country'}
                </Label>
                <Input
                  id="contact-country"
                  value={formData.country}
                  onChange={(e) => setFormData((prev) => ({ ...prev, country: e.target.value }))}
                  placeholder="Danmark"
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="contact-notes">
                {isDanish ? 'Noter' : 'Notes'} <span className="text-gray-400 text-xs">({isDanish ? 'valgfrit' : 'optional'})</span>
              </Label>
              <Textarea
                id="contact-notes"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder={isDanish ? 'Interne noter om denne kontakt...' : 'Internal notes about this contact...'}
                className="bg-gray-50 dark:bg-white/5 min-h-[80px]"
                rows={3}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(false)}
              className="dark:bg-white/5 dark:text-gray-300"
            >
              {isDanish ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !formData.name.trim()}
              className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {editingContact
                    ? (isDanish ? 'Gem ændringer' : 'Save Changes')
                    : (isDanish ? 'Opret kontakt' : 'Create Contact')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {isDanish ? 'Slet kontakt?' : 'Delete Contact?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400" asChild>
              <div className="space-y-3">
                <p>
                  {isDanish
                    ? 'Er du sikker på, at du vil slette denne kontakt? I henhold til bogføringsloven slettes data ikke — kontakten markeres som inaktiv og bevares i revisionsloggen.'
                    : 'Are you sure you want to delete this contact? Per the Bookkeeping Act, data is never deleted — the contact is marked as inactive and preserved in the audit log.'}
                </p>
                {deleteTarget && (
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{deleteTarget.name}</span>
                      {deleteTarget.cvrNumber && (
                        <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 dark:text-gray-400 border-0">
                          {deleteTarget.cvrNumber}
                        </Badge>
                      )}
                      <Badge className={`text-xs border ${getTypeBadgeStyle(deleteTarget.type)}`}>
                        {getTypeLabel(deleteTarget.type, language)}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              className="dark:bg-white/5 dark:text-gray-300"
              onClick={() => setDeleteTarget(null)}
            >
              {isDanish ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isDanish ? 'Sletter...' : 'Deleting...'}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDanish ? 'Slet kontakt' : 'Delete Contact'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
