'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
} from 'recharts';

interface CashFlowForecastData {
  historical: Array<{
    month: string;
    revenue: number;
    expenses: number;
    net: number;
    label: string;
    isActual: boolean;
  }>;
  last3Months: Array<{
    month: string;
    revenue: number;
    expenses: number;
    net: number;
    label: string;
    isActual: boolean;
    index: number;
  }>;
  projected: {
    month: string;
    revenue: number;
    expenses: number;
    net: number;
    label: string;
    isActual: boolean;
  } | null;
  chartData: Array<{
    month: string;
    revenue: number;
    expenses: number;
    net: number;
    label: string;
    isActual: boolean;
  }>;
  summary: {
    avgRevenue: number;
    avgExpenses: number;
    revenueTrend: number;
    expenseTrend: number;
    projectedNet: number;
    confidence: 'high' | 'medium' | 'low';
    dataPoints: number;
  } | null;
}

interface CashFlowForecastProps {
  dateRange: { from: Date; to: Date } | null;
}

export function CashFlowForecast({ dateRange: _dateRange }: CashFlowForecastProps) {
  const [data, setData] = useState<CashFlowForecastData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { tc, language } = useTranslation();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/cash-flow-forecast');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch cash flow forecast:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <Card className="stat-card">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#0d9488]" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.projected || !data.summary) return null;

  const { projected, chartData, summary } = data;

  const confidenceConfig = {
    high: {
      label: language === 'da' ? 'Høj sikkerhed' : 'High confidence',
      bgClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    },
    medium: {
      label: language === 'da' ? 'Moderat sikkerhed' : 'Medium confidence',
      bgClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
    low: {
      label: language === 'da' ? 'Lav sikkerhed' : 'Low confidence',
      bgClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    },
  };

  const confidence = confidenceConfig[summary.confidence];

  const CustomTooltip = ({ active, payload, label: tooltipLabel }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 min-w-[140px]">
        {tooltipLabel && (
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tooltipLabel}</p>
        )}
        {payload.map((item, idx) => {
          const nameMap: Record<string, string> = {
            revenue: language === 'da' ? 'Indtægter' : 'Revenue',
            expenses: language === 'da' ? 'Omkostninger' : 'Expenses',
          };
          return (
            <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                {nameMap[item.name] || item.name}
              </span>
              <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                {tc(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="stat-card overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#edf4f7] dark:bg-[#242c30] flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-[#7dabb5] dark:text-[#80c0cc]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                {language === 'da' ? 'Likviditetsprognose' : 'Cash Flow Forecast'}
                <Sparkles className="h-3 w-3 text-[#0d9488] dark:text-[#2dd4bf]" />
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {language === 'da' ? 'Projektion baseret på historik' : 'Projection based on historical patterns'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${confidence.bgClass} text-[9px] px-1.5 py-0.5`}>
              {confidence.label}
            </Badge>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[250px]">
                  <p className="text-xs">
                    {language === 'da'
                      ? `Prognosen er baseret på gennemsnittet af de seneste ${summary.dataPoints} måneder med trendjustering.`
                      : `The forecast is based on the average of the last ${summary.dataPoints} months with trend adjustment.`}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Projected Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-[#f0fdf9] dark:bg-[#1a2e2b] border border-[#0d9488]/10 dark:border-[#2dd4bf]/10">
            <div className="flex items-center gap-1 mb-1">
              <ArrowUpRight className="h-3 w-3 text-[#0d9488] dark:text-[#2dd4bf]" />
              <span className="text-[10px] uppercase tracking-wider font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                {language === 'da' ? 'Proj. indtægt' : 'Proj. Revenue'}
              </span>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              {tc(projected.revenue)}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#faf5ee] dark:bg-[#302a22] border border-[#d4915c]/10 dark:border-[#e0a476]/10">
            <div className="flex items-center gap-1 mb-1">
              <ArrowDownRight className="h-3 w-3 text-[#d4915c] dark:text-[#e0a476]" />
              <span className="text-[10px] uppercase tracking-wider font-medium text-[#d4915c] dark:text-[#e0a476]">
                {language === 'da' ? 'Proj. udgift' : 'Proj. Expense'}
              </span>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              {tc(projected.expenses)}
            </p>
          </div>

          <div className={`p-3 rounded-xl border ${
            projected.net >= 0
              ? 'bg-[#edf5ef] dark:bg-[#242e26] border-[#7c9a82]/10 dark:border-[#8cc492]/10'
              : 'bg-[#fef2f2] dark:bg-[#2e2024] border-red-200 dark:border-red-800/20'
          }`}>
            <div className="flex items-center gap-1 mb-1">
              {projected.net >= 0
                ? <TrendingUp className="h-3 w-3 text-[#7c9a82] dark:text-[#8cc492]" />
                : <TrendingDown className="h-3 w-3 text-red-500 dark:text-red-400" />
              }
              <span className={`text-[10px] uppercase tracking-wider font-medium ${
                projected.net >= 0
                  ? 'text-[#7c9a82] dark:text-[#8cc492]'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {language === 'da' ? 'Proj. netto' : 'Proj. Net'}
              </span>
            </div>
            <p className={`text-sm font-bold tabular-nums ${
              projected.net >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
            }`}>
              {tc(projected.net)}
            </p>
          </div>
        </div>

        {/* Chart: Historical vs Projected */}
        {chartData.length > 1 && (
          <div className="h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={3} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v / 1000}k`}
                  width={40}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value) => {
                    if (value === 'revenue') return language === 'da' ? 'Indtægter' : 'Revenue';
                    if (value === 'expenses') return language === 'da' ? 'Omkostninger' : 'Expenses';
                    return value;
                  }}
                  wrapperStyle={{ fontSize: '11px', color: 'var(--muted-foreground)' }}
                />
                <Bar dataKey="revenue" radius={[3, 3, 0, 0]} name="revenue">
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`rev-${index}`}
                      fill={entry.isActual ? '#7c9a82' : '#7c9a82'}
                      opacity={entry.isActual ? 1 : 0.5}
                      strokeDasharray={entry.isActual ? undefined : '4 2'}
                    />
                  ))}
                </Bar>
                <Bar dataKey="expenses" radius={[3, 3, 0, 0]} name="expenses">
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`exp-${index}`}
                      fill={entry.isActual ? '#c9928f' : '#c9928f'}
                      opacity={entry.isActual ? 1 : 0.5}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Trend indicators */}
        <div className="flex items-center gap-4 mt-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#7c9a82]" />
            <span className="text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Faktisk' : 'Actual'}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#7c9a82] opacity-50" />
            <span className="text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Projiceret' : 'Projected'}
            </span>
          </span>
          {summary.revenueTrend !== 0 && (
            <span className={`flex items-center gap-1 ${
              summary.revenueTrend > 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {summary.revenueTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {language === 'da' ? 'Omsætningstrend' : 'Revenue trend'}: {summary.revenueTrend > 0 ? '+' : ''}{tc(summary.revenueTrend)}/mo
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
