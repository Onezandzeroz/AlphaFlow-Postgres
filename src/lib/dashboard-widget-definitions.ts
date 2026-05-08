// ---------------------------------------------------------------------------
// Dashboard widget definitions — shared between client hook and server API
// ---------------------------------------------------------------------------

export interface DashboardWidget {
  id: string;
  labelDa: string;
  labelEn: string;
  icon: string; // lucide icon name
  defaultVisible: boolean;
  section: 'indicators' | 'charts' | 'details';
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'kpi-cards', labelDa: 'Nøgletal', labelEn: 'KPI Cards', icon: 'TrendingUp', defaultVisible: true, section: 'indicators' },
  { id: 'pnl-cash', labelDa: 'Resultat & Likviditet', labelEn: 'P&L & Cash Position', icon: 'Wallet', defaultVisible: true, section: 'indicators' },
  { id: 'financial-health-score', labelDa: 'Økonomisk Sundhed', labelEn: 'Financial Health Score', icon: 'Gauge', defaultVisible: true, section: 'indicators' },
  { id: 'monthly-comparison', labelDa: 'Månedlig Sammenligning', labelEn: 'Monthly Comparison', icon: 'ArrowUpRight', defaultVisible: true, section: 'indicators' },
  { id: 'cash-flow-trend', labelDa: 'Indtægter vs Omkostninger', labelEn: 'Revenue vs Expenses', icon: 'BarChart3', defaultVisible: true, section: 'charts' },
  { id: 'quick-actions', labelDa: 'Hurtige Handlinger', labelEn: 'Quick Actions', icon: 'Zap', defaultVisible: true, section: 'indicators' },
  { id: 'invoice-overview', labelDa: 'Fakturaoversigt', labelEn: 'Invoice Overview', icon: 'FileText', defaultVisible: true, section: 'details' },
  { id: 'vat-charts', labelDa: 'Moms & Omsætningsdiagrammer', labelEn: 'VAT & Revenue Charts', icon: 'Calculator', defaultVisible: true, section: 'charts' },
  { id: 'net-result-chart', labelDa: 'Netto Resultat pr. Måned', labelEn: 'Net Result by Month', icon: 'Activity', defaultVisible: true, section: 'charts' },
  { id: 'expense-analysis', labelDa: 'Udgiftsanalyse', labelEn: 'Expense Analysis', icon: 'PieChart', defaultVisible: true, section: 'charts' },
  { id: 'profit-loss-waterfall', labelDa: 'Resultatopgørelse Vandfald', labelEn: 'P&L Waterfall', icon: 'BarChart', defaultVisible: true, section: 'charts' },
  { id: 'financial-health-detail', labelDa: 'Økonomisk Sundhed Detail', labelEn: 'Financial Health Detail', icon: 'Droplets', defaultVisible: false, section: 'details' },
  { id: 'cash-flow-forecast', labelDa: 'Likviditetsprognose', labelEn: 'Cash Flow Forecast', icon: 'TrendingUp', defaultVisible: true, section: 'charts' },
  { id: 'budget-vs-actual', labelDa: 'Budget vs Faktisk', labelEn: 'Budget vs Actual', icon: 'Scale', defaultVisible: true, section: 'details' },
  { id: 'ai-categorization', labelDa: 'AI-Kategorisering', labelEn: 'AI Categorization', icon: 'Sparkles', defaultVisible: false, section: 'details' },
  { id: 'recent-activity', labelDa: 'Seneste Aktivitet & Journal', labelEn: 'Recent Activity & Journal', icon: 'Activity', defaultVisible: true, section: 'details' },
  { id: 'active-accounts', labelDa: 'Mest Aktive Konti', labelEn: 'Most Active Accounts', icon: 'BookOpen', defaultVisible: true, section: 'details' },
  { id: 'saft-export', labelDa: 'SAF-T Eksport', labelEn: 'SAF-T Export', icon: 'Shield', defaultVisible: true, section: 'details' },
];

export function getDefaultVisibilityMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const w of DASHBOARD_WIDGETS) {
    map[w.id] = w.defaultVisible;
  }
  return map;
}
