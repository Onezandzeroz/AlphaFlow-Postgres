import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';

// GET /api/companies - List user's companies
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberships = await db.userCompany.findMany({
      where: { userId: ctx.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            isDemo: true,
            isActive: true,
            cvrNumber: true,
            companyType: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({
      companies: memberships.map(m => ({
        id: m.company.id,
        name: m.company.name,
        role: m.role,
        isDemo: m.company.isDemo,
        isActive: m.company.isActive,
        cvrNumber: m.company.cvrNumber,
        companyType: m.company.companyType,
        joinedAt: m.joinedAt,
        createdAt: m.company.createdAt,
      })),
    });
  } catch (error) {
    logger.error('List companies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
