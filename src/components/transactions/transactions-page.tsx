'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import { PageHeader } from '@/components/shared/page-header';
import { StatsCard } from '@/components/shared/stats-card';
import { MobileFilterDropdown } from '@/components/shared/mobile-filter-dropdown';
import { toast } from "sonner";
import {
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Eye,
  FileText,
  Loader2,
  Filter,
  X,
  Receipt,
  ArrowUpCircle,
  ArrowDownCircle,
  Upload,
  Paperclip,
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';

interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE' | 'SALARY' | 'BANK' | 'Z_REPORT' | 'PRIVATE' | 'ADJUSTMENT';
  amount: number;
  description: string;
  vatPercent: number;
  receiptImage: string | null;
  invoiceId?: string | null;
  // Journal-entry-derived VAT (authoritative) — from double-entry journal.
  // null when no journal entry exists.
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

/** Compute display VAT rate and amount for a transaction.
 *  When journalVAT is available (authoritative from double-entry), use it.
 *  Otherwise fall back to the transaction's own vatPercent field:
 *    - Virtual transactions (id starts with "inv-") carry NET amounts → VAT = net × rate / 100
 *    - Real SALE transactions carry GROSS amounts → VAT = gross × rate / (100 + rate)
 *    - Real PURCHASE/other transactions carry NET amounts → VAT = net × rate / 100
 */
function getDisplayVAT(tx: Transaction): { rate: number; amount: number } {
  if (tx.journalVAT && tx.journalVAT.amount > 0) {
    return { rate: tx.journalVAT.rate, amount: tx.journalVAT.amount };
  }
  const rate = tx.vatPercent || 0;
  if (rate === 0 || tx.amount <= 0) return { rate: 0, amount: 0 };
  // Virtual invoice-derived transactions have net amounts
  const isVirtual = tx.id?.startsWith('inv-');
  const netVat = isVirtual || tx.type !== 'SALE'
    ? tx.amount * rate / 100
    : tx.amount * rate / (100 + rate);
  return { rate, amount: Math.round(netVat * 100) / 100 };
}

interface VATRegisterSummary {
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
}

interface TransactionsPageProps {
  user: User;
  hideHeader?: boolean;
  defaultTypeFilter?: string;
}

type SortField = 'date' | 'amount' | 'vatPercent';
type SortDirection = 'asc' | 'desc';

export function TransactionsPage({ user, hideHeader, defaultTypeFilter }: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const { t, tc, td, language } = useTranslation();

  // Receipt upload state
  const [uploadDialogTransactionId, setUploadDialogTransactionId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [vatFilter, setVatFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>(defaultTypeFilter || 'all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [mobileDisplayCount, setMobileDisplayCount] = useState(10);

  // Helper: get receipt image URL from stored path
  const getReceiptUrl = useCallback((receiptImage: string | null) => {
    if (!receiptImage) return null;
    // Convert "uploads/receipts/{userId}/{file}" to "/api/receipts/receipts/{userId}/{file}"
    return `/api/receipts/${receiptImage}`;
  }, []);

  // VAT register data (single source of truth for VAT totals)
  const [vatSummary, setVatSummary] = useState<VATRegisterSummary | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      // Fetch transactions, invoices, and VAT register in parallel
      const [txResponse, invResponse, vatResponse] = await Promise.all([
        fetch('/api/transactions'),
        fetch('/api/invoices'),
        fetch(`/api/vat-register?from=${new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}`),
      ]);

      if (!txResponse.ok) console.error('Transactions API error:', txResponse.status);
      if (!invResponse.ok) console.error('Invoices API error:', invResponse.status);

      const txData = txResponse.ok ? await txResponse.json() : {};
      const invData = invResponse.ok ? await invResponse.json() : {};

      // Store VAT register data as the authoritative VAT source
      if (vatResponse.ok) {
        const vatData = await vatResponse.json();
        setVatSummary({
          totalOutputVAT: vatData.totalOutputVAT || 0,
          totalInputVAT: vatData.totalInputVAT || 0,
          netVATPayable: vatData.netVATPayable || 0,
        });
      }

      const allTransactions: Transaction[] = txData.transactions || [];
      const invoices: Invoice[] = invData.invoices || [];

      // Collect IDs of invoices that already have transactions (to avoid double-counting)
      const invoiceIdsWithTransactions = new Set(
        allTransactions
          .filter((tx) => tx.invoiceId)
          .map((tx) => tx.invoiceId)
      );

      // For invoices without transactions, create virtual transactions from line items
      const virtualTransactions: Transaction[] = [];

      for (const invoice of invoices) {
        if (invoice.status === 'CANCELLED') continue;
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

      // Merge real transactions with virtual ones from invoices
      setTransactions([...allTransactions, ...virtualTransactions]);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleAddTransaction = useCallback(() => {
    setIsDialogOpen(false);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleDeleteTransaction = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
        toast.success(t('transactionDeleted') || (language === 'da' ? 'Postering slettet' : 'Transaction deleted'), {
          description: language === 'da' ? 'Posteringen er blevet fjernet' : 'The transaction has been removed',
        });
        fetchTransactions();
      } catch (error) {
        console.error('Failed to delete transaction:', error);
        toast.error(language === 'da' ? 'Kunne ikke slette postering' : 'Failed to delete transaction');
      }
    },
    [fetchTransactions, t, language]
  );

  const handleExportPeppol = useCallback(async (transactionId: string) => {
    try {
      setExportingId(transactionId);
      const response = await fetch(`/api/transactions/export-peppol?id=${transactionId}`);
      if (!response.ok) throw new Error('Failed to export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oioubl-${transactionId.substring(0, 8)}.xml`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(language === 'da' ? 'OIOUBL eksporteret' : 'OIOUBL exported', {
        description: language === 'da' ? 'Filen er blevet downloadet' : 'The file has been downloaded',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(language === 'da' ? 'Eksport mislykkedes' : 'Export failed');
    } finally {
      setExportingId(null);
    }
  }, [language]);

  // Handle file selection for upload-to-existing-transaction
  const handleUploadFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(language === 'da' ? 'Filstørrelsen skal være under 10MB' : 'File size must be less than 10MB');
        return;
      }

      setUploadFile(file);
      setUploadError('');

      // Create preview
      const reader = new FileReader();
      reader.onload = () => {
        setUploadPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    },
    [language]
  );

  // Upload receipt to existing transaction
  const handleUploadReceipt = useCallback(async () => {
    if (!uploadFile || !uploadDialogTransactionId) return;

    setIsUploading(true);
    setUploadError('');

    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', uploadFile);

      const uploadResponse = await fetch('/api/transactions/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(language === 'da' ? 'Kunne ikke uploade kvittering' : 'Failed to upload receipt');
      }

      const uploadData = await uploadResponse.json();

      // Update transaction with receipt path
      const updateResponse = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uploadDialogTransactionId,
          receiptImage: uploadData.path,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error(language === 'da' ? 'Kunne ikke opdatere postering' : 'Failed to update transaction');
      }

      // Close dialog and refresh
      closeUploadDialog();
      toast.success(language === 'da' ? 'Kvittering uploadet' : 'Receipt uploaded', {
        description: language === 'da' ? 'Kvitteringen er blevet tilknyttet posteringen' : 'The receipt has been attached to the transaction',
      });
      fetchTransactions();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : (language === 'da' ? 'Der opstod en fejl' : 'An error occurred'));
    } finally {
      setIsUploading(false);
    }
  }, [uploadFile, uploadDialogTransactionId, language, fetchTransactions]);

  // Remove receipt from transaction
  const handleRemoveReceipt = useCallback(
    async (transactionId: string) => {
      try {
        const updateResponse = await fetch('/api/transactions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: transactionId,
            receiptImage: null,
          }),
        });

        if (!updateResponse.ok) {
          throw new Error('Failed to remove receipt');
        }

        setSelectedReceipt(null);
        toast.success(language === 'da' ? 'Kvittering fjernet' : 'Receipt removed', {
          description: language === 'da' ? 'Kvitteringen er blevet slettet' : 'The receipt has been deleted',
        });
        fetchTransactions();
      } catch (error) {
        console.error('Failed to remove receipt:', error);
        toast.error(language === 'da' ? 'Kunne ikke fjerne kvittering' : 'Failed to remove receipt');
      }
    },
    [fetchTransactions, language]
  );

  // Open upload dialog for a specific transaction
  const openUploadDialog = useCallback((transactionId: string) => {
    setUploadDialogTransactionId(transactionId);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadError('');
    setIsUploading(false);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  }, []);

  const closeUploadDialog = useCallback(() => {
    setUploadDialogTransactionId(null);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadError('');
    setIsUploading(false);
  }, []);

  // Get unique VAT rates for filter
  const vatRates = useMemo(() => {
    const rates = new Set(transactions.map((t) => t.vatPercent));
    return Array.from(rates).sort((a, b) => b - a);
  }, [transactions]);

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          t.amount.toString().includes(query)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((t) => t.type === typeFilter);
    }

    // VAT filter
    if (vatFilter !== 'all') {
      result = result.filter((t) => t.vatPercent.toString() === vatFilter);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === 'amount') {
        comparison = a.amount - b.amount;
      } else if (sortField === 'vatPercent') {
        comparison = a.vatPercent - b.vatPercent;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [transactions, searchQuery, typeFilter, vatFilter, sortField, sortDirection]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setMobileDisplayCount(10);
  }, [searchQuery, typeFilter, vatFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  // Mobile: show-more pagination (independent of desktop pagination)
  const mobileVisibleTransactions = useMemo(() => {
    return filteredTransactions.slice(0, mobileDisplayCount);
  }, [filteredTransactions, mobileDisplayCount]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setVatFilter('all');
    setTypeFilter('all');
  };

  // Calculate summary stats — VAT totals come exclusively from the VAT register
  // (double-entry journal), not from the legacy transaction formula.
  const stats = useMemo(() => {
    const sales = transactions.filter(t => t.type === 'SALE' || !t.type);
    const purchases = transactions.filter(t => t.type === 'PURCHASE');
    
    const salesAmount = sales.reduce((sum, t) => sum + t.amount, 0);
    const purchasesAmount = purchases.reduce((sum, t) => sum + t.amount, 0);

    // Use VAT register as the single source of truth for VAT amounts
    const outputVAT = vatSummary?.totalOutputVAT ?? 0;
    const inputVAT = vatSummary?.totalInputVAT ?? 0;
    
    return {
      salesCount: sales.length,
      purchasesCount: purchases.length,
      salesAmount,
      purchasesAmount,
      outputVAT,
      inputVAT,
    };
  }, [transactions, vatSummary]);

  // Find transaction for receipt preview
  const selectedTransaction = useMemo(() => {
    if (!selectedReceipt) return null;
    return transactions.find(t => t.receiptImage === selectedReceipt) || null;
  }, [selectedReceipt, transactions]);

  // Helper: get type display info for mobile cards
  const getTypeInfo = (type: string) => {
    const isIncome = type === 'SALE' || !type;
    const isExpense = type === 'PURCHASE';

    if (isIncome) {
      return {
        label: language === 'da' ? 'Indtægt' : 'Income',
        amountClass: 'text-green-600 dark:text-green-400',
        badgeClass: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      };
    }

    if (isExpense) {
      return {
        label: language === 'da' ? 'Udgift' : 'Expense',
        amountClass: 'text-red-600 dark:text-red-400',
        badgeClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      };
    }

    // Other types (SALARY, BANK, Z_REPORT, PRIVATE, ADJUSTMENT)
    const otherLabels: Record<string, { da: string; en: string }> = {
      SALARY: { da: 'Løn', en: 'Salary' },
      BANK: { da: 'Bank', en: 'Bank' },
      Z_REPORT: { da: 'Z-Rapport', en: 'Z-Report' },
      PRIVATE: { da: 'Privat', en: 'Private' },
      ADJUSTMENT: { da: 'Regulering', en: 'Adjustment' },
    };
    const labelInfo = otherLabels[type] || { da: 'Andet', en: 'Other' };

    return {
      label: language === 'da' ? labelInfo.da : labelInfo.en,
      amountClass: 'text-blue-600 dark:text-blue-400',
      badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    };
  };

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
      {!hideHeader && (
      <PageHeader
        title={t('transactions')}
        description={t('manageTransactions')}
        action={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm gap-2">
                <Plus className="h-4 w-4" />
                {t('addTransaction')}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="dark:text-white flex items-center gap-2">
                  <Plus className="h-5 w-5 text-[#2dd4bf]" />
                  {t('addTransaction')}
                </DialogTitle>
                <DialogDescription className="dark:text-gray-400">{t('recordNewTransaction')}</DialogDescription>
              </DialogHeader>
              <AddTransactionForm onSuccess={handleAddTransaction} />
            </DialogContent>
          </Dialog>
        }
      />
      )}

      {/* Summary Cards */}
      {transactions.length > 0 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-children">
        <StatsCard
          icon={ArrowUpCircle}
          label={t('sales')}
          value={stats.salesAmount}
          variant="green"
          badge={`${stats.salesCount}`}
        />
        <StatsCard
          icon={ArrowDownCircle}
          label={t('purchases')}
          value={stats.purchasesAmount}
          variant="amber"
          badge={`${stats.purchasesCount}`}
        />
        <StatsCard
          icon={ArrowUpCircle}
          label={t('outputVAT')}
          value={stats.outputVAT}
          variant="primary"
        />
        <StatsCard
          icon={ArrowDownCircle}
          label={t('inputVAT')}
          value={stats.inputVAT}
          variant="purple"
        />
      </div>
      )}

      {/* Filters Card */}
      {transactions.length > 0 && (
      <Card className="stat-card">
        <CardContent className="p-4 pb-2 lg:pb-4">
          {/* Results count — above search on mobile, below on desktop */}
          <div className="text-sm text-gray-500 dark:text-gray-400 lg:mt-0">
            {t('showingOf')} {filteredTransactions.length} {t('of')} {transactions.length} {t('transactionsWord')}
          </div>
          <div className="flex flex-wrap gap-2 items-center mt-2 lg:mt-3">
            {/* Search - always visible */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('searchDescription')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-white/5 border-0"
              />
            </div>

            {/* Filter dropdowns - mobile dropdown / desktop inline */}
            <MobileFilterDropdown
              activeFilterCount={(typeFilter !== 'all' ? 1 : 0) + (vatFilter !== 'all' ? 1 : 0)}
              language={language}
              onClearFilters={clearFilters}
            >
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="shrink-0 w-auto min-w-[110px] bg-gray-50 dark:bg-white/5 border-0">
                    <SelectValue placeholder={t('type')} />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                    <SelectItem value="all">{t('allTypes')}</SelectItem>
                    <SelectItem value="SALE">{t('sale')}</SelectItem>
                    <SelectItem value="PURCHASE">{t('purchase')}</SelectItem>
                    <SelectItem value="SALARY">{t('transactionTypeSalary')}</SelectItem>
                    <SelectItem value="BANK">{t('transactionTypeBank')}</SelectItem>
                    <SelectItem value="Z_REPORT">{t('transactionTypeZReport')}</SelectItem>
                    <SelectItem value="PRIVATE">{t('transactionTypePrivate')}</SelectItem>
                    <SelectItem value="ADJUSTMENT">{t('transactionTypeAdjustment')}</SelectItem>
                  </SelectContent>
                </Select>
              <Select value={vatFilter} onValueChange={setVatFilter}>
                  <SelectTrigger className="hidden sm:flex shrink-0 w-auto min-w-[110px] bg-gray-50 dark:bg-white/5 border-0">
                    <SelectValue placeholder={t('vatPercent')} />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                    <SelectItem value="all">{t('allRates')}</SelectItem>
                    {vatRates.map((rate) => (
                      <SelectItem key={rate} value={rate.toString()}>
                        {rate}% VAT
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </MobileFilterDropdown>
          </div>

        </CardContent>
      </Card>
      )}

      {/* Transactions Table */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="empty-state-container">
              <div className="empty-state-illustration">
                <div className="empty-state-icon h-16 w-16 mx-auto rounded-2xl flex items-center justify-center mb-4">
                  <Receipt className="h-8 w-8 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {t('noTransactionsFound')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm mx-auto">
                {language === 'da' 
                  ? 'Start med at registrere din første postering for at se den her.' 
                  : 'Start by recording your first transaction to see it here.'}
              </p>
              {(searchQuery || vatFilter !== 'all' || typeFilter !== 'all') && (
                <Button variant="outline" onClick={clearFilters} className="gap-2 text-[#0d9488]">
                  <X className="h-4 w-4" />
                  {t('clearFilters')}
                </Button>
              )}
            </div>
          ) : (
              <>
              {/* ===== Mobile Card List (lg:hidden) ===== */}
              <div className="lg:hidden p-3 space-y-3">
                {mobileVisibleTransactions.map((transaction) => {
                  const typeInfo = getTypeInfo(transaction.type);
                  return (
                    <div
                      key={transaction.id}
                      className="bg-white dark:bg-[#1a1f1e] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-transform cursor-pointer"
                    >
                      {/* Row 1: Description + Amount */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {transaction.description}
                          </p>
                          {transaction.id.startsWith('inv-') && (
                            <Badge className="mt-1 text-[10px] px-1.5 py-0 bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-0 gap-1">
                              <FileText className="h-2.5 w-2.5" />
                              {language === 'da' ? 'Faktura' : 'Invoice'}
                            </Badge>
                          )}
                        </div>
                        <span className={`text-base font-bold whitespace-nowrap ${typeInfo.amountClass}`}>
                          {tc(transaction.amount)}
                        </span>
                      </div>

                      {/* Row 2: Date + Type Badge */}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {td(new Date(transaction.date))}
                        </span>
                        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border-0 ${typeInfo.badgeClass}`}>
                          {typeInfo.label}
                        </span>
                      </div>

                      {/* Row 3: VAT + Actions (non-virtual transactions only) */}
                      {!transaction.id.startsWith('inv-') && (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t('vatPercent')}: {getDisplayVAT(transaction).rate}% · {tc(getDisplayVAT(transaction).amount)}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {transaction.receiptImage ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedReceipt(transaction.receiptImage)}
                                className="h-8 w-8 p-0 text-[#0d9488] hover:text-[#0d9488] hover:bg-[#0d9488]/10"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openUploadDialog(transaction.id)}
                                className="h-8 w-8 p-0 text-gray-500 hover:text-[#0d9488] dark:text-gray-400 dark:hover:text-[#2dd4bf] hover:bg-[#0d9488]/10"
                              >
                                <Paperclip className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExportPeppol(transaction.id)}
                              disabled={exportingId === transaction.id}
                              className="h-8 w-8 p-0 text-gray-500 hover:text-[#0d9488] dark:text-gray-400 dark:hover:text-[#2dd4bf] hover:bg-[#0d9488]/10"
                            >
                              {exportingId === transaction.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-gray-500 hover:text-red-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="dark:text-white">{t('deleteTransaction')}</AlertDialogTitle>
                                  <AlertDialogDescription className="dark:text-gray-400">
                                    {t('deleteConfirmMessage')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="dark:bg-white/5">{t('cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteTransaction(transaction.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    {t('delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Show More Button */}
                {mobileVisibleTransactions.length < filteredTransactions.length && (
                  <div className="pt-1">
                    <Button
                      variant="outline"
                      className="w-full text-[#0d9488] border-[#0d9488]/20 hover:bg-[#0d9488]/5 dark:border-[#0d9488]/30 dark:text-[#2dd4bf] dark:hover:bg-[#0d9488]/10"
                      onClick={() => setMobileDisplayCount((prev) => prev + 10)}
                    >
                      {language === 'da' ? 'Vis mere' : 'Show more'}
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}

                {/* Mobile Summary Bar */}
                <div className="mt-2 px-3 py-3 rounded-xl bg-[#f0fdf9]/50 dark:bg-[#1a2e2b]/30 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('total')}</span>
                  <div className="text-right">
                    <span className="text-base font-bold text-gray-900 dark:text-white">
                      {tc(filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0))}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {filteredTransactions.length} {t('transactionsWord')}
                    </p>
                  </div>
                </div>
              </div>

              {/* ===== Desktop Table (hidden lg:block) ===== */}
              <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-100 dark:border-gray-800">
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">
                      {t('type')}
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">
                      <button
                        onClick={() => toggleSort('date')}
                        className="flex items-center gap-1 hover:text-[#0d9488] transition-colors"
                      >
                        {t('date')}
                        {sortField === 'date' &&
                          (sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          ))}
                        {sortField !== 'date' && <ArrowUpDown className="h-4 w-4 opacity-50" />}
                      </button>
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">
                      {t('description')}
                    </TableHead>
                    <TableHead className="text-right bg-gray-50 dark:bg-gray-700/50">
                      <button
                        onClick={() => toggleSort('amount')}
                        className="flex items-center justify-end gap-1 hover:text-[#0d9488] transition-colors ml-auto w-full"
                      >
                        {t('amount')}
                        {sortField === 'amount' &&
                          (sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          ))}
                        {sortField !== 'amount' && <ArrowUpDown className="h-4 w-4 opacity-50" />}
                      </button>
                    </TableHead>
                    <TableHead className="text-right bg-gray-50 dark:bg-gray-700/50">
                      <button
                        onClick={() => toggleSort('vatPercent')}
                        className="flex items-center justify-end gap-1 hover:text-[#0d9488] transition-colors ml-auto w-full"
                      >
                        {t('vatPercent')}
                        {sortField === 'vatPercent' &&
                          (sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          ))}
                        {sortField !== 'vatPercent' && <ArrowUpDown className="h-4 w-4 opacity-50" />}
                      </button>
                    </TableHead>
                    <TableHead className="text-right bg-gray-50 dark:bg-gray-700/50">
                      {t('vatAmount')}
                    </TableHead>
                    <TableHead className="text-center bg-gray-50 dark:bg-gray-700/50">
                      {t('actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.map((transaction) => (
                    <TableRow
                      key={transaction.id}
                      className="border-b border-gray-50/50 table-row-teal-hover"
                    >
                      <TableCell>
                        {transaction.type === 'PURCHASE' ? (
                          <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 gap-1">
                            <ArrowDownCircle className="h-3 w-3" />
                            {language === 'da' ? 'Køb' : 'Buy'}
                          </Badge>
                        ) : (
                          <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] gap-1">
                            <ArrowUpCircle className="h-3 w-3" />
                            {language === 'da' ? 'Salg' : 'Sale'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {td(new Date(transaction.date))}
                      </TableCell>
                      <TableCell className="max-w-[150px] lg:max-w-[250px] truncate">
                        {transaction.description}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">
                        {tc(transaction.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {getDisplayVAT(transaction).rate}%
                        </span>
                      </TableCell>
                      <TableCell className={`text-right whitespace-nowrap font-medium ${
                        transaction.type === 'PURCHASE' 
                          ? 'text-amber-600 dark:text-amber-400' 
                          : 'text-[#0d9488] dark:text-[#2dd4bf]'
                      }`}>
                        {tc(getDisplayVAT(transaction).amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {transaction.id.startsWith('inv-') ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20 gap-1">
                                  <FileText className="h-3 w-3" />
                                  {language === 'da' ? 'Faktura' : 'Invoice'}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{language === 'da' ? 'Genereret fra faktura' : 'Generated from invoice'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <div className="flex items-center justify-center gap-0.5">
                            {transaction.receiptImage ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedReceipt(transaction.receiptImage)}
                                      className="text-[#0d9488] hover:text-[#0d9488]"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('receiptPreview')}</p>
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
                                      onClick={() => openUploadDialog(transaction.id)}
                                      className="text-gray-400 hover:text-[#0d9488] dark:text-gray-500 dark:hover:text-[#2dd4bf]"
                                    >
                                      <Paperclip className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('attachReceipt')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleExportPeppol(transaction.id)}
                                    disabled={exportingId === transaction.id}
                                    className="text-gray-500 hover:text-[#0d9488] dark:text-gray-400"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Export OIOUBL</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-500 hover:text-red-500 dark:text-gray-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="dark:text-white">{t('deleteTransaction')}</AlertDialogTitle>
                                  <AlertDialogDescription className="dark:text-gray-400">
                                    {t('deleteConfirmMessage')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="dark:bg-white/5">{t('cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteTransaction(transaction.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    {t('delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Summary Footer Row */}
                  <TableRow className="bg-[#f0fdf9]/50 dark:bg-[#1a2e2b]/30 font-semibold border-t-2 border-[#0d9488]/20">
                    <TableCell />
                    <TableCell />
                    <TableCell className="font-semibold">{t('total')}</TableCell>
                    <TableCell className="text-right font-semibold">{tc(filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0))}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{tc(stats.outputVAT - stats.inputVAT >= 0 ? stats.outputVAT : 0)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
              {/* Pagination */}
              {filteredTransactions.length > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border)]">
                  <div className="text-sm text-muted-foreground">
                    {language === 'da'
                      ? `Viser ${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, filteredTransactions.length)} af ${filteredTransactions.length}`
                      : `Showing ${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, filteredTransactions.length)} of ${filteredTransactions.length}`}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-8 w-8 p-0">
                      <span className="text-xs">&laquo;</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="h-8 w-8 p-0">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`h-8 w-8 p-0 text-xs ${currentPage === pageNum ? 'bg-[#0d9488] hover:bg-[#0d9488]/90 text-white' : ''}`}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} className="h-8 w-8 p-0">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-8 w-8 p-0">
                      <span className="text-xs">&raquo;</span>
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{language === 'da' ? 'Pr. side:' : 'Per page:'}</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                      <SelectTrigger className="w-16 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              </div>
              </>
          )}
        </CardContent>
      </Card>

      {/* Receipt Preview Dialog */}
      <Dialog open={!!selectedReceipt} onOpenChange={(open) => { if (!open) setSelectedReceipt(null); }}>
        <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {t('receiptPreview')}
            </DialogTitle>
            {selectedTransaction && (
              <DialogDescription className="dark:text-gray-400">
                {selectedTransaction.description} — {td(new Date(selectedTransaction.date))} — {tc(selectedTransaction.amount)}
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedReceipt && (
            <div className="relative">
              <img
                src={getReceiptUrl(selectedReceipt) || ''}
                alt="Receipt"
                className="w-full h-auto rounded-lg border"
              />
            </div>
          )}
          {selectedTransaction && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUploadDialog(selectedTransaction.id)}
                className="gap-2 dark:text-gray-300"
              >
                <Upload className="h-4 w-4" />
                {language === 'da' ? 'Skift kvittering' : 'Replace receipt'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                    {t('removeReceipt')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="dark:text-white">{t('removeReceipt')}</AlertDialogTitle>
                    <AlertDialogDescription className="dark:text-gray-400">
                      {t('removeReceiptConfirm')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="dark:bg-white/5">{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleRemoveReceipt(selectedTransaction!.id)}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {t('removeReceipt')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Receipt to Existing Transaction Dialog */}
      <Dialog open={!!uploadDialogTransactionId} onOpenChange={(open) => { if (!open) closeUploadDialog(); }}>
        <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-md">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {t('attachReceipt')}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {t('attachReceiptDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {uploadError && (
              <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-md flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {uploadError}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUploadFileChange}
              className="hidden"
              disabled={isUploading}
            />

            {/* Upload area */}
            {uploadPreview ? (
              <div className="relative">
                <img
                  src={uploadPreview}
                  alt="Receipt preview"
                  className="w-full h-48 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setUploadFile(null);
                    setUploadPreview(null);
                    if (uploadInputRef.current) uploadInputRef.current.value = '';
                  }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full h-28 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
              onClick={() => uploadInputRef.current?.click()}
              disabled={isUploading}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <Camera className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="text-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {t('takePictureOfReceipt')}
                  </span>
                </div>
              </div>
            </Button>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 dark:text-gray-300"
                onClick={closeUploadDialog}
                disabled={isUploading}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                className="flex-1 btn-gradient text-white"
                onClick={handleUploadReceipt}
                disabled={!uploadFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('processing')}
                  </>
                ) : (
                  <>
                    <Paperclip className="mr-2 h-4 w-4" />
                    {t('attachReceipt')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
