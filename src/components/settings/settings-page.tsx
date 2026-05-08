'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PageHeader } from '@/components/shared/page-header';
import { CompanySettingsPage } from '@/components/settings/company-settings-page';
import { TeamManagement } from '@/components/settings/team-management';
import { OversightSettings } from '@/components/settings/oversight-settings';
import { toast } from 'sonner';
import {
  Settings,
  Palette,
  SlidersHorizontal,
  Building2,
  Users,
  Sun,
  Moon,
  Monitor,
  Loader2,
  Check,
  Info,
  Shield,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  compactMode?: boolean;
  currencyFormat?: 'full' | 'no-decimals' | 'compact';
  defaultVatRate?: number;
  defaultPaymentTerms?: string;
  fiscalYearStart?: number;
}

interface SettingsPageProps {
  user: User;
  onNavigate?: (view: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────

export function SettingsPage({ user, onNavigate }: SettingsPageProps) {
  const { t, language } = useTranslation();
  const { theme: currentTheme, setTheme } = useTheme();

  // ── State ──
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('company');

  const [prefs, setPrefs] = useState<UserPreferences>({
    theme: 'system',
    compactMode: false,
    currencyFormat: 'full',
    defaultVatRate: 25,
    defaultPaymentTerms: 'Netto 30 dage',
    fiscalYearStart: 1,
  });

  const [originalPrefs, setOriginalPrefs] = useState<UserPreferences | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // ── Fetch preferences ──
  const fetchPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/user/preferences');
      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          const loaded = {
            theme: data.preferences.theme || 'system',
            compactMode: data.preferences.compactMode || false,
            currencyFormat: data.preferences.currencyFormat || 'full',
            defaultVatRate: data.preferences.defaultVatRate || 25,
            defaultPaymentTerms: data.preferences.defaultPaymentTerms || 'Netto 30 dage',
            fiscalYearStart: data.preferences.fiscalYearStart || 1,
          };
          setPrefs(loaded);
          setOriginalPrefs(loaded);
        }
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // ── Track changes ──
  useEffect(() => {
    if (originalPrefs) {
      const changed = JSON.stringify(prefs) !== JSON.stringify(originalPrefs);
      setHasChanges(changed);
    }
  }, [prefs, originalPrefs]);

  // ── Update a preference ──
  const updatePref = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Save preferences ──
  const savePreferences = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });

      if (response.ok) {
        setOriginalPrefs({ ...prefs });
        setHasChanges(false);
        toast.success(t('settingsSaved'), {
          description: t('settingsSavedDescription'),
        });
      } else {
        toast.error(t('settingsSaveError'));
      }
    } catch {
      toast.error(t('settingsSaveError'));
    } finally {
      setIsSaving(false);
    }
  }, [prefs, t]);

  // ── Handle theme change ──
  const handleThemeChange = useCallback((value: string) => {
    const themeVal = value as 'light' | 'dark' | 'system';
    updatePref('theme', themeVal);
    setTheme(themeVal);
  }, [updatePref, setTheme]);

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-96" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-6 w-12" />
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

  // ── Theme icon ──
  const getThemeIcon = (theme: string) => {
    switch (theme) {
      case 'light': return <Sun className="h-4 w-4" />;
      case 'dark': return <Moon className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* ── Page Header ── */}
      <PageHeader
        title={t('settingsTitle')}
        description={t('settingsDescription')}
        action={
          hasChanges ? (
            <Button
              onClick={savePreferences}
              disabled={isSaving}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
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
          ) : undefined
        }
      />

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 lg:space-y-6">
        <TabsList className="bg-white/80 dark:bg-[#1a1f1e]/80 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-xl p-1">
          <TabsTrigger
            value="company"
            className="gap-2 rounded-lg data-[state=active]:bg-teal-50 data-[state=active]:text-[#0d9488] data-[state=active]:shadow-sm data-[state=active]:shadow-[#0d9488]/20 data-[state=active]:border data-[state=active]:border-[#0d9488]/20 transition-all relative"
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsCompanyProfile')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="team"
            className="gap-2 rounded-lg data-[state=active]:bg-teal-50 data-[state=active]:text-[#0d9488] data-[state=active]:shadow-sm data-[state=active]:shadow-[#0d9488]/20 data-[state=active]:border data-[state=active]:border-[#0d9488]/20 transition-all relative"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'da' ? 'Team' : 'Team'}</span>
          </TabsTrigger>
          <TabsTrigger
            value="defaults"
            className="gap-2 rounded-lg data-[state=active]:bg-teal-50 data-[state=active]:text-[#0d9488] data-[state=active]:shadow-sm data-[state=active]:shadow-[#0d9488]/20 data-[state=active]:border data-[state=active]:border-[#0d9488]/20 transition-all relative"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsDefaults')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="gap-2 rounded-lg data-[state=active]:bg-teal-50 data-[state=active]:text-[#0d9488] data-[state=active]:shadow-sm data-[state=active]:shadow-[#0d9488]/20 data-[state=active]:border data-[state=active]:border-[#0d9488]/20 transition-all relative"
          >
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsAppearance')}</span>
          </TabsTrigger>
          {/* Oversight tab — only visible to the App Owner, or to AlphaAi users if no App Owner exists yet */}
          {(user.isSuperDev || (!user.hasAppOwner && user.activeCompanyName?.startsWith('AlphaAi'))) && (
            <TabsTrigger
              value="oversight"
              className="gap-2 rounded-lg data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 data-[state=active]:shadow-sm data-[state=active]:shadow-amber-600/20 data-[state=active]:border data-[state=active]:border-amber-600/20 transition-all relative"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">{language === 'da' ? 'Tilsyn' : 'Oversight'}</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ═══ COMPANY PROFILE TAB ═══ */}
        <TabsContent value="company" className="border-l-4 border-[#0d9488] dark:border-[#2dd4bf] pl-4">
          <CompanySettingsPage user={user} onNavigate={onNavigate} />
        </TabsContent>

        {/* ═══ TEAM TAB ═══ */}
        <TabsContent value="team" className="border-l-4 border-[#0d9488] dark:border-[#2dd4bf] pl-4">
          <TeamManagement />
        </TabsContent>

        {/* ═══ DEFAULTS TAB ═══ */}
        <TabsContent value="defaults" className="space-y-6 border-l-4 border-[#0d9488] dark:border-[#2dd4bf] pl-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* ── Default VAT Rate ── */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0d9488] flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-white">%</span>
                  </div>
                  {t('defaultVatRate')}
                </CardTitle>
                <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
                  {t('defaultVatRateDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={String(prefs.defaultVatRate)}
                  onValueChange={(val) => updatePref('defaultVatRate', Number(val))}
                  className="space-y-3"
                >
                  {[
                    { value: '25', label: '25%', desc: language === 'da' ? 'Standard (fleste varer og ydelser)' : 'Standard (most goods and services)' },
                    { value: '12', label: '12%', desc: language === 'da' ? 'Nedsat (fødevarer, aviser, mv.)' : 'Reduced (food, newspapers, etc.)' },
                    { value: '0', label: '0%', desc: language === 'da' ? 'Fritaget (eksport, sundhed, mv.)' : 'Exempt (export, healthcare, etc.)' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                        String(prefs.defaultVatRate) === opt.value
                          ? 'border-[#0d9488] bg-[#0d9488]/5 dark:border-[#2dd4bf] dark:bg-[#2dd4bf]/5'
                          : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      <RadioGroupItem value={opt.value} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{opt.label}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>

            {/* ── Payment Terms + Fiscal Year ── */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shrink-0">
                    <SlidersHorizontal className="h-4 w-4 text-white" />
                  </div>
                  {t('defaultPaymentTermsSetting')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Payment Terms */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('defaultPaymentTermsSetting')}
                  </Label>
                  <Select
                    value={prefs.defaultPaymentTerms}
                    onValueChange={(val) => updatePref('defaultPaymentTerms', val)}
                  >
                    <SelectTrigger className="w-full h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Netto 8 dage">Netto 8 dage</SelectItem>
                      <SelectItem value="Netto 14 dage">Netto 14 dage</SelectItem>
                      <SelectItem value="Netto 30 dage">Netto 30 dage</SelectItem>
                      <SelectItem value="Netto 60 dage">Netto 60 dage</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
                    {t('defaultPaymentTermsDescription')}
                  </p>
                </div>

                <Separator />

                {/* Fiscal Year Start */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('fiscalYearStart')}
                  </Label>
                  <Select
                    value={String(prefs.fiscalYearStart)}
                    onValueChange={(val) => updatePref('fiscalYearStart', Number(val))}
                  >
                    <SelectTrigger className="w-full h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('fiscalYearJanuary')}</SelectItem>
                      <SelectItem value="2">{t('fiscalYearFebruary')}</SelectItem>
                      <SelectItem value="3">{t('fiscalYearMarch')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
                    {t('fiscalYearStartDescription')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ APPEARANCE TAB ═══ */}
        <TabsContent value="appearance" className="space-y-6 border-l-4 border-[#0d9488] dark:border-[#2dd4bf] pl-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* ── Theme Selection ── */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0d9488] flex items-center justify-center shrink-0">
                    <Palette className="h-4 w-4 text-white" />
                  </div>
                  {t('themeSetting')}
                </CardTitle>
                <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
                  {t('themeDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={prefs.theme}
                  onValueChange={handleThemeChange}
                  className="space-y-3"
                >
                  {[
                    { value: 'light', label: t('themeLight'), icon: <Sun className="h-4 w-4" /> },
                    { value: 'dark', label: t('themeDark'), icon: <Moon className="h-4 w-4" /> },
                    { value: 'system', label: t('themeSystem'), icon: <Monitor className="h-4 w-4" /> },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                        prefs.theme === opt.value
                          ? 'border-[#0d9488] bg-[#0d9488]/5 dark:border-[#2dd4bf] dark:bg-[#2dd4bf]/5'
                          : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      <RadioGroupItem value={opt.value} />
                      <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-600 dark:text-gray-300">
                        {opt.icon}
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>

            {/* ── Compact Mode + Currency Format ── */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                    <SlidersHorizontal className="h-4 w-4 text-white" />
                  </div>
                  {t('currencyDisplayFormat')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Compact Mode Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('compactMode')}
                    </Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('compactModeDescription')}
                    </p>
                  </div>
                  <ResponsiveSwitch
                    checked={!!prefs.compactMode}
                    onCheckedChange={(checked) => updatePref('compactMode', checked)}
                  />
                </div>

                <Separator />

                {/* Currency Format */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('currencyDisplayFormat')}
                  </Label>
                  <Select
                    value={prefs.currencyFormat}
                    onValueChange={(val) => updatePref('currencyFormat', val as 'full' | 'no-decimals' | 'compact')}
                  >
                    <SelectTrigger className="w-full h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">{t('currencyFull')}</SelectItem>
                      <SelectItem value="no-decimals">{t('currencyNoDecimals')}</SelectItem>
                      <SelectItem value="compact">{t('currencyCompact')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Preview */}
                  <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('bankAccountPreview')}:</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {prefs.currencyFormat === 'full' && 'kr. 12.345,67'}
                      {prefs.currencyFormat === 'no-decimals' && 'kr. 12.346'}
                      {prefs.currencyFormat === 'compact' && '12.346 kr'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ OVERSIGHT TAB ═══ */}
        {(user.isSuperDev || (!user.hasAppOwner && user.activeCompanyName?.startsWith('AlphaAi'))) && (
          <TabsContent value="oversight" className="border-l-4 border-amber-400 dark:border-amber-600 pl-4">
            <OversightSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
