import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

// GET /api/receipts/[...path] - Serve receipt images with authentication
//
// URL pattern: /api/receipts/receipts/{companyId}/{filename}
// File on disk: uploads/receipts/{companyId}/{filename}
//
// Access control: the receipt must belong to a transaction within
// one of the user's companies (tenant-scoped, not user-scoped).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Verify authentication
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const filePathFromUrl = resolvedParams.path.join('/');

    if (!filePathFromUrl) {
      return NextResponse.json(
        { error: 'No file path provided' },
        { status: 400 }
      );
    }

    // Build the absolute file path
    // The URL path will be like: receipts/{companyId}/{filename}
    // The actual file is at: uploads/receipts/{companyId}/{filename}
    const absolutePath = path.join(process.cwd(), 'uploads', filePathFromUrl);

    // Security: ensure the path is within the uploads directory (prevent directory traversal)
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const resolvedPath = path.resolve(absolutePath);
    if (!resolvedPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
    }

    // Security: ensure the path is under uploads/receipts/
    const receiptsDir = path.join(uploadsDir, 'receipts');
    if (!resolvedPath.startsWith(receiptsDir)) {
      return NextResponse.json(
        { error: 'Invalid receipt path' },
        { status: 403 }
      );
    }

    // Extract the companyId from the path segment: receipts/{companyId}/{filename}
    const pathSegments = resolvedPath
      .replace(receiptsDir + path.sep, '')
      .split(path.sep);
    const companyId = pathSegments[0];

    if (!companyId) {
      return NextResponse.json({ error: 'Invalid receipt path' }, { status: 400 });
    }

    // ── Tenant-scoped access check ────────────────────────────────────
    // The user must be a member of the company that owns the receipt.
    // This allows accountants and other team members to view receipts
    // uploaded by any user in the same company.

    // SuperDev users can access any company's receipts
    if (!ctx.isSuperDev) {
      const isMember = await db.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: ctx.id,
            companyId,
          },
        },
        select: { id: true },
      });

      if (!isMember) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    // Check file exists
    if (!existsSync(absolutePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Read file
    const fileBuffer = await readFile(absolutePath);
    const fileStat = await stat(absolutePath);

    // Determine content type from file extension
    const ext = path.extname(absolutePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.pdf': 'application/pdf',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Return image with cache headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStat.size.toString(),
        'Cache-Control': 'private, max-age=86400',
        'ETag': `"${fileStat.size}-${fileStat.mtimeMs}"`,
      },
    });
  } catch (error) {
    logger.error('Serve receipt error:', error);
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    );
  }
}
