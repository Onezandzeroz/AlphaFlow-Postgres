import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

// GET - Fetch recent unique transaction descriptions for suggestions
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    
    // Get the 20 most recent non-cancelled transactions
    const recentTx = await db.transaction.findMany({
      where: { ...tenantFilter(ctx), cancelled: false },
      orderBy: { date: 'desc' },
      take: 20,
      select: { description: true, type: true },
    });

    // Deduplicate descriptions preserving order, limit to 5
    const seen = new Set<string>();
    const descriptions: { description: string; type: string }[] = [];
    for (const tx of recentTx) {
      const desc = tx.description.trim();
      if (desc && !seen.has(desc)) {
        seen.add(desc);
        descriptions.push({ description: desc, type: tx.type });
      }
      if (descriptions.length >= 5) break;
    }

    return NextResponse.json({ descriptions });
  } catch (error) {
    logger.error('Get recent descriptions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
