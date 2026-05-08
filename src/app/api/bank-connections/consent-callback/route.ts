import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProvider } from '@/lib/bank-providers';
import { logger } from '@/lib/logger';
import { auditUpdate, requestMetadata } from '@/lib/audit';

/**
 * GET /api/bank-connections/consent-callback
 *
 * Callback endpoint for sandbox bank consent authorization.
 * In production, the bank would redirect here after the user authorizes.
 * In sandbox mode, this is accessed directly as a simulated redirect.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const consentId = searchParams.get('consent_id');
    const providerId = searchParams.get('provider');
    const connectionId = searchParams.get('connection_id');

    if (!consentId || !providerId) {
      return new NextResponse(`
        <!DOCTYPE html>
        <html>
        <head><title>Consent Error</title></head>
        <body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:20px;text-align:center">
          <h2 style="color:#ef4444">❌ Authorization Failed</h2>
          <p>Missing consent information. Please try again.</p>
          <button onclick="window.close()" style="padding:8px 24px;border-radius:8px;border:none;background:#0d9488;color:white;cursor:pointer">Close</button>
        </body>
        </html>
      `, { headers: { 'Content-Type': 'text/html' } });
    }

    // Complete the consent with the provider
    const provider = getProvider(providerId);
    if (!provider) {
      return new NextResponse(`
        <!DOCTYPE html>
        <html>
        <head><title>Consent Error</title></head>
        <body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:20px;text-align:center">
          <h2 style="color:#ef4444">❌ Unknown Bank Provider</h2>
          <p>Could not find provider: ${providerId}</p>
          <button onclick="window.close()" style="padding:8px 24px;border-radius:8px;border:none;background:#0d9488;color:white;cursor:pointer">Close</button>
        </body>
        </html>
      `, { headers: { 'Content-Type': 'text/html' } });
    }

    // Call completeConsent if available (sandbox mode)
    if (provider.completeConsent) {
      await provider.completeConsent(consentId);
    }

    // Update the bank connection status to ACTIVE
    const connection = await db.bankConnection.findFirst({
      where: { consentId },
    });

    if (connection) {
      await db.bankConnection.update({
        where: { id: connection.id },
        data: { status: 'ACTIVE' },
      });

      // Audit: log bank connection activation
      await auditUpdate(
        connection.userId,
        'BankConnection',
        connection.id,
        { status: 'PENDING' },
        { status: 'ACTIVE' },
        requestMetadata(request),
        connection.companyId
      );
    }

    // Return a success page that closes the popup/redirects back
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bank Authorization Complete</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 80px auto; padding: 20px; text-align: center; }
          .success-icon { font-size: 48px; margin-bottom: 16px; }
          h2 { color: #0d9488; margin-bottom: 8px; }
          p { color: #6b7280; margin-bottom: 24px; }
          .btn { padding: 10px 32px; border-radius: 8px; border: none; background: #0d9488; color: white; font-size: 14px; font-weight: 600; cursor: pointer; }
          .btn:hover { background: #0f766e; }
        </style>
      </head>
      <body>
        <div class="success-icon">✅</div>
        <h2>Authorization Complete</h2>
        <p>Your bank has authorized the connection. You can now close this window and return to AlphaFlow.</p>
        <button class="btn" onclick="window.close()">Close Window</button>
        <script>
          // Notify the parent window that consent was completed
          if (window.opener) {
            window.opener.postMessage({ type: 'bank-consent-complete', consentId: '${consentId}', provider: '${providerId}' }, '*');
          }
          // Auto-close after 3 seconds
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  } catch (error) {
    logger.error('Consent callback error:', error);
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
      <head><title>Consent Error</title></head>
      <body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:20px;text-align:center">
        <h2 style="color:#ef4444">❌ Authorization Failed</h2>
        <p>An error occurred during authorization. Please try again.</p>
        <button onclick="window.close()" style="padding:8px 24px;border-radius:8px;border:none;background:#0d9488;color:white;cursor:pointer">Close</button>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
}

/**
 * POST /api/bank-connections/consent-callback
 *
 * API endpoint to complete consent authorization from the frontend.
 * Used when the consent flow is handled in-page rather than via redirect.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { consentId, providerId } = body;

    if (!consentId || !providerId) {
      return NextResponse.json({ error: 'Missing consentId or providerId' }, { status: 400 });
    }

    // Complete the consent with the provider
    const provider = getProvider(providerId);
    if (!provider) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    }

    if (provider.completeConsent) {
      await provider.completeConsent(consentId);
    }

    // Update the bank connection status to ACTIVE
    const connection = await db.bankConnection.findFirst({
      where: { consentId },
    });

    if (connection) {
      await db.bankConnection.update({
        where: { id: connection.id },
        data: { status: 'ACTIVE' },
      });

      // Audit: log bank connection activation
      await auditUpdate(
        connection.userId,
        'BankConnection',
        connection.id,
        { status: 'PENDING' },
        { status: 'ACTIVE' },
        requestMetadata(request),
        connection.companyId
      );

      return NextResponse.json({ success: true, connectionId: connection.id, status: 'ACTIVE' });
    }

    return NextResponse.json({ error: 'Connection not found for this consent' }, { status: 404 });
  } catch (error) {
    logger.error('Consent authorization error:', error);
    return NextResponse.json({ error: 'Failed to authorize consent' }, { status: 500 });
  }
}
