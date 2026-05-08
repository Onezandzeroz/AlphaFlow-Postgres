'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveCheckbox } from '@/components/ui/responsive-checkbox';
import { Loader2, ArrowRight, Shield, Lock, Zap, Mail, ArrowLeft, Check } from 'lucide-react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

// ─── Resend Verification sub-component ───
function ResendVerificationButton({ email }: { email: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const isDanish = typeof navigator !== 'undefined' && (navigator.language || '').startsWith('da');

  const handleResend = useCallback(async () => {
    if (isLoading || sent) return;
    setIsLoading(true);
    try {
      // Use a direct API call since user isn't authenticated yet
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setSent(true);
        setCooldown(60);
        const interval = setInterval(() => {
          setCooldown((prev) => {
            if (prev <= 1) { clearInterval(interval); return 0; }
            return prev - 1;
          });
        }, 1000);
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [isLoading, sent, email]);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 font-medium text-sm border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800 transition-colors"
      disabled={isLoading || sent}
      onClick={handleResend}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : sent ? (
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Mail className="mr-2 h-4 w-4" />
      )}
      {sent
        ? (isDanish ? `E-mail sendt!${cooldown > 0 ? ` (${cooldown}s)` : ''}` : `Email sent!${cooldown > 0 ? ` (${cooldown}s)` : ''}`)
        : (isDanish ? 'Send bekræftelses-e-mail igen' : 'Resend verification email')}
    </Button>
  );
}

interface LoginFormProps {
  onSuccess: (user: User) => void;
  onSwitchToRegister: () => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [needsVerification, setNeedsVerification] = useState<{ email: string } | null>(null);
  const { t, isDanish } = useTranslation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          // Check if login was blocked due to unverified email
          if (response.status === 403 && data.needsVerification) {
            setNeedsVerification({ email: data.email });
            return;
          }
          setError(data.error || t('loginFailed'));
          return;
        }

        onSuccess(data.user);
      } catch {
        setError(t('anErrorOccurred'));
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, onSuccess, t]
  );

  if (showForgotPassword) {
    return <ForgotPasswordForm onBackToLogin={() => setShowForgotPassword(false)} />;
  }

  // ─── Needs Verification screen ───
  if (needsVerification) {
    return (
      <div className="space-y-5 py-2">
        {/* Warning icon */}
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-teal-50 flex items-center justify-center">
            <Mail className="h-8 w-8 text-teal-600" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">
            {isDanish ? 'Bekræft din e-mail' : 'Verify your email'}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            {isDanish
              ? 'Din konto er ikke bekræftet endnu. Tjek din e-mail og klik på bekræftelseslinket.'
              : 'Your account is not verified yet. Check your email and click the verification link.'}
          </p>
        </div>

        {/* Email card */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-center">
          <p className="text-sm font-semibold text-teal-800 break-all">{needsVerification.email}</p>
        </div>

        {/* Info note */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            {isDanish
              ? 'Du skal bekræfte din e-mailadresse, før du kan logge ind. Find bekræftelses-e-mailen i din indbakke (eller spam-mappe) og klik på linket.'
              : 'You must verify your email address before logging in. Find the verification email in your inbox (or spam folder) and click the link.'}
          </p>
        </div>

        {/* Resend verification button */}
        <ResendVerificationButton email={needsVerification.email} />

        {/* Back to login button */}
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 font-medium text-sm border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800 transition-colors"
          onClick={() => { setNeedsVerification(null); setError(''); }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isDanish ? 'Tilbage til login' : 'Back to login'}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50/80 rounded-xl border border-red-200/60">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          {t('email')}
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="pl-10 login-input-teal h-11 bg-white/60 transition-all duration-200"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          {t('password')}
        </Label>
        <div className="relative">
          <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="pl-10 login-input-teal h-11 bg-white/60 transition-all duration-200"
          />
        </div>
      </div>

      {/* Remember me checkbox */}
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2.5 cursor-pointer group min-h-[44px]">
          <ResponsiveCheckbox
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked)}
            className="h-[18px] w-[18px] rounded-[5px] border-2 border-gray-300 data-[state=checked]:bg-[#0d9488] data-[state=checked]:border-[#0d9488] data-[state=unchecked]:bg-white data-[state=unchecked]:hover:border-[#0d9488]/50 transition-all duration-150"
          />
          <span className="text-[13px] text-gray-600 group-hover:text-gray-800 transition-colors select-none leading-none">
            {'Husk mig'}
          </span>
        </label>
        <button
          type="button"
          onClick={() => setShowForgotPassword(true)}
          className="text-[13px] text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors whitespace-nowrap leading-none"
        >
          {'Glemt kode?'}
        </button>
      </div>

      <Button
        type="submit"
        className="w-full h-11 btn-primary text-white font-medium text-sm"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('signingIn')}
          </>
        ) : (
          <>
            {t('signIn')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      {/* Trust indicators */}
      <div className="flex items-center justify-center gap-4 pt-1">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50/60 dark:bg-white/5 px-2.5 py-1 rounded-full border border-gray-200/40 dark:border-gray-700">
          <Shield className="h-3 w-3 text-[#0d9488]" />
          <span>GDPR-kompatibel</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50/60 dark:bg-white/5 px-2.5 py-1 rounded-full border border-gray-200/40 dark:border-gray-700">
          <Lock className="h-3 w-3 text-[#0d9488]" />
          <span>SSL-krypteret</span>
        </div>
      </div>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200/60"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="px-2 text-gray-400 dark:text-gray-500 bg-transparent">
            {t('or')}
          </span>
        </div>
      </div>
      <p className="text-sm text-center text-gray-600 dark:text-gray-300">
        {t('noAccount')}{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors"
        >
          {t('createOne')}
        </button>
      </p>
    </form>
  );
}
