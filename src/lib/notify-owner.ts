/**
 * Owner Notification Helper
 *
 * Finds the SuperDev user and sends them a notification email.
 * If no SuperDev user exists, silently skips.
 */

import { db } from '@/lib/db';
import { sendOwnerNotification } from '@/lib/email-service';
import type { Language } from '@/lib/email-service';
import { logger } from '@/lib/logger';

/**
 * Send a notification email to the app owner (SuperDev user).
 * Silently skips if no SuperDev user is configured.
 */
export async function notifyOwner(
  subject: string,
  bodyHtml: string,
  metadata?: Record<string, unknown>,
  language: Language = 'da'
): Promise<void> {
  try {
    const superDev = await db.user.findFirst({
      where: { isSuperDev: true },
      select: { id: true, email: true },
    });

    if (!superDev) {
      logger.debug('[NOTIFY-OWNER] No SuperDev user found — skipping notification');
      return;
    }

    await sendOwnerNotification(superDev.email, subject, bodyHtml, language, {
      ...metadata,
      superDevUserId: superDev.id,
    });
  } catch (error) {
    // Owner notifications should never crash the application
    logger.error('[NOTIFY-OWNER] Failed to send owner notification:', error);
  }
}
