import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { destroyAllUserSessions } from '@/lib/session';
import { logger } from '@/lib/logger';

// POST /api/auth/reset-password — Reset password with token (public)
export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Reset token is required' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Find user by reset token
    const user = await db.user.findUnique({
      where: { resetPasswordToken: token },
      select: {
        id: true,
        email: true,
        resetPasswordExpires: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    // Check if token has expired
    if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
      // Clear expired token
      await db.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
      });
      return NextResponse.json({ error: 'Reset token has expired. Please request a new one.' }, { status: 400 });
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user: set new password, clear reset token fields
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    // Invalidate all existing sessions (force re-login)
    await destroyAllUserSessions(user.id);

    logger.info(`Password reset successful for user ${user.id} (${user.email})`);

    return NextResponse.json({ message: 'Password has been reset successfully. Please log in with your new password.' });
  } catch (error) {
    logger.error('Reset password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
