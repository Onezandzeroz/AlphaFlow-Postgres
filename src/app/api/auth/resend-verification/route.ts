import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email-service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// POST /api/auth/resend-verification — Resend verification email (unauthenticated)
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`resend-verify:${clientIp}`, {
      maxRequests: 3,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerified: true, updatedAt: true, isSuperDev: true },
    });

    if (!user) {
      // Don't reveal whether the email exists — return generic success
      return NextResponse.json({ success: true });
    }

    // SuperDev never needs verification
    if (user.isSuperDev) {
      return NextResponse.json({ success: true });
    }

    // Already verified
    if (user.emailVerified) {
      return NextResponse.json({ success: true });
    }

    // Rate limit: once per minute
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    if (user.updatedAt > oneMinuteAgo) {
      return NextResponse.json(
        { error: 'Please wait before requesting another verification email' },
        { status: 429 }
      );
    }

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');

    await db.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: token },
    });

    // Find the user's company for email context
    const userCompany = await db.userCompany.findFirst({
      where: { userId: user.id },
      select: { companyId: true },
    });

    const result = await sendVerificationEmail(
      user.email,
      token,
      'da',
      userCompany?.companyId ?? undefined
    );

    if (!result.success) {
      logger.warn(`Verification email failed to resend for ${user.email}, logId=${result.logId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Resend verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
