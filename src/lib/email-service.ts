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
 *
 * IMPORTANT: All env vars are read lazily at SEND TIME, not at module load.
 * Next.js may import this module during the build phase when .env vars
 * are not yet available. Module-level constants would be permanently
 * baked in to their default values.
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

// ─── LAZY ENV VARS ────────────────────────────────────────────────
// ALL process.env reads happen at CALL TIME, never at module load.
// Next.js imports modules during build when env vars may not be set,
// which would permanently lock values to their defaults.

function getEmailFrom(): string {
  return process.env.EMAIL_FROM || 'noreply@alphaai.dk';
}

function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:3000';
}

// ─── TRANSPORT ────────────────────────────────────────────────────

interface TransportResult {
  transport: nodemailer.Transporter;
  isSmtpConfigured: boolean;
}

const _transportCache: { result: TransportResult | null; envSig: string | null } = {
  result: null,
  envSig: null,
};

let _transportLogged = false; // Log config once at startup, not on every send

function getTransport(): TransportResult {
  const sig = `${process.env.SMTP_HOST}|${process.env.SMTP_USER}|${process.env.SMTP_PASS}|${process.env.SMTP_PORT}`;
  // Re-use cached transport if env hasn't changed
  if (_transportCache.result && _transportCache.envSig === sig) {
    return _transportCache.result;
  }

  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  const result: TransportResult = configured
    ? {
        transport: nodemailer.createTransport({
          host: process.env.SMTP_HOST!,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
          auth: {
            user: process.env.SMTP_USER!,
            pass: process.env.SMTP_PASS!,
          },
        }),
        isSmtpConfigured: true,
      }
    : {
        transport: nodemailer.createTransport({ jsonTransport: true }),
        isSmtpConfigured: false,
      };

  // Log the email configuration (visible in production via warn)
  if (!_transportLogged) {
    if (configured) {
      logger.warn(`[EMAIL] ✅ SMTP configured — host=${process.env.SMTP_HOST} port=${process.env.SMTP_PORT || '587'} from=${getEmailFrom()} appUrl=${getAppUrl()}`);
    } else {
      logger.warn('[EMAIL] ⚠️ SMTP NOT configured — using dev mode (jsonTransport). No real emails will be sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
    _transportLogged = true;
  }

  _transportCache.result = result;
  _transportCache.envSig = sig;
  return result;
}

// ─── CORE SEND ────────────────────────────────────────────────────

/**
 * Send an email and log it to the database.
 * In dev mode (no SMTP), emails are logged to console via jsonTransport.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; logId: string }> {
  const logId = crypto.randomUUID();

  let smtpResult: { info: unknown; isSmtpConfigured: boolean } | null = null;

  try {
    const { transport, isSmtpConfigured } = getTransport();
    const emailFrom = getEmailFrom();

    const info = await transport.sendMail({
      from: emailFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      headers: {
        'X-Email-Log-Id': logId,
      },
    });

    // Store result for logging outside the DB write try/catch
    smtpResult = { info, isSmtpConfigured };

    const status: string = isSmtpConfigured ? 'sent' : 'dev-logged';

    // Log to database — separate try/catch so DB failure doesn't
    // make a successful SMTP send appear to fail
    try {
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
    } catch (dbError) {
      // DB write failed but email was sent — log but don't fail
      logger.warn(`[EMAIL] Email was ${status} but DB log write failed for logId=${logId}`, dbError);
    }

    // In dev mode, log the email to console for easy inspection
    if (!isSmtpConfigured) {
      const envelope = (info as unknown as Record<string, unknown>).message;
      logger.warn(`[EMAIL-DEV] To: ${opts.to}`, {
        subject: opts.subject,
        template: opts.template,
        logId,
        envelope,
      });
    }

    // Use warn for all email status so it's visible in production logs
    if (status === 'dev-logged') {
      logger.warn(`[EMAIL] ${status}: to=${opts.to} template=${opts.template} logId=${logId} from=${emailFrom}`);
    } else {
      logger.warn(`[EMAIL] ${status}: to=${opts.to} template=${opts.template} logId=${logId} from=${emailFrom}`);
    }

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

    logger.error(`[EMAIL] ❌ Failed to send to=${opts.to} from=${getEmailFrom()}: ${errorMessage}`);
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
  const verifyUrl = `${getAppUrl()}/?verify=${token}`;
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
  const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;
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
  const acceptUrl = `${getAppUrl()}/?invite=${token}`;
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
