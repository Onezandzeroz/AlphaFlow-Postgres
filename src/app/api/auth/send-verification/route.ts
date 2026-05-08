import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { sendVerificationEmail } from '@/lib/email-service';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// POST /api/auth/send-verification — Re-send email verification link
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SuperDev (AlphaAi) never needs to verify email
    if (ctx.isSuperDev) {
      return NextResponse.json({ error: 'AppOwner does not need email verification' }, { status: 400 });
    }

    // Look up the user to get fresh data
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: 'Email is already verified' }, { status: 400 });
    }

    // Rate limit: only allow once per minute (check updatedAt)
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    if (user.updatedAt > oneMinuteAgo) {
      return NextResponse.json(
        { error: 'Please wait before requesting another verification email' },
        { status: 429 }
      );
    }

    // Generate new verification token
    const token = crypto.randomBytes(32).toString('hex');

    await db.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: token },
    });

    // Send verification email (don't block if it fails)
    const result = await sendVerificationEmail(user.email, token, 'da', ctx.activeCompanyId ?? undefined);

    if (!result.success) {
      logger.warn(`Verification email failed to send for user ${user.id}, logId=${result.logId}`);
    }

    return NextResponse.json({
      message: 'Verification email sent',
      logId: result.logId,
    });
  } catch (error) {
    logger.error('Send verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
