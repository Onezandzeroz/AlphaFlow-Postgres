import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditAuth, requestMetadata } from '@/lib/audit';
import { sendVerificationEmail } from '@/lib/email-service';
import { notifyOwner } from '@/lib/notify-owner';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: max 3 registrations per minute per IP
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`register:${clientIp}`, {
      maxRequests: 3,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, password, businessName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    // Hash password with bcrypt
    const hashedPassword = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        businessName,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        demoModeEnabled: true,
      },
    });

    // Create a Company for the new user (multi-tenant)
    const companyName = businessName || normalizedEmail.split('@')[0];

    // Enforce unique company name — no two tenants may share a name
    const existingCompany = await db.company.findFirst({
      where: { name: companyName },
    });
    if (existingCompany) {
      return NextResponse.json(
        { error: `A company named "${companyName}" already exists. Please choose a different business name.` },
        { status: 409 }
      );
    }

    // Inherit AppOwner widget defaults (AlphaAi company) for new tenant companies
    const appOwnerCompany = await db.company.findUnique({
      where: { name: 'AlphaAi' },
      select: { dashboardWidgets: true },
    });
    const inheritedWidgets = appOwnerCompany?.dashboardWidgets ?? null;

    const company = await db.company.create({
      data: {
        name: companyName,
        email: normalizedEmail,
        cvrNumber: '',
        address: '',
        phone: '',
        bankName: '',
        bankAccount: '',
        bankRegistration: '',
        invoicePrefix: 'INV',
        currentYear: new Date().getFullYear(),
        dashboardWidgets: inheritedWidgets,
      },
    });

    // Assign user as OWNER of the company
    await db.userCompany.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: 'OWNER',
      },
    });

    // Send verification email (don't block registration if it fails)
    try {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await db.user.update({
        where: { id: user.id },
        data: { emailVerificationToken: verificationToken },
      });
      const emailResult = await sendVerificationEmail(
        normalizedEmail,
        verificationToken,
        'da',
        company.id
      );
      if (!emailResult.success) {
        logger.warn(`Verification email failed to send for ${normalizedEmail}, logId=${emailResult.logId}`);
      }
    } catch (emailError) {
      logger.warn('Failed to send verification email during registration:', emailError);
    }

    // NOTE: We do NOT auto-seed the chart of accounts here.
    // The onboarding flow (Step 2) lets the user explicitly seed their accounts,
    // so the onboarding progress correctly starts at 0/4 for new users.
    // Seeding is available via /api/accounts/seed or the Chart of Accounts page.

    // NOTE: We do NOT create a session here.
    // The user must verify their email before they can log in.
    // The register form shows a "check your email" screen instead.

    // Notify app owner about new tenant (fire-and-forget, non-blocking)
    notifyOwner(
      'Ny tenant registreret',
      `<p>En ny bruger har registreret sig:</p>
      <ul>
        <li><strong>Email:</strong> ${normalizedEmail}</li>
        <li><strong>Virksomhed:</strong> ${company.name}</li>
        <li><strong>Dato:</strong> ${new Date().toLocaleString('da-DK')}</li>
      </ul>`,
      { event: 'new_tenant', userId: user.id, companyId: company.id, companyName: company.name },
      'da'
    );

    // Audit registration
    await auditAuth(user.id, 'REGISTER', requestMetadata(request), company.id);

    // Return success — the client will show "check your email" screen
    return NextResponse.json({
      success: true,
      email: user.email,
      companyName: company.name,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
