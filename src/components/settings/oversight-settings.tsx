'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Shield, Eye, Search, Building2, Users, AlertTriangle, X, Loader2, ChevronRight, Crown } from 'lucide-react';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  name: string;
  email: string;
  cvrNumber: string;
  companyType: string | null;
  isDemo: boolean;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
}

export function OversightSettings() {
  const user = useAuthStore(state => state.user);
  const checkAuth = useAuthStore(state => state.checkAuth);
  const startOversight = useAuthStore(state => state.startOversight);
  const stopOversight = useAuthStore(state => state.stopOversight);
  const { language } = useTranslation();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [switching, setSwitching] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false);

  const isSuperDev = user?.isSuperDev ?? false;
  const isOversightMode = user?.isOversightMode ?? false;
  const oversightCompanyName = user?.oversightCompanyName;
  const isAlphaAiCompany = user?.activeCompanyName?.startsWith('AlphaAi') ?? false;

  const fetchTenants = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/oversight/tenants?${params}`);
      if (res.ok) {
        const data = await res.json();
        const rawTenants = data.tenants || [];
        // Pin AlphaAi (AppOwner) company to top
        const alphaAiTenants = rawTenants.filter((t: Tenant) => t.name.startsWith('AlphaAi'));
        const otherTenants = rawTenants.filter((t: Tenant) => !t.name.startsWith('AlphaAi'));
        setTenants([...alphaAiTenants, ...otherTenants]);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (isSuperDev) {
      setLoading(true);
      fetchTenants();
    } else {
      setLoading(false);
    }
  }, [isSuperDev, fetchTenants]);

  const handlePromoteToSuperDev = async () => {
    setPromoting(true);
    try {
      const res = await fetch('/api/auth/promote-superdev', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        toast.success(
          language === 'da' ? 'Forfremmet til App-ejer!' : 'Promoted to App Owner!',
          {
            description: language === 'da'
              ? 'Log ud og ind igen for at aktivere tilsynsfunktionen'
              : 'Log out and back in to activate the oversight feature',
          }
        );
        // Refresh auth state to pick up isSuperDev change
        await checkAuth();
      } else {
        toast.error(
          language === 'da' ? 'Kunne ikke forfremme' : 'Failed to promote',
          { description: data.error || (language === 'da' ? 'Ukendt fejl' : 'Unknown error') }
        );
      }
    } catch (error) {
      toast.error(
        language === 'da' ? 'Kunne ikke forfremme' : 'Failed to promote',
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setPromoting(false);
      setPromoteConfirmOpen(false);
    }
  };

  const handleStartOversight = async (tenant: Tenant) => {
    setSwitching(tenant.id);
    try {
      await startOversight(tenant.id);
      toast.success(
        language === 'da'
          ? `Overvåger nu ${tenant.name}`
          : `Now overseeing ${tenant.name}`,
        { description: language === 'da' ? 'Alle data vises skrivebeskyttet' : 'All data shown in read-only mode' }
      );
    } catch (error) {
      toast.error(
        language === 'da' ? 'Kunne ikke starte overvågning' : 'Failed to start oversight',
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setSwitching(null);
      setConfirmOpen(false);
      setSelectedTenant(null);
    }
  };

  const handleStopOversight = async () => {
    try {
      await stopOversight();
      toast.success(
        language === 'da' ? 'Overvågning afsluttet' : 'Oversight ended',
        { description: language === 'da' ? 'Tilbage til din egen virksomhed' : 'Back to your own company' }
      );
    } catch {
      toast.error(language === 'da' ? 'Kunne ikke afslutte overvågning' : 'Failed to end oversight');
    }
  };

  // ─── Non-SuperDev: Show promotion card (only for AlphaAi company) ──
  // Non-AlphaAi users should never reach this component — the tab is hidden in settings-page.tsx.
  // This is a safety net: return null if somehow rendered.

  if (!isSuperDev) {
    if (!isAlphaAiCompany) {
      return null;
    }

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-[#1a2e2a] dark:text-[#e2e8e6] flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            {language === 'da' ? 'Tilsyn' : 'Oversight'}
          </h3>
          <p className="text-sm text-[#6b7c75]">
            {language === 'da'
              ? 'AlphaAi App-ejer funktion — se alle virksomheder i skrivebeskyttet tilstand'
              : 'AlphaAi App Owner feature — view all companies in read-only mode'}
          </p>
        </div>

        <Card className="border-2 border-dashed border-amber-300 dark:border-amber-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Crown className="h-5 w-5" />
              {language === 'da' ? 'Bliv AlphaAi App-ejer' : 'Become AlphaAi App Owner'}
            </CardTitle>
            <CardDescription>
              {language === 'da'
                ? 'Som App-ejer får du skrivebeskyttet adgang til alle virksomheder i systemet (god mode)'
                : 'As App Owner you get read-only access to all companies in the system (god mode)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-4 space-y-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {language === 'da' ? 'Hvad du får:' : 'What you get:'}
              </p>
              <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-400">
                <li className="flex items-start gap-2">
                  <Eye className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {language === 'da'
                      ? 'Skrivebeskyttet adgang til alle virksomheders data'
                      : 'Read-only access to all companies\' data'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {language === 'da'
                      ? 'Alle ændringer er blokeret — kun læseadgang'
                      : 'All modifications are blocked — read-only access only'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {language === 'da'
                      ? 'Adgang logges i revisionslogen for gennemsigtighed'
                      : 'Access is logged in the audit trail for transparency'}
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {language === 'da'
                  ? 'Begrænset til én App-ejer pr. system. Når du er blevet forfremmet, kan ingen andre blive App-ejer.'
                  : 'Limited to one App Owner per system. Once promoted, no one else can become App Owner.'}
              </p>
            </div>

            <Button
              onClick={() => setPromoteConfirmOpen(true)}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              <Crown className="h-4 w-4" />
              {language === 'da' ? 'Bliv App-ejer' : 'Become App Owner'}
            </Button>
          </CardContent>
        </Card>

        {/* Promote confirm dialog */}
        <Dialog open={promoteConfirmOpen} onOpenChange={setPromoteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Crown className="h-5 w-5" />
                {language === 'da' ? 'Bekræft App-ejer forfremmelse' : 'Confirm App Owner Promotion'}
              </DialogTitle>
              <DialogDescription>
                {language === 'da'
                  ? 'Du er ved at blive forfremmet til AlphaAi App-ejer. Dette giver dig skrivebeskyttet adgang til alle virksomheder i systemet.'
                  : 'You are about to be promoted to AlphaAi App Owner. This grants you read-only access to all companies in the system.'}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">
                  {language === 'da' ? 'Vigtigt:' : 'Important:'}
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>{language === 'da' ? 'Kun én App-ejer kan eksistere ad gangen' : 'Only one App Owner can exist at a time'}</li>
                  <li>{language === 'da' ? 'Al oversight-adgang logges i revisionslogen' : 'All oversight access is logged in the audit trail'}</li>
                  <li>{language === 'da' ? 'Du skal logge ud og ind igen efter forfremmelse' : 'You must log out and back in after promotion'}</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPromoteConfirmOpen(false)}
                className="flex-1"
              >
                {language === 'da' ? 'Annuller' : 'Cancel'}
              </Button>
              <Button
                onClick={handlePromoteToSuperDev}
                disabled={promoting}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
              >
                {promoting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="h-4 w-4" />
                )}
                {language === 'da' ? 'Bekræft forfremmelse' : 'Confirm Promotion'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Active oversight mode banner ──────────────────────────────────

  if (isOversightMode) {
    return (
      <Card className="border-2 border-amber-400 dark:border-amber-600 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Eye className="h-5 w-5" />
            {language === 'da' ? 'Overvågningstilstand aktiv' : 'Oversight Mode Active'}
          </CardTitle>
          <CardDescription className="text-sm">
            {language === 'da'
              ? 'Du ser data fra en anden virksomhed i skrivebeskyttet tilstand'
              : 'You are viewing data from another company in read-only mode'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {oversightCompanyName}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {language === 'da' ? 'Overvåget virksomhed' : 'Overseen company'}
                </p>
              </div>
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                <Eye className="h-3 w-3 mr-1" />
                {language === 'da' ? 'Skrivebeskyttet' : 'Read-only'}
              </Badge>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {language === 'da'
                ? 'Du kan ikke oprette, redigere eller slette data mens du overvåger en anden virksomhed. Alle ændringer er blokeret.'
                : 'You cannot create, edit, or delete data while overseeing another company. All modifications are blocked.'}
            </p>
          </div>

          <Button
            onClick={handleStopOversight}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            <X className="h-4 w-4" />
            {language === 'da' ? 'Afslut overvågning' : 'End Oversight'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── SuperDev: Show tenant list ────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-[#1a2e2a] dark:text-[#e2e8e6] flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          {language === 'da' ? 'Tilsyn' : 'Oversight'}
        </h3>
        <p className="text-sm text-[#6b7c75]">
          {language === 'da'
            ? 'Se alle virksomheder i skrivebeskyttet tilstand som AlphaAi app-ejer'
            : 'View all companies in read-only mode as the AlphaAi App Owner'}
        </p>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7c75]" />
            <Input
              placeholder={language === 'da' ? 'Søg efter virksomhed, CVR eller e-mail...' : 'Search by company name, CVR, or email...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tenant list */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            {language === 'da' ? 'Alle virksomheder' : 'All Companies'} ({tenants.length})
          </CardTitle>
          <CardDescription>
            {language === 'da'
              ? 'Vælg en virksomhed for at se dens data i skrivebeskyttet tilstand'
              : 'Select a company to view its data in read-only mode'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-[#6b7c75]">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              {language === 'da' ? 'Indlæser...' : 'Loading...'}
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-8 text-[#6b7c75]">
              {search
                ? (language === 'da' ? 'Ingen virksomheder fundet' : 'No companies found')
                : (language === 'da' ? 'Ingen virksomheder tilgængelige' : 'No companies available')}
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {tenants.map((tenant) => {
                const isOwnCompany = tenant.id === user?.activeCompanyId;
                const isAlphaAi = tenant.name.startsWith('AlphaAi');
                return (
                  <button
                    key={tenant.id}
                    type="button"
                    disabled={isOwnCompany || switching === tenant.id}
                    onClick={() => {
                      setSelectedTenant(tenant);
                      setConfirmOpen(true);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                      isOwnCompany
                        ? 'bg-gray-50 dark:bg-white/5 opacity-50 cursor-not-allowed'
                        : isAlphaAi
                          ? 'bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer'
                          : 'bg-[#f8faf9] dark:bg-[#1a2520] hover:bg-[#f0f5f2] dark:hover:bg-[#1e2b26] cursor-pointer'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isAlphaAi
                        ? 'bg-amber-200 dark:bg-amber-800/40'
                        : 'bg-amber-100 dark:bg-amber-900/30'
                    }`}>
                      {isAlphaAi
                        ? <Crown className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                        : <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a2e2a] dark:text-[#e2e8e6] truncate">
                        {tenant.name}
                        {isOwnCompany && (
                          <span className="text-[#6b7c75] ml-1 text-xs">
                            ({language === 'da' ? 'din virksomhed' : 'your company'})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#6b7c75] flex items-center gap-2 truncate">
                        {tenant.cvrNumber && <span>CVR: {tenant.cvrNumber}</span>}
                        {tenant.email && <span>{tenant.email}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {tenant.memberCount}
                      </Badge>
                      {tenant.isDemo && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Demo
                        </Badge>
                      )}
                      {!tenant.isActive && (
                        <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                          {language === 'da' ? 'Inaktiv' : 'Inactive'}
                        </Badge>
                      )}
                      {!isOwnCompany && (
                        <ChevronRight className="h-4 w-4 text-[#6b7c75]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Eye className="h-5 w-5" />
              {language === 'da' ? 'Start overvågning?' : 'Start Oversight?'}
            </DialogTitle>
            <DialogDescription>
              {language === 'da'
                ? `Du er ved at se data fra "${selectedTenant?.name}" i skrivebeskyttet tilstand. Dette vil blive logget i revisionslogen.`
                : `You are about to view data from "${selectedTenant?.name}" in read-only mode. This will be logged in the audit trail.`}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">
                {language === 'da' ? 'Vigtigt:' : 'Important:'}
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>{language === 'da' ? 'Du kan kun læse data, ikke ændre det' : 'You can only read data, not modify it'}</li>
                <li>{language === 'da' ? 'Adgangen logges som "oversight" i revisionslogen' : 'Access is logged as "oversight" in the audit trail'}</li>
                <li>{language === 'da' ? 'Du kan afslutte overvågningen når som helst' : 'You can end oversight at any time'}</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setSelectedTenant(null);
              }}
              className="flex-1"
            >
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={() => selectedTenant && handleStartOversight(selectedTenant)}
              disabled={switching === selectedTenant?.id}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              {switching === selectedTenant?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {language === 'da' ? 'Start overvågning' : 'Start Oversight'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
