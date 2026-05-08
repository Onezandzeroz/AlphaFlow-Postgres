import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditDeleteAttempt, requestMetadata } from '@/lib/audit';
import { readFile, stat, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// GET - Get document metadata and serve the file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch document with journal entry to verify ownership
    const document = await db.document.findUnique({
      where: { id },
      include: {
        journalEntry: true,
      },
    });

    if (!document || document.journalEntry.userId !== ctx.id) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Build file path
    const absolutePath = path.join(process.cwd(), 'uploads', document.filePath);

    // Security: ensure path is within uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const resolvedPath = path.resolve(absolutePath);
    if (!resolvedPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
    }

    // Check file exists
    if (!existsSync(absolutePath)) {
      return NextResponse.json(
        { error: 'File not found on disk' },
        { status: 404 }
      );
    }

    // Read file
    const fileBuffer = await readFile(absolutePath);
    const fileStat = await stat(absolutePath);

    // Determine content type
    const contentType = document.fileType || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStat.size.toString(),
        'Content-Disposition': `inline; filename="${document.fileName}"`,
        'Cache-Control': 'private, max-age=86400',
        'ETag': `"${fileStat.size}-${fileStat.mtimeMs}"`,
      },
    });
  } catch (error) {
    logger.error('Get document error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a document (permanent delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await params;

    // Verify ownership via journal entry
    const document = await db.document.findUnique({
      where: { id },
      include: {
        journalEntry: true,
      },
    });

    if (!document || document.journalEntry.userId !== ctx.id) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Audit log the deletion attempt before removing
    await auditDeleteAttempt(
      ctx.id,
      'Document',
      id,
      {
        ...requestMetadata(request),
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        journalEntryId: document.journalEntryId,
      },
      ctx.activeCompanyId
    );

    // Delete file from disk
    try {
      const filePath = path.join(process.cwd(), 'uploads', document.filePath);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch {
      // Ignore file deletion errors — record is still removed from DB
    }

    // Delete database record
    await db.document.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Document permanently deleted',
    });
  } catch (error) {
    logger.error('Delete document error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
