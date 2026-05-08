'use client';

import { useAuthStore, CompanyInfo } from '@/lib/auth-store';
import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';

export function CompanySelector() {
  const user = useAuthStore(state => state.user);
  const switchCompany = useAuthStore(state => state.switchCompany);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const companies = (user?.companies || []).filter(c => !c.isDemo);
  const activeCompanyId = user?.activeCompanyId;
  const activeCompanyName = user?.activeCompanyName;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If user only has one company, show just the name (no dropdown)
  if (companies.length <= 1 && !user?.isSuperDev) {
    return (
      <div className="px-4 py-2 border-b border-[#e2e8e6] dark:border-[#2a3330]">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1a2e2a] dark:text-[#e2e8e6]">
          <Building2 className="h-4 w-4 text-[#0d9488] shrink-0" />
          <span className="truncate">{activeCompanyName || 'No Company'}</span>
          {user?.isDemoCompany && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              Demo
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 border-b border-[#e2e8e6] dark:border-[#2a3330]" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-sm font-medium text-[#1a2e2a] dark:text-[#e2e8e6] hover:text-[#0d9488] transition-colors rounded-md px-2 py-1.5 -mx-2 hover:bg-[#f0f7f5] dark:hover:bg-[#1a2520]"
      >
        <Building2 className="h-4 w-4 text-[#0d9488] shrink-0" />
        <span className="truncate flex-1 text-left">{activeCompanyName || 'Select Company'}</span>
        {user?.isDemoCompany && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 uppercase tracking-wider shrink-0">
            Demo
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-[#6b7c75] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 -mx-2 bg-white dark:bg-[#1a2520] rounded-md border border-[#e2e8e6] dark:border-[#2a3330] shadow-lg z-50 overflow-hidden">
          {companies.map((company: CompanyInfo) => (
            <button
              key={company.id}
              type="button"
              onClick={() => {
                if (company.id !== activeCompanyId) {
                  switchCompany(company.id);
                }
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#f0f7f5] dark:hover:bg-[#222e2a] transition-colors ${
                company.id === activeCompanyId ? 'bg-[#f0f7f5] dark:bg-[#1a2e28] text-[#0d9488]' : 'text-[#1a2e2a] dark:text-[#e2e8e6]'
              }`}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1">{company.name}</span>
              {company.id === activeCompanyId && (
                <Check className="h-3.5 w-3.5 text-[#0d9488] shrink-0" />
              )}
              <span className="text-[10px] text-[#6b7c75] uppercase tracking-wider">{company.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
