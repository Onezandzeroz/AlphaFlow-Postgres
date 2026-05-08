'use client';

import Tesseract from 'tesseract.js';

export interface OCRResult {
  text: string;
  amount: number | null;
  date: string | null;
  vatPercent: number | null;
  confidence: number;
  rawLines: string[];
}

/**
 * Scan a receipt image using OCR (Tesseract.js).
 * Extracts ONLY: total amount, date, and VAT rate.
 */
export async function scanReceipt(
  imageFile: File,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  try {
    const result = await Tesseract.recognize(imageFile, 'dan+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    });

    const text = result?.data?.text || '';
    const confidence = result?.data?.confidence || 0;
    const rawLines = text.split('\n').filter((line) => line.trim());

    const parsed = parseReceiptText(text);

    return {
      text,
      amount: parsed.totalAmount,
      date: parsed.date,
      vatPercent: parsed.vatPercent,
      confidence,
      rawLines,
    };
  } catch (error) {
    console.error('OCR Error:', error);
    return {
      text: '',
      amount: null,
      date: null,
      vatPercent: null,
      confidence: 0,
      rawLines: [],
    };
  }
}

/**
 * Parse OCR text from a receipt to extract:
 * - Total amount
 * - Date
 * - VAT percentage
 */
function parseReceiptText(text: string | undefined | null): {
  totalAmount: number | null;
  date: string | null;
  vatPercent: number | null;
} {
  if (!text || typeof text !== 'string') {
    return { totalAmount: null, date: null, vatPercent: null };
  }

  const result = {
    totalAmount: null as number | null,
    date: null as string | null,
    vatPercent: null as number | null,
  };

  // ──────────────────────────────────────────────
  // 1. Extract DATE
  // ──────────────────────────────────────────────
  const datePatterns = [
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/gi,
    // YYYY-MM-DD (ISO format)
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/gi,
    // DD MMM YYYY (e.g., 26 Mar 2024)
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+(\d{2,4})/gi,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsedDate = parseDate(match[0]);
      if (parsedDate) {
        result.date = parsedDate;
        break;
      }
    }
  }

  // ──────────────────────────────────────────────
  // 2. Extract TOTAL AMOUNT
  // ──────────────────────────────────────────────
  // Strategy: HIGH-PRIORITY total lines first (TOTAL, At betale, SUM, etc.)
  // If a TOTAL-line amount is found, use the LAST match (final total on receipt).
  // Only fall back to "largest amount" if no TOTAL line was detected.

  // ── Phase 1: High-priority TOTAL-line patterns ──
  // These match lines where the receipt explicitly labels the grand total.
  const totalLinePatterns = [
    // "At betale" (Danish — to pay) — the final amount due
    /at\s+betale[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
    // TOTAL: or Total: or TOTAL (with optional colon, kr, DKK)
    /(?:TOTAL|Total|total)[^:]*:?\s*(?:kr\.?\s*)?(?:DKK\s*)?(\d+(?:[.,]\d{1,2}))\s*(?:kr)?(?:\s*DKK)?/gi,
    // "Kr 123,45 total" (amount before the word total)
    /kr\.?\s*(\d+(?:[.,]\d{1,2}))\s*(?:total|TOTAL|Total)/gi,
    // SUM: or Sum:
    /(?:SUM|Sum|sum)[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))\s*(?:kr)?/gi,
    // "I alt" or "ialt" (Danish — "in total")
    /i\s*alt[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
    // "Beløb:" (Danish — amount)
    /beløb[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
  ];

  let totalLineAmount: number | null = null;

  for (const pattern of totalLinePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    let lastAmount: number | null = null;
    while ((match = regex.exec(text)) !== null) {
      const amount = parseAmount(match[1]);
      if (amount !== null && amount > 0) {
        lastAmount = amount;  // Keep the LAST match (final total is usually last)
      }
    }
    // Use the last match from this pattern (the final total on the receipt)
    if (lastAmount !== null) {
      totalLineAmount = lastAmount;
      break;  // Stop at the first pattern that matched
    }
  }

  if (totalLineAmount !== null) {
    // HIGH CONFIDENCE: We found an explicit TOTAL line
    result.totalAmount = totalLineAmount;
  } else {
    // ── Phase 2: Fallback — collect all monetary amounts, pick the largest ──
    const fallbackPatterns = [
      // DKK 123.45
      /dkk\s*(\d+(?:[.,]\d{1,2}))/gi,
      // Generic: kr 123,45 or kr. 123.45
      /kr\.?\s*(\d+(?:[.,]\d{1,2}))/gi,
      // Amount: or Price:
      /(?:pris|price|amount)[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
    ];

    const allAmounts: number[] = [];

    for (const pattern of fallbackPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const amount = parseAmount(match[1]);
        if (amount !== null && amount > 0) {
          allAmounts.push(amount);
        }
      }
    }

    // Use the largest amount found as the total
    if (allAmounts.length > 0) {
      allAmounts.sort((a, b) => b - a);
      result.totalAmount = allAmounts[0];
    }
  }

  // ──────────────────────────────────────────────
  // 3. Extract VAT PERCENTAGE
  // ──────────────────────────────────────────────
  const vatPatterns = [
    // Moms: 25% or Moms 25%
    /moms[^:]*:?\s*(\d+(?:[.,]\d+)?)\s*%?/gi,
    // VAT: 25% or VAT 25%
    /vat[^:]*:?\s*(\d+(?:[.,]\d+)?)\s*%?/gi,
    // 25% moms
    /(\d+(?:[.,]\d+)?)\s*%\s*(?:moms|vat)/gi,
    // Moms kr 12.34 (extract percentage from amount)
    /moms[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
    // Moms udgør: or VAT amount:
    /moms\s+(?:udgør|amount)[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
  ];

  for (const pattern of vatPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let vatMatch;
    while ((vatMatch = regex.exec(text)) !== null) {
      const value = parseFloat((vatMatch[1] || '0').replace(',', '.'));
      if (!isNaN(value) && value <= 100 && value >= 0) {
        // This is a percentage (0-100)
        result.vatPercent = value;
        break;
      } else if (!isNaN(value) && value > 100 && result.totalAmount) {
        // This is a VAT amount (>100 DKK), calculate percentage from total
        const netAmount = result.totalAmount - value;
        if (netAmount > 0) {
          result.vatPercent = Math.round((value / netAmount) * 100);
        }
        break;
      }
    }
    if (result.vatPercent !== null) break;
  }

  // Default to 25% if Danish receipt context but no VAT found
  if (result.vatPercent === null && result.totalAmount !== null) {
    const danishIndicators = ['moms', 'kr', 'dkk', 'betale', 'kontant', 'dankort'];
    if (danishIndicators.some((ind) => text.toLowerCase().includes(ind))) {
      result.vatPercent = 25;
    }
  }

  return result;
}

/**
 * Parse amount string to number (handles comma/dot decimal separators)
 */
function parseAmount(amountStr: string | undefined): number | null {
  if (!amountStr || typeof amountStr !== 'string') return null;
  try {
    const normalized = amountStr.replace(',', '.');
    const amount = parseFloat(normalized);
    return isNaN(amount) ? null : amount;
  } catch {
    return null;
  }
}

/**
 * Parse date string to ISO format (YYYY-MM-DD)
 */
function parseDate(dateStr: string | undefined | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  try {
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = dateStr.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);
    if (dmyMatch) {
      const day = (dmyMatch[1] || '').padStart(2, '0');
      const month = (dmyMatch[2] || '').padStart(2, '0');
      let year = dmyMatch[3] || '';
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }

    // YYYY-MM-DD
    const isoMatch = dateStr.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/i);
    if (isoMatch) {
      const year = isoMatch[1] || '';
      const month = (isoMatch[2] || '').padStart(2, '0');
      const day = (isoMatch[3] || '').padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Format a number as Danish currency
 */
export function formatDanishCurrency(amount: number): string {
  return amount.toLocaleString('da-DK', {
    style: 'currency',
    currency: 'DKK',
  });
}

/**
 * Get today's date in ISO format
 */
export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}
