/**
 * Invoice PDF Generator
 *
 * Generates professional PDF invoices using pdf-lib.
 * Includes company branding, line items table, VAT breakdown,
 * and payment information. Supports multiple currencies.
 *
 * SERVER-SIDE ONLY — do not import on the client.
 */

import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { formatNumberForPDF, getCurrencySymbol, getCurrencyConfig } from './currency-utils';
import { logger } from '@/lib/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
}

export interface InvoiceWithDetails {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerAddress?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerCvr?: string | null;
  issueDate: Date | string;
  dueDate: Date | string;
  lineItems: string; // JSON string
  subtotal: number;
  vatTotal: number;
  total: number;
  currency: string;
  exchangeRate?: number | null;
  status: string;
  notes?: string | null;
  // Company info (joined)
  companyInfo?: {
    logo?: string | null;
    companyName: string;
    address: string;
    phone: string;
    email: string;
    cvrNumber: string;
    bankName: string;
    bankAccount: string;
    bankRegistration: string;
    bankIban?: string | null;
    invoiceTerms?: string | null;
  } | null;
}

// ── Color Palette ────────────────────────────────────────────────────────────

const COLORS = {
  primary: rgb(0.15, 0.24, 0.41),      // Dark navy
  primaryLight: rgb(0.25, 0.37, 0.58),  // Lighter navy
  accent: rgb(0.85, 0.43, 0.10),        // Warm orange accent
  text: rgb(0.18, 0.18, 0.18),          // Near-black
  textLight: rgb(0.45, 0.45, 0.45),     // Gray
  textWhite: rgb(1, 1, 1),
  border: rgb(0.82, 0.82, 0.82),
  borderLight: rgb(0.92, 0.92, 0.92),
  tableHeader: rgb(0.95, 0.96, 0.98),
  tableAlt: rgb(0.98, 0.98, 0.99),
  footerBg: rgb(0.15, 0.24, 0.41),
  white: rgb(1, 1, 1),
  red: rgb(0.75, 0.12, 0.12),
};

// ── Layout Constants ─────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28;  // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 60;

// ── Main Generator ───────────────────────────────────────────────────────────

export async function generateInvoicePDF(invoice: InvoiceWithDetails): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const currency = invoice.currency || 'DKK';
  const currencyConfig = getCurrencyConfig(currency);
  const currencySymbol = currencyConfig.symbol;
  const parsedItems = parseLineItems(invoice.lineItems);

  // ── Page 1 ──
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;
  // ── Header: Company Logo + Name ──
  const company = invoice.companyInfo;
  let logoEmbedSuccess = false;

  if (company?.logo) {
    try {
      const logoPath = path.isAbsolute(company.logo)
        ? company.logo
        : path.join(process.cwd(), company.logo);
      if (existsSync(logoPath)) {
        const logoBytes = await readFile(logoPath);
        let image;
        if (logoPath.toLowerCase().endsWith('.png')) {
          image = await pdfDoc.embedPng(logoBytes);
        } else {
          image = await pdfDoc.embedJpg(logoBytes);
        }
        const logoDims = image.scale(1);
        const maxLogoHeight = 50;
        const maxLogoWidth = 140;
        const scaleW = maxLogoWidth / logoDims.width;
        const scaleH = maxLogoHeight / logoDims.height;
        const scale = Math.min(scaleW, scaleH, 1);
        const w = logoDims.width * scale;
        const h = logoDims.height * scale;
        page.drawImage(image, {
          x: MARGIN_LEFT,
          y: y - h,
          width: w,
          height: h,
        });
        logoEmbedSuccess = true;
      }
    } catch (err) {
      logger.warn('[PDF] Failed to embed logo:', err);
    }
  }

  // Company name to the right or below logo
  const companyNameY = logoEmbedSuccess ? y - 10 : y;
  const companyNameX = logoEmbedSuccess
    ? MARGIN_LEFT + 160
    : MARGIN_LEFT;

  drawText(page, company?.companyName || 'AlphaFlow', {
    x: companyNameX,
    y: companyNameY - 14,
    font: fontBold,
    size: 18,
    color: COLORS.primary,
  });

  let infoY = companyNameY - 32;
  if (company?.address) {
    drawText(page, company.address, { x: companyNameX, y: infoY, font: fontRegular, size: 8.5, color: COLORS.textLight });
    infoY -= 12;
  }
  if (company?.phone) {
    drawText(page, company.phone, { x: companyNameX, y: infoY, font: fontRegular, size: 8.5, color: COLORS.textLight });
    infoY -= 12;
  }
  if (company?.email) {
    drawText(page, company.email, { x: companyNameX, y: infoY, font: fontRegular, size: 8.5, color: COLORS.textLight });
    infoY -= 12;
  }
  if (company?.cvrNumber) {
    drawText(page, `CVR: ${company.cvrNumber}`, { x: companyNameX, y: infoY, font: fontRegular, size: 8.5, color: COLORS.textLight });
  }

  // ── Invoice Title + Meta (top right) ──
  const rightX = PAGE_WIDTH - MARGIN_RIGHT;
  drawText(page, 'FAKTURA', {
    x: rightX,
    y: y - 14,
    font: fontBold,
    size: 26,
    color: COLORS.primary,
    align: 'right',
  });

  // Accent line under title
  const titleWidth = fontBold.widthOfTextAtSize('FAKTURA', 26);
  page.drawLine({
    start: { x: rightX - titleWidth, y: y - 20 },
    end: { x: rightX, y: y - 20 },
    thickness: 2.5,
    color: COLORS.accent,
  });

  let metaY = y - 42;
  const metaLabelX = rightX - 150;
  const metaValueX = rightX;

  drawMetaRow(page, 'Fakturanr.:', invoice.invoiceNumber, metaLabelX, metaValueX, metaY, fontRegular, fontBold);
  metaY -= 16;
  drawMetaRow(page, 'Udstedelsesdato:', formatDate(invoice.issueDate), metaLabelX, metaValueX, metaY, fontRegular, fontBold);
  metaY -= 16;
  drawMetaRow(page, 'Forfaldsdato:', formatDate(invoice.dueDate), metaLabelX, metaValueX, metaY, fontRegular, fontBold);
  metaY -= 16;
  drawMetaRow(page, 'Valuta:', `${currency} (${currencySymbol})`, metaLabelX, metaValueX, metaY, fontRegular, fontBold);
  if (invoice.exchangeRate && invoice.currency !== 'DKK') {
    metaY -= 16;
    drawMetaRow(page, 'Kurs:', invoice.exchangeRate.toFixed(4), metaLabelX, metaValueX, metaY, fontRegular, fontBold);
  }
  metaY -= 16;
  drawMetaRow(page, 'Status:', mapStatus(invoice.status), metaLabelX, metaValueX, metaY, fontRegular, fontBold);

  // ── Horizontal divider ──
  y = Math.min(infoY, metaY) - 16;
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
    thickness: 0.75,
    color: COLORS.border,
  });

  // ── Customer block ──
  y -= 20;
  drawText(page, 'KUNDE', {
    x: MARGIN_LEFT,
    y,
    font: fontBold,
    size: 10,
    color: COLORS.primaryLight,
  });
  y -= 16;
  drawText(page, invoice.customerName, {
    x: MARGIN_LEFT,
    y,
    font: fontBold,
    size: 11,
    color: COLORS.text,
  });
  y -= 14;
  if (invoice.customerAddress) {
    drawText(page, invoice.customerAddress, { x: MARGIN_LEFT, y, font: fontRegular, size: 9, color: COLORS.textLight });
    y -= 12;
  }
  if (invoice.customerCvr) {
    drawText(page, `CVR: ${invoice.customerCvr}`, { x: MARGIN_LEFT, y, font: fontRegular, size: 9, color: COLORS.textLight });
    y -= 12;
  }
  if (invoice.customerEmail) {
    drawText(page, invoice.customerEmail, { x: MARGIN_LEFT, y, font: fontRegular, size: 9, color: COLORS.textLight });
    y -= 12;
  }
  if (invoice.customerPhone) {
    drawText(page, invoice.customerPhone, { x: MARGIN_LEFT, y, font: fontRegular, size: 9, color: COLORS.textLight });
  }

  // ── Line items table ──
  y -= 24;

  const tableLeft = MARGIN_LEFT;
  const tableRight = PAGE_WIDTH - MARGIN_RIGHT;
  const tableWidth = tableRight - tableLeft;

  // Column widths (description, qty, unit price, VAT%, line total)
  const colDesc = tableWidth * 0.42;
  const colQty = tableWidth * 0.10;
  const colUnitPrice = tableWidth * 0.18;
  const colVat = tableWidth * 0.10;
  const colTotal = tableWidth * 0.20;

  // Table header
  page.drawRectangle({
    x: tableLeft,
    y: y - 16,
    width: tableWidth,
    height: 20,
    color: COLORS.tableHeader,
  });

  const headerY = y - 3;
  const headerSize = 8;
  drawText(page, 'Beskrivelse', { x: tableLeft + 6, y: headerY, font: fontBold, size: headerSize, color: COLORS.primary });
  drawText(page, 'Antal', { x: tableLeft + colDesc + 6, y: headerY, font: fontBold, size: headerSize, color: COLORS.primary });
  drawText(page, 'Enhedspris', { x: tableLeft + colDesc + colQty + 6, y: headerY, font: fontBold, size: headerSize, color: COLORS.primary, align: 'right', maxWidth: tableLeft + colDesc + colQty + colUnitPrice - 4 });
  drawText(page, 'Moms %', { x: tableLeft + colDesc + colQty + colUnitPrice + 4, y: headerY, font: fontBold, size: headerSize, color: COLORS.primary, align: 'center', maxWidth: tableLeft + colDesc + colQty + colUnitPrice + colVat - 4 });
  drawText(page, 'Linjetotal', { x: tableLeft + colDesc + colQty + colUnitPrice + colVat + 4, y: headerY, font: fontBold, size: headerSize, color: COLORS.primary, align: 'right', maxWidth: tableRight - 4 });

  // Bottom border for header
  page.drawLine({
    start: { x: tableLeft, y: y - 16 },
    end: { x: tableRight, y: y - 16 },
    thickness: 1,
    color: COLORS.primaryLight,
  });

  y -= 16;

  // Line items
  const rowHeight = 18;
  const fontSize = 8.5;

  for (let i = 0; i < parsedItems.length; i++) {
    // Check if we need a new page
    if (y - rowHeight < MARGIN_BOTTOM + 80) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN_TOP;
    }

    const item = parsedItems[i];
    const lineTotal = item.quantity * item.unitPrice;

    // Alternating row background
    if (i % 2 === 1) {
      page.drawRectangle({
        x: tableLeft,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: COLORS.tableAlt,
      });
    }

    const rowTextY = y - 5;

    // Description (left-aligned)
    drawText(page, item.description, {
      x: tableLeft + 6,
      y: rowTextY,
      font: fontRegular,
      size: fontSize,
      color: COLORS.text,
      maxWidth: colDesc - 12,
    });

    // Quantity (center-aligned)
    const qtyStr = formatNumberForPDF(item.quantity, 0);
    drawText(page, qtyStr, {
      x: tableLeft + colDesc + 6,
      y: rowTextY,
      font: fontRegular,
      size: fontSize,
      color: COLORS.text,
    });

    // Unit price (right-aligned)
    const unitPriceStr = `${formatNumberForPDF(item.unitPrice)} ${currencySymbol}`;
    drawText(page, unitPriceStr, {
      x: tableLeft + colDesc + colQty + colUnitPrice - 4,
      y: rowTextY,
      font: fontRegular,
      size: fontSize,
      color: COLORS.text,
      align: 'right',
    });

    // VAT % (center-aligned)
    const vatStr = `${item.vatPercent}%`;
    drawText(page, vatStr, {
      x: tableLeft + colDesc + colQty + colUnitPrice + colVat / 2,
      y: rowTextY,
      font: fontRegular,
      size: fontSize,
      color: COLORS.text,
      align: 'center',
    });

    // Line total (right-aligned, bold)
    const lineTotalStr = `${formatNumberForPDF(lineTotal)} ${currencySymbol}`;
    drawText(page, lineTotalStr, {
      x: tableRight - 4,
      y: rowTextY,
      font: fontBold,
      size: fontSize,
      color: COLORS.text,
      align: 'right',
    });

    y -= rowHeight;
  }

  // Bottom border for table
  page.drawLine({
    start: { x: tableLeft, y },
    end: { x: tableRight, y },
    thickness: 1,
    color: COLORS.border,
  });

  // ── Totals section ──
  y -= 20;

  const totalsX = tableLeft + colDesc + colQty + colUnitPrice + colVat;
  const totalsWidth = colTotal;

  // Subtotal
  drawText(page, 'Subtotal (excl. moms):', {
    x: totalsX,
    y,
    font: fontRegular,
    size: 9,
    color: COLORS.textLight,
    align: 'right',
    maxWidth: totalsX + totalsWidth - 4,
  });
  drawText(page, `${formatNumberForPDF(invoice.subtotal)} ${currencySymbol}`, {
    x: tableRight - 4,
    y,
    font: fontRegular,
    size: 9,
    color: COLORS.text,
    align: 'right',
  });
  y -= 14;

  // VAT total
  drawText(page, 'Moms (Moms total):', {
    x: totalsX,
    y,
    font: fontRegular,
    size: 9,
    color: COLORS.textLight,
    align: 'right',
    maxWidth: totalsX + totalsWidth - 4,
  });
  drawText(page, `${formatNumberForPDF(invoice.vatTotal)} ${currencySymbol}`, {
    x: tableRight - 4,
    y,
    font: fontRegular,
    size: 9,
    color: COLORS.text,
    align: 'right',
  });
  y -= 18;

  // Divider
  page.drawLine({
    start: { x: totalsX, y },
    end: { x: tableRight, y },
    thickness: 0.5,
    color: COLORS.border,
  });
  y -= 16;

  // Grand Total
  // Background highlight for total
  page.drawRectangle({
    x: totalsX - 4,
    y: y - 8,
    width: tableRight - totalsX + 4,
    height: 24,
    color: COLORS.tableHeader,
    borderColor: COLORS.primaryLight,
    borderWidth: 1,
  });

  drawText(page, 'TOTAL:', {
    x: totalsX,
    y: y + 4,
    font: fontBold,
    size: 12,
    color: COLORS.primary,
    align: 'right',
    maxWidth: totalsX + totalsWidth - 4,
  });
  drawText(page, `${formatNumberForPDF(invoice.total)} ${currencySymbol}`, {
    x: tableRight - 6,
    y: y + 4,
    font: fontBold,
    size: 12,
    color: COLORS.primary,
    align: 'right',
  });

  // ── DKK equivalent if foreign currency ──
  if (invoice.exchangeRate && invoice.currency !== 'DKK') {
    y -= 22;
    const dkkEquivalent = invoice.total * invoice.exchangeRate;
    drawText(page, `Tilsvarende i DKK: ${formatNumberForPDF(dkkEquivalent)} kr. (kurs: ${invoice.exchangeRate.toFixed(4)})`, {
      x: MARGIN_LEFT,
      y,
      font: fontItalic,
      size: 8,
      color: COLORS.textLight,
    });
  }

  // ── Payment Information ──
  y -= 30;

  if (company) {
    drawText(page, 'BETALINGSINFORMATION', {
      x: MARGIN_LEFT,
      y,
      font: fontBold,
      size: 10,
      color: COLORS.primaryLight,
    });
    y -= 18;

    const bankDetails: string[] = [];
    if (company.bankName) bankDetails.push(`Bank: ${company.bankName}`);
    if (company.bankRegistration) bankDetails.push(`Reg.nr.: ${company.bankRegistration}`);
    if (company.bankAccount) bankDetails.push(`Kontonr.: ${company.bankAccount}`);
    if (company.bankIban) bankDetails.push(`IBAN: ${company.bankIban}`);

    for (const detail of bankDetails) {
      drawText(page, detail, {
        x: MARGIN_LEFT,
        y,
        font: fontRegular,
        size: 9,
        color: COLORS.text,
      });
      y -= 13;
    }

    // Payment reference
    const refStr = `Reference: ${invoice.invoiceNumber}`;
    drawText(page, refStr, {
      x: MARGIN_LEFT,
      y,
      font: fontBold,
      size: 9,
      color: COLORS.accent,
    });
    y -= 13;
  }

  // ── Notes ──
  if (invoice.notes || company?.invoiceTerms) {
    y -= 8;
    drawText(page, 'BEMÆRKNINGER', {
      x: MARGIN_LEFT,
      y,
      font: fontBold,
      size: 10,
      color: COLORS.primaryLight,
    });
    y -= 16;

    const allNotes: string[] = [];
    if (company?.invoiceTerms) allNotes.push(company.invoiceTerms);
    if (invoice.notes) allNotes.push(invoice.notes);
    const combinedNotes = allNotes.join('\n');

    drawWrappedText(page, combinedNotes, {
      x: MARGIN_LEFT,
      y,
      font: fontRegular,
      size: 8.5,
      color: COLORS.textLight,
      maxWidth: CONTENT_WIDTH,
      lineHeight: 12,
    });
  }

  // ── Footer ──
  drawFooter(page, fontBold, fontRegular, fontItalic, pdfDoc.getPageCount());

  // ── Save ──
  return pdfDoc.save();
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function drawText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: typeof COLORS.white;
    align?: 'left' | 'right' | 'center';
    maxWidth?: number;
  }
) {
  const { x, y, font, size, color, align = 'left', maxWidth } = options;
  const textWidth = font.widthOfTextAtSize(text, size);

  if (maxWidth && textWidth > maxWidth) {
    // Truncate with ellipsis
    let truncated = text;
    while (font.widthOfTextAtSize(truncated + '...', size) > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    if (truncated.length > 0) {
      const truncatedText = truncated + '...';
      const tWidth = font.widthOfTextAtSize(truncatedText, size);
      let drawX = x;
      if (align === 'right') drawX = x - tWidth;
      else if (align === 'center') drawX = x - tWidth / 2;
      page.drawText(truncatedText, { x: drawX, y, font, size, color });
    }
    return;
  }

  let drawX = x;
  if (align === 'right') drawX = x - textWidth;
  else if (align === 'center') drawX = x - textWidth / 2;

  page.drawText(text, { x: drawX, y, font, size, color });
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: typeof COLORS.white;
    maxWidth?: number;
    lineHeight: number;
  }
) {
  const { x, y, font, size, color, maxWidth, lineHeight } = options;
  const lines = text.split('\n');

  let currentY = y;
  for (const line of lines) {
    if (!line.trim()) {
      currentY -= lineHeight;
      continue;
    }

    // Simple word wrapping
    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, size);

      if (maxWidth && testWidth > maxWidth && currentLine) {
        page.drawText(currentLine, { x, y: currentY, font, size, color });
        currentY -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, { x, y: currentY, font, size, color });
      currentY -= lineHeight;
    }
  }
}

function drawMetaRow(
  page: PDFPage,
  label: string,
  value: string,
  labelX: number,
  valueX: number,
  y: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
) {
  drawText(page, label, {
    x: labelX,
    y,
    font: fontRegular,
    size: 8.5,
    color: COLORS.textLight,
  });
  drawText(page, value, {
    x: valueX,
    y,
    font: fontBold,
    size: 8.5,
    color: COLORS.text,
    align: 'right',
  });
}

function drawFooter(page: PDFPage, fontBold: PDFFont, fontRegular: PDFFont, fontItalic: PDFFont, _pageNum: number) {
  const footerY = MARGIN_BOTTOM - 10;

  // Footer background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: MARGIN_BOTTOM + 10,
    color: COLORS.footerBg,
  });

  // Branding text
  drawText(page, 'AlphaFlow', {
    x: PAGE_WIDTH / 2,
    y: footerY + 8,
    font: fontBold,
    size: 9,
    color: COLORS.textWhite,
    align: 'center',
  });

  drawText(page, 'Professionelt regnskabssystem', {
    x: PAGE_WIDTH / 2,
    y: footerY - 4,
    font: fontItalic,
    size: 7,
    color: rgb(0.7, 0.75, 0.85),
    align: 'center',
  });

  // Generated timestamp
  const generatedStr = `Genereret: ${new Date().toLocaleDateString('da-DK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  drawText(page, generatedStr, {
    x: PAGE_WIDTH / 2,
    y: footerY - 16,
    font: fontRegular,
    size: 6.5,
    color: rgb(0.6, 0.65, 0.75),
    align: 'center',
  });
}

function parseLineItems(lineItemsStr: string): InvoiceLineItem[] {
  try {
    const parsed = JSON.parse(lineItemsStr);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        description: item.description || '',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        vatPercent: Number(item.vatPercent) || 0,
      }));
    }
  } catch {
    logger.warn('[PDF] Failed to parse line items JSON');
  }
  return [];
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('da-DK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function mapStatus(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Kladd',
    SENT: 'Sendt',
    PAID: 'Betalt',
    CANCELLED: 'Annulleret',
  };
  return map[status] || status;
}
