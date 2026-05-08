import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import {
  generateOIOUBL,
  getVATCategoryCode,
  type OIOUBLInvoiceData,
} from '@/lib/oioubl-generator';

// GET /api/invoices/[id]/oioubl — Export an Invoice as OIOUBL XML
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // demo filter now included in tenantFilter

    // Fetch invoice with related companyInfo and contact in a single query
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

    // Fetch company info for the current user (supplier details)
    const companyInfo = ctx.activeCompanyId
      ? await db.company.findUnique({ where: { id: ctx.activeCompanyId } })
      : null;

    // Parse line items from JSON
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
          { error: 'Invoice has no line items' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid line items data in invoice' },
        { status: 400 }
      );
    }

    // ── Build supplier data from companyInfo ─────────────────────────
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

    // ── Build customer data from contact or invoice fields ──────────
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
      unitCode: 'EA', // Each — could be expanded with a unitCode field on line items
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
      paymentMeansCode: '30', // Credit transfer
      paymentAccountId: companyInfo?.bankIban || companyInfo?.bankAccount || undefined,
      paymentReference: invoice.invoiceNumber,
      currencyCode,
    };

    // ── Generate XML ─────────────────────────────────────────────────
    const xmlContent = generateOIOUBL(invoiceData);

    // ── Return XML file ──────────────────────────────────────────────
    const filename = `oioubl-${invoice.invoiceNumber}.xml`;

    return new NextResponse(xmlContent, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    logger.error('OIOUBL invoice export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate OIOUBL XML' },
      { status: 500 }
    );
  }
}

// ── Helper utilities ────────────────────────────────────────────────────

/**
 * Attempt to extract a city name from an address string.
 * Danish addresses often follow the format: "Street, ZIP City" or "Street, ZIP City, Country"
 */
function extractCity(address?: string | null): string | undefined {
  if (!address) return undefined;
  // Try to extract city after postal code (4-digit ZIP in Denmark)
  const match = address.match(/\d{4}\s+(.+)/);
  return match ? match[1].trim().split(',')[0].trim() : undefined;
}

/**
 * Attempt to extract a postal code from an address string.
 */
function extractPostalCode(address?: string | null): string | undefined {
  if (!address) return undefined;
  const match = address.match(/(\d{4})/);
  return match ? match[1] : undefined;
}
