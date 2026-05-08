import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// POST /api/auth/verify-email — Verify email with token (public)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    logger.info(`[VERIFY-EMAIL] Received verify request, token length: ${token?.length ?? 0}, type: ${typeof token}`);

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Verification token is required' }, { status: 400 });
    }

    // Find user by token
    const user = await db.user.findUnique({
      where: { emailVerificationToken: token },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    logger.info(`[VERIFY-EMAIL] User lookup result: ${user ? `found (id=${user.id}, verified=${user.emailVerified})` : 'not found'}`);

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 400 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: 'Email is already verified' });
    }

    // Mark as verified and clear token
    await db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      },
    });

    logger.info(`[VERIFY-EMAIL] ✅ Email verified for user ${user.id} (${user.email})`);

    return NextResponse.json({ message: 'Email verified successfully' });
  } catch (error) {
    logger.error('[VERIFY-EMAIL] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
