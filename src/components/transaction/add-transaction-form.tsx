'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import {
  X,
  Info,
  Calendar,
  Clock,
  TrendingDown,
  BookOpen,
  Camera,
  Upload,
  Download,
  AlertTriangle,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { ReceiptScanner } from '@/components/scanner/ReceiptScanner';
import { scanReceipt, type OCRResult } from '@/lib/ocr-utils';

const CURRENCIES = ['DKK', 'EUR', 'USD', 'GBP', 'SEK', 'NOK'] as const;

interface ExpenseAccount {
  id: string;
  number: string;
  name: string;
  nameEn: string | null;
}

interface RecentDescription {
  description: string;
  type: string;
}

interface AddTransactionFormProps {
  onSuccess: () => void;
  /** When set, a receipt file from the standalone scanner (FAB) should be
   *  preloaded into the form automatically. */
  preloadedReceiptFile?: File | null;
  /** Called after the preloaded file has been consumed (set in the form). */
  onPreloadedFileConsumed?: () => void;
  /** Called when the scanner opens (true) or closes (false). Used by parent Dialog
   *  to prevent Radix from treating scanner clicks as "outside clicks". */
  onScannerActiveChange?: (active: boolean) => void;
}

// Account category groupings for the Danish chart of accounts
const ACCOUNT_GROUPS: Array<{ labelDa: string; labelEn: string; range: [number, number] }> = [
  { labelDa: 'Vareforbrug', labelEn: 'Cost of Goods', range: [6000, 6999] },
  { labelDa: 'Personaleomkostninger', labelEn: 'Personnel', range: [7000, 7999] },
  { labelDa: 'Driftsomkostninger', labelEn: 'Operating Expenses', range: [8000, 8999] },
  { labelDa: 'Finansielle omkostninger', labelEn: 'Financial', range: [9000, 9400] },
  { labelDa: 'Skat', labelEn: 'Tax', range: [9500, 9500] },
];

// Format number with Danish locale for display
function formatDanishNumber(num: number): string {
  return num.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function defaultToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AddTransactionForm({ onSuccess, preloadedReceiptFile, onPreloadedFileConsumed, onScannerActiveChange }: AddTransactionFormProps) {
  const { t, language } = useTranslation();
  const isDa = language === 'da';

  // ─── State ───
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountError, setAccountError] = useState('');

  const [date, setDate] = useState(defaultToday());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('DKK');
  const [exchangeRate, setExchangeRate] = useState('');
  const [includesVAT, setIncludesVAT] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [description, setDescription] = useState('');
  const [vatPercent, setVatPercent] = useState('25');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preloadedConsumedRef = useRef(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  // Track whether the user has manually interacted with the date field.
  // OCR should override the default date (today) but NOT a user-chosen date.
  const dateManuallySetRef = useRef(false);

  // ─── Data ───
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [recentDescriptions, setRecentDescriptions] = useState<RecentDescription[]>([]);
  const [descriptionsLoading, setDescriptionsLoading] = useState(false);
  const [showDescriptionSuggestions, setShowDescriptionSuggestions] = useState(false);

  // Notify parent when scanner is active so the Dialog can prevent
  // Radix from treating scanner clicks as "outside clicks" that close it.
  useEffect(() => {
    onScannerActiveChange?.(scannerOpen);
  }, [scannerOpen, onScannerActiveChange]);

  // Fetch expense accounts (6000-9500) on mount
  useEffect(() => {
    async function fetchAccounts() {
      setAccountsLoading(true);
      try {
        const expRes = await fetch('/api/accounts?type=EXPENSE');
        if (expRes.ok) {
          const data = await expRes.json();
          const filtered = (data.accounts || []).filter(
            (acc: ExpenseAccount) => {
              const num = parseInt(acc.number, 10);
              return num >= 6000 && num <= 9500;
            }
          );
          setExpenseAccounts(filtered);
        }
      } catch { /* silent */ } finally {
        setAccountsLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch recent descriptions on mount
  useEffect(() => {
    async function fetchDescriptions() {
      setDescriptionsLoading(true);
      try {
        const res = await fetch('/api/transactions/recent-descriptions');
        if (res.ok) {
          const data = await res.json();
          setRecentDescriptions(data.descriptions || []);
        }
      } catch { /* silent */ } finally {
        setDescriptionsLoading(false);
      }
    }
    fetchDescriptions();
  }, []);

  // ─── Calculations ───
  const parsedAmount = parseFloat(amount || '0');
  const parsedVatPercent = parseFloat(vatPercent || '0');
  const netAmount = includesVAT ? parsedAmount / (1 + parsedVatPercent / 100) : parsedAmount;
  const vatAmount = netAmount * parsedVatPercent / 100;
  const totalAmount = netAmount + vatAmount;

  // Group accounts by category for the dropdown
  const groupedAccounts = useMemo(() => {
    const groups: Array<{ labelDa: string; labelEn: string; accounts: ExpenseAccount[] }> = [];
    for (const group of ACCOUNT_GROUPS) {
      const accounts = expenseAccounts.filter((acc) => {
        const num = parseInt(acc.number, 10);
        return num >= group.range[0] && num <= group.range[1];
      });
      if (accounts.length > 0) {
        groups.push({ labelDa: group.labelDa, labelEn: group.labelEn, accounts });
      }
    }
    return groups;
  }, [expenseAccounts]);

  const selectedAccount = expenseAccounts.find((a) => a.id === selectedAccountId);

  // ─── Receipt handling ───
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(isDa ? 'Filstørrelsen skal være under 10MB' : 'File size must be less than 10MB');
      return;
    }
    setReceiptFile(file);
    setError('');
    const reader = new FileReader();
    reader.onload = (event) => setReceiptPreview(event.target?.result as string);
    reader.readAsDataURL(file);
  }, [isDa]);

  const clearReceipt = useCallback(() => {
    setReceiptFile(null);
    // Revoke any Object URL created by the scanner
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
    setReceiptPreview(null);
    setOcrLoading(false);
    setOcrProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  /**
   * Apply OCR results to the form fields.
   * Only fills a field if it's currently empty OR the user hasn't manually changed it.
   * Date: overrides the default (today) unless the user manually picked a date.
   * Amount: only fills if empty (preserves any user-typed value).
   */
  const applyOCRResult = useCallback((ocr: OCRResult) => {
    if (ocr.amount !== null && !amount) {
      setAmount(String(ocr.amount));
    }
    // Always apply OCR date unless the user has manually set one
    if (ocr.date && !dateManuallySetRef.current) {
      setDate(ocr.date);
    }
    if (ocr.vatPercent !== null) {
      setVatPercent(String(ocr.vatPercent));
    }
    if (ocr.amount !== null) {
      // If OCR found an amount and a VAT rate, the amount likely includes VAT
      if (ocr.vatPercent !== null && ocr.vatPercent > 0) {
        setIncludesVAT(true);
      }
    }
  }, [amount]);

  // When a preloaded file arrives from the standalone scanner (FAB flow),
  // auto-attach it to the form and run OCR.
  useEffect(() => {
    if (preloadedReceiptFile && !preloadedConsumedRef.current) {
      preloadedConsumedRef.current = true;
      // Revoke any previous Object URL
      if (receiptPreviewUrlRef.current) {
        URL.revokeObjectURL(receiptPreviewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(preloadedReceiptFile);
      receiptPreviewUrlRef.current = previewUrl;
      setReceiptFile(preloadedReceiptFile);
      setReceiptPreview(previewUrl);
      onPreloadedFileConsumed?.();

      // Run OCR on the preloaded image
      setOcrLoading(true);
      setOcrProgress(0);
      scanReceipt(preloadedReceiptFile, (progress) => {
        setOcrProgress(progress);
      }).then((ocrResult) => {
        setOcrLoading(false);
        setOcrProgress(100);
        applyOCRResult(ocrResult);
        if (ocrResult.confidence > 0 && (ocrResult.amount || ocrResult.date)) {
          toast.success(isDa ? 'Kvittering læst' : 'Receipt scanned', {
            description: isDa
              ? `Fundet ${ocrResult.amount ? `beløb: ${ocrResult.amount} kr` : ''}${ocrResult.amount && ocrResult.date ? ', ' : ''}${ocrResult.date ? `dato: ${ocrResult.date}` : ''}`
              : `Found ${ocrResult.amount ? `amount: ${ocrResult.amount} DKK` : ''}${ocrResult.amount && ocrResult.date ? ', ' : ''}${ocrResult.date ? `date: ${ocrResult.date}` : ''}`,
            duration: 4000,
          });
        }
      }).catch(() => {
        setOcrLoading(false);
      });
    }
    if (!preloadedReceiptFile) {
      preloadedConsumedRef.current = false;
    }
  }, [preloadedReceiptFile, onPreloadedFileConsumed, isDa, applyOCRResult]);

  const handleScannerCapture = useCallback((file: File) => {
    // Revoke any previous Object URL to prevent memory leaks
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    receiptPreviewUrlRef.current = previewUrl;
    setReceiptFile(file);
    setReceiptPreview(previewUrl);
    setScannerOpen(false);

    // Run OCR on the captured image
    setOcrLoading(true);
    setOcrProgress(0);
    scanReceipt(file, (progress) => {
      setOcrProgress(progress);
    }).then((ocrResult) => {
      setOcrLoading(false);
      setOcrProgress(100);
      applyOCRResult(ocrResult);
      if (ocrResult.confidence > 0 && (ocrResult.amount || ocrResult.date)) {
        toast.success(isDa ? 'Kvittering læst' : 'Receipt scanned', {
          description: isDa
            ? `Fundet ${ocrResult.amount ? `beløb: ${ocrResult.amount} kr` : ''}${ocrResult.amount && ocrResult.date ? ', ' : ''}${ocrResult.date ? `dato: ${ocrResult.date}` : ''}`
            : `Found ${ocrResult.amount ? `amount: ${ocrResult.amount} DKK` : ''}${ocrResult.amount && ocrResult.date ? ', ' : ''}${ocrResult.date ? `date: ${ocrResult.date}` : ''}`,
          duration: 4000,
        });
      }
    }).catch(() => {
      setOcrLoading(false);
    });
  }, [isDa, applyOCRResult]);

  const handleScannerDismiss = useCallback(() => {
    setScannerOpen(false);
  }, []);

  const handleUseDescription = useCallback((desc: string) => {
    setDescription(desc);
    setShowDescriptionSuggestions(false);
    descriptionInputRef.current?.focus();
  }, []);

  // ─── Submit ───
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccountError('');

    // Validate expense account is selected (required for double-entry)
    if (!selectedAccountId) {
      setAccountError(isDa
        ? 'Vælg en omkostningskonto for at bogføre i dobbelt-posteringsregnskabet'
        : 'Select an expense account for double-entry bookkeeping');
      return;
    }

    setIsLoading(true);

    try {
      let receiptImagePath: string | null = null;
      if (receiptFile) {
        const formData = new FormData();
        formData.append('file', receiptFile);
        const uploadResponse = await fetch('/api/transactions/upload', { method: 'POST', body: formData });
        if (!uploadResponse.ok) throw new Error(isDa ? 'Kunne ikke uploade kvittering' : 'Failed to upload receipt');
        const uploadData = await uploadResponse.json();
        receiptImagePath = uploadData.path;
      }

      const amountToStore = includesVAT ? netAmount : parsedAmount;
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PURCHASE',
          date,
          amount: amountToStore,
          currency: currency !== 'DKK' ? currency : undefined,
          exchangeRate: currency !== 'DKK' && exchangeRate ? parseFloat(exchangeRate) : undefined,
          description,
          vatPercent: parseFloat(vatPercent),
          receiptImage: receiptImagePath,
          accountId: selectedAccountId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || (isDa ? 'Kunne ikke oprette indkøb' : 'Failed to create purchase'));
      }

      // Reset form
      setDate(defaultToday());
      setAmount('');
      setCurrency('DKK');
      setExchangeRate('');
      setIncludesVAT(true);
      setOcrLoading(false);
      setOcrProgress(0);
      setDescription('');
      setVatPercent('25');
      setSelectedAccountId('');
      clearReceipt();

      toast.success(isDa ? 'Indkøb bogført' : 'Purchase recorded', {
        description: isDa
          ? 'Dit indkøb er bogført i dobbelt-posteringsregnskabet'
          : 'Your purchase has been recorded in the double-entry ledger',
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isDa ? 'Der opstod en fejl' : 'An error occurred'));
    } finally {
      setIsLoading(false);
    }
  }, [date, amount, currency, exchangeRate, includesVAT, netAmount, parsedAmount, description, vatPercent, receiptFile, selectedAccountId, clearReceipt, onSuccess, isDa]);

  // ─── RENDER ───
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Double-entry bookkeeping info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20">
        <ArrowRightLeft className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-medium text-teal-700 dark:text-teal-300">
            {isDa ? 'Dobbelt-posteringsregnskab' : 'Double-Entry Bookkeeping'}
          </p>
          <p className="text-teal-600 dark:text-teal-400 mt-0.5">
            {isDa
              ? 'Alle indkøb bogføres automatisk med modposteringer i Finansjournalen.'
              : 'All purchases are automatically recorded with offsetting entries in the General Journal.'}
          </p>
        </div>
      </div>

      {/* ─── REQUIRED: Expense Account (Omkostninger 6xxx-9xxx) ─── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
          <Label className="dark:text-gray-300 text-sm font-medium">
            {isDa ? 'Omkostninger' : 'Expenses'}
          </Label>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/20 dark:text-[#2dd4bf]">
            6xxx–9xxx
          </span>
          <span className="text-[10px] text-red-500 dark:text-red-400 ml-1">*</span>
        </div>
        <Select value={selectedAccountId} onValueChange={(val) => { setSelectedAccountId(val); setAccountError(''); }} disabled={isLoading || accountsLoading}>
          <SelectTrigger className={`dark:bg-white/5 ${accountError ? 'border-red-400 dark:border-red-500' : ''}`}>
            <SelectValue placeholder={accountsLoading
              ? (isDa ? 'Indlæser konti...' : 'Loading accounts...')
              : (isDa ? 'Vælg omkostningskonto...' : 'Select expense account...')
            } />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-[#1a1f1e] max-h-72">
            {groupedAccounts.map((group) => (
              <SelectGroup key={group.labelDa}>
                <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 select-none">
                  {isDa ? group.labelDa : group.labelEn} ({group.accounts[0]?.number.slice(0, 1)}xxx)
                </SelectLabel>
                {group.accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{acc.number}</span>
                    {isDa ? acc.name : (acc.nameEn || acc.name)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {accountError && (
          <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {accountError}
          </p>
        )}
        {selectedAccount && (
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            {isDa ? `Valgt: ${selectedAccount.number} ${selectedAccount.name}` : `Selected: ${selectedAccount.number} ${selectedAccount.nameEn || selectedAccount.name}`}
          </p>
        )}
      </div>

      {/* Receipt Upload */}
      <div className="space-y-2">
        <Label className="dark:text-gray-300 text-sm font-medium">{t('receipt')} ({isDa ? 'Valgfrit' : 'Optional'})</Label>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isLoading} />
        {receiptPreview ? (
          <div className="relative">
            <div className="w-full rounded-lg border overflow-hidden bg-gray-50 dark:bg-gray-900/50">
              <img src={receiptPreview} alt="Receipt preview" className="w-full h-auto max-h-64 object-contain" />
              {/* OCR progress overlay */}
              {ocrLoading && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                  <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full bg-teal-400 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${Math.max(ocrProgress, 5)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-white/80 font-medium">
                    {isDa ? 'Læser kvittering…' : 'Reading receipt…'}
                  </p>
                </div>
              )}
            </div>
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = receiptPreview;
                  const now = new Date();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  a.download = `kvittering_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                aria-label={isDa ? 'Gem billede' : 'Save image'}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="destructive" size="sm" className="bg-red-500/80 backdrop-blur-sm" onClick={clearReceipt}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-20 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
              onClick={() => setScannerOpen(true)}
              disabled={isLoading}
            >
              <div className="flex flex-col items-center gap-1.5">
                <Camera className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
                <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{isDa ? 'Scan kvittering' : 'Scan receipt'}</span>
              </div>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-20 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{isDa ? 'Vælg fil' : 'Choose file'}</span>
              </div>
            </Button>
          </div>
        )}
        {scannerOpen && (
          <ReceiptScanner
            onCapture={handleScannerCapture}
            onDismiss={handleScannerDismiss}
          />
        )}
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="date" className="dark:text-gray-300 text-sm font-medium">{t('date')}</Label>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setDate(defaultToday()); dateManuallySetRef.current = true; }} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${date === defaultToday() ? 'bg-[#0d9488]/10 border-[#0d9488] text-[#0d9488] dark:text-[#2dd4bf]' : 'border-gray-200 dark:border-white/10 text-gray-600'}`}>
            <Calendar className="h-3 w-3" /> {t('today')}
          </button>
          <button type="button" onClick={() => { setDate(defaultYesterday()); dateManuallySetRef.current = true; }} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${date === defaultYesterday() ? 'bg-[#0d9488]/10 border-[#0d9488] text-[#0d9488] dark:text-[#2dd4bf]' : 'border-gray-200 dark:border-white/10 text-gray-600'}`}>
            <Clock className="h-3 w-3" /> {t('yesterday')}
          </button>
        </div>
        <Input id="date" type="date" value={date} onChange={(e) => { setDate(e.target.value); dateManuallySetRef.current = true; }} required disabled={isLoading} className="dark:bg-white/5" />
      </div>

      {/* Amount */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="dark:text-gray-300 text-sm font-medium">{t('amount')}</Label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">{t('amountIncludesVAT')}</Label>
            <ResponsiveSwitch checked={includesVAT} onCheckedChange={setIncludesVAT} disabled={isLoading} />
          </div>
        </div>
        <div className="relative">
          <Input type="number" step="0.01" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={isLoading} className="h-14 text-2xl font-bold text-right pr-16 dark:bg-white/5 tabular-nums" />
          <div className="absolute right-3 top-1/2 -translate-y-1/2"><span className="text-sm font-semibold text-gray-500 dark:text-gray-400">DKK</span></div>
        </div>
        {includesVAT && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><Info className="h-3 w-3" />{t('grossToNetInfo')}</p>
        )}
        {amount && parsedAmount > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('netAmountShort')}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(netAmount)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('vatShort')}</p>
              <p className="text-sm font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">{formatDanishNumber(vatAmount)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('grossShort')}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(totalAmount)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Currency */}
      <div className="space-y-2">
        <Label className="dark:text-gray-300 text-sm font-medium">{t('currency')}</Label>
        <Select value={currency} onValueChange={(val) => { setCurrency(val); if (val === 'DKK') setExchangeRate(''); }}>
          <SelectTrigger className="dark:bg-white/5"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-white dark:bg-[#1a1f1e]">{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {currency !== 'DKK' && (
        <div className="space-y-2">
          <Label className="dark:text-gray-300 text-sm font-medium">{t('exchangeRate')} ({currency} → DKK)</Label>
          <Input type="number" step="0.0001" min="0" placeholder="0.0000" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} disabled={isLoading} className="dark:bg-white/5" />
        </div>
      )}

      {/* VAT */}
      <div className="space-y-2">
        <Label className="dark:text-gray-300 text-sm font-medium">{isDa ? 'Moms procent' : 'VAT Percentage'}</Label>
        <Input type="number" step="0.1" min="0" max="100" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} disabled={isLoading} className="dark:bg-white/5" />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="dark:text-gray-300 text-sm font-medium">{t('description')}</Label>
          {recentDescriptions.length > 0 && (
            <button type="button" onClick={() => setShowDescriptionSuggestions(!showDescriptionSuggestions)} className="text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:underline cursor-pointer">
              {isDa ? 'Seneste' : 'Recent'}
            </button>
          )}
        </div>
        {showDescriptionSuggestions && recentDescriptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 p-2">
            {recentDescriptions.map((desc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleUseDescription(desc.description)}
                className="text-xs px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-[#0d9488]/10 hover:border-[#0d9488]/30 hover:text-[#0d9488] dark:hover:text-[#2dd4bf] transition-colors cursor-pointer truncate max-w-[200px]"
              >
                {desc.description}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={descriptionInputRef}
          placeholder={isDa ? 'Beskrivelse af købet...' : 'Description of purchase...'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={isLoading}
          className="dark:bg-white/5 text-sm"
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white font-semibold h-11 transition-colors"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {isDa ? 'Bogfører...' : 'Recording...'}
          </span>
        ) : (
          <span>{isDa ? 'Bogfør indkøb' : 'Record Purchase'}</span>
        )}
      </Button>
    </form>
  );
}
