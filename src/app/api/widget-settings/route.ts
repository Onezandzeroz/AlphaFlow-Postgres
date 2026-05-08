import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { DASHBOARD_WIDGETS, getDefaultVisibilityMap } from '@/lib/dashboard-widget-definitions';
import { auditUpdate, requestMetadata } from '@/lib/audit';

// ── Helpers ────────────────────────────────────────────────────────

const VALID_WIDGET_IDS = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
const DEFAULT_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);

// ── Storage format ─────────────────────────────────────────────────
// v1 (legacy): { widgetId: boolean }                — pure visibility map
// v2 (current): { v: 2, visibility: {...}, order: [...] }

interface WidgetSettingsV1 {
  [key: string]: boolean;
}

interface WidgetSettingsV2 {
  v: 2;
  visibility: Record<string, boolean>;
  order: string[];
}

function normalizeSettings(raw: string): { visibility: Record<string, boolean>; order: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { visibility: getDefaultVisibilityMap(), order: [...DEFAULT_ORDER] };
  }

  // v1 format — plain { widgetId: boolean }
  if (parsed !== null && typeof parsed === 'object' && !('v' in parsed)) {
    const legacy = parsed as WidgetSettingsV1;
    const defaults = getDefaultVisibilityMap();
    return { visibility: { ...defaults, ...legacy }, order: [...DEFAULT_ORDER] };
  }

  // v2 format
  const v2 = parsed as WidgetSettingsV2;
  if (v2?.v === 2 && v2.visibility && Array.isArray(v2.order)) {
    const defaults = getDefaultVisibilityMap();
    const visibility = { ...defaults, ...v2.visibility };
    // Ensure order contains all known widgets (add missing ones at the end, remove unknown)
    const order = [
      ...v2.order.filter((id) => VALID_WIDGET_IDS.has(id)),
      ...DEFAULT_ORDER.filter((id) => !v2.order.includes(id)),
    ];
    return { visibility, order };
  }

  // Fallback
  return { visibility: getDefaultVisibilityMap(), order: [...DEFAULT_ORDER] };
}

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext(request);
  if (!ctx || !ctx.activeCompanyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const company = await db.company.findUnique({
    where: { id: ctx.activeCompanyId },
    select: { dashboardWidgets: true, name: true },
  });

  let visibility: Record<string, boolean>;
  let order: string[];

  if (company?.dashboardWidgets) {
    const normalized = normalizeSettings(company.dashboardWidgets);
    visibility = normalized.visibility;
    order = normalized.order;
  } else {
    // No saved preferences — fall back to AppOwner's company (AlphaAi) or hardcoded defaults
    const appOwnerCompany = await db.company.findUnique({
      where: { name: 'AlphaAi' },
      select: { dashboardWidgets: true },
    });

    if (appOwnerCompany?.dashboardWidgets) {
      const normalized = normalizeSettings(appOwnerCompany.dashboardWidgets);
      visibility = normalized.visibility;
      order = normalized.order;
    } else {
      visibility = getDefaultVisibilityMap();
      order = [...DEFAULT_ORDER];
    }
  }

  const isAppOwner = ctx.isSuperDev && ctx.activeCompanyName === 'AlphaAi';

  return NextResponse.json({ widgets: visibility, order, isAppOwner });
}

// ── PUT ────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const ctx = await getAuthContext(request);
  if (!ctx || !ctx.activeCompanyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // AppOwner/SuperDev can edit demo company data; others cannot
  if (ctx.isOversightMode || (ctx.isDemoCompany && !ctx.isSuperDev)) {
    return NextResponse.json(
      { error: 'Read-only — cannot modify widget settings in this context' },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { widgets, order } = body as { widgets: Record<string, boolean>; order: string[] };

  if (!widgets || typeof widgets !== 'object') {
    return NextResponse.json({ error: 'Invalid payload: "widgets" object required' }, { status: 400 });
  }

  // Validate all keys are known widget IDs
  const keys = Object.keys(widgets);
  for (const key of keys) {
    if (!VALID_WIDGET_IDS.has(key)) {
      return NextResponse.json(
        { error: `Invalid widget ID: "${key}"` },
        { status: 400 },
      );
    }
  }

  // Validate order array — must contain only valid widget IDs
  if (order && !Array.isArray(order)) {
    return NextResponse.json({ error: 'Invalid payload: "order" must be an array' }, { status: 400 });
  }
  if (order) {
    for (const id of order) {
      if (!VALID_WIDGET_IDS.has(id)) {
        return NextResponse.json(
          { error: `Invalid widget ID in order: "${id}"` },
          { status: 400 },
        );
      }
    }
  }

  // Build v2 format payload
  const finalOrder = order && order.length > 0 ? order : DEFAULT_ORDER;
  const payload: WidgetSettingsV2 = {
    v: 2,
    visibility: widgets,
    order: finalOrder,
  };

  // Capture old widgets for audit
  const companyBefore = await db.company.findUnique({
    where: { id: ctx.activeCompanyId },
    select: { dashboardWidgets: true },
  });
  const oldWidgets = companyBefore?.dashboardWidgets ?? null;

  await db.company.update({
    where: { id: ctx.activeCompanyId },
    data: { dashboardWidgets: JSON.stringify(payload) },
  });

  const newWidgets = JSON.stringify(payload);
  await auditUpdate(
    ctx.id,
    'CompanyInfo',
    ctx.activeCompanyId,
    { dashboardWidgets: oldWidgets },
    { dashboardWidgets: newWidgets },
    requestMetadata(request),
    ctx.activeCompanyId,
  );

  return NextResponse.json({ success: true });
}
