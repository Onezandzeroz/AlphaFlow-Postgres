'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuthStore, User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { VerifyEmailScreen } from '@/components/auth/verify-email-screen';
import { useHydrated } from '@/lib/use-hydrated';
import { AppLayout } from '@/components/layout/app-layout';
import { PwaInstallBanner, PostInstallCameraPrompt } from '@/components/pwa/pwa-register';
import { MobileInstallPrompt } from '@/components/pwa/mobile-install-prompt';
import { Dashboard } from '@/components/dashboard/dashboard';
import { TransactionsPage } from '@/components/transactions/transactions-page';
import { VATReport } from '@/components/vat-report/vat-report';
import { ExportsPage } from '@/components/exports/exports-page';
import { InvoicesPage } from '@/components/invoices/invoices-page';
import { BackupPage } from '@/components/backup/backup-page';
import { AuditLogPage } from '@/components/audit-log/audit-log-page';
import { ChartOfAccountsPage } from '@/components/chart-of-accounts/chart-of-accounts-page';
import { JournalEntriesPage } from '@/components/journal/journal-entries-page';
import { ContactsPage } from '@/components/contacts/contacts-page';
import { FiscalPeriodsPage } from '@/components/fiscal-periods/fiscal-periods-page';
import { LedgerPage } from '@/components/ledger/ledger-page';
import { ReportsPage } from '@/components/reports/reports-page';
import { BankReconciliationPage } from '@/components/bank-reconciliation/bank-reconciliation-page';
import { YearEndClosingPage } from '@/components/year-end-closing/year-end-closing-page';
import { AgingReportsPage } from '@/components/aging-reports/aging-reports-page';
import { CashFlowPage } from '@/components/cash-flow/cash-flow-page';
import { RecurringEntriesPage } from '@/components/recurring-entries/recurring-entries-page';
import { PosteringerPage } from '@/components/transactions/posteringer-page';
import { BudgetPage } from '@/components/budget/budget-page';
import { CompanySettingsPage } from '@/components/settings/company-settings-page';
import { SettingsPage } from '@/components/settings/settings-page';
import { Loader2 } from 'lucide-react';
import { useScannerStore } from '@/lib/scanner-store';
import { useSwipeNavigation } from '@/lib/use-swipe-navigation';
import { SwipeViewContainer } from '@/components/swipe-view-container';
import { ReceiptScanner } from '@/components/scanner/ReceiptScanner';

type View = 'dashboard' | 'transactions' | 'vat-report' | 'exports' | 'invoices' | 'backups' | 'audit-log' | 'accounts' | 'journal' | 'contacts' | 'periods' | 'ledger' | 'reports' | 'bank-recon' | 'year-end' | 'aging' | 'cash-flow' | 'recurring' | 'budget' | 'settings' | 'settings-company';

const VALID_VIEWS: View[] = ['dashboard', 'transactions', 'vat-report', 'exports', 'invoices', 'backups', 'audit-log', 'accounts', 'journal', 'contacts', 'periods', 'ledger', 'reports', 'bank-recon', 'year-end', 'aging', 'cash-flow', 'recurring', 'budget', 'settings', 'settings-company'];

// Get initial view from URL hash
function getInitialView(): View {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '') as View;
  return hash && VALID_VIEWS.includes(hash) ? hash : 'dashboard';
}

export default function Home() {
  const { user, setUser, isLoading, checkAuth } = useAuthStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingStepJustDone, setOnboardingStepJustDone] = useState(0);
  const [pendingCreateAction, setPendingCreateAction] = useState<'create-invoice' | 'create-contact' | null>(null);
  const hydrated = useHydrated();
  const hasCheckedAuth = useRef(false);
  const { t, language } = useTranslation();

  // Detect ?verify=TOKEN from URL (one-time, client-only)
  const [verifyToken, setVerifyToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('verify');
    if (t) window.history.replaceState({}, '', window.location.pathname);
    return t;
  });

  // Detect ?invite=TOKEN from URL (one-time, client-only)
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('invite');
    if (t) window.history.replaceState({}, '', window.location.pathname);
    return t;
  });

  // Check auth status once after hydration
  useEffect(() => {
    if (!hydrated || hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;
    // Skip auth check when showing verify screen — but clear loading flag
    if (verifyToken) {
      useAuthStore.getState().setLoading(false);
      return;
    }
    checkAuth();
  }, [hydrated, checkAuth, verifyToken]);

  // Handle ?invite=TOKEN for already-logged-in users:
  // The login route auto-accepts, but if the user is already logged in
  // (e.g. clicked invite link while having a session), accept server-side.
  useEffect(() => {
    if (!inviteToken || !user) return;
    const abort = new AbortController();
    (async () => {
      try {
        await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
          signal: abort.signal,
        });
      } catch { /* ignore */ }
      setInviteToken(null);
    })();
    return () => abort.abort();
  }, [inviteToken, user]);

  // ─── Browser back/forward button support via History API ───
  const isNavigatingRef = useRef(false);

  const navigateToView = useCallback((view: View) => {
    isNavigatingRef.current = true;
    setCurrentView(view);
    // Replace current history entry so back button returns to previous page
    window.history.pushState({ view }, '', `#${view}`);
    // Reset flag after microtask so popstate doesn't re-trigger
    requestAnimationFrame(() => {
      isNavigatingRef.current = false;
    });
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isNavigatingRef.current) return;
      const view = (e.state?.view as View) || 'dashboard';
      setCurrentView(view);
    };

    window.addEventListener('popstate', handlePopState);

    // Set initial history state so back button works from first navigation
    window.history.replaceState({ view: currentView }, '', `#${currentView}`);

    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentView]);

  // ─── Mobile swipe navigation (must be before any early returns) ──
  const { state: swipeState, containerWidth, onSettleComplete, containerRef, handlers: swipeHandlers } =
    useSwipeNavigation({
      currentView,
      onViewChange: navigateToView,
      enabled: true,
    });

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
  }, [setUser]);

  const handleRegisterSuccess = useCallback((registeredUser: User) => {
    setUser(registeredUser);
  }, [setUser]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    navigateToView('dashboard');
  }, [setUser, navigateToView]);

  const handleDeleteAccount = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (response.ok) {
        setUser(null);
        navigateToView('dashboard');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  }, [setUser, navigateToView]);

  /**
   * FAB "Scan bilag" — opens the standalone scanner.
   * The scanner is rendered via createPortal to document.body (z-9999)
   * so it covers everything, independent of any Dialog or view.
   * When the user captures a receipt, completeScan() stores the result
   * in the zustand store. PosteringerPage subscribes and opens the form.
   */
  const scannerOpen = useScannerStore((s) => s.isOpen);

  const handleOpenScanner = useCallback(() => {
    useScannerStore.getState().openScanner();
  }, []);

  const handleStandaloneCapture = useCallback((file: File) => {
    useScannerStore.getState().completeScan(file);
    // Navigate to transactions so PosteringerPage can pick up the scan.
    // If already on transactions, this is a harmless no-op.
    navigateToView('transactions');
  }, [navigateToView]);

  const handleStandaloneDismiss = useCallback(() => {
    useScannerStore.getState().closeScanner();
  }, []);

  const handleCreateInvoice = useCallback(() => {
    setPendingCreateAction('create-invoice');
    navigateToView('invoices');
  }, [navigateToView]);

  const handleCreateContact = useCallback(() => {
    setPendingCreateAction('create-contact');
    navigateToView('contacts');
  }, [navigateToView]);

  // ─── Email verification screen (?verify=TOKEN) ───
  // IMPORTANT: Check verifyToken BEFORE isLoading to avoid the auth spinner
  // blocking the verification UI. The verify screen has its own loading state.
  if (hydrated && verifyToken && !user) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            {/* Logo */}
            <div className="mb-[46px] -mt-[19px]">
              <Image
                src="/logo-clean.png"
                alt="AlphaFlow"
                width={170}
                height={114}
                className="object-contain login-logo-hover"
                priority
              />
            </div>

            <VerifyEmailScreen
              token={verifyToken}
              onGoToLogin={() => { setVerifyToken(null); }}
            />
          </div>
        </main>

        <footer className="relative z-10 py-6 text-center">
          <div className="sidebar-brand-badge mx-auto mb-2">
            <span>Powered by</span>
            <span className="text-[#0d9488] font-semibold">AlphaFlow</span>
          </div>
          <p className="text-[11px] text-gray-400">
            © {new Date().getFullYear()} AlphaFlow {language === 'da' ? 'Bogføringsapp' : 'Accounting'}
          </p>
        </footer>
      </div>
    );
  }

  if (!hydrated || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8faf9] light-forced">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full animate-spin" style={{ background: 'conic-gradient(from 0deg, #0d9488, #2dd4bf, #0d9488)', animationDuration: '1.5s' }} />
            <div className="absolute inset-1 rounded-full bg-[#f8faf9]" />
          </div>
          <p className="text-gray-500 text-sm">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        {/* Third animated gradient blob (centered, slow) */}
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            {/* Logo */}
            <div className="mb-[46px] -mt-[19px]">
              <Image
                src="/logo-clean.png"
                alt="AlphaFlow"
                width={170}
                height={114}
                className="object-contain login-logo-hover"
                priority
              />
            </div>

            {/* Abstract decorative shapes */}
            <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
            <div className="login-shape-2 absolute top-16 -left-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9a82]/10 to-[#9bb5a0]/5 border border-[#7c9a82]/10 pointer-events-none" />
            <div className="login-shape-3 absolute bottom-24 -right-8 w-12 h-12 rounded-lg bg-gradient-to-br from-[#6366f1]/8 to-[#818cf8]/5 border border-[#6366f1]/8 -rotate-6 pointer-events-none" />

            {/* Description */}
            <div className="text-center mb-6">
              <p className="text-gray-500 text-[15px] mt-2">
                Intelligent bogføring for moderne virksomheder
              </p>
            </div>

            {/* Login Card with premium styling */}
            <PwaInstallBanner />
            <MobileInstallPrompt />
            <div className="w-full relative">
              {/* Top accent bar with shimmer */}
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-6 border border-white/60 login-card-animated-bg login-card-glow overflow-hidden">
                {authMode === 'login' ? (
                  <LoginForm
                    onSuccess={handleLoginSuccess}
                    onSwitchToRegister={() => setAuthMode('register')}
                  />
                ) : (
                  <RegisterForm
                    onSuccess={handleRegisterSuccess}
                    onSwitchToLogin={() => setAuthMode('login')}
                  />
                )}
              </div>
            </div>

            <p className="text-center text-[11px] text-gray-400/60 mt-3 select-none">
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400/70 bg-gray-100/60 border border-gray-200/50 rounded-md shadow-sm">⌘</kbd>
              {' + '}
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400/70 bg-gray-100/60 border border-gray-200/50 rounded-md shadow-sm">↵</kbd>
            </p>

            <p className="text-center text-xs text-gray-400 mt-8">
              {t('poweredByOCR')}
            </p>
          </div>
        </main>
        <footer className="relative z-10 py-6 text-center">
          <div className="sidebar-brand-badge mx-auto mb-2">
            <span>Powered by</span>
            <span className="text-[#0d9488] font-semibold">AlphaFlow</span>
          </div>
          <p className="text-[11px] text-gray-400">
            © {new Date().getFullYear()} AlphaFlow {language === 'da' ? 'Bogføringsapp' : 'Accounting'}
          </p>
        </footer>
      </div>
    );
  }

  // ─── View renderer (supports an explicit view for swipe previews) ──
  const renderView = (view?: View) => {
    const v = view ?? currentView;
    // isCurrent is true when rendering the active page (not a swipe neighbor preview).
    // SwipeViewContainer calls renderView(currentView) with a defined arg, so we
    // compare against currentView rather than checking for undefined.
    const isCurrent = v === currentView;
    switch (v) {
      case 'transactions':
        return <PosteringerPage user={user} />;
      case 'invoices':
        return (
          <InvoicesPage
            user={user}
            initialView={isCurrent && pendingCreateAction === 'create-invoice' ? 'create' : 'list'}
            onInitialViewConsumed={isCurrent ? () => setPendingCreateAction(null) : undefined}
          />
        );
      case 'vat-report':
        return <VATReport user={user} />;
      case 'exports':
        return <ExportsPage user={user} />;
      case 'backups':
        return <BackupPage user={user} />;
      case 'audit-log':
        return <AuditLogPage user={user} />;
      case 'accounts':
        return <ChartOfAccountsPage user={user} onNavigate={(navView) => { if (isCurrent) setOnboardingStepJustDone(2); navigateToView(navView as View); }} />;
      case 'journal':
        return <JournalEntriesPage user={user} />;
      case 'contacts':
        return (
          <ContactsPage
            user={user}
            autoOpenCreate={isCurrent && pendingCreateAction === 'create-contact'}
            onAutoCreateConsumed={isCurrent ? () => setPendingCreateAction(null) : undefined}
          />
        );
      case 'periods':
        return <FiscalPeriodsPage user={user} />;
      case 'ledger':
        return <LedgerPage user={user} />;
      case 'reports':
        return <ReportsPage user={user} />;
      case 'bank-recon':
        return <BankReconciliationPage user={user} />;
      case 'year-end':
        return <YearEndClosingPage user={user} />;
      case 'aging':
        return <AgingReportsPage user={user} />;
      case 'cash-flow':
        return <CashFlowPage user={user} />;
      case 'recurring':
        return <PosteringerPage user={user} defaultTab="recurring" />;
      case 'budget':
        return <BudgetPage user={user} />;
      case 'settings':
        return <SettingsPage user={user} onNavigate={(navView) => navigateToView(navView as View)} />;
      case 'settings-company':
        return <CompanySettingsPage user={user} onNavigate={(navView) => navigateToView(navView as View)} />;
      default:
        return <Dashboard user={user} onNavigate={(navView) => navigateToView(navView as View)} onboardingStepJustDone={onboardingStepJustDone} onOnboardingStepDoneConsumed={() => setOnboardingStepJustDone(0)} />;
    }
  };

  return (
    <AppLayout
      user={user}
      currentView={currentView}
      onViewChange={navigateToView}
      onLogout={handleLogout}
      onDeleteAccount={handleDeleteAccount}
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      onAddTransaction={handleOpenScanner}
      onCreateInvoice={handleCreateInvoice}
      onCreateContact={handleCreateContact}
    >
      {/* Standalone scanner: rendered at page level, independent of any Dialog.
          The scanner uses createPortal → document.body (z-9999).
          Controlled entirely by the scanner store (isOpen). */}
      {scannerOpen && (
        <ReceiptScanner
          onCapture={handleStandaloneCapture}
          onDismiss={handleStandaloneDismiss}
        />
      )}
      <PostInstallCameraPrompt />
      <SwipeViewContainer
        currentView={currentView}
        state={swipeState}
        containerWidth={containerWidth}
        renderView={renderView}
        onSettleComplete={onSettleComplete}
        containerRef={containerRef}
        handlers={swipeHandlers}
      />
    </AppLayout>
  );
}
