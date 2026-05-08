'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Landmark,
  RefreshCw,
  Plus,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  ArrowDownToLine,
  Info,
} from 'lucide-react';

// ──────────────── Types ────────────────

interface BankConnectionSync {
  id: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'PENDING';
  startedAt: string;
  completedAt: string | null;
  transactionsFound: number;
  transactionsNew: number;
  transactionsDup: number;
  matchedCount: number;
  errorMessage: string | null;
}

interface BankConnection {
  id: string;
  bankName: string;
  provider: string;
  registrationNumber: string | null;
  accountNumber: string;
  iban: string | null;
  accountName: string | null;
  currentBalance: number | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  syncFrequency: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'REVOKED' | 'ERROR';
  consentId: string | null;
  consentExpiresAt: string | null;
  retryCount: number;
  lastError: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  recentSyncs: BankConnectionSync[];
  unmatchedCount: number;
}

interface AvailableBank {
  id: string;
  name: string;
  isDemo?: boolean;
  isConfigured?: boolean;
}

interface AiMatchSummary {
  totalUnmatched: number;
  autoMatched: number;
  suggested: number;
  remaining: number;
}

interface OpenBankingSectionProps {
  user: User;
  onSyncComplete?: () => void;
}

// ──────────────── Helpers ────────────────

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  const visible = accountNumber.slice(-4);
  const masked = accountNumber.slice(0, -4).replace(/./g, '•');
  return masked + visible;
}

function formatRelativeTime(dateStr: string | null, language: string): string {
  if (!dateStr) return language === 'da' ? 'Aldrig' : 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return language === 'da' ? 'Lige nu' : 'Just now';
  if (diffMins < 60) return language === 'da' ? `${diffMins} min siden` : `${diffMins}m ago`;
  if (diffHours < 24) return language === 'da' ? `${diffHours} timer siden` : `${diffHours}h ago`;
  if (diffDays < 7) return language === 'da' ? `${diffDays} dage siden` : `${diffDays}d ago`;

  return date.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

function getStatusConfig(status: BankConnection['status'], language: string) {
  switch (status) {
    case 'ACTIVE':
      return {
        label: language === 'da' ? 'Aktiv' : 'Active',
        icon: Wifi,
        bgClass: 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20',
        dotClass: 'bg-green-500',
      };
    case 'PENDING':
      return {
        label: language === 'da' ? 'Afventer' : 'Pending',
        icon: Clock,
        bgClass: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20',
        dotClass: 'bg-amber-500',
      };
    case 'EXPIRED':
      return {
        label: language === 'da' ? 'Udløbet' : 'Expired',
        icon: AlertTriangle,
        bgClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20',
        dotClass: 'bg-red-500',
      };
    case 'REVOKED':
      return {
        label: language === 'da' ? 'Tilbagekaldt' : 'Revoked',
        icon: WifiOff,
        bgClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20',
        dotClass: 'bg-red-500',
      };
    case 'ERROR':
      return {
        label: language === 'da' ? 'Fejl' : 'Error',
        icon: XCircle,
        bgClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20',
        dotClass: 'bg-red-500',
      };
    default:
      return {
        label: status,
        icon: WifiOff,
        bgClass: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20',
        dotClass: 'bg-gray-500',
      };
  }
}

function getBankIcon(provider: string) {
  // Each bank could have a distinct icon; for now we use Landmark
  return Landmark;
}

// ──────────────── Component ────────────────

export function OpenBankingSection({ user, onSyncComplete }: OpenBankingSectionProps) {
  const { t, tc, language } = useTranslation();

  // ── State ──
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [availableBanks, setAvailableBanks] = useState<AvailableBank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Connect dialog
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectBankName, setConnectBankName] = useState('');
  const [connectProvider, setConnectProvider] = useState('');
  const [connectRegNumber, setConnectRegNumber] = useState('');
  const [connectAccountNumber, setConnectAccountNumber] = useState('');
  const [connectIban, setConnectIban] = useState('');
  const [connectAccountName, setConnectAccountName] = useState('');
  const [connectSyncFrequency, setConnectSyncFrequency] = useState('daily');
  const [isConnecting, setIsConnecting] = useState(false);
  const [companyBankInfo, setCompanyBankInfo] = useState<{
    bankName: string;
    bankRegistration: string;
    bankAccount: string;
    bankIban: string | null;
    companyName: string;
  } | null>(null);
  const [autofilledFields, setAutofilledFields] = useState<Set<string>>(new Set());

  // Sync states (per connection)
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<BankConnection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit frequency dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [connectionToEdit, setConnectionToEdit] = useState<BankConnection | null>(null);
  const [editFrequency, setEditFrequency] = useState('daily');
  const [editAccountName, setEditAccountName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Consent renew
  const [renewingConsentIds, setRenewingConsentIds] = useState<Set<string>>(new Set());

  // Consent authorization dialog
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [consentInfo, setConsentInfo] = useState<{
    connectionId: string;
    consentId: string;
    providerId: string;
    bankName: string;
    redirectUrl: string;
    sandboxMode: boolean;
  } | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // AI match
  const [isRunningAiMatch, setIsRunningAiMatch] = useState(false);
  const [aiMatchResult, setAiMatchResult] = useState<AiMatchSummary | null>(null);

  // ── Fetch connections ──

  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch('/api/bank-connections');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err) {
      console.error('Failed to fetch bank connections:', err);
    }
  }, []);

  const fetchAvailableBanks = useCallback(async () => {
    try {
      const response = await fetch('/api/bank-connections?action=banks');
      if (!response.ok) throw new Error('Failed to fetch banks');
      const data = await response.json();
      setAvailableBanks(data.banks || []);
    } catch (err) {
      console.error('Failed to fetch available banks:', err);
    }
  }, []);

  const loadAll = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    await Promise.all([fetchConnections(), fetchAvailableBanks()]);
    if (showLoading) setIsLoading(false);
  }, [fetchConnections, fetchAvailableBanks]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Computed ──

  const activeConnections = useMemo(
    () => connections.filter((c) => c.status === 'ACTIVE'),
    [connections]
  );

  const connectionsNeedingAttention = useMemo(
    () => connections.filter((c) => ['EXPIRED', 'ERROR', 'PENDING'].includes(c.status)),
    [connections]
  );

  const totalBalance = useMemo(
    () => activeConnections.reduce((sum, c) => sum + (c.currentBalance || 0), 0),
    [activeConnections]
  );

  const totalUnmatched = useMemo(
    () => connections.reduce((sum, c) => sum + c.unmatchedCount, 0),
    [connections]
  );

  // ── Connect ──

  const handleConnect = useCallback(async () => {
    if (!connectProvider || !connectAccountNumber) {
      toast.error(language === 'da' ? 'Manglende felter' : 'Missing fields', {
        description: language === 'da'
          ? 'Udfyld venligst bank og kontonummer'
          : 'Please fill in bank and account number',
      });
      return;
    }

    if (connectRegNumber && !/^\d{4}$/.test(connectRegNumber)) {
      toast.error(language === 'da' ? 'Ugyldigt registreringsnummer' : 'Invalid registration number', {
        description: language === 'da'
          ? 'Registreringsnummer skal være 4 cifre'
          : 'Registration number must be 4 digits',
      });
      return;
    }

    setIsConnecting(true);
    try {
      const response = await fetch('/api/bank-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: connectBankName || connectProvider,
          provider: connectProvider,
          registrationNumber: connectRegNumber || undefined,
          accountNumber: connectAccountNumber,
          iban: connectIban || undefined,
          accountName: connectAccountName || undefined,
          syncFrequency: connectSyncFrequency,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Connection failed');
      }

      const result = await response.json();

      // Check for consent redirect — real bank requires authorization
      if (result.consentRedirect) {
        // Close the connect dialog, open consent authorization dialog
        setConnectDialogOpen(false);
        setConsentInfo({
          connectionId: result.connection.id,
          consentId: result.connection.consentId,
          providerId: result.connection.provider,
          bankName: result.connection.bankName,
          redirectUrl: result.consentRedirect,
          sandboxMode: result.sandboxMode || false,
        });
        setConsentDialogOpen(true);
        await fetchConnections();
      } else {
        // Demo bank — connected immediately
        toast.success(language === 'da' ? 'Bankforbindelse oprettet' : 'Bank connection created', {
          description: language === 'da'
            ? `${connectBankName || connectProvider} er nu tilknyttet`
            : `${connectBankName || connectProvider} is now connected`,
        });
        setConnectDialogOpen(false);
        resetConnectForm();
        await fetchConnections();
        onSyncComplete?.();
      }
    } catch (err: any) {
      toast.error(language === 'da' ? 'Kunne ikke forbinde' : 'Failed to connect', {
        description: err.message || (language === 'da'
          ? 'Der opstod en fejl ved oprettelse af bankforbindelsen'
          : 'An error occurred while creating the bank connection'),
      });
    } finally {
      setIsConnecting(false);
    }
  }, [
    connectBankName, connectProvider, connectRegNumber, connectAccountNumber,
    connectIban, connectAccountName, connectSyncFrequency, language,
    fetchConnections, onSyncComplete,
  ]);

  const resetConnectForm = useCallback(() => {
    setConnectBankName('');
    setConnectProvider('');
    setConnectRegNumber('');
    setConnectAccountNumber('');
    setConnectIban('');
    setConnectAccountName('');
    setConnectSyncFrequency('daily');
    setAutofilledFields(new Set());
    setCompanyBankInfo(null);
  }, []);

  // ── Consent Authorization ──

  const handleConsentAuthorize = useCallback(async () => {
    if (!consentInfo) return;
    setIsAuthorizing(true);
    try {
      if (consentInfo.sandboxMode) {
        // Sandbox: authorize directly via API
        const response = await fetch('/api/bank-connections/consent-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consentId: consentInfo.consentId,
            providerId: consentInfo.providerId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Authorization failed');
        }

        toast.success(language === 'da' ? 'Bankgodkendelse fuldført' : 'Bank authorization completed', {
          description: language === 'da'
            ? `${consentInfo.bankName} er nu godkendt og aktiv`
            : `${consentInfo.bankName} is now authorized and active`,
        });
      } else {
        // Production: open the bank's authorization page in a new window
        window.open(consentInfo.redirectUrl, 'bank-authorization', 'width=600,height=700');

        // Listen for the callback message from the popup
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'bank-consent-complete') {
            window.removeEventListener('message', handleMessage);
            toast.success(language === 'da' ? 'Bankgodkendelse fuldført' : 'Bank authorization completed', {
              description: language === 'da'
                ? `${consentInfo.bankName} er nu godkendt`
                : `${consentInfo.bankName} is now authorized`,
            });
            setConsentDialogOpen(false);
            setConsentInfo(null);
            fetchConnections();
            onSyncComplete?.();
          }
        };
        window.addEventListener('message', handleMessage);

        // Also poll for status change as a fallback
        toast(language === 'da' ? 'Venter på bankgodkendelse' : 'Waiting for bank authorization', {
          description: language === 'da'
            ? 'Godkend din bank i det nye vindue'
            : 'Authorize your bank in the new window',
        });
      }

      setConsentDialogOpen(false);
      setConsentInfo(null);
      resetConnectForm();
      await fetchConnections();
      onSyncComplete?.();
    } catch (err: any) {
      toast.error(language === 'da' ? 'Godkendelse fejlede' : 'Authorization failed', {
        description: err.message || (language === 'da'
          ? 'Kunne ikke godkende bankforbindelsen'
          : 'Could not authorize the bank connection'),
      });
    } finally {
      setIsAuthorizing(false);
    }
  }, [consentInfo, language, fetchConnections, onSyncComplete, resetConnectForm]);

  // ── Sync ──

  const handleSync = useCallback(async (connectionId: string) => {
    setSyncingIds((prev) => new Set(prev).add(connectionId));
    try {
      const response = await fetch(`/api/bank-connections/${connectionId}/sync`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Sync failed');
      }

      const result = await response.json();

      toast.success(language === 'da' ? 'Synkronisering fuldført' : 'Sync completed', {
        description: language === 'da'
          ? `${result.sync?.transactionsNew || 0} nye posteringer fundet`
          : `${result.sync?.transactionsNew || 0} new transactions found`,
      });

      await fetchConnections();
      onSyncComplete?.();
    } catch (err: any) {
      toast.error(language === 'da' ? 'Synkronisering fejlede' : 'Sync failed', {
        description: err.message || (language === 'da'
          ? 'Kunne ikke synkronisere bankforbindelsen'
          : 'Could not sync the bank connection'),
      });
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  }, [language, fetchConnections, onSyncComplete]);

  // ── Delete ──

  const handleDelete = useCallback(async () => {
    if (!connectionToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/bank-connections/${connectionToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Delete failed');

      toast.success(language === 'da' ? 'Bankforbindelse slettet' : 'Bank connection removed', {
        description: language === 'da'
          ? `${connectionToDelete.bankName} er nu fjernet`
          : `${connectionToDelete.bankName} has been removed`,
      });

      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
      await fetchConnections();
      onSyncComplete?.();
    } catch (err) {
      toast.error(language === 'da' ? 'Kunne ikke slette' : 'Failed to remove', {
        description: language === 'da'
          ? 'Der opstod en fejl ved sletning af bankforbindelsen'
          : 'An error occurred while removing the bank connection',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [connectionToDelete, language, fetchConnections, onSyncComplete]);

  // ── Edit ──

  const handleEdit = useCallback(async () => {
    if (!connectionToEdit) return;

    setIsEditing(true);
    try {
      const response = await fetch(`/api/bank-connections/${connectionToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncFrequency: editFrequency,
          accountName: editAccountName || undefined,
        }),
      });

      if (!response.ok) throw new Error('Update failed');

      toast.success(language === 'da' ? 'Indstillinger opdateret' : 'Settings updated', {
        description: language === 'da'
          ? 'Bankforbindelsen er blevet opdateret'
          : 'Bank connection has been updated',
      });

      setEditDialogOpen(false);
      setConnectionToEdit(null);
      await fetchConnections();
    } catch (err) {
      toast.error(language === 'da' ? 'Kunne ikke opdatere' : 'Failed to update', {
        description: language === 'da'
          ? 'Der opstod en fejl ved opdatering af bankforbindelsen'
          : 'An error occurred while updating the bank connection',
      });
    } finally {
      setIsEditing(false);
    }
  }, [connectionToEdit, editFrequency, editAccountName, language, fetchConnections]);

  // ── Renew consent ──

  const handleRenewConsent = useCallback(async (connection: BankConnection) => {
    setRenewingConsentIds((prev) => new Set(prev).add(connection.id));
    try {
      const response = await fetch(`/api/bank-connections/${connection.id}/consent`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Consent renewal failed');
      }

      const result = await response.json();

      if (result.redirectUrl) {
        toast(language === 'da' ? 'Bankgodkendelse kræves' : 'Bank authorization required', {
          description: language === 'da'
            ? 'Du bliver viderestillet til din bank for at forny godkendelsen'
            : 'You will be redirected to your bank to renew authorization',
        });
      } else {
        toast.success(language === 'da' ? 'Godkendelse fornyet' : 'Consent renewed', {
          description: language === 'da'
            ? `${connection.bankName} godkendelse er fornyet`
            : `${connection.bankName} consent has been renewed`,
        });
      }

      await fetchConnections();
    } catch (err: any) {
      toast.error(language === 'da' ? 'Kunne ikke forny godkendelse' : 'Failed to renew consent', {
        description: err.message || (language === 'da'
          ? 'Der opstod en fejl ved fornyelse af bankgodkendelsen'
          : 'An error occurred while renewing bank consent'),
      });
    } finally {
      setRenewingConsentIds((prev) => {
        const next = new Set(prev);
        next.delete(connection.id);
        return next;
      });
    }
  }, [language, fetchConnections]);

  // ── AI Match ──

  const handleAiMatch = useCallback(async () => {
    setIsRunningAiMatch(true);
    setAiMatchResult(null);
    try {
      const response = await fetch('/api/bank-reconciliation?action=ai-match');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'AI match failed');
      }

      const data = await response.json();
      const summary: AiMatchSummary = data.summary || {
        totalUnmatched: 0,
        autoMatched: 0,
        suggested: 0,
        remaining: 0,
      };

      setAiMatchResult(summary);

      const hasMatches = summary.autoMatched > 0 || summary.suggested > 0;

      toast.success(language === 'da' ? 'AI-match fuldført' : 'AI match completed', {
        description: hasMatches
          ? language === 'da'
            ? `${summary.autoMatched} auto-matchet, ${summary.suggested} forslag til gennemgang`
            : `${summary.autoMatched} auto-matched, ${summary.suggested} suggestions to review`
          : language === 'da'
            ? 'Ingen nye match fundet'
            : 'No new matches found',
      });

      await fetchConnections();
      onSyncComplete?.();
    } catch (err: any) {
      toast.error(language === 'da' ? 'AI-match fejlede' : 'AI match failed', {
        description: err.message || (language === 'da'
          ? 'Kunne ikke køre AI-match'
          : 'Could not run AI matching'),
      });
    } finally {
      setIsRunningAiMatch(false);
    }
  }, [language, fetchConnections, onSyncComplete]);

  // ── Bank selection helper ──

  /**
   * Map a bank name (from CompanyInfo) to a provider ID.
   * Tries exact match first, then case-insensitive substring match.
   */
  const detectProviderFromBankName = useCallback((bankName: string): string | null => {
    if (!bankName) return null;
    const normalized = bankName.toLowerCase().trim();

    // Direct provider ID matches
    for (const bank of availableBanks) {
      if (bank.id.toLowerCase() === normalized) return bank.id;
      if (bank.name.toLowerCase() === normalized) return bank.id;
    }

    // Substring / fuzzy matching for common Danish bank names
    const bankNameMap: Record<string, string> = {
      'nordea': 'nordea',
      'danske bank': 'danske_bank',
      'danske': 'danske_bank',
      'jyske bank': 'jyske_bank',
      'jyske': 'jyske_bank',
      'tink': 'tink',
      'demo': 'demo',
      'sydbank': 'demo',
      'spar nord': 'demo',
      'arbejdernes landsbank': 'demo',
      'nykredit': 'demo',
      'ringkøbing landbobank': 'demo',
      'savings bank': 'demo',
      'sparekasse': 'demo',
    };

    for (const [key, providerId] of Object.entries(bankNameMap)) {
      if (normalized.includes(key)) return providerId;
    }

    // Default to demo if we have a bank name but can't match
    return 'demo';
  }, [availableBanks]);

  const handleBankSelect = useCallback((providerId: string) => {
    setConnectProvider(providerId);
    const bank = availableBanks.find((b) => b.id === providerId);
    if (bank) {
      setConnectBankName(bank.name);
    }
  }, [availableBanks]);

  // ── Fetch company info and auto-fill connect form ──

  const [isFetchingCompanyInfo, setIsFetchingCompanyInfo] = useState(false);

  const fetchCompanyInfoAndAutoFill = useCallback(async () => {
    setIsFetchingCompanyInfo(true);
    try {
      const response = await fetch('/api/company');
      if (!response.ok) {
        console.error('Company API returned status:', response.status);
        setCompanyBankInfo(null);
        return;
      }
      const data = await response.json();
      const ci = data.companyInfo;
      if (!ci) {
        setCompanyBankInfo(null);
        return;
      }

      const info = {
        bankName: ci.bankName || '',
        bankRegistration: ci.bankRegistration || '',
        bankAccount: ci.bankAccount || '',
        bankIban: ci.bankIban || null,
        companyName: ci.companyName || '',
      };
      setCompanyBankInfo(info);

      // Check if there are any bank details to auto-fill
      const hasBankDetails = info.bankName || info.bankRegistration || info.bankAccount;
      if (!hasBankDetails) return; // No bank info to pre-fill

      // Auto-fill fields from company info
      const filled = new Set<string>();

      // Auto-detect provider from bank name
      if (info.bankName) {
        const providerId = detectProviderFromBankName(info.bankName);
        if (providerId) {
          setConnectProvider(providerId);
          const bank = availableBanks.find((b) => b.id === providerId);
          setConnectBankName(bank?.name || info.bankName);
          filled.add('provider');
        } else {
          setConnectBankName(info.bankName);
          filled.add('bankName');
        }
      }

      if (info.bankRegistration) {
        // Extract just the 4-digit reg number (bankAccount may contain "1234 1234567890")
        const regOnly = info.bankRegistration.replace(/\D/g, '').slice(0, 4);
        setConnectRegNumber(regOnly);
        if (regOnly) filled.add('regNumber');
      }

      if (info.bankAccount) {
        // bankAccount may contain "1234 1234567890" or just the account number
        // Try to extract account number after the registration number
        let accountNum = info.bankAccount.replace(/\s/g, '');
        // If it looks like "12341234567890" (reg + account concatenated), extract just account part
        if (accountNum.length > 4 && /^\d{4}\d+$/.test(accountNum)) {
          // If reg number matches the first 4 digits, take the rest as account number
          const regFromAccount = accountNum.slice(0, 4);
          if (info.bankRegistration && regFromAccount === info.bankRegistration.replace(/\D/g, '')) {
            accountNum = accountNum.slice(4);
          }
        }
        setConnectAccountNumber(accountNum);
        if (accountNum) filled.add('accountNumber');
      }

      if (info.bankIban) {
        setConnectIban(info.bankIban || '');
        filled.add('iban');
      }

      if (info.companyName) {
        setConnectAccountName(info.companyName);
        filled.add('accountName');
      }

      setAutofilledFields(filled);
    } catch (err) {
      console.error('Failed to fetch company info for auto-fill:', err);
      setCompanyBankInfo(null);
    } finally {
      setIsFetchingCompanyInfo(false);
    }
  }, [availableBanks, detectProviderFromBankName]);

  // ── Auto-fill when dialog opens ──
  // NOTE: Radix UI Dialog's onOpenChange is NOT called when open prop
  // changes programmatically. So we use a useEffect to trigger auto-fill.
  useEffect(() => {
    if (connectDialogOpen) {
      resetConnectForm();
      fetchCompanyInfoAndAutoFill();
    } else {
      resetConnectForm();
    }
  }, [connectDialogOpen]);

  // ──────────────── Loading skeleton ────────────────

  if (isLoading) {
    return (
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-8 rounded-full ml-2" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // ──────────────── Main render ────────────────

  return (
    <>
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5 overflow-hidden">
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 rounded-t-lg transition-colors">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#0d9488] to-[#5eead4] flex items-center justify-center">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
                        {language === 'da' ? 'Åben Bank' : 'Open Banking'}
                      </CardTitle>
                      {connections.length > 0 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          {connections.length}{' '}
                          {language === 'da'
                            ? connections.length === 1 ? 'forbindelse' : 'forbindelser'
                            : connections.length === 1 ? 'connection' : 'connections'}
                        </Badge>
                      )}
                      {connectionsNeedingAttention.length > 0 && (
                        <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20 text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {connectionsNeedingAttention.length}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {language === 'da'
                        ? 'Automatisk synkronisering med din bank'
                        : 'Automatic synchronization with your bank'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              {/* ── Quick stats row ── */}
              {connections.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border border-[#0d9488]/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Aktive' : 'Active'}
                      </p>
                      <p className="text-lg font-bold text-[#0d9488] dark:text-[#2dd4bf]">
                        {activeConnections.length}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Samlet saldo' : 'Total balance'}
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {tc(totalBalance)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Uafstemte' : 'Unmatched'}
                      </p>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">
                        {totalUnmatched}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Seneste sync' : 'Last sync'}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {activeConnections.length > 0
                          ? formatRelativeTime(
                              activeConnections.reduce((latest, c) =>
                                c.lastSyncAt && (!latest || c.lastSyncAt > latest)
                                  ? c.lastSyncAt
                                  : latest
                              , null as string | null),
                              language
                            )
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {/* ── Connection cards ── */}
              {connections.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-[#0d9488]/10 mb-3">
                    <Landmark className="h-7 w-7 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    {language === 'da'
                      ? 'Ingen bankforbindelser'
                      : 'No bank connections'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-4">
                    {language === 'da'
                      ? 'Tilknyt din bankkonto for automatisk import af posteringer og smart afstemning.'
                      : 'Connect your bank account for automatic transaction import and smart reconciliation.'}
                  </p>
                  <Button
                    onClick={() => setConnectDialogOpen(true)}
                    className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    {language === 'da' ? 'Tilknyt bankkonto' : 'Connect bank account'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                  {connections.map((connection) => {
                    const statusConfig = getStatusConfig(connection.status, language);
                    const StatusIcon = statusConfig.icon;
                    const BankIcon = getBankIcon(connection.provider);
                    const isSyncing = syncingIds.has(connection.id);
                    const isRenewing = renewingConsentIds.has(connection.id);
                    const isRevokedOrExpired = connection.status === 'REVOKED' || connection.status === 'EXPIRED';

                    return (
                      <div
                        key={connection.id}
                        className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl border transition-colors ${
                          isRevokedOrExpired
                            ? 'bg-red-50/50 dark:bg-red-500/5 border-red-200/50 dark:border-red-500/10'
                            : connection.status === 'PENDING'
                              ? 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200/50 dark:border-amber-500/10'
                              : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/10 hover:border-[#0d9488]/30'
                        }`}
                      >
                        {/* Bank icon */}
                        <div className={`h-10 w-10 sm:h-11 sm:w-11 rounded-full flex items-center justify-center shrink-0 ${
                          connection.status === 'ACTIVE'
                            ? 'bg-[#0d9488]/10'
                            : 'bg-gray-100 dark:bg-white/10'
                        }`}>
                          <BankIcon className={`h-5 w-5 ${
                            connection.status === 'ACTIVE'
                              ? 'text-[#0d9488] dark:text-[#2dd4bf]'
                              : 'text-gray-400 dark:text-gray-500'
                          }`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {connection.accountName || connection.bankName}
                            </span>
                            <Badge className={`text-[10px] gap-1 ${statusConfig.bgClass}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`} />
                              {statusConfig.label}
                            </Badge>
                            {connection.isDemo && (
                              <Badge variant="outline" className="text-[10px] border-[#0d9488]/30 text-[#0d9488]">
                                Demo
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-mono">
                              {connection.registrationNumber
                                ? `${connection.registrationNumber} • `
                                : ''}
                              {maskAccountNumber(connection.accountNumber)}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(connection.lastSyncAt, language)}
                            </span>
                          </div>
                          {connection.lastError && (
                            <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5 truncate">
                              {connection.lastError}
                            </p>
                          )}
                        </div>

                        {/* Balance & Actions */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          {connection.currentBalance !== null && (
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {language === 'da' ? 'Saldo' : 'Balance'}
                              </p>
                              <p className={`text-sm font-semibold font-mono ${
                                connection.currentBalance >= 0
                                  ? 'text-gray-900 dark:text-white'
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {tc(connection.currentBalance)}
                              </p>
                            </div>
                          )}

                          {/* Sync button / Authorize button */}
                          {connection.status === 'PENDING' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 gap-1"
                              onClick={() => {
                                setConsentInfo({
                                  connectionId: connection.id,
                                  consentId: connection.consentId || '',
                                  providerId: connection.provider,
                                  bankName: connection.bankName,
                                  redirectUrl: `/api/bank-connections/consent-callback?consent_id=${connection.consentId}&provider=${connection.provider}&connection_id=${connection.id}`,
                                  sandboxMode: !connection.isDemo,
                                });
                                setConsentDialogOpen(true);
                              }}
                              title={language === 'da' ? 'Godkend bankforbindelse' : 'Authorize bank connection'}
                            >
                              <Shield className="h-4 w-4" />
                              <span className="text-xs hidden sm:inline">
                                {language === 'da' ? 'Godkend' : 'Authorize'}
                              </span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-[#0d9488] hover:text-[#0f766e] hover:bg-[#0d9488]/10"
                              onClick={() => handleSync(connection.id)}
                              disabled={isSyncing || connection.status === 'REVOKED'}
                              title={language === 'da' ? 'Synkroniser nu' : 'Sync now'}
                            >
                              {isSyncing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          )}

                          {/* Settings dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  setConnectionToEdit(connection);
                                  setEditFrequency(connection.syncFrequency);
                                  setEditAccountName(connection.accountName || '');
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Clock className="h-4 w-4 mr-2" />
                                {language === 'da' ? 'Skift synk-frekvens' : 'Change sync frequency'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRenewConsent(connection)}
                                disabled={isRenewing}
                              >
                                {isRenewing ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Shield className="h-4 w-4 mr-2" />
                                )}
                                {language === 'da' ? 'Forny godkendelse' : 'Renew consent'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setConnectionToDelete(connection);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {language === 'da' ? 'Slet forbindelse' : 'Remove connection'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Action bar ── */}
              {connections.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        onClick={() => setConnectDialogOpen(true)}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-[#0d9488]/30 text-[#0d9488] hover:bg-[#0d9488]/10 hover:text-[#0f766e]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {language === 'da' ? 'Tilknyt bankkonto' : 'Connect bank'}
                      </Button>
                      <Button
                        onClick={handleAiMatch}
                        size="sm"
                        className="gap-1.5 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
                        disabled={isRunningAiMatch || totalUnmatched === 0}
                      >
                        {isRunningAiMatch ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {language === 'da' ? 'Kør AI-match' : 'Run AI match'}
                      </Button>
                    </div>

                    {/* AI match result notification */}
                    {aiMatchResult && (
                      <div className="flex items-center gap-2 text-xs sm:text-sm">
                        {aiMatchResult.autoMatched > 0 && (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {aiMatchResult.autoMatched} {language === 'da' ? 'auto-matchet' : 'auto-matched'}
                          </span>
                        )}
                        {aiMatchResult.suggested > 0 && (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Sparkles className="h-3.5 w-3.5" />
                            {aiMatchResult.suggested} {language === 'da' ? 'forslag' : 'suggestions'}
                          </span>
                        )}
                        {aiMatchResult.remaining > 0 && (
                          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                            {aiMatchResult.remaining} {language === 'da' ? 'tilbage' : 'remaining'}
                          </span>
                        )}
                        {aiMatchResult.autoMatched === 0 && aiMatchResult.suggested === 0 && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {language === 'da' ? 'Ingen match fundet' : 'No matches found'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ── Connect Dialog ── */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[#0d9488]/10 flex items-center justify-center">
                <Landmark className="h-4 w-4 text-[#0d9488]" />
              </div>
              {language === 'da' ? 'Tilknyt bankkonto' : 'Connect bank account'}
            </DialogTitle>
            <DialogDescription>
              {language === 'da'
                ? 'Forbind din bankkonto for automatisk import af posteringer.'
                : 'Connect your bank account for automatic transaction import.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Auto-fill notice */}
            {autofilledFields.size > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0d9488]/5 border border-[#0d9488]/10">
                <ArrowDownToLine className="h-4 w-4 text-[#0d9488] mt-0.5 shrink-0" />
                <div className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                    {language === 'da' ? 'Auto-udfyldt fra virksomhedsoplysninger' : 'Auto-filled from company info'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Felter er forudfyldt med dine bankoplysninger. Du kan tilpasse dem efter behov.'
                    : 'Fields are pre-filled with your bank details. You can adjust them as needed.'}
                </div>
              </div>
            )}

            {/* Loading company info */}
            {isFetchingCompanyInfo && connectDialogOpen && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                <Loader2 className="h-4 w-4 text-[#0d9488] animate-spin shrink-0" />
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Indlæser virksomhedsoplysninger...' : 'Loading company info...'}
                </span>
              </div>
            )}

            {/* No company info notice — only show after fetch completes */}
            {!isFetchingCompanyInfo && !companyBankInfo && connectDialogOpen && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="font-medium">
                    {language === 'da' ? 'Ingen virksomhedsoplysninger fundet' : 'No company info found'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Udfyld dine virksomhedsoplysninger først, så udfylder vi automatisk bankfelterne for dig.'
                    : 'Fill in your company info first, and we\'ll auto-fill the bank fields for you.'}
                </div>
              </div>
            )}

            {/* Company info exists but no bank details */}
            {companyBankInfo && !companyBankInfo.bankName && !companyBankInfo.bankRegistration && !companyBankInfo.bankAccount && connectDialogOpen && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="font-medium">
                    {language === 'da' ? 'Manglende bankoplysninger' : 'Missing bank details'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Tilføj dine bankoplysninger under Virksomhedsoplysninger, så udfylder vi automatisk felterne her.'
                    : 'Add your bank details under Company Settings, and we\'ll auto-fill the fields here.'}
                </div>
              </div>
            )}

            {/* Bank selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Bank' : 'Bank'} <span className="text-red-500">*</span>
                {autofilledFields.has('provider') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    {language === 'da' ? '(auto-detected)' : '(auto-detected)'}
                  </span>
                )}
              </Label>
              <Select value={connectProvider} onValueChange={handleBankSelect}>
                <SelectTrigger className="bg-gray-50 dark:bg-white/5">
                  <SelectValue placeholder={language === 'da' ? 'Vælg bank...' : 'Select bank...'} />
                </SelectTrigger>
                <SelectContent>
                  {availableBanks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      <div className="flex items-center gap-2">
                        <span>{bank.name}</span>
                        {'isDemo' in bank && bank.isDemo && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#0d9488]/30 text-[#0d9488]">
                            {language === 'da' ? 'Test' : 'Test'}
                          </Badge>
                        )}
                        {'isConfigured' in bank && !bank.isConfigured && !bank.isDemo && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-400/30 text-amber-600">
                            Sandbox
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Registration number */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Registreringsnummer' : 'Registration number'}{' '}
                <span className="text-red-500">*</span>
                {autofilledFields.has('regNumber') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectRegNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setConnectRegNumber(val);
                }}
                placeholder="1234"
                maxLength={4}
                className={`font-mono ${autofilledFields.has('regNumber') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}`}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {language === 'da' ? '4 cifre' : '4 digits'}
              </p>
            </div>

            {/* Account number */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Kontonummer' : 'Account number'}{' '}
                <span className="text-red-500">*</span>
                {autofilledFields.has('accountNumber') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectAccountNumber}
                onChange={(e) => setConnectAccountNumber(e.target.value)}
                placeholder={language === 'da' ? 'Indtast kontonummer' : 'Enter account number'}
                className={`font-mono ${autofilledFields.has('accountNumber') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}`}
              />
            </div>

            {/* IBAN (optional) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                IBAN{' '}
                <span className="text-gray-400 font-normal">
                  ({language === 'da' ? 'valgfri' : 'optional'})
                </span>
                {autofilledFields.has('iban') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectIban}
                onChange={(e) => setConnectIban(e.target.value.toUpperCase())}
                placeholder="DK00 0000 0000 0000 00"
                className={`font-mono ${autofilledFields.has('iban') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}`}
              />
            </div>

            {/* Account name (optional) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Kontonavn' : 'Account name'}{' '}
                <span className="text-gray-400 font-normal">
                  ({language === 'da' ? 'valgfri' : 'optional'})
                </span>
                {autofilledFields.has('accountName') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectAccountName}
                onChange={(e) => setConnectAccountName(e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Virksomhedskonto' : 'e.g. Business account'}
                className={autofilledFields.has('accountName') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}
              />
            </div>

            {/* Sync frequency */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Synkroniseringsfrekvens' : 'Sync frequency'}
              </Label>
              <Select value={connectSyncFrequency} onValueChange={setConnectSyncFrequency}>
                <SelectTrigger className="bg-gray-50 dark:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">
                    {language === 'da' ? 'Hver time' : 'Hourly'}
                  </SelectItem>
                  <SelectItem value="daily">
                    {language === 'da' ? 'Dagligt' : 'Daily'}
                  </SelectItem>
                  <SelectItem value="manual">
                    {language === 'da' ? 'Kun manuelt' : 'Manual only'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Security notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0d9488]/5 border border-[#0d9488]/10">
              <Shield className="h-4 w-4 text-[#0d9488] mt-0.5 shrink-0" />
              <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'da'
                  ? 'Dine bankoplysninger er krypteret og sikret i henhold til PSD2/Open Banking-reglerne. Vi gemmer aldrig dine loginoplysninger.'
                  : 'Your banking credentials are encrypted and secured in accordance with PSD2/Open Banking regulations. We never store your login credentials.'}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setConnectDialogOpen(false);
                resetConnectForm();
              }}
              disabled={isConnecting}
            >
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleConnect}
              disabled={isConnecting || !connectProvider || !connectAccountNumber}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {isConnecting
                ? (language === 'da' ? 'Forbinder...' : 'Connecting...')
                : (language === 'da' ? 'Tilknyt' : 'Connect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Settings Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-[#0d9488]" />
              {language === 'da' ? 'Indstillinger' : 'Settings'}
            </DialogTitle>
            <DialogDescription>
              {connectionToEdit?.bankName} — {connectionToEdit ? maskAccountNumber(connectionToEdit.accountNumber) : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Kontonavn' : 'Account name'}
              </Label>
              <Input
                value={editAccountName}
                onChange={(e) => setEditAccountName(e.target.value)}
                placeholder={language === 'da' ? 'Angiv kontonavn' : 'Enter account name'}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Synkroniseringsfrekvens' : 'Sync frequency'}
              </Label>
              <Select value={editFrequency} onValueChange={setEditFrequency}>
                <SelectTrigger className="bg-gray-50 dark:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">
                    {language === 'da' ? 'Hver time' : 'Hourly'}
                  </SelectItem>
                  <SelectItem value="daily">
                    {language === 'da' ? 'Dagligt' : 'Daily'}
                  </SelectItem>
                  <SelectItem value="manual">
                    {language === 'da' ? 'Kun manuelt' : 'Manual only'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isEditing}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isEditing}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isEditing && <Loader2 className="h-4 w-4 animate-spin" />}
              {language === 'da' ? 'Gem' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-red-500" />
              </div>
              {language === 'da' ? 'Slet bankforbindelse' : 'Remove bank connection'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {connectionToDelete && (
                <>
                  {language === 'da'
                    ? `Er du sikker på, at du vil fjerne forbindelsen til ${connectionToDelete.bankName} (${maskAccountNumber(connectionToDelete.accountNumber)})? Godkendelsen vil blive tilbagekaldt og automatisk synkronisering stoppes.`
                    : `Are you sure you want to remove the connection to ${connectionToDelete.bankName} (${maskAccountNumber(connectionToDelete.accountNumber)})? Consent will be revoked and automatic synchronization will stop.`}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {language === 'da' ? 'Slet forbindelse' : 'Remove connection'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Consent Authorization Dialog ── */}
      <Dialog open={consentDialogOpen} onOpenChange={setConsentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-amber-500" />
              </div>
              {language === 'da' ? 'Bankgodkendelse påkrævet' : 'Bank Authorization Required'}
            </DialogTitle>
            <DialogDescription>
              {language === 'da'
                ? 'Din bank kræver godkendelse før forbindelsen kan aktiveres.'
                : 'Your bank requires authorization before the connection can be activated.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Bank info */}
            {consentInfo && (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#0d9488] to-[#5eead4] flex items-center justify-center">
                    <Landmark className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {consentInfo.bankName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Afventer godkendelse' : 'Pending authorization'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sandbox mode notice */}
            {consentInfo?.sandboxMode && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="font-medium">
                    {language === 'da' ? 'Sandbox-tilstand' : 'Sandbox Mode'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Denne bank har ikke konfigureret API-nøgler. Godkendelse simuleres til testformål. I produktion vil du blive omdirigeret til bankens sikre godkendelsesside.'
                    : 'This bank does not have API keys configured. Authorization is simulated for testing. In production, you would be redirected to the bank\'s secure authorization page.'}
                </div>
              </div>
            )}

            {/* Explanation */}
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#0d9488]" />
              <p className="leading-relaxed">
                {language === 'da'
                  ? 'For at oprette forbindelse til din bank, skal du godkende adgang via bankens sikre godkendelsesside (SCA — Strong Customer Authentication). Dette er et krav fra PSD2/EU-lovgivningen for at beskytte dine data.'
                  : 'To connect to your bank, you must authorize access through the bank\'s secure authorization page (SCA — Strong Customer Authentication). This is required by PSD2/EU legislation to protect your data.'}
              </p>
            </div>

            {/* Consent ID for reference */}
            {consentInfo && (
              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                Consent ID: {consentInfo.consentId}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setConsentDialogOpen(false);
                setConsentInfo(null);
              }}
              disabled={isAuthorizing}
            >
              {language === 'da' ? 'Senere' : 'Later'}
            </Button>
            <Button
              onClick={handleConsentAuthorize}
              disabled={isAuthorizing}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isAuthorizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {language === 'da' ? 'Godkender...' : 'Authorizing...'}
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  {consentInfo?.sandboxMode
                    ? (language === 'da' ? 'Godkend (Sandbox)' : 'Authorize (Sandbox)')
                    : (language === 'da' ? 'Godkend hos bank' : 'Authorize at Bank')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type { OpenBankingSectionProps, BankConnection, BankConnectionSync, AiMatchSummary };
