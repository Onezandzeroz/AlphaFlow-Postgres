'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLanguageStore } from '@/lib/language-store';
import {
  Command,
  Search,
  FileText,
  Receipt,
  BarChart3,
  Settings,
  Moon,
  Sun,
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Keyboard,
  X,
} from 'lucide-react';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (view: string) => void;
}

interface ShortcutGroup {
  title: string;
  titleDa: string;
  shortcuts: {
    keys: string[];
    description: string;
    descriptionDa: string;
    icon: React.ElementType;
    action?: () => void;
  }[];
}

export function KeyboardShortcutsModal({ open, onOpenChange, onNavigate }: KeyboardShortcutsModalProps) {
  const { language } = useLanguageStore();

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Navigation',
      titleDa: 'Navigation',
      shortcuts: [
        {
          keys: ['⌘', 'K'],
          description: 'Open command palette',
          descriptionDa: 'Åbn kommandopalette',
          icon: Command,
        },
        {
          keys: ['?'],
          description: 'Show keyboard shortcuts',
          descriptionDa: 'Vis tastaturgenveje',
          icon: Keyboard,
        },
        {
          keys: ['Alt', '←'],
          description: 'Go back',
          descriptionDa: 'Gå tilbage',
          icon: ArrowLeft,
          action: () => window.history.back(),
        },
        {
          keys: ['Alt', '→'],
          description: 'Go forward',
          descriptionDa: 'Gå fremad',
          icon: ArrowRight,
          action: () => window.history.forward(),
        },
      ],
    },
    {
      title: 'Quick Actions',
      titleDa: 'Hurtige handlinger',
      shortcuts: [
        {
          keys: ['⌘', 'T'],
          description: 'New purchase',
          descriptionDa: 'Nyt indkøb',
          icon: Receipt,
          action: () => onNavigate?.('transactions'),
        },
        {
          keys: ['⌘', 'I'],
          description: 'Go to sales & invoices',
          descriptionDa: 'Gå til salg & faktura',
          icon: FileText,
          action: () => onNavigate?.('invoices'),
        },
        {
          keys: ['⌘', 'D'],
          description: 'Go to dashboard',
          descriptionDa: 'Gå til dashboard',
          icon: BarChart3,
          action: () => onNavigate?.('dashboard'),
        },
        {
          keys: ['⌘', ','],
          description: 'Open settings',
          descriptionDa: 'Åbn indstillinger',
          icon: Settings,
          action: () => onNavigate?.('settings'),
        },
      ],
    },
    {
      title: 'Quick Navigation (Alt)',
      titleDa: 'Hurtig navigation (Alt)',
      shortcuts: [
        {
          keys: ['Alt', 'N'],
          description: 'New purchase',
          descriptionDa: 'Nyt indkøb',
          icon: Receipt,
          action: () => onNavigate?.('transactions'),
        },
        {
          keys: ['Alt', 'I'],
          description: 'Go to sales & invoices',
          descriptionDa: 'Gå til salg & faktura',
          icon: FileText,
          action: () => onNavigate?.('invoices'),
        },
        {
          keys: ['Alt', 'R'],
          description: 'Go to reports',
          descriptionDa: 'Gå til rapporter',
          icon: BarChart3,
          action: () => onNavigate?.('reports'),
        },
        {
          keys: ['Alt', 'V'],
          description: 'Go to VAT report',
          descriptionDa: 'Gå til momsafregning',
          icon: BarChart3,
          action: () => onNavigate?.('vat-report'),
        },
      ],
    },
    {
      title: 'Appearance',
      titleDa: 'Udseende',
      shortcuts: [
        {
          keys: ['⌘', 'D'],
          description: 'Toggle dark mode',
          descriptionDa: 'Skift mørkt tilstand',
          icon: Moon,
          action: () => {
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'light' : 'dark');
            document.documentElement.classList.toggle('dark', !isDark);
            window.dispatchEvent(new StorageEvent('storage'));
          },
        },
      ],
    },
    {
      title: 'Dialogs',
      titleDa: 'Dialoger',
      shortcuts: [
        {
          keys: ['Esc'],
          description: 'Close topmost dialog',
          descriptionDa: 'Luk øverste dialog',
          icon: X,
        },
      ],
    },
  ];

  const handleShortcutClick = (action?: () => void) => {
    if (action) {
      action();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-[#1a1f1e] border border-[#e2e8e6] dark:border-[#2a3330] max-w-lg">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-[#0d9488] dark:text-[#2dd4bf]" />
            {language === 'da' ? 'Tastaturgenveje' : 'Keyboard Shortcuts'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {language === 'da'
              ? 'Brug disse genveje til at navigere hurtigere'
              : 'Use these shortcuts to navigate faster'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {shortcutGroups.map((group, groupIdx) => (
            <div key={groupIdx}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                {language === 'da' ? group.titleDa : group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut, idx) => {
                  const Icon = shortcut.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleShortcutClick(shortcut.action)}
                      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-150 text-left ${
                        shortcut.action
                          ? 'hover:bg-[#f0fdf9] dark:hover:bg-[#1a2e2b] cursor-pointer'
                          : 'cursor-default'
                      }`}
                    >
                      <div className="h-8 w-8 rounded-lg bg-[#f0fdf9] dark:bg-[#1a2e2b] flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                      </div>
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                        {language === 'da' ? shortcut.descriptionDa : shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIdx) => (
                          <span key={keyIdx}>
                            <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-gray-200 dark:border-[#2a3330] bg-gray-50 dark:bg-[#242e26] px-1.5 font-mono text-[11px] font-medium text-gray-500 dark:text-gray-400">
                              {key}
                            </kbd>
                            {keyIdx < shortcut.keys.length - 1 && (
                              <span className="text-gray-400 dark:text-gray-600 mx-0.5 text-xs">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-[#2a3330] text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {language === 'da'
              ? 'Tip: Tryk ? når som helst for at åbne denne menu'
              : 'Tip: Press ? anytime to open this menu'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
