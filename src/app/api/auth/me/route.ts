import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ user: null });
    }

    // Fetch user's companies for the company selector
    const companies = await db.userCompany.findMany({
      where: { userId: ctx.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            isDemo: true,
            isActive: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    // Check if any App Owner (isSuperDev) exists in the system
    const existingAppOwner = await db.user.findFirst({
      where: { isSuperDev: true },
      select: { id: true },
    });
    const hasAppOwner = existingAppOwner !== null;

    // Append "- App-owner" to company name when the user is the App Owner
    // and their active company is named "AlphaAi"
    let displayCompanyName = ctx.activeCompanyName;
    if (ctx.isSuperDev && displayCompanyName === 'AlphaAi') {
      displayCompanyName = 'AlphaAi - App-owner';
    }

    // For the company list, also append the badge to AlphaAi company if user is SuperDev
    const mappedCompanies = companies.map(c => ({
      id: c.company.id,
      name: c.company.name === 'AlphaAi' && ctx.isSuperDev
        ? 'AlphaAi - App-owner'
        : c.company.name,
      role: c.role,
      isDemo: c.company.isDemo,
      isActive: c.company.isActive,
    }));

    return NextResponse.json({
      user: {
        id: ctx.id,
        email: ctx.email,
        emailVerified: ctx.isSuperDev ? true : ctx.emailVerified,
        businessName: ctx.businessName,
        demoModeEnabled: ctx.demoModeEnabled,
        isDemoCompany: ctx.isDemoCompany,
        isSuperDev: ctx.isSuperDev,
        hasAppOwner,
        activeCompanyId: ctx.activeCompanyId,
        activeCompanyRole: ctx.activeCompanyRole,
        activeCompanyName: displayCompanyName,
        oversightCompanyId: ctx.oversightCompanyId,
        oversightCompanyName: ctx.oversightCompanyName,
        isOversightMode: ctx.isOversightMode,
        companies: mappedCompanies,
      },
    });
  } catch (error) {
    logger.error('Get user error:', error);
    return NextResponse.json({ user: null });
  }
}
