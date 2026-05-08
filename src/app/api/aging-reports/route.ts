import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { companyScope, type AuthContext } from '@/lib/rbac';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// Helper to compute days between two dates
function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

// Format a Date to YYYY-MM-DD string
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Types ──────────────────────────────────────────────────────────

interface OpenItem {
  date: Date;
  amount: number;
  description: string;
  reference: string;
  journalEntryId: string;
}

interface AgingEntry {
  journalEntryId: string;
  date: string;
  description: string;
  amount: number;
  daysOld: number;
}

interface AccountAging {
  accountId: string;
  accountNumber: string;
  accountName: string;
  current: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  days120plus: number;
  total: number;
  entries: AgingEntry[];
}

interface AgingBucketSummary {
  current: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  days120plus: number;
  total: number;
}

// ─── FIFO Aging Helper ──────────────────────────────────────────────
// Processes journal entry lines chronologically per account.
// For receivables: debits create open items, credits reduce them FIFO.
// For payables: credits create open items, debits reduce them FIFO.
// Returns the remaining open items aged into buckets.

interface LineRecord {
  date: Date;
  debit: number;
  credit: number;
  description: string;
  reference: string;
  journalEntryId: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
}

function fifoAgeItems(
  lines: LineRecord[],
  asOf: Date,
  isOpenItemDebit: boolean // true for receivables (debits = new items), false for payables (credits = new items)
): AccountAging[] {
  // Group lines by account
  const accountLines = new Map<string, { number: string; name: string; lines: LineRecord[] }>();

  for (const line of lines) {
    if (!accountLines.has(line.accountId)) {
      accountLines.set(line.accountId, { number: line.accountNumber, name: line.accountName, lines: [] });
    }
    accountLines.get(line.accountId)!.lines.push(line);
  }

  const results: AccountAging[] = [];

  for (const [accountId, { number, name: accountName, lines: acctLines }] of accountLines) {
    // Sort lines chronologically
    acctLines.sort((a, b) => a.date.getTime() - b.date.getTime());

    // FIFO open items queue
    const openItems: OpenItem[] = [];

    for (const line of acctLines) {
      if (isOpenItemDebit) {
        // Receivables: debit = new invoice (adds to open), credit = payment (reduces FIFO)
        if (line.debit > 0) {
          openItems.push({
            date: line.date,
            amount: line.debit,
            description: line.description,
            reference: line.reference,
            journalEntryId: line.journalEntryId,
          });
        }
        if (line.credit > 0) {
          let remaining = line.credit;
          while (remaining > 0 && openItems.length > 0) {
            const oldest = openItems[0];
            if (oldest.amount <= remaining) {
              remaining -= oldest.amount;
              openItems.shift();
            } else {
              oldest.amount -= remaining;
              remaining = 0;
            }
          }
        }
      } else {
        // Payables: credit = new purchase (adds to open), debit = payment (reduces FIFO)
        if (line.credit > 0) {
          openItems.push({
            date: line.date,
            amount: line.credit,
            description: line.description,
            reference: line.reference,
            journalEntryId: line.journalEntryId,
          });
        }
        if (line.debit > 0) {
          let remaining = line.debit;
          while (remaining > 0 && openItems.length > 0) {
            const oldest = openItems[0];
            if (oldest.amount <= remaining) {
              remaining -= oldest.amount;
              openItems.shift();
            } else {
              oldest.amount -= remaining;
              remaining = 0;
            }
          }
        }
      }
    }

    // Build aging buckets from remaining open items
    const aging: AccountAging = {
      accountId,
      accountNumber: number,
      accountName,
      current: 0,
      days31to60: 0,
      days61to90: 0,
      days91to120: 0,
      days120plus: 0,
      total: 0,
      entries: [],
    };

    for (const item of openItems) {
      const daysOld = daysBetween(item.date, asOf);
      aging.total += item.amount;

      if (daysOld <= 30) {
        aging.current += item.amount;
      } else if (daysOld <= 60) {
        aging.days31to60 += item.amount;
      } else if (daysOld <= 90) {
        aging.days61to90 += item.amount;
      } else if (daysOld <= 120) {
        aging.days91to120 += item.amount;
      } else {
        aging.days120plus += item.amount;
      }

      aging.entries.push({
        journalEntryId: item.journalEntryId,
        date: formatDate(item.date),
        description: item.description || item.reference || '',
        amount: r(item.amount),
        daysOld,
      });
    }

    // Round all bucket totals
    aging.current = r(aging.current);
    aging.days31to60 = r(aging.days31to60);
    aging.days61to90 = r(aging.days61to90);
    aging.days91to120 = r(aging.days91to120);
    aging.days120plus = r(aging.days120plus);
    aging.total = r(aging.total);

    // Only include accounts with outstanding balance
    if (aging.total > 0) {
      results.push(aging);
    }
  }

  return results;
}

// ─── GET - Generate Aging Report ────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const asOfStr = searchParams.get('asOf');

    // Validate type parameter
    if (!type || (!['receivables', 'payables'].includes(type))) {
      return NextResponse.json(
        { error: 'Missing or invalid type parameter. Must be "receivables" or "payables".' },
        { status: 400 }
      );
    }

    // Determine asOf date (defaults to today)
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    asOf.setHours(23, 59, 59, 999);

    if (isNaN(asOf.getTime())) {
      return NextResponse.json(
        { error: 'Invalid asOf date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    if (type === 'receivables') {
      return generateReceivablesAging(ctx, asOf, asOfStr || formatDate(new Date()));
    } else {
      return generatePayablesAging(ctx, asOf, asOfStr || formatDate(new Date()));
    }
  } catch (error) {
    logger.error('Aging reports error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── Receivables Aging (Debitorrapport) ─────────────────────────────

async function generateReceivablesAging(
  ctx: AuthContext,
  asOf: Date,
  asOfStr: string
) {
  // Fetch all journal entry lines for RECEIVABLES accounts
  // up to asOf date, for POSTED non-cancelled entries
  const scope = companyScope(ctx);
  if (!('companyId' in scope)) {
    return NextResponse.json({ type: 'receivables', asOf: asOfStr, summary: { current: 0, days31to60: 0, days61to90: 0, days91to120: 0, days120plus: 0, total: 0 }, accounts: [] });
  }

  const jeLines = await db.journalEntryLine.findMany({
    where: {
      account: {
        group: AccountGroup.RECEIVABLES,
        companyId: scope.companyId,
      },
      journalEntry: {
        status: 'POSTED',
        cancelled: false,
        date: {
          lte: asOf,
        },
      },
    },
    include: {
      journalEntry: {
        select: {
          date: true,
          description: true,
          reference: true,
          status: true,
          cancelled: true,
        },
      },
      account: {
        select: {
          id: true,
          number: true,
          name: true,
        },
      },
    },
  });

  // Build line records for FIFO processing
  const lines: LineRecord[] = jeLines
    .filter((l) => l.journalEntry.status === 'POSTED' && !l.journalEntry.cancelled)
    .map((l) => ({
      date: new Date(l.journalEntry.date),
      debit: l.debit || 0,
      credit: l.credit || 0,
      description: l.journalEntry.description || '',
      reference: l.journalEntry.reference || '',
      journalEntryId: l.journalEntryId,
      accountId: l.account.id,
      accountNumber: l.account.number,
      accountName: l.account.name,
    }));

  // Process with FIFO: debits create open items, credits reduce them
  const accounts = fifoAgeItems(lines, asOf, true);

  // Build summary
  const summary: AgingBucketSummary = {
    current: 0,
    days31to60: 0,
    days61to90: 0,
    days91to120: 0,
    days120plus: 0,
    total: 0,
  };

  for (const acc of accounts) {
    summary.current += acc.current;
    summary.days31to60 += acc.days31to60;
    summary.days61to90 += acc.days61to90;
    summary.days91to120 += acc.days91to120;
    summary.days120plus += acc.days120plus;
    summary.total += acc.total;
  }

  // Round summary
  summary.current = r(summary.current);
  summary.days31to60 = r(summary.days31to60);
  summary.days61to90 = r(summary.days61to90);
  summary.days91to120 = r(summary.days91to120);
  summary.days120plus = r(summary.days120plus);
  summary.total = r(summary.total);

  // Sort accounts by number
  accounts.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return NextResponse.json({
    type: 'receivables',
    asOf: asOfStr,
    summary,
    accounts,
  });
}

// ─── Payables Aging (Kreditorrapport) ───────────────────────────────

async function generatePayablesAging(
  ctx: AuthContext,
  asOf: Date,
  asOfStr: string
) {
  // Fetch all journal entry lines for PAYABLES accounts
  // up to asOf date, for POSTED non-cancelled entries
  const scope = companyScope(ctx);
  if (!('companyId' in scope)) {
    return NextResponse.json({ type: 'payables', asOf: asOfStr, summary: { current: 0, days31to60: 0, days61to90: 0, days91to120: 0, days120plus: 0, total: 0 }, accounts: [] });
  }

  const jeLines = await db.journalEntryLine.findMany({
    where: {
      account: {
        group: AccountGroup.PAYABLES,
        companyId: scope.companyId,
      },
      journalEntry: {
        status: 'POSTED',
        cancelled: false,
        date: {
          lte: asOf,
        },
      },
    },
    include: {
      journalEntry: {
        select: {
          date: true,
          description: true,
          reference: true,
          status: true,
          cancelled: true,
        },
      },
      account: {
        select: {
          id: true,
          number: true,
          name: true,
        },
      },
    },
  });

  // Build line records for FIFO processing
  const lines: LineRecord[] = jeLines
    .filter((l) => l.journalEntry.status === 'POSTED' && !l.journalEntry.cancelled)
    .map((l) => ({
      date: new Date(l.journalEntry.date),
      debit: l.debit || 0,
      credit: l.credit || 0,
      description: l.journalEntry.description || '',
      reference: l.journalEntry.reference || '',
      journalEntryId: l.journalEntryId,
      accountId: l.account.id,
      accountNumber: l.account.number,
      accountName: l.account.name,
    }));

  // Process with FIFO: credits create open items (purchases), debits reduce them (payments)
  const accounts = fifoAgeItems(lines, asOf, false);

  // Build summary
  const summary: AgingBucketSummary = {
    current: 0,
    days31to60: 0,
    days61to90: 0,
    days91to120: 0,
    days120plus: 0,
    total: 0,
  };

  for (const acc of accounts) {
    summary.current += acc.current;
    summary.days31to60 += acc.days31to60;
    summary.days61to90 += acc.days61to90;
    summary.days91to120 += acc.days91to120;
    summary.days120plus += acc.days120plus;
    summary.total += acc.total;
  }

  // Round summary
  summary.current = r(summary.current);
  summary.days31to60 = r(summary.days31to60);
  summary.days61to90 = r(summary.days61to90);
  summary.days91to120 = r(summary.days91to120);
  summary.days120plus = r(summary.days120plus);
  summary.total = r(summary.total);

  // Sort accounts by number
  accounts.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return NextResponse.json({
    type: 'payables',
    asOf: asOfStr,
    summary,
    accounts,
  });
}
