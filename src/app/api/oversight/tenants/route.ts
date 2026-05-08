import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * GET /api/oversight/tenants — List all tenants for the App Owner oversight view.
 *
 * Only accessible by isSuperDev users (AlphaAi App Owner).
 * Returns all companies with member counts and basic info.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ctx.isSuperDev) {
      return NextResponse.json({ error: 'Forbidden: App Owner access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));
    const skip = (page - 1) * limit;

    // Build where clause for search
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cvrNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch all companies with member count
    const [companies, total] = await Promise.all([
      db.company.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          cvrNumber: true,
          companyType: true,
          isDemo: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.company.count({ where }),
    ]);

    return NextResponse.json({
      tenants: companies.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        cvrNumber: c.cvrNumber,
        companyType: c.companyType,
        isDemo: c.isDemo,
        isActive: c.isActive,
        memberCount: c._count.members,
        createdAt: c.createdAt,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error('List oversight tenants error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
