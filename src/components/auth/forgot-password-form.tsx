'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { isDanish } = useTranslation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || (isDanish ? 'Der opstod en fejl. Prøv igen.' : 'An error occurred. Please try again.'));
          return;
        }

        // Always show success (anti-enumeration)
        setIsSuccess(true);
      } catch {
        setError(isDanish ? 'Der opstod en fejl. Prøv igen.' : 'An error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [email, isDanish]
  );

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-[#0d9488]" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isDanish ? 'Email sendt' : 'Email sent'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isDanish
              ? 'Hvis emailen findes, har vi sendt en link til nulstilling af kodeord'
              : 'If the email exists, we\'ve sent a password reset link'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onBackToLogin}
          className="w-full h-11 gap-2 text-[#0d9488] border-[#0d9488]/30 hover:bg-[#0d9488]/5 transition-all duration-200"
        >
          <ArrowLeft className="h-4 w-4" />
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
        <Label htmlFor="forgot-email" className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          {isDanish ? 'E-mail' : 'Email'}
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            id="forgot-email"
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

      <Button
        type="submit"
        className="w-full h-11 btn-primary text-white font-medium text-sm"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isDanish ? 'Sender...' : 'Sending...'}
          </>
        ) : (
          <>
            {isDanish ? 'Send nulstillingslink' : 'Send reset link'}
            <Mail className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={onBackToLogin}
        className="w-full h-11 gap-2 text-gray-600 dark:text-gray-400 hover:text-[#0d9488] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {isDanish ? 'Tilbage til login' : 'Back to login'}
      </Button>
    </form>
  );
}
