'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

interface VerifyEmailScreenProps {
  token: string;
  onGoToLogin: () => void;
}

export function VerifyEmailScreen({ token, onGoToLogin }: VerifyEmailScreenProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const { isDanish } = useTranslation();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    (async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (cancelled) return;

        let data: Record<string, unknown>;
        try {
          data = await response.json();
        } catch {
          // Response body was not valid JSON
          setStatus('error');
          setErrorMessage(isDanish ? 'Uventet svar fra serveren.' : 'Unexpected server response.');
          return;
        }

        if (cancelled) return;

        if (response.ok) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMessage((data.error as string) || (isDanish ? 'Kunne ikke bekræfte e-mail' : 'Could not verify email'));
        }
      } catch (err) {
        clearTimeout(timeout);
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          setStatus('error');
          setErrorMessage(isDanish ? 'Forespørgsel tog for lang tid. Prøv igen.' : 'Request timed out. Please try again.');
        } else {
          setStatus('error');
          setErrorMessage(isDanish ? 'Netværksfejl. Prøv igen.' : 'Network error. Please try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [token, isDanish]);

  return (
    <div className="w-full max-w-md flex flex-col items-center">
      <div className="w-full relative">
        {/* Top accent bar */}
        <div className="login-accent-bar" />
        <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-6 border border-white/60 overflow-hidden">
          {status === 'loading' && (
            <div className="space-y-5 py-6 text-center">
              <div className="flex justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
              </div>
              <p className="text-sm text-slate-600">
                {isDanish ? 'Bekræfter din e-mailadresse...' : 'Verifying your email address...'}
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-5 py-2">
              {/* Success icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full bg-teal-50 flex items-center justify-center">
                    <CheckCircle className="h-9 w-9 text-teal-600" />
                  </div>
                </div>
              </div>

              {/* Heading */}
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {isDanish ? 'E-mail bekræftet!' : 'Email verified!'}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {isDanish
                    ? 'Din e-mailadresse er nu bekræftet. Du kan logge ind.'
                    : 'Your email address has been verified. You can now log in.'}
                </p>
              </div>

              {/* Info card */}
              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                <p className="text-xs text-teal-800 leading-relaxed">
                  {isDanish
                    ? 'Din konto er klar. Klik på knappen herunder for at logge ind og komme i gang med AlphaFlow.'
                    : 'Your account is ready. Click the button below to log in and get started with AlphaFlow.'}
                </p>
              </div>

              {/* Login button */}
              <button
                type="button"
                className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                onClick={onGoToLogin}
              >
                {isDanish ? 'Log ind' : 'Log in'}
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-5 py-2">
              {/* Error icon */}
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <XCircle className="h-9 w-9 text-slate-500" />
                </div>
              </div>

              {/* Heading */}
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {isDanish ? 'Kunne ikke bekræfte' : 'Verification failed'}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {errorMessage || (isDanish
                    ? 'Bekræftelseslinket er ugyldigt eller udløbet.'
                    : 'The verification link is invalid or expired.')}
                </p>
              </div>

              {/* Info card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isDanish
                    ? 'Prøv at logge ind — hvis din e-mail ikke er bekræftet, kan du sende en ny bekræftelses-e-mail.'
                    : 'Try logging in — if your email is not verified, you can request a new verification email.'}
                </p>
              </div>

              {/* Back to login button */}
              <button
                type="button"
                className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                onClick={onGoToLogin}
              >
                {isDanish ? 'Tilbage til login' : 'Back to login'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
