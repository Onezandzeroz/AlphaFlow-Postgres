import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { ContactType } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// GET - List contacts for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = { ...tenantFilter(ctx) };

    if (typeFilter && Object.values(ContactType).includes(typeFilter as ContactType)) {
      where.type = typeFilter;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cvrNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const contacts = await db.contact.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ contacts });
  } catch (error) {
    logger.error('List contacts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new contact
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
    const { name, cvrNumber, email, phone, address, city, postalCode, country, type, notes } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    // Validate contact type if provided
    if (type && !Object.values(ContactType).includes(type)) {
      return NextResponse.json(
        { error: `Invalid contact type. Must be one of: ${Object.values(ContactType).join(', ')}` },
        { status: 400 }
      );
    }

    
    const contact = await db.contact.create({
      data: {
        name,
        cvrNumber: cvrNumber || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        postalCode: postalCode || null,
        country: country || 'Danmark',
        type: type || 'CUSTOMER',
        notes: notes || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
      },
    });

    await auditCreate(
      ctx.id,
      'Contact',
      contact.id,
      { name, cvrNumber, email, phone, type },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    logger.error('Create contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
