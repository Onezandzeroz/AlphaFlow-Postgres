import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

/**
 * Danish keyword → account mapping for smart categorization.
 *
 * Keyword rules (as specified):
 *   husleje/leje/rent         → 8000
 *   løn/salary                → 7000
 *   el/vand/varme             → 8100
 *   forsikring/insurance      → 8400
 *   internet/telefon          → 8600
 *   kontor/office             → 8700
 *   reklame/marketing         → 8800
 *   konsulent/consulting      → 4100
 *   Default                   → null (confidence 0)
 */
const KEYWORD_ACCOUNT_MAP: Array<{
  keywords: string[];
  accountNumber: string;
  accountName: string;
  confidence: number;
}> = [
  {
    keywords: ['husleje', 'leje', 'rent'],
    accountNumber: '8000',
    accountName: 'Husleje',
    confidence: 0.92,
  },
  {
    keywords: ['løn', 'lønning', 'lønninger', 'salary', 'wage'],
    accountNumber: '7000',
    accountName: 'Lønninger',
    confidence: 0.95,
  },
  {
    keywords: ['el', 'vand', 'varme', 'strøm', 'fjernvarme', 'forsyning', 'energi', 'gas', 'heating'],
    accountNumber: '8100',
    accountName: 'El, vand og varme',
    confidence: 0.88,
  },
  {
    keywords: ['forsikring', 'insurance', 'indbo', 'ansvarsforsikring', 'erhvervsforsikring'],
    accountNumber: '8400',
    accountName: 'Forsikring',
    confidence: 0.90,
  },
  {
    keywords: ['internet', 'telefon', 'mobil', 'bredbånd', 'it', 'software', 'computer', 'licens', 'abonnement', 'subscription', 'cloud', 'hosting', 'domain'],
    accountNumber: '8600',
    accountName: 'IT- og kommunikationsomk.',
    confidence: 0.85,
  },
  {
    keywords: ['kontor', 'office', 'papir', 'printer', 'blæk', 'toner', 'kontorartikler'],
    accountNumber: '8700',
    accountName: 'Kontorartikler',
    confidence: 0.80,
  },
  {
    keywords: ['reklame', 'marketing', 'annoncering', 'annonce', 'facebook', 'google ads', 'seo', 'sponsor', 'branding'],
    accountNumber: '8800',
    accountName: 'Annoncering',
    confidence: 0.83,
  },
  {
    keywords: ['konsulent', 'consulting', 'rådgivning', 'consultant', 'rådgiver'],
    accountNumber: '4100',
    accountName: 'Konsulentydelser',
    confidence: 0.87,
  },
];

/**
 * Categorize a single description using keyword matching.
 * Returns { accountNumber, accountName, confidence } or null with confidence 0.
 */
function categorizeDescription(
  desc: string,
  userAccountMap: Map<string, { number: string; name: string; nameEn: string | null }>
): { accountNumber: string; accountName: string; confidence: number } | null {
  const normalizedDesc = desc.toLowerCase().trim();

  let bestMatch: { accountNumber: string; accountName: string; confidence: number; matchedCount: number } | null = null;

  for (const mapping of KEYWORD_ACCOUNT_MAP) {
    const matchedKeywords = mapping.keywords.filter(kw => normalizedDesc.includes(kw));
    if (matchedKeywords.length > 0) {
      // Boost confidence based on number of keyword matches
      const boost = Math.min(0.05 * matchedKeywords.length, 0.1);
      const confidence = Math.min(mapping.confidence + boost, 0.99);

      if (!bestMatch || confidence > bestMatch.confidence) {
        // Use user's actual account name if available
        const userAccount = userAccountMap.get(mapping.accountNumber);

        bestMatch = {
          accountNumber: mapping.accountNumber,
          accountName: userAccount?.name || mapping.accountName,
          confidence: Math.round(confidence * 100) / 100,
          matchedCount: matchedKeywords.length,
        };
      }
    }
  }

  // Default: null with confidence 0
  return bestMatch ? { accountNumber: bestMatch.accountNumber, accountName: bestMatch.accountName, confidence: bestMatch.confidence } : null;
}

/**
 * POST /api/ai-categorize
 *
 * Supports two request formats:
 *
 * 1. Single description (task spec):
 *    Body: { description: string }
 *    Response: { accountNumber: string, accountName: string, confidence: number }
 *    (Returns null values with confidence 0 when no match found)
 *
 * 2. Batch descriptions (existing consumers):
 *    Body: { descriptions: string[] }
 *    Response: { results: Array<{ description, suggestions, hasMatch }> }
 */
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

    const body = await request.json();
    const { description, descriptions } = body as { description?: string; descriptions?: string[] };

    // demo filter now included in tenantFilter

    // Fetch user's actual accounts to validate suggestions
    const userAccounts = await db.account.findMany({
      where: {
        ...tenantFilter(ctx),
        isActive: true,
      },
      select: { number: true, name: true, nameEn: true },
    });

    const userAccountMap = new Map(userAccounts.map(a => [a.number, a]));

    // ─── Single description mode (task spec format) ────────────────
    if (description && typeof description === 'string') {
      const result = categorizeDescription(description, userAccountMap);

      if (result) {
        return NextResponse.json({
          accountNumber: result.accountNumber,
          accountName: result.accountName,
          confidence: result.confidence,
        });
      }

      // Default: null with confidence 0
      return NextResponse.json({
        accountNumber: null,
        accountName: null,
        confidence: 0,
      });
    }

    // ─── Batch descriptions mode (existing consumers) ──────────────
    if (descriptions && Array.isArray(descriptions)) {
      const results = descriptions.map((desc: string) => {
        const normalizedDesc = desc.toLowerCase().trim();
        const suggestions: Array<{
          accountNumber: string;
          accountName: string;
          accountNameEn: string;
          confidence: number;
          matchedKeywords: string[];
        }> = [];

        for (const mapping of KEYWORD_ACCOUNT_MAP) {
          const matchedKeywords = mapping.keywords.filter(kw => normalizedDesc.includes(kw));
          if (matchedKeywords.length > 0) {
            const boost = Math.min(0.05 * matchedKeywords.length, 0.1);
            const confidence = Math.min(mapping.confidence + boost, 0.99);
            const userAccount = userAccountMap.get(mapping.accountNumber);

            suggestions.push({
              accountNumber: mapping.accountNumber,
              accountName: userAccount?.name || mapping.accountName,
              accountNameEn: userAccount?.nameEn ?? mapping.accountName,
              confidence: Math.round(confidence * 100) / 100,
              matchedKeywords,
            });
          }
        }

        suggestions.sort((a, b) => b.confidence - a.confidence);

        return {
          description: desc,
          suggestions: suggestions.slice(0, 3),
          hasMatch: suggestions.length > 0,
        };
      });

      return NextResponse.json({ results });
    }

    return NextResponse.json(
      { error: 'Missing "description" or "descriptions" field.' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('AI categorize API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
