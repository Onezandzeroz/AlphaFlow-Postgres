'use client';

import { useLanguageStore } from '@/lib/language-store';
import {
  LayoutDashboard,
  List,
  FileText,
  BarChart3,
} from 'lucide-react';

type View = 'dashboard' | 'transactions' | 'invoices' | 'reports' | 'settings' | 'vat-report' | 'exports' | 'backups' | 'audit-log' | 'accounts' | 'journal' | 'contacts' | 'periods' | 'ledger' | 'bank-recon' | 'year-end' | 'aging' | 'cash-flow' | 'recurring' | 'budget' | 'settings-company';

interface MobileBottomNavProps {
  currentView: string;
  onViewChange: (view: View) => void;
}

interface NavItem {
  key: View;
  labelDa: string;
  labelEn: string;
  icon: React.ElementType;
  matchViews: string[];
}

const navItems: NavItem[] = [
  {
    key: 'dashboard',
    labelDa: 'Dashboard',
    labelEn: 'Dashboard',
    icon: LayoutDashboard,
    matchViews: ['dashboard'],
  },
  {
    key: 'transactions',
    labelDa: 'Indkøb & Kvittering',
    labelEn: 'Purchases & Receipts',
    icon: List,
    matchViews: ['transactions', 'bank-recon', 'recurring'],
  },
  {
    key: 'invoices',
    labelDa: 'Salg & Faktura',
    labelEn: 'Sales & Invoice',
    icon: FileText,
    matchViews: ['invoices'],
  },
  {
    key: 'reports',
    labelDa: 'Rapporter',
    labelEn: 'Reports',
    icon: BarChart3,
    matchViews: ['reports', 'vat-report', 'ledger', 'cash-flow', 'aging', 'exports', 'journal', 'year-end'],
  },
];

export function MobileBottomNav({ currentView, onViewChange }: MobileBottomNavProps) {
  const { language } = useLanguageStore();

  const getIsActive = (item: NavItem) => {
    return item.matchViews.includes(currentView);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden safe-area-bottom">
      <div className="bg-white/80 dark:bg-[#141918]/80 backdrop-blur-2xl shadow-[0_-1px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-1px_12px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-around h-[60px] px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = getIsActive(item);

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onViewChange(item.key)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-200 relative group rounded-xl mx-1 my-1.5 ${
                  isActive
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0d9488] dark:text-[#2dd4bf]'
                    : 'text-gray-500 dark:text-gray-500 active:text-[#0d9488] dark:active:text-[#2dd4bf]'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-all duration-200 ${
                    isActive ? 'scale-110' : 'group-active:scale-105'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span className={`text-[10px] font-medium transition-all duration-200 ${
                  isActive ? 'text-[#0d9488] dark:text-[#2dd4bf] font-semibold' : ''
                }`}>
                  {language === 'da' ? item.labelDa : item.labelEn}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
