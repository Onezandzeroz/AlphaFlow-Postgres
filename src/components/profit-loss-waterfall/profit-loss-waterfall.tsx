'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Loader2, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';

interface WaterfallItem {
  name: string;
  type: 'revenue' | 'expense' | 'subtotal' | 'net';
  amount: number;
  cumulative: number;
}

interface Summary {
  totalRevenue: number;
  totalExpenses: number;
  netResult: number;
  revenueCount: number;
  expenseCount: number;
  marginPercent: number;
}

interface ProfitLossWaterfallProps {
  dateRange: { from: Date; to: Date } | null;
}

export function ProfitLossWaterfall({ dateRange }: ProfitLossWaterfallProps) {
  const { t, tc, language } = useTranslation();
  const [waterfall, setWaterfall] = useState<WaterfallItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const from = dateRange ? dateRange.from.toISOString().split('T')[0] : '';
      const to = dateRange ? dateRange.to.toISOString().split('T')[0] : '';
      const res = await fetch(`/api/profit-loss?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setWaterfall(data.waterfall || []);
        setSummary(data.summary || null);
      }
    } catch (error) {
      console.error('Failed to fetch P&L data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Transform waterfall data for the chart
  const chartData = useMemo(() => {
    if (waterfall.length === 0) return [];

    return waterfall.map((item) => {
      // For waterfall chart, we need base, positive, and negative segments
      let base = 0;
      let positive = 0;
      let negative = 0;

      if (item.type === 'revenue' || item.type === 'subtotal') {
        // Revenue items grow from 0 upward
        base = 0;
        positive = Math.max(0, item.amount);
        negative = 0;
      } else if (item.type === 'expense') {
        // Expense items reduce the cumulative
        const prevCumulative = waterfall
          .filter((w) => w.type === 'revenue' || w.type === 'subtotal')
          .reduce((sum, w) => sum + w.amount, 0);
        base = Math.max(0, prevCumulative + item.cumulative - item.amount);
        // Find the previous cumulative
        const idx = waterfall.indexOf(item);
        const prevItem = idx > 0 ? waterfall[idx - 1] : null;
        base = prevItem ? prevItem.cumulative + item.amount : item.amount;
        negative = Math.abs(item.amount);
        positive = 0;
      } else if (item.type === 'net') {
        base = 0;
        if (item.amount >= 0) {
          positive = item.amount;
        } else {
          negative = Math.abs(item.amount);
        }
      }

      return {
        name: item.name.length > 15 ? item.name.substring(0, 14) + '…' : item.name,
        fullName: item.name,
        type: item.type,
        base: Math.max(0, base),
        positive,
        negative,
        amount: item.amount,
        cumulative: item.cumulative,
      };
    });
  }, [waterfall]);

  const maxVal = useMemo(() => {
    if (chartData.length === 0) return 100;
    return Math.max(...chartData.map((d) => Math.max(d.base + d.positive, d.base + d.negative, Math.abs(d.amount))), 100);
  }, [chartData]);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullName: string; type: string; amount: number } }> }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{data.fullName}</p>
        <p className={`text-sm font-bold tabular-nums ${data.amount >= 0 ? 'text-[#0d9488]' : 'text-[#dc4a45]'}`}>
          {data.amount >= 0 ? '+' : ''}{tc(data.amount)}
        </p>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="stat-card">
        <CardContent className="p-4 sm:p-6 flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-[#0d9488]" />
        </CardContent>
      </Card>
    );
  }

  if (waterfall.length === 0) {
    return null;
  }

  return (
    <Card className="stat-card hover-lift">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#0d9488]" />
            {language === 'da' ? 'Resultatopgørelse (Waterfall)' : 'Profit & Loss Waterfall'}
          </CardTitle>
          {summary && (
            <Badge
              className={`text-xs font-semibold ${
                summary.netResult >= 0
                  ? 'bg-[#edf5ef] text-[#3d7a4a] dark:bg-[#152e1e] dark:text-[#86efac] border-[#bbf7d0] dark:border-[#224830]'
                  : 'bg-[#fef2f2] text-[#dc4a45] dark:bg-[#2e1a1a] dark:text-[#fca5a5] border-[#fee2e2] dark:border-[#402020]'
              }`}
            >
              {summary.netResult >= 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
              {tc(summary.netResult)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-[#e6f7f3] dark:bg-[#1a2e2b] p-2.5 text-center">
              <p className="text-[10px] font-medium text-[#0d9488] dark:text-[#2dd4bf] uppercase tracking-wide">
                {language === 'da' ? 'Indtægter' : 'Revenue'}
              </p>
              <p className="text-sm font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums mt-0.5">
                {tc(summary.totalRevenue)}
              </p>
            </div>
            <div className="rounded-lg bg-[#fef2f2] dark:bg-[#2e1a1a] p-2.5 text-center">
              <p className="text-[10px] font-medium text-[#dc4a45] dark:text-[#f87171] uppercase tracking-wide">
                {language === 'da' ? 'Omkostninger' : 'Expenses'}
              </p>
              <p className="text-sm font-bold text-[#dc4a45] dark:text-[#f87171] tabular-nums mt-0.5">
                {tc(summary.totalExpenses)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 text-center">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {language === 'da' ? 'Margin' : 'Margin'}
              </p>
              <p className={`text-sm font-bold tabular-nums mt-0.5 ${summary.marginPercent >= 0 ? 'text-[#0d9488]' : 'text-[#dc4a45]'}`}>
                {summary.marginPercent}%
              </p>
            </div>
          </div>
        )}

        {/* Waterfall Chart */}
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                interval={0}
                angle={-20}
                textAnchor="end"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                domain={[0, maxVal * 1.1]}
                tickFormatter={(val: number) => `${(val / 1000).toFixed(0)}k`}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Bar dataKey="base" stackId="waterfall" fill="transparent" />
              <Bar dataKey="positive" stackId="waterfall" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-pos-${index}`}
                    fill={entry.type === 'net' ? '#0d9488' : entry.type === 'subtotal' ? '#14b8a6' : '#0d9488'}
                    fillOpacity={entry.type === 'subtotal' ? 0.7 : 1}
                  />
                ))}
              </Bar>
              <Bar dataKey="negative" stackId="waterfall" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-neg-${index}`} fill="#dc4a45" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
