import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';
import { tenantFilter } from '@/lib/rbac';
import {
  enrichTransactionsWithVAT,
  enrichInvoicesWithVAT,
  computeVATRegister,
  r2,
} from '@/lib/vat-utils';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    // Determine date range
    let fromDate: Date;
    let toDate: Date;

    if (month) {
      fromDate = new Date(`${month}-01`);
      toDate = new Date(fromDate);
      toDate.setMonth(toDate.getMonth() + 1);
      toDate.setDate(0);
      toDate.setHours(23, 59, 59, 999);
    } else {
      const now = new Date();
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Fetch transactions and invoices for line-level CSV data
    const [transactions, invoices] = await Promise.all([
      db.transaction.findMany({
        where: {
          ...tenantFilter(ctx),
          date: { gte: fromDate, lte: toDate },
          cancelled: false,
        },
        orderBy: { date: 'asc' },
      }),
      db.invoice.findMany({
        where: { ...tenantFilter(ctx), status: { not: 'CANCELLED' }, cancelled: false },
        orderBy: { issueDate: 'asc' },
      }),
    ]);

    const invoiceIdsWithTransactions = new Set(
      transactions.filter((t) => t.invoiceId).map((t) => t.invoiceId)
    );

    interface Entry {
      date: Date;
      type: string;
      amount: number;
      description: string;
      source: string;
      sourceId: string;
      journalVATAmount?: number;
      journalVATRate?: number;
      journalVATCode?: string | null;
    }

    const allEntries: Entry[] = [];

    for (const tx of transactions) {
      allEntries.push({
        date: tx.date, type: tx.type, amount: tx.amount,
        description: tx.description, source: 'transaction',
        sourceId: tx.id,
      });
    }

    for (const invoice of invoices) {
      if (invoice.status === 'CANCELLED') continue;
      if (invoiceIdsWithTransactions.has(invoice.id)) continue;

      if (invoice.issueDate < fromDate || invoice.issueDate > toDate) continue;

      try {
        const lineItems = JSON.parse(invoice.lineItems) as Array<{
          description: string; quantity: number; unitPrice: number; vatPercent: number;
        }>;

        for (const item of lineItems) {
          if (!item.description?.trim() || item.unitPrice <= 0) continue;
          const lineTotal = item.quantity * item.unitPrice;
          allEntries.push({
            date: invoice.issueDate, type: 'SALE', amount: lineTotal,
            description: `${invoice.invoiceNumber} - ${item.description}`,
            source: 'invoice', sourceId: invoice.id,
          });
        }
      } catch {
        logger.warn(`Could not parse lineItems for invoice ${invoice.id}`);
      }
    }

    // ─── Enrich per-line entries with journal-entry-derived VAT data ───
    // This is the ONLY source of per-line VAT. No fallback formula is used.
    try {
      const companyId = ctx.activeCompanyId;
      if (companyId) {
        const txVatMap = await enrichTransactionsWithVAT(transactions, companyId);
        const invNumbers = invoices.map(inv => inv.invoiceNumber).filter(Boolean);
        const invVatMap = await enrichInvoicesWithVAT(invNumbers, companyId);

        for (const entry of allEntries) {
          if (entry.source === 'transaction') {
            const jeVAT = txVatMap.get(entry.sourceId);
            if (jeVAT) {
              entry.journalVATAmount = jeVAT.vatAmount;
              entry.journalVATRate = jeVAT.vatRate;
              entry.journalVATCode = jeVAT.vatCode;
            }
          } else if (entry.source === 'invoice') {
            const inv = invoices.find(i => i.id === entry.sourceId);
            if (inv) {
              const jeVAT = invVatMap.get(inv.invoiceNumber);
              if (jeVAT) {
                entry.journalVATAmount = jeVAT.vatAmount;
                entry.journalVATRate = jeVAT.vatRate;
                entry.journalVATCode = jeVAT.vatCode;
              }
            }
          }
        }
      }
    } catch (e) {
      logger.warn('Failed to enrich export entries with journal VAT data:', e);
    }

    allEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // ─── Summary VAT totals from the single source of truth ───
    // Calls the SAME function as /api/vat-register — no independent calculation.
    let vatResult = { totalOutputVAT: 0, totalInputVAT: 0, netVATPayable: 0 };

    try {
      vatResult = await computeVATRegister({
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        date: { gte: fromDate, lte: toDate },
      });
    } catch (e) {
      logger.error('Failed to compute VAT register for export:', e);
    }

    const { totalOutputVAT: registerOutputVAT, totalInputVAT: registerInputVAT } = vatResult;
    const registerNetVAT = r2(registerOutputVAT - registerInputVAT);

    // Build CSV
    const headers = ['Date', 'Type', 'Description', 'Net Amount (DKK)', 'VAT %', 'VAT Amount (DKK)', 'Gross Amount (DKK)', 'Source'];

    const rows = allEntries.map((e) => {
      // Per-line VAT: ONLY use journal-entry-derived amount. No fallback formula.
      const lineVAT = e.journalVATAmount ?? 0;
      const lineRate = e.journalVATRate ?? 0;
      return [
        e.date.toISOString().split('T')[0],
        e.type === 'PURCHASE' ? 'Purchase' : 'Sale',
        `"${e.description.replace(/"/g, '""')}"`,
        e.amount.toFixed(2),
        lineRate.toFixed(1),
        lineVAT.toFixed(2),
        (e.amount + lineVAT).toFixed(2),
        e.source,
      ];
    });

    const totalNet = allEntries.reduce((sum, e) => sum + e.amount, 0);

    rows.push([]);
    rows.push(['', 'TOTALS', '', '', '', '', '', '']);
    rows.push(['', 'Total Net Amount', totalNet.toFixed(2), '', '', '', '', '']);
    rows.push(['', 'Output VAT (Sales)', registerOutputVAT.toFixed(2), '', '', '', '', '(from journal entries)']);
    rows.push(['', 'Input VAT (Purchases)', registerInputVAT.toFixed(2), '', '', '', '', '(from journal entries)']);
    rows.push(['', 'Net VAT (to pay/refund)', registerNetVAT.toFixed(2), '', '', '', '', '']);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transactions-${month || 'all'}.csv"`,
      },
    });
  } catch (error) {
    logger.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export transactions' }, { status: 500 });
  }
}
