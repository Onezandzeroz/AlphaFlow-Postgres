'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Mail, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';

export function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user);
  const { isDanish } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSentAt, setEmailSentAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Check rate limiting: once per 60 seconds
  const [canSend, setCanSend] = useState(true);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (!emailSentAt) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - emailSentAt) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        setCanSend(true);
        setEmailSent(false);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [emailSentAt]);

  const handleSendVerification = useCallback(async () => {
    if (!canSend || isLoading) return;
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        // Rate limited by server
        if (response.status === 429) {
          setError(isDanish ? 'Vent et øjeblik' : 'Wait a moment');
          setCanSend(false);
          setEmailSentAt(Date.now());
          setCooldownRemaining(60);
        } else {
          setError(data.error || (isDanish ? 'Der opstod en fejl' : 'An error occurred'));
        }
        return;
      }

      setEmailSent(true);
      setEmailSentAt(Date.now());
      setCanSend(false);
      setCooldownRemaining(60);
    } catch {
      setError(isDanish ? 'Der opstod en fejl' : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [canSend, isLoading, isDanish]);

  // Don't render if user is verified, not logged in, dismissed, or is AppOwner (SuperDev)
  if (!user || user.emailVerified || user.isSuperDev || dismissed) return null;

  return (
    <div className="bg-teal-50 dark:bg-teal-950/20 border-b border-teal-200 dark:border-teal-800/40">
      <div className="max-w-full px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <AlertTriangle className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <p className="text-sm text-slate-800 dark:text-slate-200 truncate">
            {isDanish
              ? 'Din emailadresse er ikke bekræftet. Tjek din indbakke eller send en ny bekræftelses-email.'
              : 'Your email address is not verified. Check your inbox or send a new verification email.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {emailSent ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 px-2.5 py-1 rounded-full">
              <CheckCircle className="h-3 w-3" />
              {isDanish ? 'Email sendt!' : 'Email sent!'}
              {cooldownRemaining > 0 && (
                <span className="text-teal-600 dark:text-teal-500">({cooldownRemaining}s)</span>
              )}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSendVerification}
              disabled={isLoading || !canSend}
              className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 bg-teal-100 dark:bg-teal-900/30 hover:bg-teal-200 dark:hover:bg-teal-900/50 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : !canSend ? (
                <Mail className="h-3 w-3" />
              ) : (
                <Mail className="h-3 w-3" />
              )}
              {isLoading
                ? (isDanish ? 'Sender...' : 'Sending...')
                : !canSend
                  ? (isDanish ? `Vent ${cooldownRemaining}s` : `Wait ${cooldownRemaining}s`)
                  : (isDanish ? 'Send bekræftelses-email' : 'Send verification email')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-teal-400 hover:text-teal-600 dark:hover:text-teal-300 transition-colors"
            aria-label={isDanish ? 'Luk' : 'Dismiss'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">{error}</p>
        </div>
      )}
    </div>
  );
}
