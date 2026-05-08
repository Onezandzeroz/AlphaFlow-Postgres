'use client';

const DEFAULT_INVOICE_TERMS = 'Betaling forfalder senest 30 dage efter\nfakturadatoen. Ved forsinkelse, påløber\nder renter efter Renteloven.\nEvt. spørgsmål, så kontakt os venligst.';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Settings,
  Building2,
  Landmark,
  FileText,
  Image as ImageIcon,
  Upload,
  X,
  Check,
  Loader2,
  Info,
  AlertCircle,
  Save,
  RefreshCw,
  Camera,
  ArrowLeft,
  Plus,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { format, formatDistanceToNow } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────

interface CompanyInfo {
  id: string;
  logo: string | null;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  cvrNumber: string;
  companyType: string | null;
  invoicePrefix: string;
  bankName: string;
  bankAccount: string;
  bankRegistration: string;
  bankIban: string | null;
  bankStreet: string | null;
  bankCity: string | null;
  bankCountry: string | null;
  invoiceTerms: string | null;
  invoiceNotesTemplate: string | null;
  nextInvoiceSequence: number;
  currentYear: number;
  createdAt: string;
  updatedAt: string;
}

interface CompanySettingsPageProps {
  user: User;
  onNavigate?: (view: string) => void;
}

interface ValidationErrors {
  [key: string]: string;
}

// ── Validation helpers ─────────────────────────────────────────────

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s()-]/g, '');
  return /^(\+45)?\d{8}$/.test(cleaned);
}

function validateCvr(cvr: string): boolean {
  return /^\d{8}$/.test(cvr.trim());
}

function validateIban(iban: string): boolean {
  if (!iban) return true; // Optional field
  const cleaned = iban.trim().replace(/\s/g, '');
  // IBAN format: 2 letters (country code) + 2 digits (check digits) + 8-30 alphanumeric (BBAN)
  // Danish IBAN: DK + 2 check + 14 digits = 18 chars total (e.g. DK9066952003084399)
  return /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(cleaned);
}

function formatDanishBank(reg: string, account: string): string {
  const r = reg.trim().replace(/\s/g, '');
  const a = account.trim().replace(/\s/g, '');
  return `${r} ${a}`;
}

// ── Component ──────────────────────────────────────────────────────────

export function CompanySettingsPage({ user, onNavigate }: CompanySettingsPageProps) {
  const { t, language } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showBankPreview, setShowBankPreview] = useState(true);

  // Form state
  const [form, setForm] = useState({
    logo: '' as string,
    companyName: '',
    address: '',
    phone: '',
    email: '',
    cvrNumber: '',
    companyType: '',
    invoicePrefix: '',
    bankName: '',
    bankAccount: '',
    bankRegistration: '',
    bankIban: '',
    bankStreet: '',
    bankCity: '',
    bankCountry: '',
    invoiceTerms: DEFAULT_INVOICE_TERMS,
    invoiceNotesTemplate: '',
  });

  // ── Validation ──
  const validationErrors = useMemo<ValidationErrors>(() => {
    const errs: ValidationErrors = {};
    if (form.email && !validateEmail(form.email)) errs.email = t('invalidEmail');
    if (form.phone && !validatePhone(form.phone)) errs.phone = t('invalidPhone');
    if (form.cvrNumber && !validateCvr(form.cvrNumber)) errs.cvrNumber = t('invalidCvr');
    if (form.bankIban && !validateIban(form.bankIban)) errs.bankIban = t('invalidIban');
    return errs;
  }, [form, t]);

  // ── Bank account preview ──
  const bankPreview = useMemo(() => {
    if (form.bankRegistration && form.bankAccount) {
      return formatDanishBank(form.bankRegistration, form.bankAccount);
    }
    return '';
  }, [form.bankRegistration, form.bankAccount]);

  // ── Fetch company info ──
  const fetchCompanyInfo = useCallback(async () => {
    try {
      const response = await fetch('/api/company');
      if (response.ok) {
        const data = await response.json();
        if (data.companyInfo) {
          const info = data.companyInfo;
          setCompanyInfo(info);
          setForm({
            logo: info.logo || '',
            companyName: info.companyName || '',
            address: info.address || '',
            phone: info.phone || '',
            email: info.email || '',
            cvrNumber: info.cvrNumber || '',
            companyType: info.companyType || '',
            invoicePrefix: info.invoicePrefix || '',
            bankName: info.bankName || '',
            bankAccount: info.bankAccount || '',
            bankRegistration: info.bankRegistration || '',
            bankIban: info.bankIban || '',
            bankStreet: info.bankStreet || '',
            bankCity: info.bankCity || '',
            bankCountry: info.bankCountry || '',
            invoiceTerms: info.invoiceTerms || DEFAULT_INVOICE_TERMS,
            invoiceNotesTemplate: info.invoiceNotesTemplate || '',
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch company info:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanyInfo();
  }, [fetchCompanyInfo]);

  // ── Track changes ──
  useEffect(() => {
    if (companyInfo) {
      const changed =
        form.companyName !== (companyInfo.companyName || '') ||
        form.address !== (companyInfo.address || '') ||
        form.phone !== (companyInfo.phone || '') ||
        form.email !== (companyInfo.email || '') ||
        form.cvrNumber !== (companyInfo.cvrNumber || '') ||
        form.companyType !== (companyInfo.companyType || '') ||
        form.invoicePrefix !== (companyInfo.invoicePrefix || '') ||
        form.bankName !== (companyInfo.bankName || '') ||
        form.bankAccount !== (companyInfo.bankAccount || '') ||
        form.bankRegistration !== (companyInfo.bankRegistration || '') ||
        form.bankIban !== (companyInfo.bankIban || '') ||
        form.bankStreet !== (companyInfo.bankStreet || '') ||
        form.bankCity !== (companyInfo.bankCity || '') ||
        form.bankCountry !== (companyInfo.bankCountry || '') ||
        form.invoiceTerms !== (companyInfo.invoiceTerms || '') ||
        form.invoiceNotesTemplate !== (companyInfo.invoiceNotesTemplate || '') ||
        form.logo !== (companyInfo.logo || '');
      setHasChanges(changed);
    } else {
      const hasAny =
        form.companyName.trim() !== '' ||
        form.address.trim() !== '' ||
        form.phone.trim() !== '' ||
        form.email.trim() !== '' ||
        form.cvrNumber.trim() !== '' ||
        form.invoicePrefix.trim() !== '' ||
        form.bankName.trim() !== '' ||
        form.bankAccount.trim() !== '' ||
        form.bankRegistration.trim() !== '';
      setHasChanges(hasAny);
    }
  }, [form, companyInfo]);

  // ── Update form field ──
  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear field-specific error on change
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // ── Logo upload ──
  const handleLogoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^image\/(jpeg|png)$/)) {
        toast.error(language === 'da' ? 'Ugyldigt format' : 'Invalid format', {
          description: language === 'da' ? 'Kun JPG og PNG filer er tilladt' : 'Only JPG and PNG files are allowed',
        });
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        toast.error(language === 'da' ? 'Filen er for stor' : 'File too large', {
          description: language === 'da' ? 'Filen må højst være 2MB' : 'File size must be under 2MB',
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        updateField('logo', base64);
      };
      reader.readAsDataURL(file);
    },
    [language]
  );

  // ── Remove logo ──
  const handleRemoveLogo = useCallback(() => {
    updateField('logo', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // ── Save ──
  const handleSave = useCallback(async () => {
    // Check for real-time validation errors
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toast.error(language === 'da' ? 'Valideringsfejl' : 'Validation Errors', {
        description: language === 'da' ? 'Ret de markerede felter' : 'Fix the highlighted fields',
      });
      return;
    }

    // Validate required fields
    const requiredFields = [
      'companyName',
      'address',
      'phone',
      'email',
      'cvrNumber',
      'invoicePrefix',
      'bankName',
      'bankAccount',
      'bankRegistration',
    ] as const;

    const missingFields: ValidationErrors = {};
    for (const field of requiredFields) {
      if (!form[field].trim()) {
        missingFields[field] = language === 'da' ? 'Dette felt er påkrævet' : 'This field is required';
      }
    }

    if (Object.keys(missingFields).length > 0) {
      setErrors(missingFields);
      toast.error(language === 'da' ? 'Mangler påkrævede felter' : 'Missing Required Fields', {
        description: language === 'da' ? 'Udfyld alle felter markeret med *' : 'Fill in all fields marked with *',
      });
      return;
    }

    setIsSaving(true);
    try {
      const method = companyInfo ? 'PUT' : 'POST';
      const response = await fetch('/api/company', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logo: form.logo || null,
          companyName: form.companyName.trim(),
          address: form.address.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          cvrNumber: form.cvrNumber.trim(),
          companyType: form.companyType || null,
          invoicePrefix: form.invoicePrefix.trim().toUpperCase(),
          bankName: form.bankName.trim(),
          bankAccount: form.bankAccount.trim(),
          bankRegistration: form.bankRegistration.trim(),
          bankIban: form.bankIban.trim() || null,
          bankStreet: form.bankStreet.trim() || null,
          bankCity: form.bankCity.trim() || null,
          bankCountry: form.bankCountry.trim() || null,
          invoiceTerms: form.invoiceTerms.trim() || 'Betaling forfalder senest 30 dage efter\nfakturadatoen. Ved forsinkelse, påløber\nder renter efter Renteloven.\nEvt. spørgsmål, så kontakt os venligst.',
          invoiceNotesTemplate: form.invoiceNotesTemplate.trim() || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.companyInfo) {
          setCompanyInfo(data.companyInfo);
          setHasChanges(false);
          setErrors({});
        }
        toast.success(language === 'da' ? 'Indstillinger gemt!' : 'Settings Saved!', {
          description: language === 'da' ? 'Virksomhedsoplysningerne er opdateret.' : 'Company information has been updated.',
        });
        // Return to dashboard (onboarding scene) after a short delay
        setTimeout(() => onNavigate?.('dashboard'), 800);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(language === 'da' ? 'Fejl ved gemning' : 'Save Error', {
          description: errorData.error || (language === 'da' ? 'Kunne ikke gemme indstillingerne.' : 'Could not save settings.'),
        });
      }
    } catch {
      toast.error(language === 'da' ? 'Fejl ved gemning' : 'Save Error', {
        description: language === 'da' ? 'Kunne ikke gemme indstillingerne.' : 'Could not save settings.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [form, companyInfo, language, validationErrors]);

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-10 w-full" />
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

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ── Status Indicators ── */}
      <Card className="stat-card">
        <CardContent className="p-3 sm:p-4">
          {/* Mobile: compact horizontal row */}
          <div className="flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full stat-icon-primary flex items-center justify-center shrink-0">
                <Building2 className="h-3.5 w-3.5 text-[#14b8a6] dark:text-[#99f6e4]" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-none">{t('companyInformation')}</p>
                <p className={`text-[11px] font-bold mt-0.5 ${
                  companyInfo
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {companyInfo
                    ? (language === 'da' ? 'Komplet' : 'Complete')
                    : (language === 'da' ? 'Mangler' : 'Incomplete')}
                </p>
              </div>
            </div>
            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full stat-icon-green flex items-center justify-center shrink-0">
                <Landmark className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-none">{language === 'da' ? 'Bankoplysninger' : 'Bank Details'}</p>
                <p className={`text-[11px] font-bold mt-0.5 ${
                  form.bankName && form.bankAccount
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {form.bankName && form.bankAccount
                    ? (language === 'da' ? 'Udfyldt' : 'Filled')
                    : (language === 'da' ? 'Mangler' : 'Missing')}
                </p>
              </div>
            </div>
            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full stat-icon-amber flex items-center justify-center shrink-0">
                <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-none">{language === 'da' ? 'Sidst opdateret' : 'Last Updated'}</p>
                {companyInfo?.updatedAt ? (
                  <p className="text-[11px] font-bold text-gray-900 dark:text-white mt-0.5">
                    {formatDistanceToNow(new Date(companyInfo.updatedAt), { addSuffix: true })}
                  </p>
                ) : (
                  <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mt-0.5">
                    {language === 'da' ? 'Aldrig' : 'Never'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Desktop: three separate cards in a row */}
          <div className="hidden lg:grid grid-cols-3 gap-3">
            {/* Company Info Status */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full stat-icon-primary flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-[#14b8a6] dark:text-[#99f6e4]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('companyInformation')}
                </p>
                <p className={`text-xs font-bold mt-0.5 ${
                  companyInfo
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {companyInfo
                    ? (language === 'da' ? 'Komplet' : 'Complete')
                    : (language === 'da' ? 'Mangler' : 'Incomplete')}
                </p>
              </div>
            </div>

            {/* Bank Details Status */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full stat-icon-green flex items-center justify-center shrink-0">
                <Landmark className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Bankoplysninger' : 'Bank Details'}
                </p>
                <p className={`text-xs font-bold mt-0.5 ${
                  form.bankName && form.bankAccount
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {form.bankName && form.bankAccount
                    ? (language === 'da' ? 'Udfyldt' : 'Filled')
                    : (language === 'da' ? 'Mangler' : 'Missing')}
                </p>
              </div>
            </div>

            {/* Last Updated */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full stat-icon-amber flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Sidst opdateret' : 'Last Updated'}
                </p>
                {companyInfo?.updatedAt ? (
                  <p className="text-xs font-bold text-gray-900 dark:text-white mt-0.5">
                    {formatDistanceToNow(new Date(companyInfo.updatedAt), { addSuffix: true })}
                  </p>
                ) : (
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 mt-0.5">
                    {language === 'da' ? 'Aldrig' : 'Never'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* ── Company Details Card ── */}
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0d9488] flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-white" />
              </div>
              {language === 'da' ? 'Virksomhedsoplysninger' : 'Company Details'}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'da'
                ? 'Grundlæggende oplysninger om din virksomhed'
                : 'Basic information about your business'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 lg:space-y-6">
            {/* Logo Upload - Circular */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                {form.logo ? (
                  <div className="h-20 w-20 rounded-full border-2 border-[#0d9488]/30 dark:border-[#2dd4bf]/30 overflow-hidden bg-gray-100 dark:bg-white/5">
                    <img src={form.logo} alt="Company Logo" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="h-20 w-20 rounded-full border-2 border-dashed border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-white/5 flex items-center justify-center hover:border-[#0d9488] hover:bg-[#0d9488]/5 dark:hover:border-[#2dd4bf] dark:hover:bg-[#2dd4bf]/5 transition-all cursor-pointer"
                  >
                    <Plus className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  </button>
                )}
                {form.logo && (
                  <div className="absolute -top-1 -right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="h-6 w-6 rounded-full bg-white dark:bg-[#1c2035] shadow-sm border border-gray-200 dark:border-white/10 flex items-center justify-center"
                          >
                            <Camera className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{language === 'da' ? 'Skift logo' : 'Change Logo'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={handleRemoveLogo}
                            className="h-6 w-6 rounded-full bg-white dark:bg-[#1c2035] shadow-sm border border-gray-200 dark:border-white/10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <X className="h-3 w-3 text-red-500" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{language === 'da' ? 'Fjern logo' : 'Remove Logo'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('companyLogo')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  JPG, PNG (max 2MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('companyName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. AlphaAi ApS' : 'e.g. AlphaAi ApS'}
                className="h-10 focus-ring-teal"
              />
              {errors.companyName && <p className="text-xs text-red-500">{errors.companyName}</p>}
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('companyAddress')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Strøget 1, 1234 København' : 'e.g. Strøget 1, 1234 Copenhagen'}
                className="h-10 focus-ring-teal"
              />
              {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
            </div>

            {/* Phone & Email row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('companyPhone')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+45 12 34 56 78"
                  className={`h-10 focus-ring-teal ${validationErrors.phone ? 'border-red-500 dark:border-red-500' : ''}`}
                />
                {validationErrors.phone && (
                  <div className="flex items-center gap-1 text-xs text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    {validationErrors.phone}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('companyEmail')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="info@alphaai.dk"
                  className={`h-10 focus-ring-teal ${validationErrors.email ? 'border-red-500 dark:border-red-500' : ''}`}
                />
                {validationErrors.email && (
                  <div className="flex items-center gap-1 text-xs text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    {validationErrors.email}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* ── Business Registration Section ── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {t('businessRegistration')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* CVR */}
                <div className="space-y-2">
                  <Label htmlFor="cvrNumber" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('cvrNumber')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="cvrNumber"
                    value={form.cvrNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                      updateField('cvrNumber', val);
                    }}
                    placeholder={language === 'da' ? 'f.eks. 12345678' : 'e.g. 12345678'}
                    maxLength={8}
                    className={`h-10 focus-ring-teal ${validationErrors.cvrNumber ? 'border-red-500 dark:border-red-500' : ''}`}
                  />
                  {validationErrors.cvrNumber && (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <AlertTriangle className="h-3 w-3" />
                      {validationErrors.cvrNumber}
                    </div>
                  )}
                </div>

                {/* Company Type */}
                <div className="space-y-2">
                  <Label htmlFor="companyType" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('companyType')}
                  </Label>
                  <Select
                    value={form.companyType}
                    onValueChange={(val) => updateField('companyType', val)}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder={t('companyTypeSelectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ApS">{t('companyTypeApS')}</SelectItem>
                      <SelectItem value="A/S">{t('companyTypeAS')}</SelectItem>
                      <SelectItem value="IVS">{t('companyTypeIVS')}</SelectItem>
                      <SelectItem value="Enkeltmandsvirksomhed">{t('companyTypeEnkelt')}</SelectItem>
                      <SelectItem value="Holdingselskab">{t('companyTypeHolder')}</SelectItem>
                      <SelectItem value="Andet">{t('companyTypeOther')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
              <p>
                {language === 'da'
                  ? 'Disse oplysninger vises automatisk på alle dine fakturaer og eksporterede dokumenter.'
                  : 'This information is automatically displayed on all your invoices and exported documents.'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Bank Details Card ── */}
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                <Landmark className="h-4 w-4 text-white" />
              </div>
              {language === 'da' ? 'Bankoplysninger' : 'Bank Details'}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'da'
                ? 'Dine bankoplysninger til fakturabetaling'
                : 'Your bank details for invoice payments'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bank Name */}
            <div className="space-y-2">
              <Label htmlFor="bankName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('bankName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bankName"
                value={form.bankName}
                onChange={(e) => updateField('bankName', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Nordea' : 'e.g. Nordea'}
                className="h-10 focus-ring-teal"
              />
            </div>

            {/* Reg & Account row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankRegistration" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankRegistration')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="bankRegistration"
                  value={form.bankRegistration}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    updateField('bankRegistration', val);
                  }}
                  placeholder="1234"
                  maxLength={4}
                  className="h-10 focus-ring-teal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccount" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankAccount')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="bankAccount"
                  value={form.bankAccount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    updateField('bankAccount', val);
                  }}
                  placeholder="1234567890"
                  maxLength={10}
                  className="h-10 focus-ring-teal"
                />
              </div>
            </div>

            {/* Bank Account Preview (Danish formatting) */}
            {bankPreview && (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('bankAccountPreviewLabel')}
                  </p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                    {bankPreview}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full stat-icon-green flex items-center justify-center">
                  <Landmark className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              </div>
            )}

            {/* IBAN */}
            <div className="space-y-2">
              <Label htmlFor="bankIban" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('bankIban')}
              </Label>
              <Input
                id="bankIban"
                value={form.bankIban}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  updateField('bankIban', val);
                }}
                placeholder="DK50 1234 1234 1234 12"
                className={`h-10 focus-ring-teal ${validationErrors.bankIban ? 'border-red-500 dark:border-red-500' : ''}`}
              />
              {validationErrors.bankIban && (
                <div className="flex items-center gap-1 text-xs text-red-500">
                  <AlertTriangle className="h-3 w-3" />
                  {validationErrors.bankIban}
                </div>
              )}
            </div>

            <Separator />

            {/* Bank Address */}
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {language === 'da' ? 'Bankadresse (frivillig)' : 'Bank Address (Optional)'}
            </p>

            <div className="space-y-2">
              <Label htmlFor="bankStreet" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('bankStreet')}
              </Label>
              <Input
                id="bankStreet"
                value={form.bankStreet}
                onChange={(e) => updateField('bankStreet', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Holmens Kanal 2' : 'e.g. Holmens Kanal 2'}
                className="h-10 focus-ring-teal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankCity" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankCity')}
                </Label>
                <Input
                  id="bankCity"
                  value={form.bankCity}
                  onChange={(e) => updateField('bankCity', e.target.value)}
                  placeholder={language === 'da' ? 'f.eks. 1060 København K' : 'e.g. 1060 Copenhagen K'}
                  className="h-10 focus-ring-teal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankCountry" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankCountry')}
                </Label>
                <Input
                  id="bankCountry"
                  value={form.bankCountry}
                  onChange={(e) => updateField('bankCountry', e.target.value)}
                  placeholder={language === 'da' ? 'Danmark' : 'Denmark'}
                  className="h-10 focus-ring-teal"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row: Invoice Settings ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* ── Invoice Settings Card ── */}
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0d9488] flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-white" />
              </div>
              {language === 'da' ? 'Fakturaindstillinger' : 'Invoice Settings'}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'da'
                ? 'Konfigurer præfiks, nummerering og betalingsbetingelser'
                : 'Configure prefix, numbering, and payment terms'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invoice Prefix */}
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('invoicePrefix')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoicePrefix"
                value={form.invoicePrefix}
                onChange={(e) => updateField('invoicePrefix', e.target.value.toUpperCase())}
                placeholder={t('invoicePrefixPlaceholder')}
                className="h-10 uppercase"
              />
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-turquoise rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
                <p>{t('invoicePrefixHelp')}</p>
              </div>
            </div>

            {/* Next Invoice Number (live preview — updates as user types prefix) */}
            {companyInfo && (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('nextInvoiceNumber')}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white mt-1 font-mono tracking-wide">
                      {form.invoicePrefix || '#'}-{companyInfo.currentYear}-{String(companyInfo.nextInvoiceSequence).padStart(3, '0')}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full stat-icon-purple flex items-center justify-center">
                    <FileText className="h-5 w-5 text-[#14b8a6] dark:text-[#99f6e4]" />
                  </div>
                </div>
              </div>
            )}

            {/* Invoice Terms */}
            <div className="space-y-2">
              <Label htmlFor="invoiceTerms" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('invoiceTerms')}
              </Label>
              <Textarea
                id="invoiceTerms"
                value={form.invoiceTerms}
                onChange={(e) => updateField('invoiceTerms', e.target.value)}
                placeholder={t('invoiceTermsPlaceholder')}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Invoice Notes Template Card ── */}
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-white" />
              </div>
              {t('invoiceNotesTemplate')}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {t('invoiceNotesTemplateDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNotesTemplate" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('invoiceNotesTemplate')}
              </Label>
              <Textarea
                id="invoiceNotesTemplate"
                value={form.invoiceNotesTemplate}
                onChange={(e) => updateField('invoiceNotesTemplate', e.target.value)}
                placeholder={t('invoiceNotesTemplatePlaceholder')}
                rows={5}
                className="resize-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {language === 'da'
                  ? 'Denne tekst vises i bunden af alle nye fakturaer som standard.'
                  : 'This text appears at the bottom of all new invoices by default.'}
              </p>
            </div>

            {/* Preview */}
            {form.invoiceNotesTemplate && (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  {t('bankAccountPreview')}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap italic">
                  {form.invoiceNotesTemplate}
                </p>
              </div>
            )}

            {/* Info note */}
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
              <p>
                {language === 'da'
                  ? 'Du kan altid redigere noterne individuelt på hver faktura.'
                  : 'You can always edit notes individually on each invoice.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Save Bar ── */}
      {hasChanges && (
        <div className="sticky bottom-4 z-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-white dark:bg-[#1a1f1e] border border-gray-200 dark:border-white/10 shadow-2xl px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="hidden sm:inline">
                  {language === 'da' ? 'Du har ikke-gemte ændringer' : 'You have unsaved changes'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchCompanyInfo}
                  className="gap-2"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  size="sm"
                  className="bg-[#14b8a6] hover:bg-[#0d9488] text-white font-medium gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {isSaving
                    ? (language === 'da' ? 'Gemmer...' : 'Saving...')
                    : (language === 'da' ? 'Gem ændringer' : 'Save Changes')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
