/**
 * File Service — Centralized file storage utilities for AlphaFlow
 *
 * Provides a single source of truth for:
 * - File upload paths (tenant-scoped receipts, user-scoped documents)
 * - Path traversal protection
 * - File size/type validation
 * - Tenant receipt folder structure inside Tenant-Backup
 *
 * Folder Structure:
 *   Tenant-Backup/{companyName}/Receipts/{YYYY}/{MM}/{DD}/{filename}
 *   uploads/receipts/{companyId}/{filename}          (legacy/active path for API serving)
 *   uploads/documents/{userId}/{filename}            (journal entry attachments)
 */

import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { logger } from '@/lib/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Project root */
const PROJECT_ROOT = process.cwd();

/** Base directory for tenant backup files (receipts) */
const TENANT_BACKUP_BASE = path.join(PROJECT_ROOT, 'Tenant-Backup');

/** Base directory for served uploads (backwards-compatible API paths) */
const UPLOADS_BASE = path.join(PROJECT_ROOT, 'uploads');

/** Maximum file size for receipt uploads: 25 MB */
export const MAX_RECEIPT_SIZE = 25 * 1024 * 1024;

/** Allowed MIME types for receipt images */
export const ALLOWED_RECEIPT_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'application/pdf': ['.pdf'],
};

// ─── Path Helpers ─────────────────────────────────────────────────────────────

/**
 * Sanitize a company name for safe use as a directory name.
 */
export function sanitizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'unknown-company';
}

/**
 * Get the Tenant-Backup receipts directory for a company.
 * Structure: Tenant-Backup/{companyName}/Receipts/{YYYY}/{MM}/{DD}/
 *
 * Creates directories on demand.
 */
export function getTenantReceiptDir(companyName: string, date?: Date): string {
  const folderName = sanitizeCompanyName(companyName);
  const d = date || new Date();
  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const dir = path.join(TENANT_BACKUP_BASE, folderName, 'Receipts', year, month, day);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

/**
 * Get the uploads/receipts/{companyId}/ directory.
 * This is the path used by the receipt serving API.
 */
export function getUploadsReceiptDir(companyId: string): string {
  const dir = path.join(UPLOADS_BASE, 'receipts', companyId);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

/**
 * Generate a unique filename with timestamp prefix.
 * Format: {timestamp}-{random6chars}.{ext}
 */
export function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
  const random = crypto.randomBytes(3).toString('hex');
  return `${timestamp}-${random}${ext}`;
}

// ─── Security ─────────────────────────────────────────────────────────────────

/**
 * Validate that a resolved path stays within a trusted base directory.
 * Prevents directory traversal attacks.
 */
export function isPathWithin(resolvedPath: string, baseDir: string): boolean {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  return normalizedPath.startsWith(normalizedBase + path.sep) || normalizedPath === normalizedBase;
}

/**
 * Validate a file for receipt upload.
 * Returns an error message if invalid, or null if valid.
 */
export function validateReceiptFile(file: File): string | null {
  // Check file size
  if (file.size > MAX_RECEIPT_SIZE) {
    const maxMB = (MAX_RECEIPT_SIZE / (1024 * 1024)).toFixed(0);
    return `File too large. Maximum ${maxMB} MB.`;
  }

  // Check MIME type
  const allowedExts = ALLOWED_RECEIPT_TYPES[file.type];
  if (!allowedExts) {
    return `Unsupported file type: ${file.type || 'unknown'}. Allowed: JPEG, PNG, WebP, GIF, BMP, TIFF, PDF.`;
  }

  // Check extension matches MIME type
  const ext = path.extname(file.name).toLowerCase();
  if (ext && allowedExts.length > 0 && !allowedExts.includes(ext)) {
    return `File extension ${ext} does not match content type ${file.type}.`;
  }

  return null;
}

// ─── Core Operations ──────────────────────────────────────────────────────────

export interface SaveReceiptResult {
  /** Relative path for DB storage: receipts/{companyId}/{filename} */
  dbPath: string;
  /** Full path in Tenant-Backup: Tenant-Backup/{company}/Receipts/{YYYY}/{MM}/{DD}/{filename} */
  tenantPath: string;
  /** File size in bytes */
  fileSize: number;
  /** Original filename */
  originalName: string;
}

/**
 * Save a receipt file to BOTH storage locations:
 * 1. Tenant-Backup/{companyName}/Receipts/{YYYY}/{MM}/{DD}/{filename}  (per-tenant backup)
 * 2. uploads/receipts/{companyId}/{filename}                            (API serving path)
 *
 * Returns the DB-relative path for storing in Transaction.receiptImage.
 */
export function saveReceiptFile(
  file: Buffer,
  originalName: string,
  companyId: string,
  companyName: string,
): SaveReceiptResult {
  const filename = generateUniqueFilename(originalName);
  const dbRelativePath = `receipts/${companyId}/${filename}`;

  // 1. Save to Tenant-Backup (per-tenant organized by date)
  const tenantDir = getTenantReceiptDir(companyName);
  const tenantFilePath = path.join(tenantDir, filename);

  // 2. Save to uploads (for API serving)
  const uploadsDir = getUploadsReceiptDir(companyId);
  const uploadsFilePath = path.join(uploadsDir, filename);

  // Write to both locations
  try {
    fs.writeFileSync(tenantFilePath, file);
  } catch (error) {
    logger.error('[FILE-SERVICE] Failed to write receipt to Tenant-Backup:', error);
    // Continue — uploads path is the primary serving path
  }

  try {
    fs.writeFileSync(uploadsFilePath, file);
  } catch (error) {
    logger.error('[FILE-SERVICE] Failed to write receipt to uploads:', error);
    throw error; // This one is critical — API can't serve without it
  }

  return {
    dbPath: dbRelativePath,
    tenantPath: tenantFilePath,
    fileSize: file.length,
    originalName,
  };
}

/**
 * Delete a receipt file from both storage locations.
 */
export function deleteReceiptFile(dbRelativePath: string): void {
  if (!dbRelativePath) return;

  // Delete from uploads
  const uploadsPath = path.join(UPLOADS_BASE, dbRelativePath);
  try {
    if (fs.existsSync(uploadsPath)) {
      fs.unlinkSync(uploadsPath);
    }
  } catch (error) {
    logger.warn('[FILE-SERVICE] Failed to delete receipt from uploads:', error);
  }
}

/**
 * Get the full list of receipt files for a company from Tenant-Backup.
 * Returns paths grouped by date: { "2025-01-15": [file1, file2, ...], ... }
 */
export function listTenantReceipts(companyName: string): Record<string, string[]> {
  const folderName = sanitizeCompanyName(companyName);
  const receiptsBase = path.join(TENANT_BACKUP_BASE, folderName, 'Receipts');

  if (!fs.existsSync(receiptsBase)) {
    return {};
  }

  const result: Record<string, string[]> = {};

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        // Extract date folder path: YYYY/MM/DD → 2025-01-15
        const relative = path.relative(receiptsBase, fullPath);
        const parts = relative.split(path.sep);
        if (parts.length >= 3) {
          const dateKey = `${parts[0]}-${parts[1]}-${parts[2]}`;
          if (!result[dateKey]) result[dateKey] = [];
          result[dateKey].push(fullPath);
        }
      }
    }
  }

  walkDir(receiptsBase);
  return result;
}

/**
 * Get total size of all tenant receipts in Tenant-Backup.
 */
export function getTenantReceiptsSize(companyName: string): number {
  const folderName = sanitizeCompanyName(companyName);
  const receiptsBase = path.join(TENANT_BACKUP_BASE, folderName, 'Receipts');

  if (!fs.existsSync(receiptsBase)) {
    return 0;
  }

  let totalSize = 0;

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        try {
          totalSize += fs.statSync(fullPath).size;
        } catch {
          // Skip inaccessible files
        }
      }
    }
  }

  walkDir(receiptsBase);
  return totalSize;
}
