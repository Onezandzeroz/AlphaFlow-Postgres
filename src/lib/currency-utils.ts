/**
 * Currency formatting utilities
 *
 * Supports: DKK, EUR, USD, GBP, SEK, NOK
 * Provides proper symbol placement, decimal formatting, and locale-aware display.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
  symbolBeforeAmount: boolean;
  spaceBetweenSymbolAndAmount: boolean;
}

export const CURRENCY_CONFIG: Record<string, CurrencyConfig> = {
  DKK: {
    code: 'DKK',
    symbol: 'kr.',
    name: 'Danish Krone',
    locale: 'da-DK',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: false,
  },
  EUR: {
    code: 'EUR',
    symbol: '\u20AC',
    name: 'Euro',
    locale: 'da-DK',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: false,
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    decimals: 2,
    symbolBeforeAmount: true,
    spaceBetweenSymbolAndAmount: false,
  },
  GBP: {
    code: 'GBP',
    symbol: '\u00A3',
    name: 'British Pound',
    locale: 'en-GB',
    decimals: 2,
    symbolBeforeAmount: true,
    spaceBetweenSymbolAndAmount: false,
  },
  SEK: {
    code: 'SEK',
    symbol: 'kr',
    name: 'Swedish Krona',
    locale: 'sv-SE',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: true,
  },
  NOK: {
    code: 'NOK',
    symbol: 'kr',
    name: 'Norwegian Krone',
    locale: 'nb-NO',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: true,
  },
};

/**
 * Format a number as a currency string with proper symbol and decimals.
 *
 * @param amount - The numeric amount to format
 * @param currency - Currency code (e.g. 'DKK', 'EUR', 'USD')
 * @returns Formatted string, e.g. "1.234,56 kr.", "€1,234.56"
 */
export function formatCurrency(amount: number, currency: string = 'DKK'): string {
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.DKK;

  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
  } catch {
    // Fallback if Intl formatting fails
    const fixed = amount.toFixed(config.decimals);
    if (config.symbolBeforeAmount) {
      return `${config.symbol}${fixed}`;
    }
    return `${fixed} ${config.symbol}`;
  }
}

/**
 * Get the currency config for a given currency code.
 * Falls back to DKK if the currency is not recognized.
 */
export function getCurrencyConfig(currency: string): CurrencyConfig {
  return CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.DKK;
}

/**
 * Validate if a currency code is supported.
 */
export function isSupportedCurrency(currency: string): boolean {
  return currency in CURRENCY_CONFIG;
}

/**
 * Format a number with decimal places for use in PDF tables.
 * Uses comma as decimal separator (Danish convention).
 */
export function formatNumberForPDF(amount: number, decimals: number = 2): string {
  return amount.toLocaleString('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Get the currency symbol for a given currency code.
 */
export function getCurrencySymbol(currency: string): string {
  const config = CURRENCY_CONFIG[currency];
  return config ? config.symbol : CURRENCY_CONFIG.DKK.symbol;
}

/**
 * TODO: Integrate with a real exchange rate API (e.g., Danmarks Nationalbank, ECB, or Fixer.io)
 * This stub returns null for now. When implementing:
 *   1. Choose an API provider
 *   2. Add caching to avoid rate-limiting (e.g., in-memory cache with 1-hour TTL)
 *   3. Handle API errors gracefully
 *   4. Add rate limiting
 *
 * @param from - Source currency code (e.g. 'DKK')
 * @param to - Target currency code (e.g. 'EUR')
 * @returns Exchange rate (amount of `from` per 1 unit of `to`), or null if unavailable
 */
export async function getExchangeRate(
  _from: string,
  _to: string
): Promise<number | null> {
  // TODO: Implement exchange rate API integration
  // Example implementation:
  // const cacheKey = `exchange-rate-${from}-${to}`;
  // const cached = cache.get(cacheKey);
  // if (cached) return cached;
  //
  // const response = await fetch(`https://api.exchangerate.host/latest?base=${from}&symbols=${to}`);
  // const data = await response.json();
  // const rate = data.rates?.[to];
  //
  // if (rate) {
  //   cache.set(cacheKey, rate, { ttl: 3600000 }); // 1 hour TTL
  // }
  // return rate ?? null;

  return null;
}
