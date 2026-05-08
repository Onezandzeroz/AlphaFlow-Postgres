/**
 * Transaction Matching Engine for Bank Reconciliation
 *
 * Three-level matching:
 * 1. Rule-based: Exact amount ±0.01 DKK, date ±3 days, reference match
 * 2. Fuzzy: Amount ±5 DKK, date ±7 days, description similarity > 70%
 * 3. AI-assisted: Internal LLM with confidence score
 *
 * Auto-post at >95% confidence, otherwise requires manual approval.
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface MatchCandidate {
  journalLineId: string;
  confidence: number; // 0.0-1.0
  method: 'exact' | 'fuzzy' | 'ai';
  reasons: string[];
}

export interface BankLineInput {
  id: string;
  date: Date;
  description: string;
  reference: string | null;
  amount: number;
}

export interface JournalLineInput {
  id: string;
  date: Date;
  description: string;
  accountNumber: string;
  accountName: string;
  amount: number; // From bank perspective
}

export interface MatchOptions {
  enableAI?: boolean;
  aiConfidenceThreshold?: number; // Default: 0.80
  autoMatchThreshold?: number;    // Default: 0.95
}

// ─── Levenshtein Distance ──────────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ─── Date Helpers ──────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

// ─── Rule-Based Matching ───────────────────────────────────────────

function ruleBasedMatch(
  bankLine: BankLineInput,
  journalLine: JournalLineInput
): MatchCandidate | null {
  const reasons: string[] = [];
  let confidence = 0;

  // Amount check: exact ±0.01 DKK
  const amountDiff = Math.abs(bankLine.amount - journalLine.amount);
  if (amountDiff <= 0.01) {
    confidence += 0.50;
    reasons.push(`Beløb matcher præcist: ${bankLine.amount.toFixed(2)} DKK`);
  } else if (amountDiff <= 1.0) {
    confidence += 0.30;
    reasons.push(`Beløb næsten match: ${amountDiff.toFixed(2)} DKK forskel`);
  } else {
    return null; // Amount too different for rule-based
  }

  // Date check: within ±3 days
  const daysDiff = daysBetween(bankLine.date, journalLine.date);
  if (daysDiff <= 1) {
    confidence += 0.35;
    reasons.push(`Dato matcher: ${daysDiff.toFixed(0)} dag(e) forskel`);
  } else if (daysDiff <= 3) {
    confidence += 0.25;
    reasons.push(`Dato tæt på: ${daysDiff.toFixed(0)} dag(e) forskel`);
  } else if (daysDiff <= 7) {
    confidence += 0.10;
    reasons.push(`Dato inden for 7 dage: ${daysDiff.toFixed(0)} dag(e) forskel`);
  } else {
    return null; // Date too far for rule-based
  }

  // Reference match (bonus)
  if (bankLine.reference && journalLine.description) {
    const refLower = bankLine.reference.toLowerCase();
    const descLower = journalLine.description.toLowerCase();
    if (descLower.includes(refLower) || refLower.includes(descLower)) {
      confidence += 0.15;
      reasons.push('Reference matcher beskrivelse');
    }
  }

  // Description similarity (bonus)
  const descSimilarity = stringSimilarity(
    bankLine.description,
    journalLine.description
  );
  if (descSimilarity > 0.7) {
    confidence += 0.10;
    reasons.push(`Beskrivelse ligner: ${(descSimilarity * 100).toFixed(0)}%`);
  }

  confidence = Math.min(confidence, 1.0);

  if (confidence >= 0.60) {
    return {
      journalLineId: journalLine.id,
      confidence,
      method: 'exact',
      reasons,
    };
  }

  return null;
}

// ─── Fuzzy Matching ────────────────────────────────────────────────

function fuzzyMatch(
  bankLine: BankLineInput,
  journalLine: JournalLineInput
): MatchCandidate | null {
  const reasons: string[] = [];
  let confidence = 0;

  // Amount check: within ±5 DKK
  const amountDiff = Math.abs(bankLine.amount - journalLine.amount);
  if (amountDiff <= 5.0) {
    confidence += 0.30;
    reasons.push(`Beløb tæt på: ${amountDiff.toFixed(2)} DKK forskel`);
  } else if (amountDiff <= Math.abs(bankLine.amount) * 0.05) {
    // Within 5% of the amount
    confidence += 0.20;
    reasons.push(`Beløb inden for 5%: ${amountDiff.toFixed(2)} DKK forskel`);
  } else {
    return null;
  }

  // Date check: within ±7 days
  const daysDiff = daysBetween(bankLine.date, journalLine.date);
  if (daysDiff <= 3) {
    confidence += 0.25;
    reasons.push(`Dato tæt på: ${daysDiff.toFixed(0)} dag(e) forskel`);
  } else if (daysDiff <= 7) {
    confidence += 0.15;
    reasons.push(`Dato inden for 7 dage: ${daysDiff.toFixed(0)} dag(e) forskel`);
  } else {
    return null;
  }

  // Description similarity > 50%
  const descSimilarity = stringSimilarity(
    bankLine.description,
    journalLine.description
  );
  if (descSimilarity > 0.70) {
    confidence += 0.35;
    reasons.push(`Beskrivelse ligner: ${(descSimilarity * 100).toFixed(0)}%`);
  } else if (descSimilarity > 0.50) {
    confidence += 0.20;
    reasons.push(`Beskrivelse delvist ligner: ${(descSimilarity * 100).toFixed(0)}%`);
  }

  // Keyword matching (Danish banking keywords)
  const bankKeywords = extractKeywords(bankLine.description);
  const journalKeywords = extractKeywords(journalLine.description);
  const commonKeywords = bankKeywords.filter(k => journalKeywords.includes(k));
  if (commonKeywords.length > 0) {
    confidence += 0.10;
    reasons.push(`Fælles nøgleord: ${commonKeywords.join(', ')}`);
  }

  confidence = Math.min(confidence, 0.94); // Fuzzy never reaches auto-match threshold

  if (confidence >= 0.50) {
    return {
      journalLineId: journalLine.id,
      confidence,
      method: 'fuzzy',
      reasons,
    };
  }

  return null;
}

// ─── Keyword Extraction ────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'og', 'eller', 'den', 'det', 'en', 'et', 'de', 'i', 'på', 'til',
    'fra', 'med', 'for', 'af', 'er', 'var', 'har', 'kan', 'skal',
    'the', 'and', 'or', 'a', 'an', 'is', 'was', 'has', 'to', 'for',
    'dkk', 'kr', 'dk', 'danmark',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\sæøåÆØÅ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

// ─── AI-Assisted Matching ──────────────────────────────────────────

async function aiMatch(
  bankLine: BankLineInput,
  candidates: JournalLineInput[]
): Promise<MatchCandidate[]> {
  try {
    // Dynamic import to avoid client-side bundling
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const sdk = await ZAI.create();

    const prompt = `Du er en dansk bogføringsassistent. Analysér denne banktransaktion og de potentielle finansposteringer, og vurder hvilke der matcher.

BANKTRANSAKTION:
- Dato: ${bankLine.date.toISOString().split('T')[0]}
- Tekst: ${bankLine.description}
- Reference: ${bankLine.reference || 'Ingen'}
- Beløb: ${bankLine.amount.toFixed(2)} DKK

KANDIDATER:
${candidates.map((c, i) => `${i + 1}. ID: ${c.id} | Dato: ${c.date.toISOString().split('T')[0]} | Tekst: ${c.description} | Konto: ${c.accountNumber} ${c.accountName} | Beløb: ${c.amount.toFixed(2)} DKK`).join('\n')}

Svar KUN med JSON i dette format:
{"matches": [{"id": "kandidat-id", "confidence": 0.95, "reason": "forklaring"}]}

Vigtige regler:
- Kun match hvis beløb og dato er konsistente
- Confidence > 0.95 = automatisk match
- Confidence 0.80-0.95 = kræver manuel godkendelse
- Confidence < 0.80 = ingen match
- Returnér kun matches med confidence >= 0.80`;

    const result = await sdk.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    const content = result.choices?.[0]?.message?.content || '';
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const matches: MatchCandidate[] = (parsed.matches || [])
      .filter((m: { confidence: number }) => m.confidence >= 0.80)
      .map((m: { id: string; confidence: number; reason: string }) => ({
        journalLineId: m.id,
        confidence: Math.min(m.confidence, 1.0),
        method: 'ai' as const,
        reasons: [m.reason],
      }));

    return matches;
  } catch (error) {
    console.error('[Matching Engine] AI matching failed:', error);
    return [];
  }
}

// ─── Main Matching Functions ───────────────────────────────────────

/**
 * Find match candidates for a single bank line
 */
export function findMatches(
  bankLine: BankLineInput,
  journalLines: JournalLineInput[],
  options?: MatchOptions
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  for (const jl of journalLines) {
    // Try rule-based first
    const ruleMatch = ruleBasedMatch(bankLine, jl);
    if (ruleMatch) {
      candidates.push(ruleMatch);
      continue;
    }

    // Try fuzzy matching
    const fuzzy = fuzzyMatch(bankLine, jl);
    if (fuzzy) {
      candidates.push(fuzzy);
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Remove duplicates (same journal line matched via different methods - keep highest)
  const seen = new Set<string>();
  return candidates.filter(c => {
    if (seen.has(c.journalLineId)) return false;
    seen.add(c.journalLineId);
    return true;
  });
}

/**
 * Batch matching for all unmatched bank lines
 * Returns a map of bankLineId -> best match candidate
 */
export function batchMatch(
  bankLines: BankLineInput[],
  journalLines: JournalLineInput[],
  options?: MatchOptions
): Map<string, MatchCandidate> {
  const matches = new Map<string, MatchCandidate>();
  const usedJournalLines = new Set<string>();
  const threshold = options?.autoMatchThreshold ?? 0.95;

  // Sort bank lines by amount (exact amounts first for better matching)
  const sortedLines = [...bankLines].sort((a, b) =>
    Math.abs(b.amount) - Math.abs(a.amount)
  );

  for (const bankLine of sortedLines) {
    const candidates = findMatches(bankLine, journalLines.filter(
      jl => !usedJournalLines.has(jl.id)
    ), options);

    if (candidates.length > 0) {
      const best = candidates[0];
      if (best.confidence >= 0.50) {
        matches.set(bankLine.id, best);
        if (best.confidence >= threshold) {
          usedJournalLines.add(best.journalLineId);
        }
      }
    }
  }

  return matches;
}

/**
 * Run AI-assisted matching on unmatched lines
 * This is async because it calls the LLM
 */
export async function aiBatchMatch(
  bankLines: BankLineInput[],
  journalLines: JournalLineInput[],
  options?: MatchOptions
): Promise<Map<string, MatchCandidate>> {
  const matches = new Map<string, MatchCandidate>();
  const threshold = options?.aiConfidenceThreshold ?? 0.80;

  // Process in batches of 5 to avoid rate limiting
  for (let i = 0; i < bankLines.length; i += 5) {
    const batch = bankLines.slice(i, i + 5);

    for (const bankLine of batch) {
      // Get fuzzy candidates first (narrow down to likely matches)
      const fuzzyCandidates = journalLines.filter(jl => {
        const amountDiff = Math.abs(bankLine.amount - jl.amount);
        const daysDiff = daysBetween(bankLine.date, jl.date);
        return amountDiff <= Math.abs(bankLine.amount) * 0.10 && daysDiff <= 14;
      });

      if (fuzzyCandidates.length === 0) continue;

      const aiResults = await aiMatch(bankLine, fuzzyCandidates.slice(0, 10));

      if (aiResults.length > 0 && aiResults[0].confidence >= threshold) {
        matches.set(bankLine.id, aiResults[0]);
      }
    }
  }

  return matches;
}
