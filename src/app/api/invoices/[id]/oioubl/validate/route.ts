import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import {
  generateOIOUBL,
  getVATCategoryCode,
  type OIOUBLInvoiceData,
} from '@/lib/oioubl-generator';
import { validateOIOUBL } from '@/lib/oioubl-validator';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// POST /api/invoices/[id]/oioubl/validate — Validate an Invoice against Peppol BIS Billing 3.0
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await params;

    // demo filter now included in tenantFilter

    // Fetch invoice with related companyInfo and contact
    const invoice = await db.invoice.findFirst({
      where: { id, ...tenantFilter(ctx) },
      include: {
        user: true,
        contact: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Fetch company info for supplier details
    const companyInfo = ctx.activeCompanyId
      ? await db.company.findUnique({ where: { id: ctx.activeCompanyId } })
      : null;

    // Parse line items
    let lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      vatPercent: number;
    }>;
    try {
      lineItems = JSON.parse(invoice.lineItems);
      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return NextResponse.json(
          {
            isValid: false,
            errors: ['Invoice has no line items.'],
            warnings: [],
          },
          { status: 200 }
        );
      }
    } catch {
      return NextResponse.json(
        {
          isValid: false,
          errors: ['Invalid line items data in invoice.'],
          warnings: [],
        },
        { status: 200 }
      );
    }

    // ── Build supplier data ──────────────────────────────────────────
    const supplier: OIOUBLInvoiceData['supplier'] = companyInfo
      ? {
          id: companyInfo.cvrNumber || `DK${ctx.id.substring(0, 8).toUpperCase()}`,
          name: companyInfo.name || ctx.businessName || 'Unknown Business',
          streetAddress: companyInfo.address || undefined,
          city: extractCity(companyInfo.address),
          postalCode: extractPostalCode(companyInfo.address),
          country: 'DK',
          vatNumber: companyInfo.cvrNumber
            ? (companyInfo.cvrNumber.startsWith('DK') ? companyInfo.cvrNumber : `DK${companyInfo.cvrNumber}`)
            : undefined,
          contactEmail: companyInfo.email || undefined,
          contactPhone: companyInfo.phone || undefined,
        }
      : {
          id: `DK${ctx.id.substring(0, 8).toUpperCase()}`,
          name: ctx.businessName || 'Unknown Business',
          country: 'DK',
          contactEmail: ctx.email || undefined,
        };

    // ── Build customer data ──────────────────────────────────────────
    const customer: OIOUBLInvoiceData['customer'] = {
      id: invoice.contact?.cvrNumber || invoice.customerCvr || `CUST-${invoice.id.substring(0, 8)}`,
      name: invoice.contact?.name || invoice.customerName,
      streetAddress: invoice.contact?.address || invoice.customerAddress || undefined,
      city: invoice.contact?.city || undefined,
      postalCode: invoice.contact?.postalCode || undefined,
      country: invoice.contact?.country || 'DK',
      vatNumber: invoice.contact?.cvrNumber || invoice.customerCvr || undefined,
      contactEmail: invoice.contact?.email || invoice.customerEmail || undefined,
    };

    // ── Build invoice lines ──────────────────────────────────────────
    const lines: OIOUBLInvoiceData['lines'] = lineItems.map((item, index) => ({
      id: String(index + 1),
      description: item.description || 'Untitled line item',
      quantity: item.quantity || 1,
      unitCode: 'EA',
      unitPrice: item.unitPrice || 0,
      vatPercent: item.vatPercent || 0,
      vatCategoryCode: getVATCategoryCode(item.vatPercent || 0),
    }));

    // ── Build totals ─────────────────────────────────────────────────
    const currencyCode = invoice.currency || 'DKK';
    const taxExclusiveAmount = invoice.subtotal || 0;
    const taxTotal = invoice.vatTotal || 0;
    const taxInclusiveAmount = invoice.total || 0;
    const payableAmount = invoice.total || 0;

    // ── Build OIOUBL data ────────────────────────────────────────────
    const invoiceData: OIOUBLInvoiceData = {
      invoiceId: invoice.invoiceNumber,
      issueDate: invoice.issueDate.toISOString().split('T')[0],
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().split('T')[0] : undefined,
      supplier,
      customer,
      lines,
      taxTotal,
      payableAmount,
      taxExclusiveAmount,
      taxInclusiveAmount,
      paymentMeansCode: '30',
      paymentAccountId: companyInfo?.bankIban || companyInfo?.bankAccount || undefined,
      paymentReference: invoice.invoiceNumber,
      currencyCode,
    };

    // ── Generate XML and validate ────────────────────────────────────
    const xmlContent = generateOIOUBL(invoiceData);
    const validationResult = validateOIOUBL(xmlContent);

    return NextResponse.json({
      isValid: validationResult.isValid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
    });
  } catch (error) {
    logger.error('OIOUBL validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate OIOUBL XML' },
      { status: 500 }
    );
  }
}

// ── Helper utilities ────────────────────────────────────────────────────

function extractCity(address?: string | null): string | undefined {
  if (!address) return undefined;
  const match = address.match(/\d{4}\s+(.+)/);
  return match ? match[1].trim().split(',')[0].trim() : undefined;
}

function extractPostalCode(address?: string | null): string | undefined {
  if (!address) return undefined;
  const match = address.match(/(\d{4})/);
  return match ? match[1] : undefined;
}
