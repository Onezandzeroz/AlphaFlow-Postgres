/**
 * VAT Utilities — SINGLE SOURCE OF TRUTH for all VAT data
 *
 * All VAT totals MUST come from JournalEntryLine records where the associated
 * Account.group is OUTPUT_VAT (udgående moms) or INPUT_VAT (indgående moms).
 *
 * The Invoice.vatTotal and Transaction.vatPercent fields are WRITE-ONLY metadata
 * used for document generation (PDF, OIOUBL) — NEVER for financial reporting.
 *
 * VAT Account Mapping (from seed-chart-of-accounts.ts):
 *   OUTPUT_VAT:  4510 (25%), 4520 (12%)
 *   INPUT_VAT:   5410 (25%), 5420 (12%)
 *
 * VAT Code Mapping (Prisma enum):
 *   Output: S25, S12, S0, SEU
 *   Input:  K25, K12, K0, KEU, KUF
 *
 * ⚠️ ARCHITECTURE RULE: No file outside this module may calculate VAT totals
 *    independently. Every consumer MUST call computeVATRegister() or enrich
 *    via enrichTransactionsWithVAT() / enrichInvoicesWithVAT().
 */

import { db } from '@/lib/db';
import { AccountGroup } from '@prisma/client';

// ─── Single canonical VAT definitions ────────────────────────────────────────

/** VAT code → rate mapping — the ONLY place this is defined */
export const VAT_RATE_MAP: Record<string, number> = {
  S25: 25, S12: 12, S0: 0, SEU: 0,
  K25: 25, K12: 12, K0: 0, KEU: 0, KUF: 0, NONE: 0,
};

/** Output VAT codes (udgående / salgsmoms) */
export const OUTPUT_VAT_CODES = ['S25', 'S12', 'S0', 'SEU'] as const;
/** Input VAT codes (indgående / købsmoms) */
export const INPUT_VAT_CODES = ['K25', 'K12', 'K0', 'KEU', 'KUF'] as const;

/** Valid VAT percentages for Danish tax — the ONLY place this set is defined */
export const VALID_VAT_PERCENTAGES = [0, 12, 25] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VATCodeSummary {
  code: string;
  rate: number;
  debitTotal: number;
  creditTotal: number;
  netAmount: number;
}

export interface VATRegisterResult {
  outputVAT: VATCodeSummary[];
  inputVAT: VATCodeSummary[];
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
  /** Net revenue from journal entry lines on REVENUE accounts (4xxx) */
  totalRevenue: number;
  /** Net expenses from journal entry lines on EXPENSE accounts (5xxx/6xxx) */
  totalExpenses: number;
}

// ─── Rounding helper ──────────────────────────────────────────────────────────

export const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── CORE: computeVATRegister — the single source of truth for VAT totals ───

/**
 * Compute VAT register totals from journal entries for a given period.
 *
 * This is the ONLY function that should produce VAT totals for reporting.
 * Both the /api/vat-register endpoint and the server-side CSV export
 * call this function to ensure consistency.
 *
 * @param whereClause - Prisma JournalEntryWhereInput (must include status: 'POSTED',
 *                      cancelled: false, and date range). The caller adds tenantFilter.
 */
export async function computeVATRegister(
  whereClause: Record<string, unknown>,
): Promise<VATRegisterResult> {
  const entries = await db.journalEntry.findMany({
    where: whereClause,
    include: {
      lines: {
        include: { account: true },
      },
    },
    orderBy: { date: 'asc' },
  });

  // Aggregate lines by VAT code — only lines on OUTPUT_VAT / INPUT_VAT accounts
  const vatCodeMap = new Map<string, { debitTotal: number; creditTotal: number }>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const accountGroup = line.account?.group as AccountGroup | undefined;
      if (accountGroup !== 'OUTPUT_VAT' && accountGroup !== 'INPUT_VAT') continue;

      const code = line.vatCode || 'NONE';
      const existing = vatCodeMap.get(code) || { debitTotal: 0, creditTotal: 0 };
      existing.debitTotal += line.debit || 0;
      existing.creditTotal += line.credit || 0;
      vatCodeMap.set(code, existing);
    }
  }

  // Build output VAT summary
  const outputVAT: VATCodeSummary[] = [];
  let totalOutputVAT = 0;

  for (const code of OUTPUT_VAT_CODES) {
    const data = vatCodeMap.get(code);
    if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
      const netAmount = r2(data.creditTotal - data.debitTotal);
      totalOutputVAT += netAmount;
      outputVAT.push({
        code,
        rate: VAT_RATE_MAP[code],
        debitTotal: r2(data.debitTotal),
        creditTotal: r2(data.creditTotal),
        netAmount,
      });
    }
  }

  // Build input VAT summary
  const inputVAT: VATCodeSummary[] = [];
  let totalInputVAT = 0;

  for (const code of INPUT_VAT_CODES) {
    const data = vatCodeMap.get(code);
    if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
      const netAmount = r2(data.debitTotal - data.creditTotal);
      totalInputVAT += netAmount;
      inputVAT.push({
        code,
        rate: VAT_RATE_MAP[code],
        debitTotal: r2(data.debitTotal),
        creditTotal: r2(data.creditTotal),
        netAmount,
      });
    }
  }

  totalOutputVAT = r2(totalOutputVAT);
  totalInputVAT = r2(totalInputVAT);
  const netVATPayable = r2(totalOutputVAT - totalInputVAT);

  // Also compute net revenue and expenses from the journal entries.
  // Revenue accounts (SALES_REVENUE, OTHER_REVENUE): natural balance is credit → net = credit - debit
  // Expense accounts (COST_OF_GOODS, PERSONNEL, OTHER_OPERATING, FINANCIAL_EXPENSE): natural balance is debit → net = debit - credit
  let totalRevenue = 0;
  let totalExpenses = 0;

  const REVENUE_GROUPS: string[] = ['SALES_REVENUE', 'OTHER_REVENUE'];
  const EXPENSE_GROUPS: string[] = ['COST_OF_GOODS', 'PERSONNEL', 'OTHER_OPERATING', 'FINANCIAL_EXPENSE'];

  for (const entry of entries) {
    for (const line of entry.lines) {
      const accountGroup = line.account?.group as string | undefined;
      if (!accountGroup) continue;

      if (REVENUE_GROUPS.includes(accountGroup)) {
        totalRevenue += (line.credit || 0) - (line.debit || 0);
      } else if (EXPENSE_GROUPS.includes(accountGroup)) {
        totalExpenses += (line.debit || 0) - (line.credit || 0);
      }
    }
  }

  totalRevenue = r2(totalRevenue);
  totalExpenses = r2(totalExpenses);

  return {
    outputVAT,
    inputVAT,
    totalOutputVAT,
    totalInputVAT,
    netVATPayable,
    totalRevenue,
    totalExpenses,
  };
}

// ─── Per-transaction enrichment ───────────────────────────────────────────────

/**
 * Enrich transactions with journal-entry-derived VAT data.
 *
 * For each transaction, looks up the journal entry created alongside it
 * (by reference `TX-{id}` for purchases) and extracts the VAT amount
 * and VAT code from the journal entry lines on OUTPUT_VAT / INPUT_VAT accounts.
 *
 * Returns a Map<Transaction.id, { vatAmount, vatCode, vatRate }>
 * so the caller can use journal-derived data for display.
 *
 * IMPORTANT: If no journal entry is found for a transaction, that transaction
 * will NOT appear in the returned map. Callers must NOT fall back to
 * `amount × vatPercent / 100` — if enrichment is missing, the correct VAT
 * is already captured in the summary totals via computeVATRegister().
 */
export async function enrichTransactionsWithVAT(
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    description: string;
    vatPercent: number;
    date: string | Date;
  }>,
  companyId: string,
): Promise<Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>> {
  const txIds = transactions.filter(t => !t.id.startsWith('inv-')).map(t => t.id);

  if (txIds.length === 0) return new Map();

  // Purchase JEs use reference = `TX-{id.slice(0, 8)}`
  const partialRefs = txIds.map(id => `TX-${id.slice(0, 8)}`);

  const journalEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      cancelled: false,
      status: 'POSTED',
      OR: partialRefs.map(ref => ({
        reference: { startsWith: ref, mode: 'insensitive' },
      })),
    },
    include: {
      lines: {
        include: {
          account: { select: { id: true, number: true, group: true } },
        },
      },
    },
  });

  const result = new Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>();

  for (const je of journalEntries) {
    if (!je.reference?.startsWith('TX-')) continue;

    let vatAmount = 0;
    let vatCode: string | null = null;
    let vatRate = 0;

    for (const line of je.lines) {
      const group = line.account?.group as AccountGroup | undefined;
      const code = line.vatCode;

      if ((group === 'OUTPUT_VAT' || group === 'INPUT_VAT') && code) {
        const net = group === 'OUTPUT_VAT'
          ? (line.credit || 0) - (line.debit || 0)
          : (line.debit || 0) - (line.credit || 0);

        if (Math.abs(net) > 0.005) {
          vatAmount = Math.round(net * 100) / 100;
          vatCode = code;
          vatRate = VAT_RATE_MAP[code] ?? 0;
        }
      }
    }

    if (vatAmount > 0) {
      const shortRef = je.reference;
      const matchingTx = transactions.find(
        t => t.id.startsWith('inv-') ? false :
          `TX-${t.id.slice(0, 8)}` === shortRef ||
          `TX-${t.id}` === shortRef
      );
      if (matchingTx) {
        result.set(matchingTx.id, { vatAmount, vatCode, vatRate });
      }
    }
  }

  return result;
}

// ─── Per-invoice enrichment ───────────────────────────────────────────────────

/**
 * Derive per-invoice VAT amounts from the journal entries for invoices.
 *
 * Invoice accrual JEs use reference = `{invoiceNumber}`.
 * Cash receipt JEs use reference = `{invoiceNumber}-IND`.
 *
 * Returns a Map<invoiceNumber, { vatAmount, vatCode, vatRate }>.
 * Cash receipt entries (-IND) are skipped since they don't contain VAT lines.
 */
export async function enrichInvoicesWithVAT(
  invoiceNumbers: string[],
  companyId: string,
): Promise<Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>> {
  if (invoiceNumbers.length === 0) return new Map();

  const journalEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      cancelled: false,
      status: 'POSTED',
      reference: {
        in: invoiceNumbers,
      },
    },
    include: {
      lines: {
        include: {
          account: { select: { id: true, number: true, group: true } },
        },
      },
    },
  });

  const result = new Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>();

  for (const je of journalEntries) {
    const invNumber = je.reference?.replace(/-IND$/, '');
    if (!invNumber || result.has(invNumber)) continue;
    // Skip cash receipt entries (-IND) — they don't contain VAT lines
    if (je.reference?.endsWith('-IND')) continue;

    let totalVatAmount = 0;
    let primaryCode: string | null = null;
    let primaryRate = 0;

    for (const line of je.lines) {
      const group = line.account?.group as AccountGroup | undefined;
      const code = line.vatCode;

      if ((group === 'OUTPUT_VAT' || group === 'INPUT_VAT') && code) {
        const net = group === 'OUTPUT_VAT'
          ? (line.credit || 0) - (line.debit || 0)
          : (line.debit || 0) - (line.credit || 0);

        if (Math.abs(net) > 0.005) {
          totalVatAmount += Math.round(net * 100) / 100;
          if (!primaryCode) {
            primaryCode = code;
            primaryRate = VAT_RATE_MAP[code] ?? 0;
          }
        }
      }
    }

    if (totalVatAmount > 0) {
      result.set(invNumber, { vatAmount: totalVatAmount, vatCode: primaryCode, vatRate: primaryRate });
    }
  }

  return result;
}
