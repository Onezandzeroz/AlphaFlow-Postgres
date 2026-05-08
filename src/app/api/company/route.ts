import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, tenantFilter, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { auditCreate, auditUpdate, auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

// GET /api/company - Get active company info
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ companyInfo: null });
    }

    const company = await db.company.findUnique({
      where: { id: ctx.activeCompanyId },
    });

    // Auto-fix stale currentYear: if the DB value doesn't match the actual year,
    // update it so the frontend preview shows the correct year.
    // Note: nextInvoiceSequence is NOT reset here — the invoice creation code
    // handles the year-rollover sequence reset when the first invoice is created.
    if (company && company.currentYear !== new Date().getFullYear()) {
      await db.company.update({
        where: { id: company.id },
        data: {
          currentYear: new Date().getFullYear(),
        },
      });
      company.currentYear = new Date().getFullYear();
    }

    // Map Company model to the frontend-expected format (camelCase)
    const companyInfo = company ? {
      id: company.id,
      logo: company.logo,
      companyName: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      cvrNumber: company.cvrNumber,
      invoicePrefix: company.invoicePrefix,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      bankRegistration: company.bankRegistration,
      bankIban: company.bankIban,
      bankStreet: company.bankStreet,
      bankCity: company.bankCity,
      bankCountry: company.bankCountry,
      companyType: company.companyType,
      invoiceTerms: company.invoiceTerms,
      invoiceNotesTemplate: company.invoiceNotesTemplate,
      nextInvoiceSequence: company.nextInvoiceSequence,
      currentYear: company.currentYear,
      isDemo: company.isDemo,
      updatedAt: company.updatedAt,
    } : null;

    return NextResponse.json({ companyInfo });
  } catch (error) {
    logger.error('Failed to fetch company info:', error);
    return NextResponse.json({ error: 'Failed to fetch company info' }, { status: 500 });
  }
}

// POST /api/company - Create a new company
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
    const {
      logo, companyName, address, phone, email, cvrNumber, invoicePrefix,
      bankName, bankAccount, bankRegistration, bankIban, bankStreet, bankCity,
      bankCountry, invoiceTerms, companyType, invoiceNotesTemplate,
    } = body;

    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Enforce unique company name — no two tenants may share a name
    const existingWithName = await db.company.findFirst({
      where: { name: companyName },
    });
    if (existingWithName) {
      return NextResponse.json(
        { error: `A company named "${companyName}" already exists. Company names must be unique.` },
        { status: 409 }
      );
    }

    // Inherit AppOwner widget defaults for the new company
    const appOwnerCompany = await db.company.findUnique({
      where: { name: 'AlphaAi' },
      select: { dashboardWidgets: true },
    });
    const inheritedWidgets = appOwnerCompany?.dashboardWidgets ?? null;

    const company = await db.company.create({
      data: {
        name: companyName,
        logo: logo || null,
        address: address || '',
        phone: phone || '',
        email: email || '',
        cvrNumber: cvrNumber || '',
        invoicePrefix: invoicePrefix?.toUpperCase() || 'INV',
        currentYear: new Date().getFullYear(),
        bankName: bankName || '',
        bankAccount: bankAccount || '',
        bankRegistration: bankRegistration || '',
        bankIban: bankIban || null,
        bankStreet: bankStreet || null,
        bankCity: bankCity || null,
        bankCountry: bankCountry || null,
        invoiceTerms: invoiceTerms || undefined,
        companyType: companyType || null,
        invoiceNotesTemplate: invoiceNotesTemplate || null,
        dashboardWidgets: inheritedWidgets,
      },
    });

    // Assign the user as OWNER of the new company
    await db.userCompany.create({
      data: {
        userId: ctx.id,
        companyId: company.id,
        role: 'OWNER',
      },
    });

    await auditCreate(ctx.id, 'Company', company.id, { companyName, cvrNumber }, requestMetadata(request), company.id);

    const companyInfo = {
      id: company.id,
      logo: company.logo,
      companyName: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      cvrNumber: company.cvrNumber,
      invoicePrefix: company.invoicePrefix,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      bankRegistration: company.bankRegistration,
      bankIban: company.bankIban,
      bankStreet: company.bankStreet,
      bankCity: company.bankCity,
      bankCountry: company.bankCountry,
      companyType: company.companyType,
      invoiceTerms: company.invoiceTerms,
      invoiceNotesTemplate: company.invoiceNotesTemplate,
      nextInvoiceSequence: company.nextInvoiceSequence,
      currentYear: company.currentYear,
      isDemo: company.isDemo,
      updatedAt: company.updatedAt,
    };

    return NextResponse.json({ companyInfo }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create company:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}

// PUT /api/company - Update active company info
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const forbidden = requirePermission(ctx, Permission.COMPANY_EDIT_SETTINGS);
    if (forbidden) return forbidden;

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }

    const body = await request.json();
    const {
      logo, companyName, address, phone, email, cvrNumber, invoicePrefix,
      bankName, bankAccount, bankRegistration, bankIban, bankStreet, bankCity,
      bankCountry, invoiceTerms, companyType, invoiceNotesTemplate,
    } = body;

    const existing = await db.company.findUnique({
      where: { id: ctx.activeCompanyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Enforce unique company name — block rename if another company has that name
    if (companyName && companyName !== existing.name) {
      const nameTaken = await db.company.findFirst({
        where: { name: companyName },
      });
      if (nameTaken) {
        return NextResponse.json(
          { error: `A company named "${companyName}" already exists. Company names must be unique.` },
          { status: 409 }
        );
      }
    }

    // Build old data snapshot for audit
    const oldData: Record<string, unknown> = { companyName: existing.name, cvrNumber: existing.cvrNumber };

    const company = await db.company.update({
      where: { id: ctx.activeCompanyId },
      data: {
        ...(logo !== undefined && { logo }),
        ...(companyName && { name: companyName }),
        ...(address && { address }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(cvrNumber && { cvrNumber }),
        ...(invoicePrefix && { invoicePrefix: invoicePrefix.toUpperCase() }),
        ...(bankName && { bankName }),
        ...(bankAccount && { bankAccount }),
        ...(bankRegistration && { bankRegistration }),
        ...(bankIban !== undefined && { bankIban }),
        ...(bankStreet !== undefined && { bankStreet }),
        ...(bankCity !== undefined && { bankCity }),
        ...(bankCountry !== undefined && { bankCountry }),
        ...(invoiceTerms !== undefined && { invoiceTerms }),
        ...(companyType !== undefined && { companyType }),
        ...(invoiceNotesTemplate !== undefined && { invoiceNotesTemplate }),
      },
    });

    const newData: Record<string, unknown> = { companyName: company.name, cvrNumber: company.cvrNumber };
    await auditUpdate(ctx.id, 'Company', existing.id, oldData, newData, requestMetadata(request), ctx.activeCompanyId);

    const companyInfo = {
      id: company.id,
      logo: company.logo,
      companyName: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      cvrNumber: company.cvrNumber,
      invoicePrefix: company.invoicePrefix,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      bankRegistration: company.bankRegistration,
      bankIban: company.bankIban,
      bankStreet: company.bankStreet,
      bankCity: company.bankCity,
      bankCountry: company.bankCountry,
      companyType: company.companyType,
      invoiceTerms: company.invoiceTerms,
      invoiceNotesTemplate: company.invoiceNotesTemplate,
      nextInvoiceSequence: company.nextInvoiceSequence,
      currentYear: company.currentYear,
      isDemo: company.isDemo,
      updatedAt: company.updatedAt,
    };

    return NextResponse.json({ companyInfo });
  } catch (error) {
    logger.error('Failed to update company:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

// DELETE /api/company - Reset all data (with audit trail)
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const forbidden = requirePermission(ctx, Permission.COMPANY_DELETE);
    if (forbidden) return forbidden;

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }

    // Audit the data reset BEFORE it happens
    await auditLog({
      action: 'DATA_RESET',
      entityType: 'System',
      entityId: ctx.activeCompanyId,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      metadata: requestMetadata(request),
    });

    const filter = tenantFilter(ctx);

    // Cancel all transactions (soft-delete)
    await db.transaction.updateMany({
      where: { ...filter, cancelled: false },
      data: { cancelled: true, cancelReason: 'Full data reset by user' },
    });

    // Cancel all invoices (soft-delete)
    await db.invoice.updateMany({
      where: { ...filter, cancelled: false },
      data: { cancelled: true, cancelReason: 'Full data reset by user', status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true, message: 'All data cleared successfully' });
  } catch (error) {
    logger.error('Failed to clear data:', error);
    return NextResponse.json({ error: 'Failed to clear data' }, { status: 500 });
  }
}
