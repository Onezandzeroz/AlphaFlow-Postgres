'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

interface CategorizationSuggestion {
  accountNumber: string | null;
  accountName: string | null;
  accountNameEn?: string;
  confidence: number;
  matchedKeywords?: string[];
}

interface CategorizationBadgeProps {
  description: string;
  onApply?: (suggestion: CategorizationSuggestion) => void;
  compact?: boolean;
}

export function CategorizationBadge({ description, onApply, compact = false }: CategorizationBadgeProps) {
  const [suggestion, setSuggestion] = useState<CategorizationSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const { language } = useTranslation();

  const fetchSuggestion = useCallback(async () => {
    if (!description?.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.accountNumber && data.confidence > 0) {
          setSuggestion({
            accountNumber: data.accountNumber,
            accountName: data.accountName,
            confidence: data.confidence,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch categorization suggestion:', error);
    } finally {
      setIsLoading(false);
    }
  }, [description]);

  useEffect(() => {
    fetchSuggestion();
  }, [fetchSuggestion]);

  if (isLoading) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 gap-1"
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        {!compact && (language === 'da' ? 'Analyserer...' : 'Analyzing...')}
      </Badge>
    );
  }

  if (!suggestion || !suggestion.accountNumber) return null;

  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceColor =
    confidencePercent >= 85
      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800'
      : confidencePercent >= 60
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700';

  if (isApplied) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0.5 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 gap-1"
      >
        <Sparkles className="h-2.5 w-2.5" />
        {suggestion.accountNumber} {language === 'da' ? suggestion.accountName : (suggestion.accountNameEn || suggestion.accountName)}
      </Badge>
    );
  }

  const badgeContent = (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0.5 gap-1 cursor-pointer hover:opacity-80 transition-opacity ${confidenceColor}`}
      onClick={(e) => {
        e.stopPropagation();
        if (onApply) {
          onApply(suggestion);
          setIsApplied(true);
        }
      }}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {suggestion.accountNumber} {!compact && (language === 'da' ? suggestion.accountName : (suggestion.accountNameEn || suggestion.accountName))}
      <span className="opacity-60 ml-0.5">{confidencePercent}%</span>
    </Badge>
  );

  if (compact && !onApply) {
    return badgeContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          <div className="space-y-1">
            <p className="text-xs font-medium">
              {language === 'da' ? 'AI-kategorisering' : 'AI Categorization'}
            </p>
            <p className="text-[10px] text-gray-400">
              {language === 'da' ? suggestion.accountName : (suggestion.accountNameEn || suggestion.accountName)} ({suggestion.accountNumber})
            </p>
            <p className="text-[10px] text-gray-400">
              {language === 'da' ? 'Sikkerhed' : 'Confidence'}: {confidencePercent}%
            </p>
            {suggestion.matchedKeywords && suggestion.matchedKeywords.length > 0 && (
              <p className="text-[10px] text-gray-400">
                {language === 'da' ? 'Matchede nøgleord' : 'Matched keywords'}: {suggestion.matchedKeywords.join(', ')}
              </p>
            )}
            {onApply && (
              <p className="text-[10px] text-[#0d9488] dark:text-[#2dd4bf] font-medium">
                {language === 'da' ? 'Klik for at anvende' : 'Click to apply'}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Batch categorization component for showing suggestions on multiple transactions at once.
 * Used in the dashboard widget.
 */
export function CategorizationSuggestionsList({ descriptions }: { descriptions: string[] }) {
  const [results, setResults] = useState<Array<{
    description: string;
    suggestions: CategorizationSuggestion[];
    hasMatch: boolean;
  }> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { language } = useTranslation();

  const fetchSuggestions = useCallback(async () => {
    if (descriptions.length === 0) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptions }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch (error) {
      console.error('Failed to fetch categorization suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [descriptions]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-[#0d9488]" />
      </div>
    );
  }

  if (!results) return null;

  const matchedResults = results.filter(r => r.hasMatch);

  if (matchedResults.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {matchedResults.slice(0, 5).map((result, idx) => {
        const top = result.suggestions[0];
        if (!top) return null;
        const confidencePercent = Math.round(top.confidence * 100);
        return (
          <div
            key={idx}
            className="flex items-center gap-2 p-2 rounded-lg bg-gray-50/80 dark:bg-gray-800/50 text-xs"
          >
            <Sparkles className="h-3 w-3 text-[#0d9488] dark:text-[#2dd4bf] shrink-0" />
            <span className="flex-1 truncate text-gray-600 dark:text-gray-400 min-w-0">
              {result.description}
            </span>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 shrink-0 bg-[#f0fdf9] dark:bg-[#1a2e2b] border-[#0d9488]/20 dark:border-[#2dd4bf]/20 text-[#0d9488] dark:text-[#2dd4bf] gap-0.5"
            >
              {top.accountNumber} {language === 'da' ? top.accountName : top.accountNameEn}
              <span className="opacity-60 ml-0.5">{confidencePercent}%</span>
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
