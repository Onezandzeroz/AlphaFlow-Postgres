import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation } from '@/lib/rbac';
import { VALID_VAT_PERCENTAGES } from '@/lib/vat-utils';
import { auditUpdate } from '@/lib/audit';

// ── Types ──────────────────────────────────────────────────────────

interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  compactMode?: boolean;
  currencyFormat?: 'full' | 'no-decimals' | 'compact';
  defaultVatRate?: number;
  defaultPaymentTerms?: string;
  fiscalYearStart?: number;
}

const VALID_PAYMENT_TERMS = ['Netto 8 dage', 'Netto 14 dage', 'Netto 30 dage', 'Netto 60 dage'];
const VALID_FISCAL_MONTHS = [1, 2, 3];
const VALID_THEMES = ['light', 'dark', 'system'];
const VALID_CURRENCY_FORMATS = ['full', 'no-decimals', 'compact'];

// ── GET ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const record = await db.user.findUnique({
      where: { id: ctx.id },
      select: { sidebarPrefs: true, userPrefs: true },
    });

    let sidebarPrefs: { expandedSections?: string[] } | null = null;
    if (record?.sidebarPrefs) {
      try {
        sidebarPrefs = JSON.parse(record.sidebarPrefs);
      } catch {
        sidebarPrefs = null;
      }
    }

    let userPrefs: UserPreferences = {};
    if (record?.userPrefs) {
      try {
        userPrefs = JSON.parse(record.userPrefs);
      } catch {
        userPrefs = {};
      }
    }

    return NextResponse.json({ preferences: { ...userPrefs, expandedSections: sidebarPrefs?.expandedSections } });
  } catch (error) {
    logger.error('Get user preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PUT ────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const body = await request.json();
    const { expandedSections, theme, compactMode, currencyFormat, defaultVatRate, defaultPaymentTerms, fiscalYearStart } = body;

    // Handle sidebar preferences
    if (Array.isArray(expandedSections)) {
      const validSections = [
        'daily-operations',
        'bookkeeping',
        'reporting',
        'compliance',
        'maintenance',
      ];
      const filtered = expandedSections.filter((s: string) =>
        validSections.includes(s)
      );

      await db.user.update({
        where: { id: ctx.id },
        data: {
          sidebarPrefs: JSON.stringify({ expandedSections: filtered }),
        },
      });
    }

    // Handle user preferences
    const userPrefs: UserPreferences = {};

    if (theme !== undefined) {
      if (!VALID_THEMES.includes(theme)) {
        return NextResponse.json(
          { error: `Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}` },
          { status: 400 }
        );
      }
      userPrefs.theme = theme;
    }

    if (compactMode !== undefined) {
      if (typeof compactMode !== 'boolean') {
        return NextResponse.json(
          { error: 'compactMode must be a boolean' },
          { status: 400 }
        );
      }
      userPrefs.compactMode = compactMode;
    }

    if (currencyFormat !== undefined) {
      if (!VALID_CURRENCY_FORMATS.includes(currencyFormat)) {
        return NextResponse.json(
          { error: `Invalid currencyFormat. Must be one of: ${VALID_CURRENCY_FORMATS.join(', ')}` },
          { status: 400 }
        );
      }
      userPrefs.currencyFormat = currencyFormat;
    }

    if (defaultVatRate !== undefined) {
      if (!(VALID_VAT_PERCENTAGES as readonly number[]).includes(Number(defaultVatRate))) {
        return NextResponse.json(
          { error: `Invalid VAT rate. Must be one of: ${VALID_VAT_PERCENTAGES.join('%, ')}%` },
          { status: 400 }
        );
      }
      userPrefs.defaultVatRate = Number(defaultVatRate);
    }

    if (defaultPaymentTerms !== undefined) {
      if (!VALID_PAYMENT_TERMS.includes(defaultPaymentTerms)) {
        return NextResponse.json(
          { error: `Invalid payment terms. Must be one of: ${VALID_PAYMENT_TERMS.join(', ')}` },
          { status: 400 }
        );
      }
      userPrefs.defaultPaymentTerms = defaultPaymentTerms;
    }

    if (fiscalYearStart !== undefined) {
      if (!VALID_FISCAL_MONTHS.includes(Number(fiscalYearStart))) {
        return NextResponse.json(
          { error: 'Invalid fiscal year start month. Must be 1, 2, or 3' },
          { status: 400 }
        );
      }
      userPrefs.fiscalYearStart = Number(fiscalYearStart);
    }

    // Merge with existing preferences
    if (Object.keys(userPrefs).length > 0) {
      const record = await db.user.findUnique({
        where: { id: ctx.id },
        select: { userPrefs: true },
      });

      let existingPrefs: UserPreferences = {};
      if (record?.userPrefs) {
        try {
          existingPrefs = JSON.parse(record.userPrefs);
        } catch {
          existingPrefs = {};
        }
      }

      const mergedPrefs = { ...existingPrefs, ...userPrefs };

      await db.user.update({
        where: { id: ctx.id },
        data: {
          userPrefs: JSON.stringify(mergedPrefs),
        },
      });

      // Audit: log preference changes (capture old before, new after)
      await auditUpdate(ctx.id, 'User', ctx.id, existingPrefs as Record<string, unknown>, userPrefs as Record<string, unknown>, { source: 'preferences_update' }, ctx.activeCompanyId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Save user preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
