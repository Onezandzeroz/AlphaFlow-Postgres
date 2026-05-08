'use client';

const DEFAULT_INVOICE_TERMS = 'Betaling forfalder senest 30 dage efter\nfakturadatoen. Ved forsinkelse, påløber\nder renter efter Renteloven.\nEvt. spørgsmål, så kontakt os venligst.';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FileText,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Search,
  Building2,
  Pencil,
  Printer,
  Send,
  CheckCircle2,
  Upload,
  X,
  ChevronDown,
  CircleDot,
  Ban,
  Download,
  Users,
  Check,
  AlertCircle,
  CalendarDays,
  AlignLeft,
  Package,
  Info,
  FilePenLine,
  XCircle,
  AlertTriangle,
  Clock,
  Wallet,
  Receipt,
  FileSpreadsheet,
  MoreHorizontal,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { da, enGB } from 'date-fns/locale';
import { toast } from "sonner";
import { PageHeader } from '@/components/shared/page-header';
import { StatsCard } from '@/components/shared/stats-card';
import { MobileFilterDropdown } from '@/components/shared/mobile-filter-dropdown';

// Types
interface CompanyInfo {
  id: string;
  logo: string | null;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  cvrNumber: string;
  invoicePrefix: string;
  bankName: string;
  bankAccount: string;
  bankRegistration: string;
  bankIban: string | null;
  bankStreet: string | null;
  bankCity: string | null;
  bankCountry: string | null;
  invoiceTerms: string | null;
  nextInvoiceSequence: number;
  currentYear: number;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
  accountId: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCvr: string | null;
  issueDate: string;
  dueDate: string;
  lineItems: string; // JSON string
  subtotal: number;
  vatTotal: number;
  total: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
}

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

interface InvoicesPageProps {
  user: User;
  initialView?: 'list' | 'create';
  onInitialViewConsumed?: () => void;
}

interface Account {
  id: string;
  number: string;
  name: string;
  nameEn: string | null;
  type: string;
  group: string;
}

type PageView = 'list' | 'create';

export function InvoicesPage({ user, initialView, onInitialViewConsumed }: InvoicesPageProps) {
  const { t, tc, td, language } = useTranslation();

  // State
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<PageView>(initialView || 'list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCompanySetup, setShowCompanySetup] = useState(false);
  const [showEditCompany, setShowEditCompany] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  // Contact state (for invoice creation)
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contactTypeFilter, setContactTypeFilter] = useState<'CUSTOMER' | 'SUPPLIER' | 'ALL'>('CUSTOMER');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);

  // Accounts state (for line item account selection)
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Company form state
  const [companyForm, setCompanyForm] = useState({
    logo: '' as string,
    companyName: '',
    address: '',
    phone: '',
    email: '',
    cvrNumber: '',
    invoicePrefix: '',
    bankName: '',
    bankAccount: '',
    bankRegistration: '',
    bankIban: '',
    bankStreet: '',
    bankCity: '',
    bankCountry: '',
    invoiceTerms: DEFAULT_INVOICE_TERMS,
  });

  // Invoice form state
  const [invoiceForm, setInvoiceForm] = useState({
    customerName: '',
    customerAddress: '',
    customerEmail: '',
    customerPhone: '',
    customerCvr: '',
    issueDate: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
    dueDate: (() => { const n = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
    lineItems: [
      { description: '', quantity: 1, unitPrice: 0, vatPercent: 25, accountId: '' } as LineItem,
    ] as LineItem[],
    notes: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const invoicePreviewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewContentH, setPreviewContentH] = useState(0);

  // Fetch data
  const fetchCompanyInfo = useCallback(async () => {
    try {
      const response = await fetch('/api/company');
      const data = await response.json();
      if (data.companyInfo) {
        setCompanyInfo(data.companyInfo);
        setCompanyForm({
          logo: data.companyInfo.logo || '',
          companyName: data.companyInfo.companyName || '',
          address: data.companyInfo.address || '',
          phone: data.companyInfo.phone || '',
          email: data.companyInfo.email || '',
          cvrNumber: data.companyInfo.cvrNumber || '',
          invoicePrefix: data.companyInfo.invoicePrefix || '',
          bankName: data.companyInfo.bankName || '',
          bankAccount: data.companyInfo.bankAccount || '',
          bankRegistration: data.companyInfo.bankRegistration || '',
          bankIban: data.companyInfo.bankIban || '',
          bankStreet: data.companyInfo.bankStreet || '',
          bankCity: data.companyInfo.bankCity || '',
          bankCountry: data.companyInfo.bankCountry || '',
          invoiceTerms: data.companyInfo.invoiceTerms || DEFAULT_INVOICE_TERMS,
        });
      } else {
        // No company info set up yet - show setup dialog
        setShowCompanySetup(true);
      }
    } catch (error) {
      console.error('Failed to fetch company info:', error);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      const response = await fetch('/api/invoices');
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/accounts');
      const data = await response.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  }, []);

  useEffect(() => {
    fetchCompanyInfo();
    fetchInvoices();
    fetchAccounts();
  }, [fetchCompanyInfo, fetchInvoices, fetchAccounts]);

  // Sync initialView prop changes to internal currentView state.
  // This handles the case where the component is already mounted (e.g. rendered
  // as a swipe neighbor) and the user navigates here via a quick action that
  // passes initialView='create'. useState only uses the initial value on first
  // mount, so we need this effect to pick up subsequent prop changes.
  useEffect(() => {
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);

  // Consume the initialView prop once it's been applied
  useEffect(() => {
    if (initialView && onInitialViewConsumed) {
      onInitialViewConsumed();
    }
  }, [initialView, onInitialViewConsumed]);

  // Scale invoice preview to fit without clipping
  useEffect(() => {
    if (!previewInvoice) {
      setPreviewScale(1);
      setPreviewContentH(0);
      return;
    }

    // Reset to scale=1 so we can measure natural size
    setPreviewScale(1);
    setPreviewContentH(0);

    const calculateScale = () => {
      const inner = invoicePreviewRef.current;
      if (!inner) return;

      const contentWidth = inner.scrollWidth;
      const contentHeight = inner.scrollHeight;
      if (contentWidth === 0 || contentHeight === 0) return;

      // Available space: viewport minus dialog chrome (header ~60px, padding ~80px)
      const availableWidth = window.innerWidth - 80;
      const availableHeight = window.innerHeight - 140;

      const scaleW = availableWidth / contentWidth;
      const scaleH = availableHeight / contentHeight;
      const scale = Math.min(scaleW, scaleH, 1);

      setPreviewContentH(contentHeight);
      setPreviewScale(scale);
    };

    const timer = setTimeout(calculateScale, 100);
    const timer2 = setTimeout(calculateScale, 400);
    window.addEventListener('resize', calculateScale);
    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      window.removeEventListener('resize', calculateScale);
    };
  }, [previewInvoice]);

  // Logo upload handler
  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|jpg)$/)) {
      toast.error(language === 'da' ? 'Kun JPG og PNG filer er tilladt' : 'Only JPG and PNG files are allowed');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error(language === 'da' ? 'Filstørrelsen skal være under 2MB' : 'File size must be under 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setCompanyForm(prev => ({ ...prev, logo: result }));
    };
    reader.readAsDataURL(file);
  }, [language]);

  // Company info save
  const handleSaveCompanyInfo = useCallback(async (isEdit: boolean) => {
    setIsSubmitting(true);
    try {
      const url = isEdit ? '/api/company' : '/api/company';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save company info');
      }

      const data = await response.json();
      setCompanyInfo(data.companyInfo);
      setShowCompanySetup(false);
      setShowEditCompany(false);
      toast.success(t(isEdit ? 'companyInfoUpdated' : 'companyInfoSaved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (language === 'da' ? 'Kunne ikke gemme' : 'Failed to save'));
    } finally {
      setIsSubmitting(false);
    }
  }, [companyForm, t, language]);

  // Invoice form handlers
  const addLineItem = useCallback(() => {
    setInvoiceForm(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { description: '', quantity: 1, unitPrice: 0, vatPercent: 25, accountId: '' }],
    }));
  }, []);

  const removeLineItem = useCallback((index: number) => {
    setInvoiceForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
  }, []);

  const updateLineItem = useCallback((index: number, field: keyof LineItem, value: string | number) => {
    setInvoiceForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  }, []);

  // Calculate totals
  const calculatedTotals = useMemo(() => {
    const subtotal = invoiceForm.lineItems.reduce(
      (sum, item) => sum + (item.quantity * item.unitPrice), 0
    );
    const vatTotal = invoiceForm.lineItems.reduce(
      (sum, item) => sum + ((item.quantity * item.unitPrice * item.vatPercent) / 100), 0
    );
    return { subtotal, vatTotal, total: subtotal + vatTotal };
  }, [invoiceForm.lineItems]);

  // Generate invoice
  const handleGenerateInvoice = useCallback(async () => {
    if (!companyInfo) {
      setShowCompanySetup(true);
      return;
    }

    // Validate
    if (!invoiceForm.customerName.trim()) {
      toast.error(t('customerName') + ' ' + t('required').toLowerCase());
      return;
    }

    const hasValidLineItem = invoiceForm.lineItems.some(
      item => item.description.trim() && item.unitPrice > 0
    );
    if (!hasValidLineItem) {
      toast.error(t('itemDescription') + ' / ' + t('unitPrice') + ' ' + t('required').toLowerCase());
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: invoiceForm.customerName,
          customerAddress: invoiceForm.customerAddress || null,
          customerEmail: invoiceForm.customerEmail || null,
          customerPhone: invoiceForm.customerPhone || null,
          customerCvr: invoiceForm.customerCvr || null,
          issueDate: invoiceForm.issueDate,
          dueDate: invoiceForm.dueDate,
          lineItems: invoiceForm.lineItems.filter(item => item.description.trim()),
          notes: invoiceForm.notes || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create invoice');
      }

      const data = await response.json();
      toast.success(t('invoiceCreated'), { description: data.invoice.invoiceNumber });

      // Reset form
      setInvoiceForm({
        customerName: '',
        customerAddress: '',
        customerEmail: '',
        customerPhone: '',
        customerCvr: '',
        issueDate: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
        dueDate: (() => { const n = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
        lineItems: [{ description: '', quantity: 1, unitPrice: 0, vatPercent: 25, accountId: '' }],
        notes: '',
      });

      setSelectedContactId('');
      fetchInvoices();
      fetchCompanyInfo(); // Refresh to get updated nextInvoiceSequence
      setCurrentView('list');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (language === 'da' ? 'Kunne ikke oprette faktura' : 'Failed to create invoice'));
    } finally {
      setIsSubmitting(false);
    }
  }, [companyInfo, invoiceForm, t, language, fetchInvoices, fetchCompanyInfo]);

  // Delete invoice
  const handleDeleteInvoice = useCallback(async (id: string) => {
    try {
      await fetch(`/api/invoices?id=${id}`, { method: 'DELETE' });
      toast.success(t('invoiceDeleted'), {
        description: language === 'da' ? 'Fakturaen er blevet slettet' : 'The invoice has been deleted',
      });
      fetchInvoices();
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      toast.error(language === 'da' ? 'Kunne ikke slette faktura' : 'Failed to delete invoice');
    } finally {
      setDeleteTarget(null);
    }
  }, [t, language, fetchInvoices]);

  // Reset all data (company info, invoices, transactions)
  const handleResetAllData = useCallback(async () => {
    setIsResetting(true);
    try {
      const response = await fetch('/api/company', { method: 'DELETE' });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to clear data');
      }

      // Reset all local state
      setCompanyInfo(null);
      setInvoices([]);
      setCompanyForm({
        logo: '',
        companyName: '',
        address: '',
        phone: '',
        email: '',
        cvrNumber: '',
        invoicePrefix: '',
        bankName: '',
        bankAccount: '',
        bankRegistration: '',
        bankIban: '',
        bankStreet: '',
        bankCity: '',
        bankCountry: '',
        invoiceTerms: DEFAULT_INVOICE_TERMS,
      });
      setPreviewInvoice(null);
      setShowResetDialog(false);
      setShowCompanySetup(true);

      toast.success(t('allDataCleared'));
    } catch (error) {
      console.error('Failed to reset data:', error);
      toast.error(error instanceof Error ? error.message : (language === 'da' ? 'Kunne ikke rydde data' : 'Failed to clear data'));
    } finally {
      setIsResetting(false);
    }
  }, [t, language]);

  // Update invoice status
  const handleUpdateStatus = useCallback(async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update status');
      }

      toast.success(t('invoiceStatusUpdated'), {
        description: language === 'da' ? 'Status er blevet opdateret' : 'Status has been updated',
      });
      fetchInvoices();
      if (previewInvoice?.id === id) {
        setPreviewInvoice(prev => prev ? { ...prev, status: status as Invoice['status'] } : null);
      }
    } catch (error) {
      console.error('Failed to update invoice status:', error);
      toast.error(error instanceof Error ? error.message : (language === 'da' ? 'Kunne ikke opdatere status' : 'Failed to update status'));
    }
  }, [t, language, fetchInvoices, previewInvoice]);

  // Download file helper
  const downloadFile = useCallback(async (url: string, filename: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  // Download PDF
  const handleDownloadPDF = useCallback(async (invoice: Invoice) => {
    try {
      setDownloadingInvoiceId(invoice.id);
      await downloadFile(`/api/invoices/${invoice.id}/pdf`, `faktura-${invoice.invoiceNumber}.pdf`);
      toast.info(language === 'da' ? 'PDF downloadet' : 'PDF downloaded', {
        description: `faktura-${invoice.invoiceNumber}.pdf`,
      });
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error(language === 'da' ? 'Kunne ikke generere PDF' : 'Failed to generate PDF');
    } finally {
      setDownloadingInvoiceId(null);
    }
  }, [downloadFile, language]);

  // Download OIOUBL
  const handleDownloadOIOUBL = useCallback(async (invoice: Invoice) => {
    try {
      setDownloadingInvoiceId(invoice.id);
      await downloadFile(`/api/invoices/${invoice.id}/oioubl`, `oioubl-${invoice.invoiceNumber}.xml`);
      toast.info(language === 'da' ? 'OIOUBL downloadet' : 'OIOUBL downloaded', {
        description: `oioubl-${invoice.invoiceNumber}.xml`,
      });
    } catch (error) {
      console.error('Failed to download OIOUBL:', error);
      toast.error(language === 'da' ? 'Kunne ikke generere OIOUBL' : 'Failed to generate OIOUBL');
    } finally {
      setDownloadingInvoiceId(null);
    }
  }, [downloadFile, language]);

  // Print invoice
  const handlePrintInvoice = useCallback((invoice: Invoice) => {
    const lineItems = JSON.parse(invoice.lineItems) as LineItem[];
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${t('invoiceNumber')} ${invoice.invoiceNumber}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #1f2937; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .company-logo { max-height: 70px; max-width: 220px; object-fit: contain; }
          .invoice-title { font-size: 28px; font-weight: 700; color: #0d9488; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; margin-bottom: 8px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .info-label { font-size: 11px; color: #b0a89e; text-transform: uppercase; }
          .info-value { font-size: 14px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background: #f9fafb; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
          td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
          .text-right { text-align: right; }
          .totals { margin-top: 20px; display: flex; justify-content: flex-end; }
          .totals-table td { padding: 4px 12px; }
          .grand-total { font-size: 18px; font-weight: 700; color: #0d9488; }
          .bank-info { margin-top: 40px; padding: 16px; background: #f9fafb; border-radius: 8px; }
          .bank-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 13px; }
          .notes { margin-top: 20px; padding: 16px; background: #fefce8; border-radius: 8px; font-size: 13px; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; }
          .status-DRAFT { background: #f3f4f6; color: #374151; }
          .status-SENT { background: #dbeafe; color: #1d4ed8; }
          .status-PAID { background: #dcfce7; color: #166534; }
          .status-CANCELLED { background: #fee2e2; color: #991b1b; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            ${companyInfo?.logo ? `<img src="${companyInfo.logo}" class="company-logo" alt="Logo" />` : `<div style="font-size: 22px; font-weight: 700;">${companyInfo?.companyName || ''}</div>`}
            <div style="margin-top: 12px; font-size: 13px; color: #6b7280;">
              ${t('invoiceDate')}: ${td(new Date(invoice.issueDate))}
            </div>
          </div>
          <div style="text-align: right;">
            <div class="invoice-title">${language === 'da' ? 'FAKTURA' : 'INVOICE'}</div>
            <div style="margin-top: 8px; font-size: 16px; font-weight: 600;">${invoice.invoiceNumber}</div>
            <div style="margin-top: 8px;">
              <span class="status-badge status-${invoice.status}">${t(invoice.status.toLowerCase() as Parameters<typeof t>[0])}</span>
            </div>
          </div>
        </div>

        <div class="info-grid section">
          <div>
            <div class="section-title">${t('from')}</div>
            <div class="info-value">${companyInfo?.companyName || ''}</div>
            <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">${companyInfo?.address || ''}</div>
            <div style="font-size: 13px; color: #6b7280;">${companyInfo?.phone || ''}</div>
            <div style="font-size: 13px; color: #6b7280;">${companyInfo?.email || ''}</div>
            <div style="font-size: 13px; color: #6b7280;">CVR: ${companyInfo?.cvrNumber || ''}</div>
          </div>
          <div>
            <div class="section-title">${t('to')}</div>
            <div class="info-value">${invoice.customerName}</div>
            ${invoice.customerAddress ? `<div style="font-size: 13px; color: #6b7280; margin-top: 4px;">${invoice.customerAddress}</div>` : ''}
            ${invoice.customerPhone ? `<div style="font-size: 13px; color: #6b7280;">${invoice.customerPhone}</div>` : ''}
            ${invoice.customerEmail ? `<div style="font-size: 13px; color: #6b7280;">${invoice.customerEmail}</div>` : ''}
            ${invoice.customerCvr ? `<div style="font-size: 13px; color: #6b7280;">CVR: ${invoice.customerCvr}</div>` : ''}
          </div>
        </div>

        <div class="section">
          <table>
            <thead>
              <tr>
                <th style="font-size: 13px; font-weight: 600;">${t('itemDescription')}</th>
                <th class="text-right" style="font-size: 13px; font-weight: 600;">${t('quantity')}</th>
                <th class="text-right" style="font-size: 13px; font-weight: 600;">${t('unitPrice')}</th>
                <th class="text-right" style="font-size: 13px; font-weight: 600;">${t('vatPercent')}</th>
                <th class="text-right" style="font-size: 13px; font-weight: 600;">${t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">${tc(item.unitPrice)}</td>
                  <td class="text-right">${item.vatPercent}%</td>
                  <td class="text-right">${tc(item.quantity * item.unitPrice)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <table class="totals-table">
            <tr><td style="color: #6b7280;">${t('subtotal')}</td><td class="text-right" style="font-weight: 500;">${tc(invoice.subtotal)}</td></tr>
            <tr><td style="color: #6b7280;">${t('vatTotalLabel')}</td><td class="text-right" style="font-weight: 500;">${tc(invoice.vatTotal)}</td></tr>
            <tr><td colspan="2"><hr style="border-color: #e5e7eb;"/></td></tr>
            <tr><td class="grand-total">${t('grandTotal')}</td><td class="text-right grand-total">${tc(invoice.total)}</td></tr>
            <tr><td colspan="2"><hr style="border-color: #e5e7eb;"/></td></tr>
            <tr><td style="color: #6b7280;">${t('dueDate')}</td><td class="text-right" style="font-weight: 500;">${td(new Date(invoice.dueDate))}</td></tr>
          </table>
        </div>

        ${companyInfo?.bankName ? `
        <div class="bank-info">
          <div>
            <div style="margin-bottom: 20px;">
              <div style="font-size: 13px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; margin-bottom: 6px; font-weight: 600;">${t('bankDetailsTitle')}</div>
              <div style="font-size: 13px; line-height: 1.6;">
                <div><span style="color: #b0a89e;">${t('bankRegistration')}:</span> ${companyInfo.bankRegistration}</div>
                <div><span style="color: #b0a89e;">${t('bankAccount')}:</span> ${companyInfo.bankAccount}</div>
                ${companyInfo.bankIban ? `<div><span style="color: #b0a89e;">${t('bankIban')}:</span> ${companyInfo.bankIban}</div>` : ''}
              </div>
            </div>
            <div style="display: flex; justify-content: space-between;">
              ${(companyInfo.bankName || companyInfo.bankStreet || companyInfo.bankCity || companyInfo.bankCountry) ? `
              <div>
                <div style="font-size: 13px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; margin-bottom: 6px; font-weight: 600;">${t('bankAddressTitle')}</div>
                <div style="font-size: 13px; line-height: 1.6;">
                  ${companyInfo.bankName ? `<div>${companyInfo.bankName}</div>` : ''}
                  ${companyInfo.bankStreet ? `<div>${companyInfo.bankStreet}</div>` : ''}
                  ${companyInfo.bankCity ? `<div>${companyInfo.bankCity}</div>` : ''}
                  ${companyInfo.bankCountry ? `<div>${companyInfo.bankCountry}</div>` : ''}
                </div>
              </div>
              ` : ''}
              ${companyInfo.invoiceTerms ? `
              <div style="width: 250px; text-align: left;">
                <div style="font-size: 13px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; margin-bottom: 6px; font-weight: 600;">${t('invoiceTerms')}</div>
                <div style="font-size: 13px; line-height: 1.6; white-space: pre-line;">${companyInfo.invoiceTerms}</div>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
        ` : ''}

        ${invoice.notes ? `
        <div class="notes">
          <strong>${t('notes')}:</strong> ${invoice.notes}
        </div>
        ` : ''}

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }, [companyInfo, t, tc, td, language]);

  // Clear filters helper
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
  }, []);

  // Overdue detection helper
  const getInvoiceDisplayStatus = useCallback((invoice: Invoice): string => {
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return invoice.status;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(invoice.dueDate) < today) return 'OVERDUE';
    return invoice.status;
  }, []);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.total.toString().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'OVERDUE') {
        result = result.filter(inv => getInvoiceDisplayStatus(inv) === 'OVERDUE');
      } else {
        result = result.filter(inv => inv.status === statusFilter);
      }
    }
    return result;
  }, [invoices, searchQuery, statusFilter, getInvoiceDisplayStatus]);

  // Stats (with overdue awareness)
  const invoiceStats = useMemo(() => {
    const active = invoices.filter(i => i.status !== 'CANCELLED');
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const overdueInvoices = active.filter(i => getInvoiceDisplayStatus(i) === 'OVERDUE');
    const paidThisMonth = active.filter(i => {
      if (i.status !== 'PAID') return false;
      const paidDate = new Date(i.createdAt);
      return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
    });
    return {
      totalInvoiced: active.reduce((sum, i) => sum + i.total, 0),
      outstanding: active.filter(i => i.status === 'SENT' || getInvoiceDisplayStatus(i) === 'OVERDUE').reduce((sum, i) => sum + i.total, 0),
      overdueAmount: overdueInvoices.reduce((sum, i) => sum + i.total, 0),
      paid: active.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.total, 0),
      paidThisMonth: paidThisMonth.reduce((sum, i) => sum + i.total, 0),
      overdueCount: overdueInvoices.length,
      draftCount: invoices.filter(i => i.status === 'DRAFT').length,
    };
  }, [invoices, getInvoiceDisplayStatus]);

  // Locale for date-fns
  const dateLocale = language === 'da' ? da : enGB;

  // Next invoice number preview
  const nextInvoiceNumber = useMemo(() => {
    if (!companyInfo) return '—';
    const year = new Date().getFullYear();
    const seq = companyInfo.currentYear === year ? companyInfo.nextInvoiceSequence : 1;
    return `${companyInfo.invoicePrefix}-${year}-${String(seq).padStart(4, '0')}`;
  }, [companyInfo]);

  // Enhanced status config with status-badge-* classes
  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      DRAFT: {
        label: t('draft'),
        className: 'status-badge status-badge-draft',
        icon: <FilePenLine className="h-3 w-3" />,
      },
      SENT: {
        label: t('sent'),
        className: 'status-badge status-badge-sent',
        icon: <Send className="h-3 w-3" />,
      },
      PAID: {
        label: t('paid'),
        className: 'status-badge status-badge-paid',
        icon: <CheckCircle2 className="h-3 w-3" />,
      },
      CANCELLED: {
        label: t('cancelled'),
        className: 'status-badge status-badge-cancelled',
        icon: <XCircle className="h-3 w-3" />,
      },
      OVERDUE: {
        label: language === 'da' ? 'Forfalden' : 'Overdue',
        className: 'status-badge status-badge-overdue',
        icon: <AlertTriangle className="h-3 w-3" />,
      },
    };
    return configs[status] || configs.DRAFT;
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config = getStatusConfig(status);
    return (
      <Badge className={`${config.className} text-xs font-medium flex items-center gap-1.5 px-2.5 py-1 border rounded-full`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  // ========== CONTACT FETCH & SELECT LOGIC ==========
  const fetchContacts = useCallback(async (search: string = '', typeFilter: string = contactTypeFilter) => {
    try {
      let url = '/api/contacts?';
      if (typeFilter && typeFilter !== 'ALL') {
        url += `type=${typeFilter}`;
      }
      if (search) {
        url += `${typeFilter && typeFilter !== 'ALL' ? '&' : ''}search=${encodeURIComponent(search)}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  }, [contactTypeFilter]);

  const handleSelectContact = useCallback((contact: Contact) => {
    setSelectedContactId(contact.id);
    setContactSearchOpen(false);
    const fullAddress = [contact.address, contact.postalCode, contact.city, contact.country]
      .filter(Boolean)
      .join(', ');
    setInvoiceForm(prev => ({
      ...prev,
      customerName: contact.name,
      customerAddress: fullAddress,
      customerEmail: contact.email || '',
      customerPhone: contact.phone || '',
      customerCvr: contact.cvrNumber || '',
    }));
  }, []);

  const handleClearContact = useCallback(() => {
    setSelectedContactId('');
    setInvoiceForm(prev => ({
      ...prev,
      customerName: '',
      customerAddress: '',
      customerEmail: '',
      customerPhone: '',
      customerCvr: '',
    }));
  }, []);

  // Due date countdown helper (must be before early returns to satisfy hooks rules)
  const getDueDateCountdown = useCallback((invoice: Invoice): { text: string; isOverdue: boolean; isUrgent: boolean } => {
    // Paid or cancelled invoices are never overdue regardless of due date
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
      return { text: '', isOverdue: false, isUrgent: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(invoice.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const diffMs = dueDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        text: language === 'da' ? `${Math.abs(diffDays)} dage forfalden` : `${Math.abs(diffDays)} days overdue`,
        isOverdue: true,
        isUrgent: true,
      };
    } else if (diffDays === 0) {
      return {
        text: language === 'da' ? 'Forfalder i dag' : 'Due today',
        isOverdue: false,
        isUrgent: true,
      };
    } else if (diffDays <= 7) {
      return {
        text: language === 'da' ? `Forfalder om ${diffDays} dage` : `Due in ${diffDays} days`,
        isOverdue: false,
        isUrgent: diffDays <= 3,
      };
    }
    return { text: '', isOverdue: false, isUrgent: false };
  }, [language]);

  // Status filter pill data (must be before early returns to satisfy hooks rules)
  const statusFilterPills = useMemo(() => {
    const pills = [
      { value: 'all', label: t('allStatuses'), count: invoices.length },
      { value: 'DRAFT', label: t('draft'), count: invoices.filter(i => i.status === 'DRAFT').length },
      { value: 'SENT', label: t('sent'), count: invoices.filter(i => i.status === 'SENT').length },
      { value: 'PAID', label: t('paid'), count: invoices.filter(i => i.status === 'PAID').length },
      { value: 'OVERDUE', label: language === 'da' ? 'Forfalden' : 'Overdue', count: invoiceStats.overdueCount },
      { value: 'CANCELLED', label: t('cancelled'), count: invoices.filter(i => i.status === 'CANCELLED').length },
    ];
    return pills;
  }, [invoices, invoiceStats.overdueCount, t, language]);

  // Loading state
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

  // ========== COMPANY SETUP DIALOG ==========
  const renderCompanySetupDialog = () => (
    <Dialog open={showCompanySetup || showEditCompany} onOpenChange={(open) => {
      if (!open) {
        setShowCompanySetup(false);
        setShowEditCompany(false);
      }
    }}>
      <DialogContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#0d9488]" />
            {showEditCompany ? t('editCompanyInfo') : t('companySetup')}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {showEditCompany
              ? t('editCompanyInfo')
              : t('companySetupDescription')
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 lg:space-y-6 pt-4">
          {/* Logo Upload */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">{t('companyLogo')}</Label>
            <div className="flex items-center gap-4">
              {companyForm.logo ? (
                <div className="relative h-16 w-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img src={companyForm.logo} alt="Logo" className="h-full w-full object-contain" />
                  <button
                    onClick={() => setCompanyForm(prev => ({ ...prev, logo: '' }))}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center hover:border-[#2dd4bf] dark:hover:border-[#0d9488] transition-colors"
                >
                  <Upload className="h-5 w-5 text-gray-400" />
                </button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="dark:border-gray-700"
              >
                {t('uploadLogo')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Company Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label className="dark:text-gray-300">{t('companyName')} <span className="text-red-500">*</span></Label>
              <Input
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm(prev => ({ ...prev, companyName: e.target.value }))}
                placeholder={t('companyName')}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="dark:text-gray-300">{t('address')} <span className="text-red-500">*</span></Label>
              <Input
                value={companyForm.address}
                onChange={(e) => setCompanyForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder={t('address')}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">{t('phone')} <span className="text-red-500">*</span></Label>
              <Input
                value={companyForm.phone}
                onChange={(e) => setCompanyForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder={t('phone')}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">{t('email')} <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={companyForm.email}
                onChange={(e) => setCompanyForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder={t('email')}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">{t('cvrNumber')} <span className="text-red-500">*</span></Label>
              <Input
                value={companyForm.cvrNumber}
                onChange={(e) => setCompanyForm(prev => ({ ...prev, cvrNumber: e.target.value }))}
                placeholder={t('cvrNumber')}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">{t('invoicePrefix')} <span className="text-red-500">*</span></Label>
              <Input
                value={companyForm.invoicePrefix}
                onChange={(e) => setCompanyForm(prev => ({ ...prev, invoicePrefix: e.target.value.toUpperCase() }))}
                placeholder={t('invoicePrefixPlaceholder')}
                className="bg-gray-50 dark:bg-white/5"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('invoicePrefixHelp')}</p>
            </div>
          </div>

          <Separator className="dark:bg-gray-700" />

          {/* Bank Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('bankDetails')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('bankName')} <span className="text-red-500">*</span></Label>
                <Input
                  value={companyForm.bankName}
                  onChange={(e) => setCompanyForm(prev => ({ ...prev, bankName: e.target.value }))}
                  placeholder={t('bankName')}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('bankRegistration')} <span className="text-red-500">*</span></Label>
                <Input
                  value={companyForm.bankRegistration}
                  onChange={(e) => setCompanyForm(prev => ({ ...prev, bankRegistration: e.target.value }))}
                  placeholder={t('bankRegistration')}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('bankAccount')} <span className="text-red-500">*</span></Label>
                <Input
                  value={companyForm.bankAccount}
                  onChange={(e) => setCompanyForm(prev => ({ ...prev, bankAccount: e.target.value }))}
                  placeholder={t('bankAccount')}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('bankIban')}</Label>
                <Input
                  value={companyForm.bankIban}
                  onChange={(e) => setCompanyForm(prev => ({ ...prev, bankIban: e.target.value }))}
                  placeholder="DK00 0000 0000 0000 00"
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
            </div>
            <Separator className="dark:bg-gray-700 mt-2" />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('bankAddressTitle')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('bankStreet')}</Label>
                <Input
                  value={companyForm.bankStreet}
                  onChange={(e) => setCompanyForm(prev => ({ ...prev, bankStreet: e.target.value }))}
                  placeholder={t('bankStreet')}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('bankCity')}</Label>
                <Input
                  value={companyForm.bankCity}
                  onChange={(e) => setCompanyForm(prev => ({ ...prev, bankCity: e.target.value }))}
                  placeholder={t('bankCity')}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('bankCountry')}</Label>
                <Input
                  value={companyForm.bankCountry}
                  onChange={(e) => setCompanyForm(prev => ({ ...prev, bankCountry: e.target.value }))}
                  placeholder={t('bankCountry')}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
            </div>
            <Separator className="dark:bg-gray-700 mt-2" />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('invoiceTerms')}</h4>
            <div className="space-y-2">
              <textarea
                value={companyForm.invoiceTerms}
                onChange={(e) => setCompanyForm(prev => ({ ...prev, invoiceTerms: e.target.value }))}
                placeholder={t('invoiceTermsPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 px-3 py-2 text-sm dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0d9488]"
              />
            </div>
          </div>

          <Button
            onClick={() => handleSaveCompanyInfo(showEditCompany)}
            disabled={isSubmitting}
            className="w-full btn-primary"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('saving')}</>
            ) : (
              t('saveCompanyInfo')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ========== INVOICE PREVIEW DIALOG ==========
  const renderInvoicePreview = () => {
    if (!previewInvoice) return null;
    const lineItems = JSON.parse(previewInvoice.lineItems) as LineItem[];

    return (
      <Dialog open={!!previewInvoice} onOpenChange={() => setPreviewInvoice(null)}>
        <DialogContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740] max-w-[1100px] w-[95vw] sm:max-w-[1100px] flex flex-col items-center">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="dark:text-white">{t('invoicePreview')}</DialogTitle>
              <div className="flex items-center gap-2">
                {previewInvoice.status !== 'PAID' && previewInvoice.status !== 'CANCELLED' && (
                  <>
                    {previewInvoice.status === 'DRAFT' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateStatus(previewInvoice.id, 'SENT')}
                        className="gap-1.5 text-[#7dabb5] dark:text-[#80c0cc]"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {t('markAsSent')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus(previewInvoice.id, 'PAID')}
                      className="gap-1.5 text-green-600 dark:text-green-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('markAsPaid')}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePrintInvoice(previewInvoice)}
                  className="gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t('printInvoice')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPDF(previewInvoice)}
                  disabled={downloadingInvoiceId === previewInvoice.id}
                  className="gap-1.5"
                >
                  {downloadingInvoiceId === previewInvoice.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {t('downloadPDF')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadOIOUBL(previewInvoice)}
                  disabled={downloadingInvoiceId === previewInvoice.id}
                  className="gap-1.5"
                >
                  {downloadingInvoiceId === previewInvoice.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  {t('downloadOIOUBL')}
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex justify-center py-2">
            <div style={{
              width: 800 * previewScale,
              height: previewContentH > 0 ? previewContentH * previewScale : undefined,
              position: 'relative',
            }}>
              <div
                ref={invoicePreviewRef}
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  width: '800px',
                }}
              >
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-8 bg-white dark:bg-[#1a1f1e]">
                {/* Header - Logo + Invoice Title */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    {companyInfo?.logo ? (
                      <img src={companyInfo.logo} alt="Logo" className="h-16 w-auto object-contain" />
                    ) : (
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{companyInfo?.companyName}</h2>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('invoiceDate')}: {td(new Date(previewInvoice.issueDate))}</p>
                  </div>
                  <div className="text-right">
                    <h1 className="text-3xl font-bold text-[#0d9488] dark:text-[#2dd4bf]">
                      {language === 'da' ? 'FAKTURA' : 'INVOICE'}
                    </h1>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{previewInvoice.invoiceNumber}</p>
                    <div className="mt-2"><StatusBadge status={getInvoiceDisplayStatus(previewInvoice)} /></div>
                  </div>
                </div>

                {/* From / To */}
                <div className="grid grid-cols-2 gap-8 mb-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('from')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{companyInfo?.companyName}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{companyInfo?.address}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{companyInfo?.phone}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{companyInfo?.email}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">CVR: {companyInfo?.cvrNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('to')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{previewInvoice.customerName}</p>
                    {previewInvoice.customerAddress && <p className="text-sm text-gray-500 dark:text-gray-400">{previewInvoice.customerAddress}</p>}
                    {previewInvoice.customerPhone && <p className="text-sm text-gray-500 dark:text-gray-400">{previewInvoice.customerPhone}</p>}
                    {previewInvoice.customerEmail && <p className="text-sm text-gray-500 dark:text-gray-400">{previewInvoice.customerEmail}</p>}
                    {previewInvoice.customerCvr && <p className="text-sm text-gray-500 dark:text-gray-400">CVR: {previewInvoice.customerCvr}</p>}
                  </div>
                </div>

                {/* Line Items */}
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200 dark:border-gray-700">
                      <TableHead className="bg-gray-50 dark:bg-gray-700/50 text-sm font-semibold">{t('itemDescription')}</TableHead>
                      <TableHead className="bg-gray-50 dark:bg-gray-700/50 text-right text-sm font-semibold">{t('quantity')}</TableHead>
                      <TableHead className="bg-gray-50 dark:bg-gray-700/50 text-right text-sm font-semibold">{t('unitPrice')}</TableHead>
                      <TableHead className="bg-gray-50 dark:bg-gray-700/50 text-right text-sm font-semibold">{t('vatPercent')}</TableHead>
                      <TableHead className="bg-gray-50 dark:bg-gray-700/50 text-right text-sm font-semibold">{t('amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, idx) => (
                      <TableRow key={idx} className="border-gray-100/50">
                        <TableCell className="dark:text-gray-300">{item.description}</TableCell>
                        <TableCell className="text-right dark:text-gray-300">{item.quantity}</TableCell>
                        <TableCell className="text-right dark:text-gray-300">{tc(item.unitPrice)}</TableCell>
                        <TableCell className="text-right dark:text-gray-300">{item.vatPercent}%</TableCell>
                        <TableCell className="text-right font-medium dark:text-gray-300">{tc(item.quantity * item.unitPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Totals */}
                <div className="flex justify-end mt-6">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('subtotal')}</span>
                      <span className="font-medium dark:text-gray-300">{tc(previewInvoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('vatTotalLabel')}</span>
                      <span className="font-medium dark:text-gray-300">{tc(previewInvoice.vatTotal)}</span>
                    </div>
                    <Separator className="dark:bg-gray-700" />
                    <div className="flex justify-between">
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{t('grandTotal')}</span>
                      <span className="text-lg font-bold text-[#0d9488] dark:text-[#2dd4bf]">{tc(previewInvoice.total)}</span>
                    </div>
                    <Separator className="dark:bg-gray-700" />
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('dueDate')}</span>
                      <span className="font-medium dark:text-gray-300">{td(new Date(previewInvoice.dueDate))}</span>
                    </div>
                  </div>
                </div>

                {/* Bank Details */}
                {companyInfo?.bankName && (
                  <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                    <div>
                      {/* Section 1: Bankdetaljer (full width) */}
                      <div className="mb-6">
                        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('bankDetailsTitle')}</p>
                        <div className="space-y-1 text-sm">
                          <div>
                            <span className="text-gray-400">{t('bankRegistration')}:</span>
                            <span className="ml-2 dark:text-gray-300">{companyInfo.bankRegistration}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">{t('bankAccount')}:</span>
                            <span className="ml-2 dark:text-gray-300">{companyInfo.bankAccount}</span>
                          </div>
                          {companyInfo.bankIban && (
                            <div>
                              <span className="text-gray-400">{t('bankIban')}:</span>
                              <span className="ml-2 dark:text-gray-300">{companyInfo.bankIban}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Section 2: Bankadresse + BETINGELSER side by side */}
                      <div className="flex justify-between">
                        {(companyInfo.bankName || companyInfo.bankStreet || companyInfo.bankCity || companyInfo.bankCountry) && (
                          <div>
                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('bankAddressTitle')}</p>
                            <div className="space-y-1 text-sm">
                              {companyInfo.bankName && (
                                <div className="dark:text-gray-300">{companyInfo.bankName}</div>
                              )}
                              {companyInfo.bankStreet && (
                                <div className="dark:text-gray-300">{companyInfo.bankStreet}</div>
                              )}
                              {companyInfo.bankCity && (
                                <div className="dark:text-gray-300">{companyInfo.bankCity}</div>
                              )}
                              {companyInfo.bankCountry && (
                                <div className="dark:text-gray-300">{companyInfo.bankCountry}</div>
                              )}
                            </div>
                          </div>
                        )}
                        {companyInfo.invoiceTerms && (
                          <div className="w-64 text-left">
                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('invoiceTerms')}</p>
                            <p className="text-sm dark:text-gray-300 whitespace-pre-line">{companyInfo.invoiceTerms}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {previewInvoice.notes && (
                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">{t('notes')}</p>
                    <p className="text-sm text-amber-800 dark:text-amber-300">{previewInvoice.notes}</p>
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  // ========== CREATE INVOICE VIEW ==========
  const renderCreateInvoice = () => {
    const selectedContact = contacts.find(c => c.id === selectedContactId);
    const hasFormData = invoiceForm.customerName.trim() || invoiceForm.lineItems.some(i => i.description.trim());

    return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* ── Header Section ── */}
      <PageHeader
        title={t('createInvoice')}
        description={language === 'da'
          ? 'Udfyld felterne for at oprette en ny faktura'
          : 'Fill in the fields to create a new invoice'}
        action={
          <div className="flex items-center gap-2">
            <Badge className="text-xs gap-1 bg-[#0d9488]/10 text-[#0d9488] border border-[#0d9488]/20 lg:bg-white/15 lg:text-white lg:border-white/20">
              <FileText className="h-3 w-3" />
              {nextInvoiceNumber}
            </Badge>
            <Button variant="outline" onClick={() => setCurrentView('list')} className="bg-gray-200 hover:bg-gray-300 text-gray-700 border border-gray-300 lg:bg-white/10 lg:hover:bg-white/20 lg:text-white lg:border-white/20 gap-2">
              {t('cancel')}
            </Button>
          </div>
        }
      />

      {/* ── Customer Info Card ── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0d9488] flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-white" />
            </div>
            {language === 'da' ? 'Kundeoplysninger' : 'Customer Information'}
          </CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {language === 'da'
              ? 'Vælg en eksisterende kontakt eller indtast kundeoplysninger manuelt'
              : 'Select an existing contact or enter customer details manually'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Contact selector row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Contact type filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {language === 'da' ? 'Kontakt type' : 'Contact Type'}
              </Label>
              <Select value={contactTypeFilter} onValueChange={(val) => {
                setContactTypeFilter(val as 'CUSTOMER' | 'SUPPLIER' | 'ALL');
                setSelectedContactId('');
                fetchContacts('', val);
              }}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740]">
                  <SelectItem value="CUSTOMER">
                    {language === 'da' ? 'Kunder' : 'Customers'}
                  </SelectItem>
                  <SelectItem value="SUPPLIER">
                    {language === 'da' ? 'Leverandører' : 'Suppliers'}
                  </SelectItem>
                  <SelectItem value="ALL">
                    {language === 'da' ? 'Alle kontakter' : 'All Contacts'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Contact combobox */}
            <div className="sm:col-span-2 space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {language === 'da' ? 'Vælg kontakt' : 'Select Contact'}
              </Label>
              <Popover open={contactSearchOpen} onOpenChange={(open) => {
                setContactSearchOpen(open);
                if (open) {
                  fetchContacts('', contactTypeFilter);
                }
              }}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={contactSearchOpen}
                    className="w-full h-10 justify-between text-left font-normal"
                  >
                    {selectedContact
                      ? selectedContact.name
                      : (language === 'da' ? 'Søg i kontakter...' : 'Search contacts...')}
                    <Search className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={language === 'da' ? 'Søg efter navn, CVR...' : 'Search by name, CVR...'}
                      onValueChange={(value) => fetchContacts(value, contactTypeFilter)}
                    />
                    <CommandList className="max-h-64">
                      <CommandEmpty>
                        {language === 'da' ? 'Ingen kontakter fundet.' : 'No contacts found.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {contacts.map((contact) => (
                          <CommandItem
                            key={contact.id}
                            value={contact.id}
                            onSelect={() => handleSelectContact(contact)}
                          >
                            <Check className={`h-4 w-4 mr-2 shrink-0 ${
                              selectedContactId === contact.id ? 'opacity-100' : 'opacity-0'
                            }`} />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium truncate">{contact.name}</span>
                              {contact.cvrNumber && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  CVR: {contact.cvrNumber}
                                </span>
                              )}
                            </div>
                            <Badge className="ml-auto text-[10px] shrink-0 bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400 border-0">
                              {contact.type === 'CUSTOMER'
                                ? (language === 'da' ? 'Kunde' : 'Customer')
                                : contact.type === 'SUPPLIER'
                                  ? (language === 'da' ? 'Leverandør' : 'Supplier')
                                  : (language === 'da' ? 'Begge' : 'Both')}
                            </Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {selectedContactId && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
              <p className="flex-1">
                {language === 'da'
                  ? 'Kontaktoplysningerne er udfyldt automatisk. Du kan ændre dem manuelt.'
                  : 'Contact details have been auto-filled. You can edit them manually.'}
              </p>
              <Button variant="ghost" size="sm" onClick={handleClearContact} className="h-7 px-2 text-gray-400 hover:text-red-500 shrink-0">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <Separator />

          {/* Customer details fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-customerName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('customerName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoice-customerName"
                value={invoiceForm.customerName}
                onChange={(e) => {
                  setInvoiceForm(prev => ({ ...prev, customerName: e.target.value }));
                  // Clear selected contact if name is manually changed
                  if (selectedContactId && e.target.value !== selectedContact?.name) {
                    setSelectedContactId('');
                  }
                }}
                placeholder={t('customerName')}
                className="h-10"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-customerAddress" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('customerAddress')}
              </Label>
              <Input
                id="invoice-customerAddress"
                value={invoiceForm.customerAddress}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, customerAddress: e.target.value }))}
                placeholder={t('customerAddress')}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-customerEmail" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('customerEmail')}
              </Label>
              <Input
                id="invoice-customerEmail"
                type="email"
                value={invoiceForm.customerEmail}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, customerEmail: e.target.value }))}
                placeholder={t('customerEmail')}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-customerPhone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('customerPhone')}
              </Label>
              <Input
                id="invoice-customerPhone"
                value={invoiceForm.customerPhone}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                placeholder={t('customerPhone')}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-customerCvr" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('customerCvr')}
              </Label>
              <Input
                id="invoice-customerCvr"
                value={invoiceForm.customerCvr}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, customerCvr: e.target.value }))}
                placeholder={t('customerCvr')}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-issueDate" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('invoiceDate')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoice-issueDate"
                type="date"
                value={invoiceForm.issueDate}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, issueDate: e.target.value }))}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-dueDate" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('dueDate')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoice-dueDate"
                type="date"
                value={invoiceForm.dueDate}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Line Items Card ── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-white" />
              </div>
              {t('lineItems')}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={addLineItem} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t('addItem')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {invoiceForm.lineItems.map((item, index) => (
              <div key={index} className="flex flex-col gap-3 p-4 rounded-lg border border-gray-100/50 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
                <div className="flex flex-wrap gap-3 items-end">
                  {/* Account selector */}
                  <div className="w-48 space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Konto' : 'Account'}
                    </Label>
                    <Select
                      value={item.accountId}
                      onValueChange={(val) => updateLineItem(index, 'accountId', val)}
                    >
                      <SelectTrigger className="h-10 bg-white dark:bg-white/5">
                        <SelectValue placeholder={language === 'da' ? 'Vælg konto...' : 'Select account...'} />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740] max-h-64 overflow-y-auto">
                        {accounts
                          .filter(a => a.type === 'REVENUE' || a.type === 'EXPENSE')
                          .sort((a, b) => a.number.localeCompare(b.number))
                          .map(account => (
                            <SelectItem key={account.id} value={account.id}>
                              <span className="font-mono text-xs mr-1">{account.number}</span> {account.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Description */}
                  <div className="flex-1 min-w-[180px] space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">{t('itemDescription')}</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      placeholder={t('itemDescription')}
                      className="h-10 bg-white dark:bg-white/5"
                    />
                  </div>
                  {/* Quantity */}
                  <div className="w-20 space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">{t('quantity')}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="h-10 bg-white dark:bg-white/5 text-center"
                    />
                  </div>
                  {/* Unit Price */}
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">{t('unitPrice')}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice || ''}
                      onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="h-10 bg-white dark:bg-white/5 text-right"
                    />
                  </div>
                  {/* VAT % */}
                  <div className="w-20 space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">{t('vatPercent')}</Label>
                    <Select
                      value={item.vatPercent.toString()}
                      onValueChange={(val) => updateLineItem(index, 'vatPercent', parseFloat(val))}
                    >
                      <SelectTrigger className="h-10 bg-white dark:bg-white/5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740]">
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="25">25%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Amount */}
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">{t('amount')}</Label>
                    <div className="h-10 px-3 flex items-center justify-end text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 rounded-md">
                      {tc(item.quantity * item.unitPrice)}
                    </div>
                  </div>
                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLineItem(index)}
                    disabled={invoiceForm.lineItems.length === 1}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-6">
            <div className="w-72 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('subtotal')}</span>
                <span className="font-medium dark:text-gray-300">{tc(calculatedTotals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('vatTotalLabel')}</span>
                <span className="font-medium dark:text-gray-300">{tc(calculatedTotals.vatTotal)}</span>
              </div>
              <Separator className="dark:bg-gray-700" />
              <div className="flex justify-between">
                <span className="text-lg font-bold text-gray-900 dark:text-white">{t('grandTotal')}</span>
                <span className="text-lg font-bold text-[#0d9488] dark:text-[#2dd4bf]">{tc(calculatedTotals.total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Notes Card ── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
              <AlignLeft className="h-4 w-4 text-white" />
            </div>
            {language === 'da' ? 'Bemærkninger' : 'Notes'}
          </CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {language === 'da'
              ? 'Tilføj evt. bemærkninger eller betingelser til fakturaen'
              : 'Add any notes or terms to the invoice'}
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={invoiceForm.notes}
            onChange={(e) => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder={t('invoiceNotes')}
            className="min-h-[80px]"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* ── Bottom Save Bar ── */}
      {hasFormData && (
        <div className="sticky bottom-4 z-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-white dark:bg-[#1a1f1e] border border-gray-200 dark:border-white/10 shadow-2xl px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="hidden sm:inline">
                  {language === 'da'
                    ? `${invoiceForm.lineItems.filter(i => i.description.trim()).length} linjeposter`
                    : `${invoiceForm.lineItems.filter(i => i.description.trim()).length} line items`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentView('list')}
                  className="gap-2"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={handleGenerateInvoice}
                  disabled={isSubmitting}
                  size="sm"
                  className="bg-[#14b8a6] hover:bg-[#0d9488] text-white font-medium gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {isSubmitting ? t('creating') : t('generateInvoice')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  };

  // ========== INVOICE LIST VIEW ==========
  const renderInvoiceList = () => (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={t('invoicesTitle')}
        description={t('manageInvoices')}
        action={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                if (!companyInfo) {
                  setShowCompanySetup(true);
                } else {
                  setCurrentView('create');
                }
              }}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('createInvoice')}
            </Button>
          </div>
        }
      />

      {/* Invoice Summary Cards */}
      {invoices.length > 0 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={Wallet}
          label={language === 'da' ? 'Udestående' : 'Total Outstanding'}
          value={invoiceStats.outstanding}
          variant="primary"
          badge={language === 'da' ? 'inkl. moms' : 'incl. VAT'}
          formatAsCurrency
        />
        <StatsCard
          icon={AlertTriangle}
          label={language === 'da' ? 'Forfaldent beløb' : 'Overdue Amount'}
          value={invoiceStats.overdueAmount}
          variant="red"
          badge={invoiceStats.overdueCount > 0 ? `${invoiceStats.overdueCount} ${language === 'da' ? 'faktura(er)' : 'invoice(s)'}` : undefined}
          formatAsCurrency
        />
        <StatsCard
          icon={CheckCircle2}
          label={language === 'da' ? 'Betalt denne måned' : 'Paid This Month'}
          value={invoiceStats.paidThisMonth}
          variant="green"
          badge={language === 'da' ? 'inkl. moms' : 'incl. VAT'}
          formatAsCurrency
        />
        <StatsCard
          icon={FileSpreadsheet}
          label={language === 'da' ? 'Kladder' : 'Drafts'}
          value={invoiceStats.draftCount}
          variant="blue"
          formatAsCurrency={false}
          badge={invoiceStats.draftCount > 0 ? (language === 'da' ? 'Til gennemgang' : 'Pending review') : undefined}
        />
      </div>
      )}

      {/* Filters Section */}
      {invoices.length > 0 && (
      <Card className="stat-card">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search bar - always visible */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('searchInvoices')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-white/5 border-0"
              />
            </div>
            {/* Status filters — mobile: dropdown menu / desktop: inline pills */}
            {/* Mobile: Popover dropdown with status options */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden h-9 gap-1.5 shrink-0 border-gray-200 dark:border-gray-700">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">
                    {statusFilterPills.find(p => p.value === statusFilter)?.label || t('allStatuses')}
                  </span>
                  {(searchQuery ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] font-bold bg-[#0d9488] text-white">
                      {(searchQuery ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
                    </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-1" align="end">
                <div className="space-y-0.5">
                  {statusFilterPills.map((pill) => (
                    <button
                      key={pill.value}
                      onClick={() => setStatusFilter(pill.value)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                        statusFilter === pill.value
                          ? 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span className={`
                        inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold
                        ${statusFilter === pill.value
                          ? 'bg-[#0d9488]/20 text-[#0d9488] dark:bg-[#2dd4bf]/20 dark:text-[#2dd4bf]'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                        }
                      `}>
                        {pill.count}
                      </span>
                    </button>
                  ))}
                </div>
                {(searchQuery || statusFilter !== 'all') && (
                  <>
                    <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                    <button
                      onClick={clearFilters}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      {language === 'da' ? 'Ryd filtre' : 'Clear filters'}
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>
            {/* Desktop: inline pills */}
            <MobileFilterDropdown
              activeFilterCount={(searchQuery ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
              language={language}
              onClearFilters={clearFilters}
            >
              <div className="hidden lg:flex flex-wrap gap-2">
                {statusFilterPills.map((pill) => (
                  <button
                    key={pill.value}
                    onClick={() => setStatusFilter(pill.value)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                      ${statusFilter === pill.value
                        ? pill.value === 'OVERDUE'
                          ? 'bg-red-500 text-white shadow-sm shadow-red-500/25'
                          : pill.value === 'PAID'
                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
                            : pill.value === 'DRAFT'
                              ? 'bg-gray-500 text-white shadow-sm shadow-gray-500/25'
                              : pill.value === 'SENT'
                                ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/25'
                                : pill.value === 'CANCELLED'
                                  ? 'bg-gray-400 text-white shadow-sm shadow-gray-400/25'
                                  : 'bg-[#0d9488] text-white shadow-sm shadow-[#0d9488]/25'
                        : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-[#0d9488] dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-[#1a2e2b] dark:hover:text-[#5eead4]'
                      }
                    `}
                  >
                    {pill.label}
                    <span className={`
                      inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold
                      ${statusFilter === pill.value
                        ? 'bg-[#0d9488] text-white'
                        : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500'
                      }
                    `}>
                      {pill.count}
                    </span>
                  </button>
                ))}
              </div>
            </MobileFilterDropdown>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Mobile Card List */}
      <div className="lg:hidden space-y-3">
        {filteredInvoices.length === 0 ? (
          <Card className="stat-card border-0 shadow-lg">
            <CardContent className="p-0">
              <div className="text-center py-20 px-4">
                <div className="relative mx-auto w-40 h-32 mb-6">
                  <div className="absolute bottom-0 left-2 w-28 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transform -rotate-3" />
                  <div className="absolute bottom-1 left-4 w-28 h-20 rounded-lg bg-gray-150 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 transform rotate-1" />
                  <div className="absolute bottom-2 left-6 w-28 h-20 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="p-2.5">
                      <div className="w-12 h-1.5 rounded bg-[#0d9488]/30 mb-2" />
                      <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                      <div className="w-14 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                      <div className="w-full h-px bg-gray-100 dark:bg-gray-700 my-1.5" />
                      <div className="flex justify-end">
                        <div className="w-8 h-1.5 rounded bg-[#0d9488]/40" />
                      </div>
                    </div>
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shadow-lg">
                    <Plus className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1.5">
                  {invoices.length === 0
                    ? (language === 'da' ? 'Ingen fakturaer endnu' : 'No invoices yet')
                    : t('noInvoicesFound')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
                  {invoices.length === 0
                    ? (language === 'da'
                      ? 'Opret din første faktura for at begynde at holde styr på dine betalinger og fakturering.'
                      : 'Create your first invoice to start tracking your payments and billing.')
                    : (language === 'da'
                      ? 'Ingen fakturaer matcher dine filtre. Prøv at ændre dine filtre.'
                      : 'No invoices match your current filters. Try adjusting your filters.')}
                </p>
                {invoices.length === 0 ? (
                  <Button
                    onClick={() => {
                      if (!companyInfo) {
                        setShowCompanySetup(true);
                      } else {
                        setCurrentView('create');
                      }
                    }}
                    className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-2 shadow-md shadow-[#0d9488]/25"
                  >
                    <Plus className="h-4 w-4" />
                    {language === 'da' ? 'Opret første faktura' : 'Create First Invoice'}
                  </Button>
                ) : (searchQuery || statusFilter !== 'all') ? (
                  <Button variant="outline" onClick={clearFilters} className="gap-2 text-[#0d9488]">
                    <X className="h-4 w-4" />
                    {t('clearFilters')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredInvoices.map((invoice) => {
            const displayStatus = getInvoiceDisplayStatus(invoice);
            const countdown = getDueDateCountdown(invoice);
            return (
              <div
                key={invoice.id}
                className={`bg-white dark:bg-[#1a1f1e] rounded-2xl p-4 shadow-sm border cursor-pointer hover:shadow-md transition-shadow duration-200 ${
                  countdown.isOverdue
                    ? 'border-red-200 dark:border-red-900/30'
                    : countdown.isUrgent
                      ? 'border-amber-200 dark:border-amber-900/30'
                      : 'border-gray-100 dark:border-white/5'
                }`}
                onClick={() => setPreviewInvoice(invoice)}
              >
                {/* Row 1: Invoice number + status badge + actions menu */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm text-[#0d9488] dark:text-[#2dd4bf]">
                      {invoice.invoiceNumber}
                    </span>
                    <StatusBadge status={displayStatus} />
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-[#0d9488]"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">{t('changeStatus')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleUpdateStatus(invoice.id, 'DRAFT')}
                          disabled={invoice.status === 'DRAFT'}
                          className={invoice.status === 'DRAFT' ? 'font-semibold bg-gray-50 dark:bg-white/5' : ''}
                        >
                          <FileText className="h-4 w-4 mr-2 text-gray-500 dark:text-gray-400" />
                          {t('draft')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleUpdateStatus(invoice.id, 'SENT')}
                          disabled={invoice.status === 'SENT'}
                          className={invoice.status === 'SENT' ? 'font-semibold bg-[#e8f2f4] dark:bg-[#1e2e32]' : ''}
                        >
                          <Send className="h-4 w-4 mr-2 text-[#7dabb5]" />
                          {t('sent')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleUpdateStatus(invoice.id, 'PAID')}
                          disabled={invoice.status === 'PAID'}
                          className={invoice.status === 'PAID' ? 'font-semibold bg-green-50 dark:bg-green-900/20' : ''}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                          {t('paid')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleUpdateStatus(invoice.id, 'CANCELLED')}
                          disabled={invoice.status === 'CANCELLED'}
                          className={invoice.status === 'CANCELLED' ? 'font-semibold bg-red-50 dark:bg-red-900/20' : ''}
                        >
                          <Ban className="h-4 w-4 mr-2 text-red-500" />
                          {t('cancelled')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Row 2: Customer + Amount */}
                <div className="flex items-end justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate mr-3">
                    {invoice.customerName}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
                    {tc(invoice.total)}
                  </span>
                </div>

                {/* Row 3: Dates + countdown */}
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {td(new Date(invoice.issueDate))}
                  </span>
                  <span className={countdown.isOverdue ? 'text-red-600 dark:text-red-400' : countdown.isUrgent ? 'text-amber-600 dark:text-amber-400' : ''}>
                    {language === 'da' ? 'Frist' : 'Due'}: {td(new Date(invoice.dueDate))}
                  </span>
                  {countdown.text && (
                    <span className={`flex items-center gap-0.5 ${
                      countdown.isOverdue ? 'text-red-500 dark:text-red-400/80' : countdown.isUrgent ? 'text-amber-500 dark:text-amber-400/80' : 'text-gray-400'
                    }`}>
                      <Clock className="h-3 w-3" />
                      {countdown.text}
                    </span>
                  )}
                </div>

                {/* Row 4: Quick action buttons */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-white/5" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewInvoice(invoice)}
                    className="h-7 px-2 text-xs text-gray-500 hover:text-[#0d9488] gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {language === 'da' ? 'Vis' : 'View'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadPDF(invoice)}
                    disabled={downloadingInvoiceId === invoice.id}
                    className="h-7 px-2 text-xs text-gray-500 hover:text-[#0d9488] gap-1"
                  >
                    {downloadingInvoiceId === invoice.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePrintInvoice(invoice)}
                    className="h-7 px-2 text-xs text-gray-500 hover:text-[#0d9488] gap-1"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    {language === 'da' ? 'Print' : 'Print'}
                  </Button>
                  <div className="ml-auto">
                    <AlertDialog open={deleteTarget === invoice.id} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(invoice.id)}
                          className="h-7 px-2 text-xs text-gray-500 hover:text-red-500 gap-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="dark:text-white">{t('deleteInvoice')}</AlertDialogTitle>
                          <AlertDialogDescription className="dark:text-gray-400">
                            {t('deleteInvoiceConfirm')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="dark:bg-white/5">{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteInvoice(invoice.id)}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            {t('delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Invoice Table (Desktop) */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5 hidden lg:block">
        <CardContent className="p-0">
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-20 px-4">
              {/* Professional illustration-style empty state */}
              <div className="relative mx-auto w-40 h-32 mb-6">
                {/* Stacked invoice cards illustration */}
                <div className="absolute bottom-0 left-2 w-28 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transform -rotate-3" />
                <div className="absolute bottom-1 left-4 w-28 h-20 rounded-lg bg-gray-150 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 transform rotate-1" />
                <div className="absolute bottom-2 left-6 w-28 h-20 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="p-2.5">
                    <div className="w-12 h-1.5 rounded bg-[#0d9488]/30 mb-2" />
                    <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                    <div className="w-14 h-1 rounded bg-gray-200 dark:bg-gray-700 mb-1.5" />
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-700 my-1.5" />
                    <div className="flex justify-end">
                      <div className="w-8 h-1.5 rounded bg-[#0d9488]/40" />
                    </div>
                  </div>
                </div>
                {/* Accent circle */}
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shadow-lg">
                  <Plus className="h-4 w-4 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1.5">
                {invoices.length === 0
                  ? (language === 'da' ? 'Ingen fakturaer endnu' : 'No invoices yet')
                  : t('noInvoicesFound')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
                {invoices.length === 0
                  ? (language === 'da'
                    ? 'Opret din første faktura for at begynde at holde styr på dine betalinger og fakturering.'
                    : 'Create your first invoice to start tracking your payments and billing.')
                  : (language === 'da'
                    ? 'Ingen fakturaer matcher dine filtre. Prøv at ændre dine filtre.'
                    : 'No invoices match your current filters. Try adjusting your filters.')}
              </p>
              {invoices.length === 0 ? (
                <Button
                  onClick={() => {
                    if (!companyInfo) {
                      setShowCompanySetup(true);
                    } else {
                      setCurrentView('create');
                    }
                  }}
                  className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white gap-2 shadow-md shadow-[#0d9488]/25"
                >
                  <Plus className="h-4 w-4" />
                  {language === 'da' ? 'Opret første faktura' : 'Create First Invoice'}
                </Button>
              ) : (searchQuery || statusFilter !== 'all') ? (
                <Button variant="outline" onClick={clearFilters} className="gap-2 text-[#0d9488]">
                  <X className="h-4 w-4" />
                  {t('clearFilters')}
                </Button>
              ) : null}
            </div>
          ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-100">
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">{t('invoiceNumber')}</TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">{t('customerName')}</TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">{t('invoiceDate')}</TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">{t('dueDate')}</TableHead>
                    <TableHead className="text-right bg-gray-50 dark:bg-gray-700/50">{t('grandTotal')}</TableHead>
                    <TableHead className="text-center bg-gray-50 dark:bg-gray-700/50">{t('invoiceStatus')}</TableHead>
                    <TableHead className="text-center bg-gray-50 dark:bg-gray-700/50">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const displayStatus = getInvoiceDisplayStatus(invoice);
                    const countdown = getDueDateCountdown(invoice);
                    return (
                      <TableRow
                        key={invoice.id}
                        className={`border-b border-gray-50/50 table-row-teal-hover cursor-pointer ${
                          countdown.isOverdue ? 'bg-red-50/30 dark:bg-red-900/5' : ''
                        } ${countdown.isUrgent && !countdown.isOverdue ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`}
                        onClick={() => setPreviewInvoice(invoice)}
                      >
                        <TableCell className="font-mono font-semibold text-[#0d9488] dark:text-[#2dd4bf] whitespace-nowrap">
                          {invoice.invoiceNumber}
                        </TableCell>
                        <TableCell className="font-medium dark:text-gray-300">{invoice.customerName}</TableCell>
                        <TableCell className="whitespace-nowrap dark:text-gray-400">{td(new Date(invoice.issueDate))}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className={countdown.isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : countdown.isUrgent ? 'text-amber-600 dark:text-amber-400 font-medium' : 'dark:text-gray-400'}>
                              {td(new Date(invoice.dueDate))}
                            </span>
                            {countdown.text && (
                              <span className={`text-[11px] flex items-center gap-1 ${
                                countdown.isOverdue ? 'text-red-500 dark:text-red-400/80' : countdown.isUrgent ? 'text-amber-500 dark:text-amber-400/80' : 'text-gray-400'
                              }`}>
                                <Clock className="h-3 w-3" />
                                {countdown.text}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap dark:text-gray-300">{tc(invoice.total)}</TableCell>
                        <TableCell className="text-center"><StatusBadge status={displayStatus} /></TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-400 hover:text-[#0d9488] gap-1"
                                >
                                  <CircleDot className="h-4 w-4" />
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">{t('changeStatus')}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleUpdateStatus(invoice.id, 'DRAFT')}
                                  disabled={invoice.status === 'DRAFT'}
                                  className={invoice.status === 'DRAFT' ? 'font-semibold bg-gray-50 dark:bg-white/5' : ''}
                                >
                                  <FileText className="h-4 w-4 mr-2 text-gray-500 dark:text-gray-400" />
                                  {t('draft')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleUpdateStatus(invoice.id, 'SENT')}
                                  disabled={invoice.status === 'SENT'}
                                  className={invoice.status === 'SENT' ? 'font-semibold bg-[#e8f2f4] dark:bg-[#1e2e32]' : ''}
                                >
                                  <Send className="h-4 w-4 mr-2 text-[#7dabb5]" />
                                  {t('sent')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleUpdateStatus(invoice.id, 'PAID')}
                                  disabled={invoice.status === 'PAID'}
                                  className={invoice.status === 'PAID' ? 'font-semibold bg-green-50 dark:bg-green-900/20' : ''}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                                  {t('paid')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleUpdateStatus(invoice.id, 'CANCELLED')}
                                  disabled={invoice.status === 'CANCELLED'}
                                  className={invoice.status === 'CANCELLED' ? 'font-semibold bg-red-50 dark:bg-red-900/20' : ''}
                                >
                                  <Ban className="h-4 w-4 mr-2 text-red-500" />
                                  {t('cancelled')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPreviewInvoice(invoice)}
                              className="text-gray-400 hover:text-[#0d9488]"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrintInvoice(invoice)}
                              className="text-gray-400 hover:text-[#0d9488]"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownloadPDF(invoice)}
                                    disabled={downloadingInvoiceId === invoice.id}
                                    className="text-gray-400 hover:text-[#0d9488]"
                                  >
                                    {downloadingInvoiceId === invoice.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Download className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('downloadPDF')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownloadOIOUBL(invoice)}
                                    disabled={downloadingInvoiceId === invoice.id}
                                    className="text-gray-400 hover:text-[#0d9488]"
                                  >
                                    {downloadingInvoiceId === invoice.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <FileText className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('downloadOIOUBL')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <AlertDialog open={deleteTarget === invoice.id} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteTarget(invoice.id)}
                                  className="text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="dark:text-white">{t('deleteInvoice')}</AlertDialogTitle>
                                  <AlertDialogDescription className="dark:text-gray-400">
                                    {t('deleteInvoiceConfirm')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="dark:bg-white/5">{t('cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteInvoice(invoice.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    {t('delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <>
      {currentView === 'list' && renderInvoiceList()}
      {currentView === 'create' && renderCreateInvoice()}
      {renderCompanySetupDialog()}
      {renderInvoicePreview()}

      {/* Reset All Data Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              {t('resetAllDataTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {t('resetAllDataDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-white/5" disabled={isResetting}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAllData}
              disabled={isResetting}
              className="bg-red-500 hover:bg-red-600"
            >
              {isResetting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('clearing')}</>
              ) : (
                t('resetAllDataConfirm')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
