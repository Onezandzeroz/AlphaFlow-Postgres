'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface MobileFilterDropdownProps {
  children: React.ReactNode;
  activeFilterCount: number;
  language?: string;
  onClearFilters?: () => void;
  clearLabel?: string;
}

export function MobileFilterDropdown({
  children,
  activeFilterCount,
  language = 'da',
  onClearFilters,
  clearLabel,
}: MobileFilterDropdownProps) {
  return (
    <div className="flex items-center gap-2 flex-1 flex-wrap">
      {children}
      {onClearFilters && activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 gap-1"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {clearLabel || (language === 'da' ? 'Ryd filtre' : 'Clear filters')}
          </span>
        </Button>
      )}
    </div>
  );
}
