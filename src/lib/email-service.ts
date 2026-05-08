/**
 * Email Service for AlphaAi Regnskab
 *
 * Features:
 * - SMTP transport (configurable via env vars)
 * - Dev mode: jsonTransport when no SMTP configured (logs to console)
 * - Helper functions for verification, password reset, invitation, owner notification
 * - Bilingual support (Danish/English)
 * - X-Email-Log-Id header for tracking
 * - EmailLog database entries for audit trail
 */

import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  verificationEmailHtml,
  passwordResetHtml,
  invitationEmailHtml,
  ownerNotificationHtml,
} from '@/lib/email-templates';

// ─── TYPES ────────────────────────────────────────────────────────

export type Language = 'da' | 'en';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  template: 'verification' | 'password-reset' | 'invitation' | 'owner-notification';
  companyId?: string;
  metadata?: Record<string, unknown>;
}

// ─── TRANSPORT ────────────────────────────────────────────────────

const isSmtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transport = isSmtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : nodemailer.createTransport({
      jsonTransport: true,
    });

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@alphaai.dk';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── CORE SEND ────────────────────────────────────────────────────

/**
 * Send an email and log it to the database.
 * In dev mode (no SMTP), emails are logged to console via jsonTransport.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; logId: string }> {
  const logId = crypto.randomUUID();

  try {
    const info = await transport.sendMail({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      headers: {
        'X-Email-Log-Id': logId,
      },
    });

    const status: string = isSmtpConfigured ? 'sent' : 'dev-logged';

    // Log to database
    await db.emailLog.create({
      data: {
        id: logId,
        to: opts.to,
        subject: opts.subject,
        template: opts.template,
        status,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        companyId: opts.companyId ?? null,
      },
    });

    // In dev mode, log the email to console for easy inspection
    if (!isSmtpConfigured) {
      // jsonTransport returns the full mail object — cast to access it
      const envelope = (info as unknown as Record<string, unknown>).message;
      logger.info(`[EMAIL-DEV] To: ${opts.to}`, {
        subject: opts.subject,
        template: opts.template,
        logId,
        envelope,
      });
    }

    logger.info(`[EMAIL] ${status}: to=${opts.to} template=${opts.template} logId=${logId}`);
    return { success: true, logId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failure to database
    try {
      await db.emailLog.create({
        data: {
          id: logId,
          to: opts.to,
          subject: opts.subject,
          template: opts.template,
          status: 'failed',
          errorMessage,
          metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
          companyId: opts.companyId ?? null,
        },
      });
    } catch (dbError) {
      logger.error('[EMAIL] Failed to write email log:', dbError);
    }

    logger.error(`[EMAIL] Failed to send to=${opts.to}:`, error);
    return { success: false, logId };
  }
}

// ─── VERIFICATION EMAIL ───────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  token: string,
  language: Language = 'da',
  companyId?: string
): Promise<{ success: boolean; logId: string }> {
  const verifyUrl = `${APP_URL}/?verify=${token}`;
  const subject =
    language === 'da'
      ? 'Bekræft din e-mailadresse — AlphaAi Regnskab'
      : 'Verify your email address — AlphaAi Regnskab';

  return sendEmail({
    to,
    subject,
    html: verificationEmailHtml(language, verifyUrl),
    template: 'verification',
    companyId,
    metadata: { token, language },
  });
}

// ─── PASSWORD RESET EMAIL ─────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  language: Language = 'da',
  companyId?: string
): Promise<{ success: boolean; logId: string }> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  const subject =
    language === 'da'
      ? 'Nulstil din adgangskode — AlphaAi Regnskab'
      : 'Reset your password — AlphaAi Regnskab';

  return sendEmail({
    to,
    subject,
    html: passwordResetHtml(language, resetUrl),
    template: 'password-reset',
    companyId,
    metadata: { token, language },
  });
}

// ─── INVITATION EMAIL ─────────────────────────────────────────────

export async function sendInvitationEmail(
  to: string,
  companyName: string,
  role: string,
  token: string,
  language: Language = 'da',
  companyId?: string,
  password?: string
): Promise<{ success: boolean; logId: string }> {
  const acceptUrl = `${APP_URL}/?invite=${token}`;
  const subject =
    language === 'da'
      ? `Invitation til ${companyName} — AlphaAi Regnskab`
      : `Invitation to ${companyName} — AlphaAi Regnskab`;

  return sendEmail({
    to,
    subject,
    html: invitationEmailHtml(language, companyName, role, acceptUrl, password),
    template: 'invitation',
    companyId,
    metadata: { token, language, companyName, role, newUser: !!password },
  });
}

// ─── OWNER NOTIFICATION EMAIL ─────────────────────────────────────

export async function sendOwnerNotification(
  to: string,
  subject: string,
  bodyHtml: string,
  language: Language = 'da',
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; logId: string }> {
  return sendEmail({
    to,
    subject: `🔔 ${subject} — AlphaAi Regnskab`,
    html: ownerNotificationHtml(language, subject, bodyHtml),
    template: 'owner-notification',
    metadata,
  });
}
