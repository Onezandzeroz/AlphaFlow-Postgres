'use client';

import { useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, CheckCircle, ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

interface ResetPasswordFormProps {
  onBackToLogin: () => void;
}

export function ResetPasswordForm({ onBackToLogin }: ResetPasswordFormProps) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { isDanish } = useTranslation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (password.length < 6) {
        setError(isDanish ? 'Adgangskode skal være mindst 6 tegn' : 'Password must be at least 6 characters');
        return;
      }

      if (password !== confirmPassword) {
        setError(isDanish ? 'Adgangskoder matcher ikke' : 'Passwords do not match');
        return;
      }

      if (!token) {
        setError(isDanish ? 'Ugyldigt eller manglende token' : 'Invalid or missing token');
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || (isDanish ? 'Der opstod en fejl. Prøv igen.' : 'An error occurred. Please try again.'));
          return;
        }

        setIsSuccess(true);
      } catch {
        setError(isDanish ? 'Der opstod en fejl. Prøv igen.' : 'An error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [password, confirmPassword, token, isDanish]
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
            {isDanish ? 'Kodeord nulstillet' : 'Password reset'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isDanish
              ? 'Dit kodeord er blevet ændret. Du kan nu logge ind med dit nye kodeord.'
              : 'Your password has been changed. You can now sign in with your new password.'}
          </p>
        </div>
        <Button
          type="button"
          onClick={onBackToLogin}
          className="w-full h-11 btn-primary text-white font-medium text-sm"
        >
          {isDanish ? 'Gå til login' : 'Go to login'}
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

      {!token && (
        <div className="p-3 text-sm text-amber-600 bg-amber-50/80 rounded-xl border border-amber-200/60">
          {isDanish
            ? 'Ugyldigt eller manglende nulstillingstoken. Prøv at bruge linket fra din email igen.'
            : 'Invalid or missing reset token. Please try using the link from your email again.'}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="new-password" className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          {isDanish ? 'Nyt adgangskode' : 'New Password'}
        </Label>
        <div className="relative">
          <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            id="new-password"
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

      <div className="space-y-2">
        <Label htmlFor="confirm-new-password" className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          {isDanish ? 'Bekræft adgangskode' : 'Confirm Password'}
        </Label>
        <div className="relative">
          <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            id="confirm-new-password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            className="pl-10 login-input-teal h-11 bg-white/60 transition-all duration-200"
          />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-11 btn-primary text-white font-medium text-sm"
        disabled={isLoading || !token}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isDanish ? 'Nulstiller...' : 'Resetting...'}
          </>
        ) : (
          <>
            {isDanish ? 'Nulstil kodeord' : 'Reset Password'}
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
