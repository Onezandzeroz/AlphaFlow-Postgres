import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditCancel, requestMetadata } from '@/lib/audit';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// Allowed file types for document attachments
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/zip',
  'application/xml',
];

// Max file size: 25MB
const MAX_SIZE = 25 * 1024 * 1024;

// GET - List documents for a journal entry
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const journalEntryId = searchParams.get('journalEntryId');

    if (!journalEntryId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: journalEntryId' },
        { status: 400 }
      );
    }

    // Verify the journal entry belongs to the user
    const journalEntry = await db.journalEntry.findUnique({
      where: { id: journalEntryId },
    });

    if (!journalEntry || journalEntry.userId !== ctx.id) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      );
    }

    const documents = await db.document.findMany({
      where: { journalEntryId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    logger.error('List documents error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Upload a document for a journal entry
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const journalEntryId = formData.get('journalEntryId') as string | null;
    const description = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!journalEntryId) {
      return NextResponse.json(
        { error: 'Missing journalEntryId' },
        { status: 400 }
      );
    }

    // Verify journal entry belongs to user
    const journalEntry = await db.journalEntry.findUnique({
      where: { id: journalEntryId },
    });

    if (!journalEntry || journalEntry.userId !== ctx.id) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type "${file.type}". Allowed: PDF, images, Office docs, CSV, text, ZIP.` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 25MB.' },
        { status: 400 }
      );
    }

    // Save file to uploads/documents/{userId}/
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents', ctx.id);
    await mkdir(uploadDir, { recursive: true });

    const ext = path.extname(file.name) || '.pdf';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${randomSuffix}${ext}`;
    const filePath = path.join(uploadDir, filename);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const relativePath = `documents/${ctx.id}/${filename}`;

    // Create Document record
    const document = await db.document.create({
      data: {
        journalEntryId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        filePath: relativePath,
        description: description || null,
      },
    });

    await auditCreate(
      ctx.id,
      'Document',
      document.id,
      {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        journalEntryId,
        description,
      },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    logger.error('Upload document error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Soft-delete a document (mark for deletion, keep audit trail)
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const body = await request.json();
    const { id, reason } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

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

    // Log the cancellation (soft-delete) in audit trail
    await auditCancel(
      ctx.id,
      'Document',
      id,
      reason || 'Document deleted',
      {
        ...requestMetadata(request),
        fileName: document.fileName,
        journalEntryId: document.journalEntryId,
      },
      ctx.activeCompanyId
    );

    // Actually delete the document record and file
    // (Audit trail preserves the record of deletion)
    await db.document.delete({
      where: { id },
    });

    // Try to delete the file (ignore errors if file doesn't exist)
    try {
      const { unlink } = await import('fs/promises');
      const filePath = path.join(process.cwd(), 'uploads', document.filePath);
      await unlink(filePath).catch(() => {
        // File may already be deleted, ignore
      });
    } catch {
      // Ignore file deletion errors
    }

    return NextResponse.json({
      success: true,
      message: 'Document deleted',
    });
  } catch (error) {
    logger.error('Delete document error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
