/**
 * Email HTML Templates for AlphaAi Regnskab
 *
 * All templates use inline CSS (email clients don't support <style> tags).
 * Bilingual: Danish (default) / English.
 * Primary color: #0d9488 (teal)
 */

type Language = 'da' | 'en';

const APP_NAME = 'AlphaAi Regnskab';
const PRIMARY = '#0d9488';
const PRIMARY_DARK = '#0f766e';
const BG_LIGHT = '#f0fdfa';
const TEXT_DARK = '#1a1a1a';
const TEXT_MUTED = '#6b7280';

// ─── WRAPPER ──────────────────────────────────────────────────────

function wrapperHtml(bodyContent: string, language: Language): string {
  const footer =
    language === 'da'
      ? `Du modtager denne e-mail, fordi du er registreret hos ${APP_NAME}.<br/>
         Hvis du ikke har anmodet om dette, kan du ignorere denne e-mail.`
      : `You are receiving this email because you are registered with ${APP_NAME}.<br/>
         If you did not request this, you can safely ignore this email.`;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${PRIMARY}; padding:24px 32px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:600; letter-spacing:-0.02em;">${APP_NAME}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="margin:0; font-size:12px; color:${TEXT_MUTED}; line-height:1.5;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. ${footer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── BUTTON ───────────────────────────────────────────────────────

function buttonHtml(url: string, text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <a href="${url}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block; background-color:${PRIMARY}; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:12px 28px; border-radius:8px; letter-spacing:-0.01em;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`;
}

// ─── VERIFICATION EMAIL ───────────────────────────────────────────

export function verificationEmailHtml(language: Language, verifyUrl: string): string {
  const heading =
    language === 'da' ? 'Bekræft din e-mailadresse' : 'Verify your email address';
  const body =
    language === 'da'
      ? `Tak for din tilmelding til <strong>${APP_NAME}</strong>.<br/><br/>
         Klik på knappen nedenfor for at bekræfte din e-mailadresse:`
      : `Thank you for signing up for <strong>${APP_NAME}</strong>.<br/><br/>
         Click the button below to verify your email address:`;
  const buttonText =
    language === 'da' ? 'Bekræft e-mail' : 'Verify email';
  const fallback =
    language === 'da'
      ? `Hvis knappen ikke virker, kan du kopiere dette link ind i din browser:<br/>
         <a href="${verifyUrl}" style="color:${PRIMARY}; word-break:break-all;">${verifyUrl}</a>`
      : `If the button doesn't work, copy and paste this link into your browser:<br/>
         <a href="${verifyUrl}" style="color:${PRIMARY}; word-break:break-all;">${verifyUrl}</a>`;

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 24px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
    ${buttonHtml(verifyUrl, buttonText)}
    <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
  `;

  return wrapperHtml(content, language);
}

// ─── PASSWORD RESET EMAIL ─────────────────────────────────────────

export function passwordResetHtml(language: Language, resetUrl: string): string {
  const heading =
    language === 'da' ? 'Nulstil din adgangskode' : 'Reset your password';
  const body =
    language === 'da'
      ? `Vi har modtaget en anmodning om at nulstille din adgangskode.<br/><br/>
         Klik på knappen nedenfor for at vælge en ny adgangskode. Dette link er gyldigt i 1 time.`
      : `We received a request to reset your password.<br/><br/>
         Click the button below to choose a new password. This link is valid for 1 hour.`;
  const buttonText =
    language === 'da' ? 'Nulstil adgangskode' : 'Reset password';
  const fallback =
    language === 'da'
      ? `Hvis knappen ikke virker, kan du kopiere dette link ind i din browser:<br/>
         <a href="${resetUrl}" style="color:${PRIMARY}; word-break:break-all;">${resetUrl}</a><br/><br/>
         Hvis du ikke har anmodet om dette, kan du ignorere denne e-mail.`
      : `If the button doesn't work, copy and paste this link into your browser:<br/>
         <a href="${resetUrl}" style="color:${PRIMARY}; word-break:break-all;">${resetUrl}</a><br/><br/>
         If you didn't request this, you can safely ignore this email.`;

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 24px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
    ${buttonHtml(resetUrl, buttonText)}
    <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
  `;

  return wrapperHtml(content, language);
}

// ─── INVITATION EMAIL ─────────────────────────────────────────────

export function invitationEmailHtml(
  language: Language,
  companyName: string,
  role: string,
  acceptUrl: string,
  password?: string
): string {
  const roleLabel =
    language === 'da'
      ? { OWNER: 'Ejer', ADMIN: 'Administrator', ACCOUNTANT: 'Bogholder', VIEWER: 'Læser', AUDITOR: 'Revisor' }[role] || role
      : role;

  // --- New user: email includes a generated password ---
  if (password) {
    const heading =
      language === 'da' ? 'Du er inviteret til et team' : 'You are invited to a team';
    const body =
      language === 'da'
        ? `Du er blevet inviteret af <strong>${companyName}</strong> til at deltage som <strong>${roleLabel}</strong>.<br/><br/>
           En konto er blevet oprettet til dig. Brug det nedenstående kodeord til at logge ind:`
        : `You have been invited by <strong>${companyName}</strong> to join as <strong>${roleLabel}</strong>.<br/><br/>
           An account has been created for you. Use the password below to log in:`;

    const passwordBlock =
      language === 'da'
        ? `<p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5; margin-bottom:4px;"><strong>Dit kodeord:</strong></p>
           <p style="margin:0 0 16px; font-family:'Courier New',monospace; font-size:20px; font-weight:700; letter-spacing:2px; color:${PRIMARY_DARK}; background:#f0fdfa; padding:12px 20px; border-radius:8px; border:1px solid #ccfbf1; text-align:center;">${password}</p>`
        : `<p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5; margin-bottom:4px;"><strong>Your password:</strong></p>
           <p style="margin:0 0 16px; font-family:'Courier New',monospace; font-size:20px; font-weight:700; letter-spacing:2px; color:${PRIMARY_DARK}; background:#f0fdfa; padding:12px 20px; border-radius:8px; border:1px solid #ccfbf1; text-align:center;">${password}</p>`;

    const securityNote =
      language === 'da'
        ? `<p style="margin:0; font-size:12px; color:${TEXT_MUTED}; line-height:1.5; background:#fffbeb; padding:10px 14px; border-radius:6px; border:1px solid #fde68a;">&#9888;&#65039; <strong>Vigtigt:</strong> Skift dit kodeord straks efter første login under Indstillinger.</p>`
        : `<p style="margin:0; font-size:12px; color:${TEXT_MUTED}; line-height:1.5; background:#fffbeb; padding:10px 14px; border-radius:6px; border:1px solid #fde68a;">&#9888;&#65039; <strong>Important:</strong> Change your password immediately after first login in Settings.</p>`;

    const buttonText =
      language === 'da' ? 'Log ind nu' : 'Log in now';
    const fallback =
      language === 'da'
        ? `Hvis knappen ikke virker, gå til <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a>`
        : `If the button doesn't work, go to <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a>`;

    const content = `
      <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
      <p style="margin:0 0 12px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
      ${passwordBlock}
      ${buttonHtml(acceptUrl, buttonText)}
      <p style="margin:24px 0 12px; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
      <div style="margin-top:16px;">${securityNote}</div>
    `;
    return wrapperHtml(content, language);
  }

  // --- Existing user: just an invite link ---
  const heading =
    language === 'da' ? 'Du er inviteret til et team' : 'You are invited to a team';
  const body =
    language === 'da'
      ? `Du er blevet inviteret til at deltage i <strong>${companyName}</strong> som <strong>${roleLabel}</strong>.<br/><br/>
         Klik på knappen nedenfor for at acceptere invitationen:`
      : `You have been invited to join <strong>${companyName}</strong> as <strong>${roleLabel}</strong>.<br/><br/>
         Click the button below to accept the invitation:`;
  const buttonText =
    language === 'da' ? 'Accepter invitation' : 'Accept invitation';
  const fallback =
    language === 'da'
      ? `Hvis knappen ikke virker, kan du kopiere dette link ind i din browser:<br/>
         <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a><br/><br/>
         Dette link udløber om 7 dage.`
      : `If the button doesn't work, copy and paste this link into your browser:<br/>
         <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a><br/><br/>
         This link expires in 7 days.`;

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 24px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
    ${buttonHtml(acceptUrl, buttonText)}
    <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
  `;

  return wrapperHtml(content, language);
}

// ─── OWNER NOTIFICATION EMAIL ─────────────────────────────────────

export function ownerNotificationHtml(
  language: Language,
  subject: string,
  bodyHtml: string
): string {
  const heading =
    language === 'da' ? 'Systemnotifikation' : 'System notification';

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <h3 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:16px; font-weight:500;">${subject}</h3>
    <div style="font-size:14px; color:${TEXT_DARK}; line-height:1.6;">
      ${bodyHtml}
    </div>
  `;

  return wrapperHtml(content, language);
}
