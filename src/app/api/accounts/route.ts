import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { AccountType, AccountGroup } from '@prisma/client';
import { getDemoFilter, applyDemoFilter } from '@/lib/demo-filter';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// GET - List all accounts for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');
    const groupFilter = searchParams.get('group');

    // Get demo mode filter
    
    const where: Record<string, unknown> = { ...tenantFilter(ctx) };
    if (typeFilter && Object.values(AccountType).includes(typeFilter as AccountType)) {
      where.type = typeFilter;
    }
    if (groupFilter && Object.values(AccountGroup).includes(groupFilter as AccountGroup)) {
      where.group = groupFilter;
    }

    const accounts = await db.account.findMany({
      where,
      orderBy: { number: 'asc' },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    logger.error('List accounts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new account
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const body = await request.json();
    const { number, name, nameEn, type, group, description } = body;

    if (!number || !name || !type || !group) {
      return NextResponse.json(
        { error: 'Missing required fields: number, name, type, group' },
        { status: 400 }
      );
    }

    // Validate enum values
    if (!Object.values(AccountType).includes(type)) {
      return NextResponse.json(
        { error: `Invalid account type. Must be one of: ${Object.values(AccountType).join(', ')}` },
        { status: 400 }
      );
    }
    if (!Object.values(AccountGroup).includes(group)) {
      return NextResponse.json(
        { error: `Invalid account group. Must be one of: ${Object.values(AccountGroup).join(', ')}` },
        { status: 400 }
      );
    }

    // Check number uniqueness per user (within the same demo context)
        const existing = await db.account.findFirst({
      where: { ...tenantFilter(ctx), number },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this number already exists' },
        { status: 409 }
      );
    }

    const account = await db.account.create({
      data: {
        number,
        name,
        nameEn: nameEn || null,
        type,
        group,
        description: description || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
      },
    });

    await auditCreate(
      ctx.id,
      'Account',
      account.id,
      { number, name, nameEn, type, group, description },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    logger.error('Create account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
