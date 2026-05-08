import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { tenantFilter } from '@/lib/rbac';
import { create } from 'xmlbuilder2';
import { logger } from '@/lib/logger';
import {
  validateSAFT,
  logValidationResults,
} from '@/lib/saft-validator';

// Danish SAF-T export endpoint
// Based on SAF-T Financial schema version 1.0 (Danish Tax Authority - Skattestyrelsen)
// Rewritten to use double-entry journal entries as the sole data source.

// ─── VAT Code System (Danish) — single source of truth from vat-utils.ts ──

import { VAT_RATE_MAP, OUTPUT_VAT_CODES, INPUT_VAT_CODES } from '@/lib/vat-utils';

// ─── Helpers ────────────────────────────────────────────────────────

const r = (n: number) => Math.round(n * 100) / 100;
const formatDate = (date: Date) => date.toISOString().substring(0, 10);
const formatDateTime = (date: Date) => date.toISOString();
const formatNumber = (num: number) => num.toFixed(2);

// ─── GET Handler ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Period parsing ──
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let periodStart: Date;
    let periodEnd: Date;

    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      periodStart = new Date(year, monthNum - 1, 1);
      periodEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);
    } else if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
      periodEnd.setHours(23, 59, 59, 999);
    } else {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // ── Company info ──
    const companyData = ctx.activeCompanyId
      ? await db.company.findUnique({ where: { id: ctx.activeCompanyId } })
      : null;

    const companyName = companyData?.name || ctx.businessName || ctx.email.split('@')[0];
    const companyCVR = companyData?.cvrNumber || 'DK' + ctx.id.substring(0, 8).toUpperCase();
    const companyAddress = companyData?.address || '';
    const companyEmail = companyData?.email || ctx.email;
    const companyPhone = companyData?.phone || '';

    // ── Fetch journal entries (POSTED, non-cancelled) ──
    const filter = tenantFilter(ctx);

    const journalEntries = await db.journalEntry.findMany({
      where: {
        ...filter,
        status: 'POSTED',
        cancelled: false,
        date: { gte: periodStart, lte: periodEnd },
      },
      include: {
        lines: {
          include: { account: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { date: 'asc' },
    });

    logger.info(
      `[SAF-T Export] Fetched ${journalEntries.length} journal entries for period ${month || 'custom'}`,
    );

    // ── Calculate VAT totals from journal entry lines ──
    const vatCodeMap = new Map<string, { debitTotal: number; creditTotal: number }>();

    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        const code = line.vatCode || 'NONE';
        const existing = vatCodeMap.get(code) || { debitTotal: 0, creditTotal: 0 };
        existing.debitTotal += line.debit || 0;
        existing.creditTotal += line.credit || 0;
        vatCodeMap.set(code, existing);
      }
    }

    let totalOutputVAT = 0;
    let totalInputVAT = 0;

    // Output VAT: net = credit - debit
    for (const code of OUTPUT_VAT_CODES) {
      const data = vatCodeMap.get(code);
      if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
        totalOutputVAT += r(data.creditTotal - data.debitTotal);
      }
    }

    // Input VAT: net = debit - credit
    for (const code of INPUT_VAT_CODES) {
      const data = vatCodeMap.get(code);
      if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
        totalInputVAT += r(data.debitTotal - data.creditTotal);
      }
    }

    totalOutputVAT = r(totalOutputVAT);
    totalInputVAT = r(totalInputVAT);
    const totalVAT = r(totalOutputVAT + totalInputVAT);

    // VAT breakdown by code for TaxCodeTable and VATTotals
    const vatBreakdown: Array<{
      code: string;
      rate: number;
      description: string;
      debitTotal: number;
      creditTotal: number;
      netAmount: number;
    }> = [];

    const allVatCodes = [...OUTPUT_VAT_CODES, ...INPUT_VAT_CODES, 'NONE'];
    for (const code of allVatCodes) {
      const data = vatCodeMap.get(code);
      if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
        const isOutput = (OUTPUT_VAT_CODES as readonly string[]).includes(code);
        const netAmount = isOutput
          ? r(data.creditTotal - data.debitTotal)
          : r(data.debitTotal - data.creditTotal);

        vatBreakdown.push({
          code,
          rate: VAT_RATE_MAP[code] ?? 0,
          description: getVatCodeDescription(code),
          debitTotal: r(data.debitTotal),
          creditTotal: r(data.creditTotal),
          netAmount,
        });
      }
    }

    // ── Calculate general ledger totals from journal entry lines ──
    let totalDebit = 0;
    let totalCredit = 0;

    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        totalDebit += line.debit || 0;
        totalCredit += line.credit || 0;
      }
    }

    totalDebit = r(totalDebit);
    totalCredit = r(totalCredit);

    // ── Build SAF-T XML ──
    logger.info('[SAF-T Export] Building XML structure...');

    const doc = create({ version: '1.0', encoding: 'UTF-8' });

    const root = doc.ele('AuditFile', {
      xmlns: 'urn:Oasis/Tax/Accounting/SAF-T/Financial/DK',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      'xsi:schemaLocation':
        'urn:Oasis/Tax/Accounting/SAF-T/Financial/DK Danish_SAF-T_Financial_Schema_v1.0.xsd',
    });

    // ───── 1. Header ─────
    const header = root.ele('Header');
    header.ele('AuditFileVersion').txt('1.0');
    header.ele('AuditFileCountry').txt('DK');
    header.ele('AuditFileDateCreated').txt(formatDateTime(new Date()));
    header.ele('SoftwareCompanyName').txt('AlphaFlow');
    header.ele('SoftwareID').txt('AlphaFlow v1.0');
    header.ele('SoftwareVersion').txt('1.0.0');
    header.ele('CompanyID').txt(companyCVR);
    header.ele('TaxRegistrationNumber').txt(companyCVR);

    const company = header.ele('Company');
    company.ele('RegistrationNumber').txt(companyCVR);
    company.ele('Name').txt(companyName);

    const companyAddressNode = company.ele('Address');
    if (companyAddress) {
      companyAddressNode.ele('StreetName').txt(companyAddress);
    }
    companyAddressNode.ele('Country').txt('DK');

    if (companyEmail) {
      header.ele('EmailAddress').txt(companyEmail);
    }
    if (companyPhone) {
      header.ele('TelephoneNumber').txt(companyPhone);
    }

    const period = header.ele('SelectionCriteria');
    period.ele('PeriodStart').txt(formatDate(periodStart));
    period.ele('PeriodEnd').txt(formatDate(periodEnd));

    header.ele('HeaderComment').txt('SAF-T export generated by AlphaFlow (double-entry journal)');

    // ───── 2. MasterFiles ─────
    const masterFiles = root.ele('MasterFiles');

    // General ledger accounts — fetch from DB
    const generalLedgerAccounts = masterFiles.ele('GeneralLedgerAccounts');

    const userAccounts = await db.account.findMany({
      where: { ...filter },
      orderBy: { number: 'asc' },
    });

    const accountTypeMap: Record<string, string> = {
      ASSET: 'AT',
      LIABILITY: 'LT',
      EQUITY: 'ET',
      REVENUE: 'OT',
      EXPENSE: 'EX',
    };

    const accounts =
      userAccounts.length > 0
        ? userAccounts.map((acc) => ({
            id: acc.number,
            name: acc.name,
            type: accountTypeMap[acc.type] || 'OT',
          }))
        : [
            { id: '3000', name: 'Salgsindtægter', type: 'OT' },
            { id: '5500', name: 'Moms af salg', type: 'OT' },
            { id: '5600', name: 'Moms af køb', type: 'OT' },
            { id: '6000', name: 'Lønomkostninger', type: 'EX' },
            { id: '7000', name: 'Øvrige driftsomkostninger', type: 'EX' },
          ];

    accounts.forEach((acc) => {
      const accountNode = generalLedgerAccounts.ele('Account');
      accountNode.ele('AccountID').txt(acc.id);
      accountNode.ele('AccountDescription').txt(acc.name);
      accountNode.ele('AccountType').txt(acc.type);
    });

    // Tax code table — from actual VAT codes found in journal entries
    const taxCodeTable = masterFiles.ele('TaxCodeTable');

    // Always include standard Danish codes
    const standardDanishCodes = [
      { code: 'S25', description: 'Output VAT 25%', percentage: 25 },
      { code: 'S12', description: 'Output VAT 12%', percentage: 12 },
      { code: 'S0', description: 'Output VAT 0%', percentage: 0 },
      { code: 'SEU', description: 'EU Output VAT 0%', percentage: 0 },
      { code: 'K25', description: 'Input VAT 25%', percentage: 25 },
      { code: 'K12', description: 'Input VAT 12%', percentage: 12 },
      { code: 'K0', description: 'Input VAT 0%', percentage: 0 },
      { code: 'KEU', description: 'EU Input VAT 0%', percentage: 0 },
      { code: 'KUF', description: 'Reverse charge 0%', percentage: 0 },
    ];

    standardDanishCodes.forEach((tc) => {
      const taxCodeNode = taxCodeTable.ele('TaxCode');
      taxCodeNode.ele('TaxCode').txt(tc.code);
      taxCodeNode.ele('Description').txt(tc.description);
      taxCodeNode.ele('TaxPercentage').txt(tc.percentage.toString());
      taxCodeNode.ele('Country').txt('DK');
    });

    // Customers placeholder
    const customers = masterFiles.ele('Customers');
    const customer = customers.ele('Customer');
    customer.ele('CustomerID').txt('CUST-001');
    customer.ele('CustomerTaxID').txt('DK00000000');
    customer.ele('CompanyName').txt('General Customers');

    // ───── 3. GeneralLedgerEntries ─────
    if (journalEntries.length > 0) {
      const generalLedgerEntries = root.ele('GeneralLedgerEntries');

      // Single journal containing all posted entries
      const journal = generalLedgerEntries.ele('Journal');
      journal.ele('JournalID').txt('GL');
      journal.ele('Description').txt('General Ledger (from double-entry journal)');
      journal.ele('Type').txt('GL');

      journalEntries.forEach((entry) => {
        if (!entry.lines || entry.lines.length === 0) return;

        const transaction = journal.ele('Transaction');
        transaction.ele('TransactionID').txt(entry.id);
        transaction.ele('TransactionDate').txt(formatDate(new Date(entry.date)));

        if (entry.reference) {
          transaction.ele('SourceDocumentID').txt(entry.reference);
        }

        const linesNode = transaction.ele('Lines');

        entry.lines.forEach((line, lineIndex) => {
          const lineNode = linesNode.ele('Line');
          lineNode
            .ele('RecordID')
            .txt(`${entry.id}-${lineIndex + 1}`);
          lineNode.ele('AccountID').txt(line.account?.number || line.accountId);
          lineNode.ele('Description').txt(
            line.description || entry.description || '',
          );
          lineNode.ele('DebitAmount').txt(formatNumber(line.debit || 0));
          lineNode.ele('CreditAmount').txt(formatNumber(line.credit || 0));

          if (line.vatCode && line.vatCode !== 'NONE') {
            lineNode.ele('TaxPointDate').txt(formatDate(new Date(entry.date)));
          }
        });
      });
    }

    // ───── 4. SourceDocuments (adapted from journal entries) ─────
    // Identify sales-related journal entries (those with revenue or output VAT lines)
    const salesRelatedEntries = journalEntries.filter((entry) =>
      entry.lines.some(
        (line) =>
          line.account?.type === 'REVENUE' ||
          line.account?.group === 'SALES_REVENUE' ||
          line.account?.group === 'OUTPUT_VAT',
      ),
    );

    if (salesRelatedEntries.length > 0) {
      const sourceDocuments = root.ele('SourceDocuments');
      const salesInvoices = sourceDocuments.ele('SalesInvoices');

      salesRelatedEntries.forEach((entry, index) => {
        // Gather revenue/output VAT lines for this entry
        const salesLines = entry.lines.filter(
          (line) =>
            line.account?.type === 'REVENUE' ||
            line.account?.group === 'SALES_REVENUE' ||
            line.account?.group === 'OUTPUT_VAT',
        );

        if (salesLines.length === 0) return;

        const invoice = salesInvoices.ele('Invoice');
        invoice
          .ele('InvoiceNo')
          .txt(entry.reference || `JE-${(index + 1).toString().padStart(6, '0')}`);
        invoice.ele('InvoiceDate').txt(formatDate(new Date(entry.date)));
        invoice.ele('CustomerID').txt('CUST-001');
        invoice.ele('InvoiceType').txt('Invoice');

        const invLines = invoice.ele('Lines');

        salesLines.forEach((line, lineIdx) => {
          if (line.account?.group === 'OUTPUT_VAT') return; // VAT lines handled separately

          const invLine = invLines.ele('Line');
          invLine.ele('LineNumber').txt((lineIdx + 1).toString());
          invLine
            .ele('Description')
            .txt(line.description || entry.description || '');

          const quantity = (line.debit || line.credit || 1);
          invLine.ele('Quantity').txt('1');
          invLine.ele('UnitPrice').txt(formatNumber(line.credit || line.debit || 0));
          invLine.ele('TaxBaseAmount').txt(formatNumber(line.credit || line.debit || 0));

          // Find the VAT code from this line or a companion output VAT line
          const vatCode = line.vatCode || 'NONE';
          if (vatCode !== 'NONE') {
            const invTax = invLine.ele('Tax');
            invTax.ele('TaxCode').txt(vatCode);
            invTax
              .ele('TaxPercentage')
              .txt((VAT_RATE_MAP[vatCode] ?? 0).toString());

            // VAT amount from the corresponding output VAT line
            const vatLine = entry.lines.find(
              (l) => l.account?.group === 'OUTPUT_VAT' && l.credit > 0,
            );
            invTax
              .ele('TaxAmount')
              .txt(formatNumber(vatLine?.credit || 0));
          }

          const lineTotal = (line.credit || line.debit || 0) + (entry.lines.find(
            (l) => l.account?.group === 'OUTPUT_VAT' && l.credit > 0,
          )?.credit || 0);

          const settlement = invoice.ele('Settlement');
          settlement.ele('SettlementAmount').txt(formatNumber(lineTotal));
        });
      });
    }

    // ───── 5. Totals ─────
    const totalsElement = root.ele('Totals');
    totalsElement
      .ele('NumberOfEntries')
      .txt(journalEntries.length.toString());
    totalsElement.ele('TotalDebit').txt(formatNumber(totalDebit));
    totalsElement.ele('TotalCredit').txt(formatNumber(totalCredit));

    // VAT totals grouped by code
    const vatTotals = totalsElement.ele('VATTotals');
    vatBreakdown.forEach((vb) => {
      if (vb.code === 'NONE') return; // Skip non-VAT lines in totals
      const vatTotal = vatTotals.ele('VATTotal');
      vatTotal.ele('VATCode').txt(vb.code);
      vatTotal.ele('VATRate').txt(vb.rate.toString());
      vatTotal.ele('TaxableAmount').txt(formatNumber(vb.netAmount));
      vatTotal
        .ele('VATAmount')
        .txt(formatNumber(vb.netAmount)); // Net amount IS the VAT for VAT-only lines
    });

    totalsElement.ele('TotalVATAmount').txt(formatNumber(totalVAT));
    totalsElement.ele('GrandTotal').txt(formatNumber(r(totalCredit + totalInputVAT)));

    // Convert to XML string
    const xmlString = doc.end({ prettyPrint: true });

    // ───── Schema Validation ─────
    logger.info('[SAF-T Export] Validating generated XML against Danish schema...');

    const schemaValidation = validateSAFT(xmlString);
    logValidationResults(schemaValidation, 'SAF-T Schema Validation');

    // Response headers with validation info
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="SAF-T-${month || 'export'}-${Date.now()}.xml"`,
      'X-Validation-Valid': schemaValidation.isValid ? 'true' : 'false',
      'X-Validation-Errors': schemaValidation.errors.length.toString(),
      'X-Validation-Warnings': schemaValidation.warnings.length.toString(),
      'X-Validation-Checks': schemaValidation.summary.totalChecks.toString(),
      'X-Validation-Passed': schemaValidation.summary.passed.toString(),
    };

    // Log summary
    logger.info(
      `[SAF-T Export] Export complete. Journal entries: ${journalEntries.length}, ` +
        `Total Debit: ${formatNumber(totalDebit)}, Total Credit: ${formatNumber(totalCredit)}, ` +
        `Output VAT: ${formatNumber(totalOutputVAT)}, Input VAT: ${formatNumber(totalInputVAT)}, ` +
        `Net VAT: ${formatNumber(totalOutputVAT - totalInputVAT)}. ` +
        `Valid: ${schemaValidation.isValid}, Errors: ${schemaValidation.errors.length}, Warnings: ${schemaValidation.warnings.length}`,
    );

    return new NextResponse(xmlString, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error('[SAF-T Export] Critical error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate SAF-T file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// ─── VAT Code Description Helper ────────────────────────────────────

function getVatCodeDescription(code: string): string {
  const descriptions: Record<string, string> = {
    S25: 'Output VAT 25% (Salgsmoms)',
    S12: 'Output VAT 12% (Salgsmoms)',
    S0: 'Output VAT 0%',
    SEU: 'EU Output VAT 0% (Ydelser til EU)',
    K25: 'Input VAT 25% (Købsmoms)',
    K12: 'Input VAT 12% (Købsmoms)',
    K0: 'Input VAT 0%',
    KEU: 'EU Input VAT 0% (Varekøb EU)',
    KUF: 'Reverse charge 0%',
    NONE: 'No VAT',
  };
  return descriptions[code] || code;
}
