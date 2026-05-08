'use client';

import { useState, useCallback } from 'react';
import { Plus, FileText, Camera, UserPlus } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { useTranslation } from '@/lib/use-translation';

interface MobileFabProps {
  onNavigate: (view: string) => void;
  onAddTransaction: () => void;
  onCreateInvoice?: () => void;
  onCreateContact?: () => void;
}

export function MobileFab({ onNavigate, onAddTransaction, onCreateInvoice, onCreateContact }: MobileFabProps) {
  const [open, setOpen] = useState(false);
  const { language } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleAction = useCallback(
    (view: string) => {
      setOpen(false);
      if (view === 'transactions') {
        onAddTransaction();
      } else if (view === 'invoices' && onCreateInvoice) {
        onCreateInvoice();
      } else if (view === 'contacts' && onCreateContact) {
        onCreateContact();
      } else {
        onNavigate(view);
      }
    },
    [onNavigate, onAddTransaction, onCreateInvoice, onCreateContact]
  );

  const cardClass = `rounded-2xl border p-4 transition-all duration-200 hover:shadow-md active:scale-[0.98] group ${
    isDark
      ? 'bg-[#2a2f2e]/80 border-[#3a4543]/60 hover:bg-[#2a2f2e]'
      : 'bg-white/80 border-white/50 hover:bg-white'
  }`;

  const labelClass = isDark ? 'text-[#e2e8e6]' : 'text-[#1a1d1c]';
  const sublabelClass = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <>
      {/* FAB Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-8 left-1/2 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 ease-out hover:scale-105 hover:shadow-xl active:scale-95 animate-[fab-bounce_3s_ease-in-out_infinite]"
        style={{
          background: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)',
          boxShadow:
            '0 4px 16px rgba(13, 148, 136, 0.35), 0 0 0 0 rgba(13, 148, 136, 0)',
        }}
        aria-label={language === 'da' ? 'Hurtige handlinger' : 'Quick actions'}
      >
        <Plus className="h-6 w-6 transition-transform duration-300" />
      </button>

      {/* Action Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-3xl p-0 max-h-[60vh] !bg-transparent border-none"
          overlayClassName="!bg-black/25"
          hideClose
          style={{
            backgroundColor: isDark ? 'rgba(20, 25, 24, 0.20)' : 'rgba(255, 255, 255, 0.35)',
            backdropFilter: 'blur(28px) saturate(200%)',
            WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          }}
        >
          {/* Accessible title — visually hidden */}
          <SheetTitle className="sr-only">
            {language === 'da' ? 'Hurtige handlinger' : 'Quick Actions'}
          </SheetTitle>

          {/* Drag handle indicator */}
          <div className="flex justify-center pt-3 pb-1">
            <div className={`h-1.5 w-10 rounded-full ${isDark ? 'bg-gray-500/60' : 'bg-gray-400/60'}`} />
          </div>

          {/* Action cards */}
          <div className="px-4 pb-8 space-y-3">
            {/* Ny kontakt — full width */}
            <button
              type="button"
              onClick={() => handleAction('contacts')}
              className={`w-full flex items-center gap-4 text-left ${cardClass}`}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-200 group-hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)',
                }}
              >
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${labelClass}`}>
                  {language === 'da' ? 'Ny kontakt' : 'New Contact'}
                </p>
                <p className={`text-xs mt-0.5 ${sublabelClass}`}>
                  {language === 'da' ? 'Opret ny kunde eller leverandør' : 'Create new customer or supplier'}
                </p>
              </div>
            </button>

            {/* Scan bilag + Ny faktura — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleAction('transactions')}
                className={`flex flex-col items-center gap-2.5 text-center ${cardClass}`}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-200 group-hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)',
                  }}
                >
                  <Camera className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${labelClass}`}>
                    {language === 'da' ? 'Scan bilag' : 'Scan Receipt'}
                  </p>
                  <p className={`text-[11px] mt-0.5 leading-tight ${sublabelClass}`}>
                    {language === 'da' ? 'Foto eller upload' : 'Photo or upload'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleAction('invoices')}
                className={`flex flex-col items-center gap-2.5 text-center ${cardClass}`}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-200 group-hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)',
                  }}
                >
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${labelClass}`}>
                    {language === 'da' ? 'Ny faktura' : 'New Invoice'}
                  </p>
                  <p className={`text-[11px] mt-0.5 leading-tight ${sublabelClass}`}>
                    {language === 'da' ? 'Opret og send' : 'Create and send'}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
