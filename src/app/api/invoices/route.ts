import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditCancel, auditDeleteAttempt, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { ensureInitialBackup } from '@/lib/backup-scheduler';

// GET /api/invoices - List all non-cancelled invoices
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    
    const invoices = await db.invoice.findMany({
      where: { ...tenantFilter(ctx), cancelled: false },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    logger.error('Failed to fetch invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST /api/invoices - Create a new invoice
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
      customerName,
      customerAddress,
      customerEmail,
      customerPhone,
      customerCvr,
      issueDate,
      dueDate,
      lineItems,
      notes,
      status,
    } = body;

    if (!customerName || !issueDate || !dueDate || !lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    for (const item of lineItems) {
      if (!item.description || !item.quantity || !item.unitPrice || item.vatPercent === undefined) {
        return NextResponse.json({ error: 'Invalid line item data' }, { status: 400 });
      }
    }

    const subtotal = lineItems.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    const vatTotal = lineItems.reduce((sum: number, item: { quantity: number; unitPrice: number; vatPercent: number }) => {
      return sum + ((item.quantity * item.unitPrice * item.vatPercent) / 100);
    }, 0);

    const total = subtotal + vatTotal;

        const companyInfo = ctx.activeCompanyId
      ? await db.company.findUnique({ where: { id: ctx.activeCompanyId } })
      : null;
    if (!companyInfo) {
      return NextResponse.json({ error: 'Company info not set up. Please set up company information first.' }, { status: 400 });
    }

    const currentYear = new Date().getFullYear();
    let nextSeq = companyInfo.nextInvoiceSequence;
    if (companyInfo.currentYear !== currentYear) {
      nextSeq = 1;
    }

    const invoiceNumber = `${companyInfo.invoicePrefix}-${currentYear}-${String(nextSeq).padStart(4, '0')}`;

    const invoice = await db.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerName,
          customerAddress: customerAddress || null,
          customerEmail: customerEmail || null,
          customerPhone: customerPhone || null,
          customerCvr: customerCvr || null,
          issueDate: new Date(issueDate),
          dueDate: new Date(dueDate),
          lineItems: JSON.stringify(lineItems),
          subtotal,
          vatTotal,
          total,
          status: 'DRAFT', // Always create as DRAFT; use PUT to change status
          notes: notes || null,
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
          isDemo: ctx.isDemoCompany,
        },
      });

      await tx.company.update({
        where: { id: companyInfo.id },
        data: { nextInvoiceSequence: nextSeq + 1, currentYear },
      });

      return newInvoice;
    });

    // Audit log
    await auditCreate(
      ctx.id,
      'Invoice',
      invoice.id,
      { invoiceNumber, customerName, total, status: status || 'DRAFT' },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    // Trigger initial backup on first tenant data input
    ensureInitialBackup(ctx.activeCompanyId!, ctx.id);

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create invoice:', error);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}

// DELETE /api/invoices?id=xxx - Soft-delete (cancel) an invoice
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const reason = searchParams.get('reason') || 'User requested cancellation';

    if (!id) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });
    }

    const invoice = await db.invoice.findFirst({
      where: { id, ...tenantFilter(ctx), cancelled: false },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found or already cancelled' }, { status: 404 });
    }

    // Soft-delete: mark as cancelled
    await db.invoice.update({
      where: { id },
      data: {
        cancelled: true,
        cancelReason: reason,
        status: 'CANCELLED',
      },
    });

    // Audit log
    await auditCancel(
      ctx.id,
      'Invoice',
      id,
      reason,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ success: true, message: 'Invoice cancelled (soft-delete)' });
  } catch (error) {
    logger.error('Failed to cancel invoice:', error);
    return NextResponse.json({ error: 'Failed to cancel invoice' }, { status: 500 });
  }
}
