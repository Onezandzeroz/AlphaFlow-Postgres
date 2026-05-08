'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import {
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Droplets,
  Loader2,
} from 'lucide-react';

interface FinancialHealthData {
  liquidityRatio: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  profitMargin: number;
  netIncome: number;
  totalRevenue: number;
  totalExpenses: number;
  cashFlowTrend: 'improving' | 'stable' | 'declining';
  monthlyNet: [number, number, number];
}

interface FinancialHealthWidgetProps {
  dateRange: { from: Date; to: Date } | null;
}

function getStatusColor(value: 'good' | 'warning' | 'bad') {
  if (value === 'good') return { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' };
  if (value === 'warning') return { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' };
  return { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' };
}

export function FinancialHealthWidget({ dateRange }: FinancialHealthWidgetProps) {
  const [data, setData] = useState<FinancialHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { tc, language } = useTranslation();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange) {
        params.set('from', dateRange.from.toISOString().split('T')[0]);
        params.set('to', dateRange.to.toISOString().split('T')[0]);
      }
      const res = await fetch(`/api/financial-health?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch financial health data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

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

  if (!data) return null;

  // ─── Determine status for each metric ────────────────────────────
  const liquidityStatus: 'good' | 'warning' | 'bad' =
    data.liquidityRatio >= 2 ? 'good' : data.liquidityRatio >= 1 ? 'warning' : 'bad';

  const marginStatus: 'good' | 'warning' | 'bad' =
    data.profitMargin >= 10 ? 'good' : data.profitMargin >= 0 ? 'warning' : 'bad';

  const trendStatus: 'good' | 'warning' | 'bad' =
    data.cashFlowTrend === 'improving' ? 'good' : data.cashFlowTrend === 'stable' ? 'warning' : 'bad';

  // ─── Metric cards configuration ──────────────────────────────────
  const metrics = [
    {
      key: 'liquidity',
      label: language === 'da' ? 'Likviditetsgrad' : 'Liquidity Ratio',
      value: data.liquidityRatio === 99 ? '∞' : data.liquidityRatio.toFixed(2) + 'x',
      detail: language === 'da'
        ? `Omsætningsaktiver: ${tc(data.totalCurrentAssets)} / Kortfristet gæld: ${tc(data.totalCurrentLiabilities)}`
        : `Current Assets: ${tc(data.totalCurrentAssets)} / Current Liab.: ${tc(data.totalCurrentLiabilities)}`,
      icon: Scale,
      iconBg: 'bg-[#e6f7f3] dark:bg-[#1a2e2b]',
      iconColor: 'text-[#0d9488] dark:text-[#2dd4bf]',
      status: liquidityStatus,
    },
    {
      key: 'margin',
      label: language === 'da' ? 'Overskudsgrad' : 'Profit Margin',
      value: data.profitMargin.toFixed(1) + '%',
      detail: language === 'da'
        ? `Netto: ${tc(data.netIncome)} / Omsætning: ${tc(data.totalRevenue)}`
        : `Net: ${tc(data.netIncome)} / Revenue: ${tc(data.totalRevenue)}`,
      icon: Activity,
      iconBg: 'bg-green-100 dark:bg-green-900/40',
      iconColor: 'text-green-600 dark:text-green-400',
      status: marginStatus,
    },
    {
      key: 'cashflow',
      label: language === 'da' ? 'Likviditetstrend' : 'Cash Flow Trend',
      value: data.cashFlowTrend === 'improving'
        ? (language === 'da' ? 'Forbedrende' : 'Improving')
        : data.cashFlowTrend === 'stable'
          ? (language === 'da' ? 'Stabil' : 'Stable')
          : (language === 'da' ? 'Faldende' : 'Declining'),
      detail: language === 'da'
        ? `Seneste 3 mdr netto: ${data.monthlyNet.map(n => tc(n)).join(' → ')}`
        : `Last 3 months net: ${data.monthlyNet.map(n => tc(n)).join(' → ')}`,
      icon: data.cashFlowTrend === 'improving' ? TrendingUp : data.cashFlowTrend === 'stable' ? Minus : TrendingDown,
      iconBg: getStatusColor(trendStatus).bg,
      iconColor: getStatusColor(trendStatus).text,
      status: trendStatus,
    },
  ];

  return (
    <Card className="hover-lift overflow-hidden border-0 bg-gradient-to-br from-white to-[#f0fdf9] dark:from-gray-900 dark:to-[#1a2e2b]">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-[#f0fdf9] dark:bg-[#1a2e2b] flex items-center justify-center">
            <Droplets className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {language === 'da' ? 'Økonomisk Sundhed' : 'Financial Health'}
          </p>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {metrics.map((metric) => {
            const MetricIcon = metric.icon;
            const colors = getStatusColor(metric.status);

            return (
              <div
                key={metric.key}
                className={`p-4 rounded-xl border ${colors.border} ${colors.bg}/40 transition-all duration-200 hover:scale-[1.02]`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-8 w-8 rounded-lg ${metric.iconBg} flex items-center justify-center shrink-0`}>
                    <MetricIcon className={`h-4 w-4 ${metric.iconColor}`} />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {metric.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                    {metric.value}
                  </span>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    metric.status === 'good' ? 'bg-green-500' : metric.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                </div>

                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  {metric.detail}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
