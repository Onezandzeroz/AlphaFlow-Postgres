import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';
import {
  generateOIOUBL,
  DEFAULT_SUPPLIER,
  DEFAULT_CUSTOMER,
  generateInvoiceId,
  getVATCategoryCode,
  type OIOUBLInvoiceData,
} from '@/lib/oioubl-generator';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = ctx.id;
    
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('id');

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Fetch the transaction
    const transaction = await db.transaction.findFirst({
      where: { id: transactionId, userId, ...tenantFilter(ctx) },
      include: { user: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Calculate amounts
    const vatPercent = transaction.vatPercent;
    const taxExclusiveAmount = transaction.amount;
    const taxTotal = (taxExclusiveAmount * vatPercent) / 100;
    const taxInclusiveAmount = taxExclusiveAmount + taxTotal;
    const payableAmount = taxInclusiveAmount;

    // Generate invoice ID
    const invoiceId = generateInvoiceId();

    // Format dates
    const issueDate = transaction.date.toISOString().split('T')[0];
    const dueDate = new Date(transaction.date);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days payment terms
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // Get user info for supplier (or use defaults)
    const txUser = transaction.user;
    const supplier: OIOUBLInvoiceData['supplier'] = {
      id: `DK${userId.substring(0, 8).toUpperCase()}`,
      name: txUser.businessName || 'Unknown Business',
      streetAddress: 'Address Line 1',
      city: 'Copenhagen',
      postalCode: '1000',
      country: 'DK',
      vatNumber: `DK${userId.substring(0, 8).toUpperCase()}`,
      contactEmail: txUser.email,
    };

    // Build invoice data
    const invoiceData: OIOUBLInvoiceData = {
      invoiceId,
      issueDate,
      dueDate: dueDateStr,
      supplier: {
        id: `DK${userId.substring(0, 8).toUpperCase()}`,
        name: txUser.businessName || DEFAULT_SUPPLIER.name,
        streetAddress: txUser.businessName ? 'Address Line 1' : DEFAULT_SUPPLIER.streetAddress,
        city: txUser.businessName ? 'Copenhagen' : DEFAULT_SUPPLIER.city,
        postalCode: txUser.businessName ? '1000' : DEFAULT_SUPPLIER.postalCode,
        country: 'DK',
        vatNumber: `DK${userId.substring(0, 8).toUpperCase()}`,
        contactEmail: txUser.email || DEFAULT_SUPPLIER.contactEmail,
      },
      customer: DEFAULT_CUSTOMER,
      lines: [
        {
          id: '1',
          description: transaction.description,
          quantity: 1,
          unitCode: 'EA', // Each
          unitPrice: taxExclusiveAmount,
          vatPercent,
          vatCategoryCode: getVATCategoryCode(vatPercent),
        },
      ],
      taxTotal,
      payableAmount,
      taxExclusiveAmount,
      taxInclusiveAmount,
      paymentMeansCode: '30',
      paymentAccountId: 'DK5000400440116243', // Sample IBAN-like account
      paymentReference: invoiceId.replace('INV-', ''),
      currencyCode: 'DKK',
    };

    // Generate OIOUBL XML
    const xmlContent = generateOIOUBL(invoiceData);

    // Return XML file
    return new NextResponse(xmlContent, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="oioubl-invoice-${invoiceId}.xml"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    logger.error('OIOUBL export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate OIOUBL XML' },
      { status: 500 }
    );
  }
}
