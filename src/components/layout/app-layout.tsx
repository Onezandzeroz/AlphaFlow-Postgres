'use client';

import { useState, useEffect, useSyncExternalStore, memo } from 'react';
import Image from 'next/image';
import { User } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { AccordionNav } from '@/components/layout/accordion-nav';
import { CompanySelector } from '@/components/layout/company-selector';
import { CommandPalette, useCommandPalette } from '@/components/command-palette';
import { MobileFab } from '@/components/mobile-fab';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { KeyboardShortcutsModal } from '@/components/keyboard-shortcuts-modal';
import { NotificationCenter } from '@/components/notification-center';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { EmailVerificationBanner } from '@/components/auth/email-verification-banner';
import {
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
  Sparkles,
  Search,
  Languages,
  Trash2,
  AlertTriangle,
  FlaskConical,
  EyeOff,
  ChevronsLeft,
  ShieldCheck,
  Shield,
} from 'lucide-react';

export type View = 'dashboard' | 'transactions' | 'vat-report' | 'exports' | 'invoices' | 'backups' | 'audit-log' | 'accounts' | 'journal' | 'contacts' | 'periods' | 'ledger' | 'reports' | 'bank-recon' | 'year-end' | 'aging' | 'cash-flow' | 'recurring' | 'budget' | 'settings' | 'settings-company';

interface AppLayoutProps {
  user: User;
  currentView: View;
  onViewChange: (view: View) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onOpenCommandPalette?: () => void;
  onAddTransaction?: () => void;
  onCreateInvoice?: () => void;
  onCreateContact?: () => void;
  children: React.ReactNode;
}

// Custom hook for dark mode with hydration safety
function useDarkMode() {
  const getSnapshot = () => {
    if (typeof window === 'undefined') return false;
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return savedTheme === 'dark' || (!savedTheme && prefersDark);
  };

  const getServerSnapshot = () => false;

  const darkMode = useSyncExternalStore(
    (callback) => {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', callback);
      window.addEventListener('storage', callback);
      return () => {
        mediaQuery.removeEventListener('change', callback);
        window.removeEventListener('storage', callback);
      };
    },
    getSnapshot,
    getServerSnapshot
  );

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', newMode);
    // Force re-render
    window.dispatchEvent(new StorageEvent('storage'));
  };

  return { darkMode, toggleDarkMode };
}

// Hook for hydration
function useMounted() {
  const getSnapshot = () => true;
  const getServerSnapshot = () => false;
  return useSyncExternalStore(() => () => {}, getSnapshot, getServerSnapshot);
}

export function AppLayout({
  user,
  currentView,
  onViewChange,
  onLogout,
  onDeleteAccount,
  onOpenCommandPalette,
  onAddTransaction,
  onCreateInvoice,
  onCreateContact,
  children,
}: AppLayoutProps) {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const mounted = useMounted();
  const { t } = useTranslation();
  const { language, toggleLanguage } = useLanguageStore();
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } = useCommandPalette();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Global keyboard shortcut: ? to open shortcuts modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Global keyboard shortcuts for quick navigation (Alt+N, Alt+I, Alt+R, Alt+V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Alt shortcuts – skip if user is typing in an input field
      if (e.altKey && !e.metaKey && !e.ctrlKey && !isInputFocused) {
        switch (e.key.toLowerCase()) {
          case 'n': {
            e.preventDefault();
            if (onAddTransaction) {
              onAddTransaction();
            } else {
              onViewChange('transactions');
            }
            toast.success(
              language === 'da' ? 'Nyt indkøb' : 'New purchase',
              {
                description: language === 'da'
                  ? 'Åbner dialog for nyt indkøb'
                  : 'Opening new purchase dialog',
                duration: 2000,
              }
            );
            break;
          }
          case 'i': {
            e.preventDefault();
            onViewChange('invoices');
            toast.success(
              language === 'da' ? 'Salg & Faktura' : 'Sales & Invoice',
              {
                description: language === 'da'
                  ? 'Navigerer til salg & faktura'
                  : 'Navigating to sales & invoice',
                duration: 2000,
              }
            );
            break;
          }
          case 'r': {
            e.preventDefault();
            onViewChange('reports');
            toast.success(
              language === 'da' ? 'Rapporter' : 'Reports',
              {
                description: language === 'da'
                  ? 'Navigerer til rapporter'
                  : 'Navigating to reports',
                duration: 2000,
              }
            );
            break;
          }
          case 'v': {
            e.preventDefault();
            onViewChange('vat-report');
            toast.success(
              language === 'da' ? 'Momsafregning' : 'VAT Report',
              {
                description: language === 'da'
                  ? 'Navigerer til momsafregning'
                  : 'Navigating to VAT report',
                duration: 2000,
              }
            );
            break;
          }
        }
      }

      // Escape: close app-level overlays (shortcuts modal, command palette)
      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (shortcutsOpen) {
          setShortcutsOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAddTransaction, onViewChange, language, commandPaletteOpen, shortcutsOpen, setCommandPaletteOpen]);

  // Apply dark mode class on mount and when darkMode changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const handleNavClick = (view: View) => {
    onViewChange(view);
    setSidebarOpen(false);
  };

  const handleCommandNavigate = (view: string) => {
    onViewChange(view as View);
    setSidebarOpen(false);
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await onDeleteAccount();
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8faf9] dark:bg-[#0f1211]">
        <div className="h-8 w-8 skeleton-pulse rounded-full" />
      </div>
    );
  }

  // Shared user controls for desktop and mobile sidebars.
  // Wrapped with memo to prevent destructive remounting (and thus
  // notification read-state loss) on every parent re-render.
  const UserControls = memo(function UserControls() {
    return (
    <div className="border-t border-[#e2e8e6] dark:border-[#2a3330] p-4 space-y-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-full avatar-gradient sidebar-user-avatar flex items-center justify-center shrink-0">
          <span className="text-sm font-medium text-white">
            {user.email?.[0]?.toUpperCase() || 'U'}
          </span>
        </div>
        <div className="min-w-0 sidebar-label flex-1">
          <div className="flex items-center gap-1.5 truncate">
            <p className="text-sm font-medium text-[#1a1d1c] dark:text-[#e2e8e6] truncate">
              {user.businessName?.replace(/\s*-\s*App-owner$/i, '') || t('user')}
            </p>
            {user.isSuperDev && user.businessName?.includes('App-owner') && (
              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm">
                <Shield className="h-2.5 w-2.5" />
                {language === 'da' ? 'App Owner' : 'App Owner'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {user.email}
          </p>
        </div>
        <NotificationCenter onNavigate={(view) => onViewChange(view as View)} />
      </div>

      {/* Demo Mode Indicator */}
      {user.isDemoCompany && (
        user.isSuperDev ? (
          <div className="sidebar-label flex items-center gap-2 p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/50">
            <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="text-xs font-medium text-teal-700 dark:text-teal-300 flex-1">
              {language === 'da' ? 'AppOwner-redigering' : 'AppOwner Editing'}
            </span>
          </div>
        ) : (
          <div className="sidebar-label flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
            <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 flex-1">
              {language === 'da' ? 'Demo-virksomhed' : 'Demo Company'}
            </span>
          </div>
        )
      )}

      <div className="sidebar-label flex items-center gap-2">
        {/* Language Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleLanguage}
                className="flex-1 gap-1.5 text-xs font-medium"
              >
                <Languages className="h-3.5 w-3.5" />
                <span>{language === 'da' ? 'DA' : 'EN'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {language === 'da' ? t('englishUI') : t('danishUI')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Dark Mode Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDarkMode}
          className="flex-1 gap-2"
        >
          {darkMode ? (
            <>
              <Sun className="h-4 w-4" />
              <span>{t('light')}</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              <span>{t('dark')}</span>
            </>
          )}
        </Button>
      </div>

      {/* Logout & Delete Account */}
      <div className="sidebar-label flex items-center gap-2">
        {/* Logout with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 text-slate-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700"
            >
              <LogOut className="h-4 w-4" />
              <span>{t('logout')}</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('logoutTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('logoutDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onLogout} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                {t('logout')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Account with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-red-500 hover:text-red-600 hover:border-red-300 dark:hover:border-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                {t('deleteAccountTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteAccountDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {isDeletingAccount ? t('deletingAccount') : t('deleteAccountConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
  });

  return (
    <div className="min-h-[100dvh] min-h-[100vh] lg:min-h-screen bg-[#f8faf9] dark:bg-[#0f1211] transition-colors duration-300">
      {/* Desktop Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 hidden lg:flex flex-col bg-mesh bg-white dark:bg-[#141918] border-r border-[#e2e8e6] dark:border-[#2a3330] shadow-sm',
        sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'
      )}>
        {/* Logo + Collapse Toggle */}
        <div className="flex items-center px-4 pt-6 pb-4 border-b border-[#e2e8e6] dark:border-[#2a3330]">
          <div className={cn('flex-1 flex items-center justify-center overflow-hidden', sidebarCollapsed && 'px-1')}>
            <Image
              src="/logo-notext.png"
              alt="AlphaFlow"
              width={sidebarCollapsed ? 36 : 140}
              height={sidebarCollapsed ? 36 : 94}
              className={cn('object-contain dark:invert transition-all duration-300', sidebarCollapsed && 'rounded-lg')}
              priority
            />
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="sidebar-collapse-btn shrink-0"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Company Selector */}
        {!sidebarCollapsed && <CompanySelector />}

        {/* Accordion Navigation */}
        <div className="flex-1 flex flex-col min-h-0">
          <AccordionNav
            currentView={currentView}
            onViewChange={handleNavClick}
          />
        </div>

        {/* User & Controls */}
        <UserControls />

        {/* Powered by AlphaFlow Badge */}
        <div className={cn('pb-3 pt-1', sidebarCollapsed ? 'px-2 flex justify-center' : 'px-4')}>
          {sidebarCollapsed ? (
            <div className="flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-[#0d9488] dark:text-[#2dd4bf]" />
            </div>
          ) : (
            <div className="sidebar-brand-badge">
              <Sparkles className="h-2.5 w-2.5 text-[#0d9488] dark:text-[#2dd4bf]" />
              <span>Powered by</span>
              <span className="text-[#0d9488] dark:text-[#2dd4bf] font-semibold">AlphaFlow</span>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="lg:hidden fixed inset-x-0 top-0 z-40 bg-white dark:bg-[#141918] border-b border-[#e2e8e6] dark:border-[#2a3330] shadow-sm">
        <div className="flex items-center h-16 px-4">
          {/* Left: Language, Theme, Notifications */}
          <div className="flex items-center gap-1 w-1/3">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="text-xs font-medium"
            >
              {language === 'da' ? 'DA' : 'EN'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleDarkMode}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <NotificationCenter onNavigate={(view) => onViewChange(view as View)} />
          </div>

          {/* Center: Logo */}
          <div className="flex-1 flex justify-center">
            <Image
              src="/logo-notext.png"
              alt="AlphaFlow"
              width={90}
              height={60}
              className="object-contain dark:invert"
            />
          </div>

          {/* Right: Menu button */}
          <div className="flex items-center justify-end w-1/3">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-white dark:bg-[#141918] w-72 p-0 flex flex-col">
              <SheetTitle className="sr-only">{t('navigationMenu')}</SheetTitle>
              {/* Mobile Logo */}
              <div className="flex h-16 items-center justify-center px-6 border-b border-[#e2e8e6] dark:border-[#2a3330] shrink-0">
                <Image
                  src="/logo-notext.png"
                  alt="AlphaFlow"
                  width={120}
                  height={81}
                  className="object-contain dark:invert"
                  priority
                />
              </div>

              {/* Mobile Accordion Navigation */}
              <div className="flex-1 flex flex-col min-h-0">
                <AccordionNav
                  currentView={currentView}
                  onViewChange={handleNavClick}
                />
              </div>

              {/* Mobile User Controls */}
              <div className="shrink-0 border-t border-[#e2e8e6] dark:border-[#2a3330] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full avatar-gradient flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-white">
                      {user.email?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate">
                      <p className="text-sm font-medium text-[#1a1d1c] dark:text-[#e2e8e6] truncate">
                        {user.businessName?.replace(/\s*-\s*App-owner$/i, '') || t('user')}
                      </p>
                      {user.isSuperDev && user.businessName?.includes('App-owner') && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm">
                          <Shield className="h-2.5 w-2.5" />
                          App Owner
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleLanguage}
                    className="gap-1.5"
                  >
                    <Languages className="h-4 w-4" />
                    {language === 'da' ? 'DA' : 'EN'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleDarkMode}
                    className="flex-1 gap-2"
                  >
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {darkMode ? t('light') : t('dark')}
                  </Button>
                </div>

                {/* Mobile Logout & Delete Account */}
                <div className="flex items-center gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-slate-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>{t('logout')}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('logoutTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('logoutDescription')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={onLogout} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                          {t('logout')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-5 w-5" />
                          {t('deleteAccountTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('deleteAccountDescription')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          disabled={isDeletingAccount}
                          className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                          {isDeletingAccount ? t('deletingAccount') : t('deleteAccountConfirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="lg:pl-[260px] pt-16 lg:pt-0 pb-16 lg:pb-0">
        {/* Oversight Mode Banner — desktop only */}
        {user.isOversightMode && (
          <div className="hidden lg:flex bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <EyeOff className="h-4 w-4 shrink-0" />
              <span className="font-medium truncate">
                {language === 'da'
                  ? `Overvåger: ${user.oversightCompanyName || 'Ukendt virksomhed'}`
                  : `Overseeing: ${user.oversightCompanyName || 'Unknown company'}`}
              </span>
              <span className="hidden sm:inline text-amber-100 dark:text-amber-200">
                — {language === 'da' ? 'Skrivebeskyttet tilstand' : 'Read-only mode'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onViewChange('settings')}
              className="text-xs font-medium underline underline-offset-2 hover:text-amber-100 dark:hover:text-amber-200 whitespace-nowrap"
            >
              {language === 'da' ? 'Afslut i Indstillinger' : 'End in Settings'}
            </button>
          </div>
        )}

        {/* Demo Company Banner — desktop only */}
        {user.isDemoCompany && (
          user.isSuperDev ? (
            <div className="hidden lg:flex bg-teal-600 dark:bg-teal-700 text-white px-4 py-2 items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="font-medium truncate">
                  {language === 'da'
                    ? 'Demo-virksomhed: Nordisk Erhverv ApS'
                    : 'Demo Company: Nordisk Erhverv ApS'}
                </span>
                <span className="hidden sm:inline text-teal-100 dark:text-teal-200">
                  — {language === 'da' ? 'AppOwner-tilstand — alle ændringer tilladt' : 'AppOwner Mode — full edit access'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  fetch('/api/demo-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'exit' }),
                  }).then(() => window.location.reload());
                }}
                className="text-xs font-medium underline underline-offset-2 hover:text-teal-100 dark:hover:text-teal-200 whitespace-nowrap"
              >
                {language === 'da' ? 'Tilbage til min data' : 'Back to My Data'}
              </button>
            </div>
          ) : (
            <div className="hidden lg:flex bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FlaskConical className="h-4 w-4 shrink-0" />
                <span className="font-medium truncate">
                  {language === 'da'
                    ? 'Demo-virksomhed: Nordisk Erhverv ApS'
                    : 'Demo Company: Nordisk Erhverv ApS'}
                </span>
                <span className="hidden sm:inline text-amber-100 dark:text-amber-200">
                  — {language === 'da' ? 'Skrivebeskyttet' : 'Read-only'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  fetch('/api/demo-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'exit' }),
                  }).then(() => window.location.reload());
                }}
                className="text-xs font-medium underline underline-offset-2 hover:text-amber-100 dark:hover:text-amber-200 whitespace-nowrap"
              >
                {language === 'da' ? 'Tilbage til min data' : 'Back to My Data'}
              </button>
            </div>
          )
        )}
        <EmailVerificationBanner />
        <div
          className="min-h-[100dvh] min-h-[100vh] lg:min-h-screen"
        >
          {children}
        </div>
      </main>

      {/* Mobile Floating Action Button */}
      <MobileFab
        onNavigate={(view) => onViewChange(view as View)}
        onAddTransaction={onAddTransaction || (() => onViewChange('transactions'))}
        onCreateInvoice={onCreateInvoice}
        onCreateContact={onCreateContact}
      />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        currentView={currentView}
        onViewChange={onViewChange}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={handleCommandNavigate}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        onNavigate={(view) => onViewChange(view as View)}
      />
    </div>
  );
}
