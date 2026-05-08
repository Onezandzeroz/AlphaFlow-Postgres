/**
 * OIOUBL / Peppol BIS Billing 3.0 Pre-Validation
 *
 * Validates generated OIOUBL XML against Peppol BIS Billing 3.0 rules
 * before submission to the Peppol network. This is a lightweight pre-check
 * — not a full XSD schema validation.
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Valid ISO 4217 currency codes (common subset used in Denmark/Nordics + EUR/USD/GBP)
const VALID_CURRENCY_CODES = new Set([
  'DKK', 'EUR', 'SEK', 'NOK', 'ISK', 'GBP', 'USD', 'CHF', 'PLN', 'CZK',
  'CAD', 'AUD', 'JPY', 'CNY', 'TRY', 'BGN', 'RON', 'HRK', 'HUF',
]);

// Valid UN/ECE 5301 VAT category codes for Peppol BIS Billing 3.0
const VALID_VAT_CATEGORY_CODES = new Set([
  'S',   // Standard rate
  'Z',   // Zero rated
  'AE',  // Reverse charge
  'K',   // Intra-community supply
  'G',   // Export outside EU
  'O',   // Not subject to VAT
  'E',   // Exempt from VAT
]);

// Valid UN/ECE 4461 Payment means codes (common subset)
const VALID_PAYMENT_MEANS_CODES = new Set([
  '1',   // Not defined
  '2',   // Instrument not defined
  '3',   // Cheque
  '4',   // Credit transfer
  '5',   // Debit transfer
  '6',   // Standing agreement
  '7',   // Debit card
  '8',   // Credit card
  '9',   // Direct debit
  '10',  // Cash
  '30',  // Credit transfer (specific)
  '42',  // Payment to bank account
  '48',  // Bank card
  '49',  // Direct debit
  '50',  // Standing agreement
  '54',  // Credit card
  '55',  // Debit card
  '57',  // Standing agreement (debit)
  '58',  // SEPA credit transfer
  '59',  // SEPA direct debit
]);

// ISO 8601 date regex (YYYY-MM-DD)
const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Validate an OIOUBL XML string against Peppol BIS Billing 3.0 pre-checks.
 *
 * This performs structural and business-rule validation on the generated XML
 * content. It extracts values using regex rather than a full XML parser
 * to keep the dependency footprint minimal.
 */
export function validateOIOUBL(xml: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!xml || typeof xml !== 'string') {
    errors.push('XML content is empty or invalid.');
    return { isValid: false, errors, warnings };
  }

  // ── 1. Basic XML structure ──────────────────────────────────────────

  if (!xml.includes('<Invoice')) {
    errors.push('Missing root <Invoice> element.');
  }

  if (!xml.includes('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"')) {
    errors.push('Missing UBL Invoice namespace declaration.');
  }

  if (!xml.includes('cbc:UBLVersionID')) {
    errors.push('Missing UBLVersionID element.');
  }

  // ── 2. Supplier (AccountingSupplierParty) ───────────────────────────

  if (!xml.includes('cac:AccountingSupplierParty')) {
    errors.push('Missing AccountingSupplierParty (supplier) element.');
  } else {
    const supplierName = extractElement(xml, 'cac:AccountingSupplierParty', 'cbc:Name');
    if (!supplierName) {
      errors.push('Supplier name is missing or empty.');
    }

    const supplierEndpoint = extractElement(xml, 'cac:AccountingSupplierParty', 'cbc:EndpointID');
    if (!supplierEndpoint) {
      warnings.push('Supplier endpoint ID (CVR/EAN) is missing. Peppol routing may fail.');
    }

    const supplierVat = extractElement(xml, 'cac:AccountingSupplierParty', 'cbc:CompanyID');
    if (!supplierVat) {
      warnings.push('Supplier VAT number (CompanyID) is missing.');
    }
  }

  // ── 3. Customer (AccountingCustomerParty) ───────────────────────────

  if (!xml.includes('cac:AccountingCustomerParty')) {
    errors.push('Missing AccountingCustomerParty (customer) element.');
  } else {
    const customerName = extractElement(xml, 'cac:AccountingCustomerParty', 'cbc:Name');
    if (!customerName) {
      errors.push('Customer name is missing or empty.');
    }

    const customerEndpoint = extractElement(xml, 'cac:AccountingCustomerParty', 'cbc:EndpointID');
    if (!customerEndpoint) {
      warnings.push('Customer endpoint ID (CVR/EAN) is missing. Peppol routing may fail.');
    }
  }

  // ── 4. Invoice line items ───────────────────────────────────────────

  const invoiceLineCount = countOccurrences(xml, '<cac:InvoiceLine>');
  if (invoiceLineCount === 0) {
    errors.push('Invoice must contain at least one line item.');
  }

  // Validate each invoice line
  for (let i = 0; i < invoiceLineCount; i++) {
    const lineDescription = extractNthElement(xml, 'cbc:Description', i);
    if (!lineDescription) {
      errors.push(`Invoice line ${i + 1}: description is missing.`);
    }

    const lineQuantity = extractNthElement(xml, 'cbc:InvoicedQuantity', i);
    if (!lineQuantity || parseFloat(lineQuantity) <= 0) {
      errors.push(`Invoice line ${i + 1}: quantity must be greater than 0.`);
    }

    const linePrice = extractNthElement(xml, 'cbc:PriceAmount', i);
    if (!linePrice || parseFloat(linePrice) < 0) {
      errors.push(`Invoice line ${i + 1}: unit price must be 0 or greater.`);
    }
  }

  // ── 5. Totals validation ────────────────────────────────────────────

  const lineExtensionAmounts = extractAllValues(xml, 'cbc:LineExtensionAmount');
  const calculatedLineTotal = lineExtensionAmounts.reduce((sum, val) => sum + parseFloat(val || '0'), 0);

  const taxExclusiveAmount = extractFirstValue(xml, 'cbc:TaxExclusiveAmount');
  const taxInclusiveAmount = extractFirstValue(xml, 'cbc:TaxInclusiveAmount');
  const payableAmount = extractFirstValue(xml, 'cbc:PayableAmount');
  const taxAmount = extractFirstValue(xml, 'cbc:TaxAmount');

  if (taxExclusiveAmount === null) {
    errors.push('Missing TaxExclusiveAmount.');
  } else {
    const taxExcl = parseFloat(taxExclusiveAmount);
    if (Math.abs(taxExcl - calculatedLineTotal) > 0.02) {
      errors.push(
        `TaxExclusiveAmount (${taxExcl.toFixed(2)}) does not match sum of line extension amounts (${calculatedLineTotal.toFixed(2)}). Difference: ${(taxExcl - calculatedLineTotal).toFixed(2)}.`
      );
    }
  }

  if (taxInclusiveAmount === null) {
    errors.push('Missing TaxInclusiveAmount.');
  }

  if (taxAmount === null) {
    errors.push('Missing TaxAmount (total VAT).');
  } else {
    const tax = parseFloat(taxAmount);
    if (tax < 0) {
      errors.push('TaxAmount must not be negative.');
    }

    if (taxExclusiveAmount !== null && taxInclusiveAmount !== null) {
      const expectedInclusive = parseFloat(taxExclusiveAmount) + tax;
      if (Math.abs(expectedInclusive - parseFloat(taxInclusiveAmount)) > 0.02) {
        errors.push(
          `TaxInclusiveAmount (${parseFloat(taxInclusiveAmount).toFixed(2)}) does not equal TaxExclusiveAmount + TaxAmount (${expectedInclusive.toFixed(2)}).`
        );
      }
    }
  }

  if (payableAmount === null) {
    errors.push('Missing PayableAmount.');
  } else {
    const payable = parseFloat(payableAmount);
    if (payable < 0) {
      errors.push('PayableAmount must not be negative.');
    }
    if (taxInclusiveAmount !== null && Math.abs(payable - parseFloat(taxInclusiveAmount)) > 0.02) {
      warnings.push(
        `PayableAmount (${payable.toFixed(2)}) differs from TaxInclusiveAmount (${parseFloat(taxInclusiveAmount).toFixed(2)}). This may indicate allowances or charges.`
      );
    }
  }

  // ── 6. Currency code validation ─────────────────────────────────────

  const currencyMatches = xml.matchAll(/cbc:DocumentCurrencyCode[^>]*>([^<]+)/g);
  const currencyCodes = new Set<string>();
  for (const match of currencyMatches) {
    const code = match[1].trim();
    currencyCodes.add(code);
    if (!VALID_CURRENCY_CODES.has(code)) {
      errors.push(`Invalid currency code "${code}". Must be a valid ISO 4217 code.`);
    }
  }

  if (currencyCodes.size === 0) {
    errors.push('Missing DocumentCurrencyCode.');
  } else if (currencyCodes.size > 1) {
    warnings.push('Multiple currency codes detected. Peppol BIS Billing 3.0 supports a single currency.');
  }

  // ── 7. VAT category code validation ─────────────────────────────────

  const vatCategoryMatches = xml.matchAll(/cbc:ID>([^<]*)<\/cbc:ID/g);
  const vatCategories: string[] = [];
  for (const match of vatCategoryMatches) {
    const code = match[1].trim();
    // Only validate if it looks like a VAT category code (1-2 chars, letters)
    if (/^[A-Z]{1,2}$/.test(code) && !['VAT'].includes(code)) {
      vatCategories.push(code);
      if (!VALID_VAT_CATEGORY_CODES.has(code)) {
        errors.push(`Invalid VAT category code "${code}". Valid codes: S, Z, AE, K, G, O, E.`);
      }
    }
  }

  if (vatCategories.length === 0 && invoiceLineCount > 0) {
    warnings.push('No VAT category codes found in invoice lines.');
  }

  // ── 8. Payment means validation ─────────────────────────────────────

  const paymentMeansMatch = xml.match(/cbc:PaymentMeansCode[^>]*>([^<]+)/);
  if (paymentMeansMatch) {
    const meansCode = paymentMeansMatch[1].trim();
    if (!VALID_PAYMENT_MEANS_CODES.has(meansCode)) {
      errors.push(`Invalid PaymentMeansCode "${meansCode}". Must be a valid UN/ECE 4461 code.`);
    }
  } else if (xml.includes('cac:PaymentMeans')) {
    warnings.push('PaymentMeans element found but PaymentMeansCode is missing.');
  } else {
    warnings.push('No PaymentMeans element found. The invoice may still be valid but payment instructions will be absent.');
  }

  // ── 9. Date format validation ───────────────────────────────────────

  const dateElements = ['cbc:IssueDate', 'cbc:DueDate'];
  for (const element of dateElements) {
    const dateMatch = xml.match(new RegExp(`<${element}[^>]*>([^<]+)</${element}>`));
    if (dateMatch) {
      const dateStr = dateMatch[1].trim();
      if (!ISO_DATE_REGEX.test(dateStr)) {
        errors.push(`${element} "${dateStr}" is not a valid ISO 8601 date (expected YYYY-MM-DD).`);
      }
    }
  }

  // IssueDate is mandatory
  if (!xml.includes('cbc:IssueDate')) {
    errors.push('Missing mandatory IssueDate.');
  }

  // ── 10. ProfileID and CustomizationID ───────────────────────────────

  if (!xml.includes('cbc:CustomizationID')) {
    warnings.push('Missing CustomizationID. Expected "urn:cen.eu:en16931:2017" for Peppol BIS Billing 3.0.');
  }

  if (!xml.includes('cbc:ProfileID')) {
    warnings.push('Missing ProfileID. Expected "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0" for Peppol BIS Billing 3.0.');
  }

  const invoiceTypeMatch = xml.match(/cbc:InvoiceTypeCode[^>]*>([^<]+)/);
  if (!invoiceTypeMatch) {
    errors.push('Missing InvoiceTypeCode. Value 380 (Commercial invoice) is expected.');
  } else {
    const typeCode = invoiceTypeMatch[1].trim();
    if (typeCode !== '380' && typeCode !== '381' && typeCode !== '384' && typeCode !== '389') {
      warnings.push(`InvoiceTypeCode "${typeCode}" is not standard. Expected 380 (Commercial invoice), 381 (Credit note), 384 (Corrected invoice), or 389 (Self-billed invoice).`);
    }
  }

  // ── 11. Invoice ID ──────────────────────────────────────────────────

  const invoiceIdMatch = xml.match(/<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/);
  if (!invoiceIdMatch) {
    errors.push('Missing Invoice ID (cbc:ID).');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Helper functions ─────────────────────────────────────────────────────

/**
 * Extract the text content of the first occurrence of a nested element.
 * Works for simple cases where the target element appears once within the parent scope.
 */
function extractElement(xml: string, _parentTag: string, targetTag: string): string | null {
  const match = xml.match(new RegExp(`<${escapeRegex(targetTag)}[^>]*>([^<]+)</${escapeRegex(targetTag)}>`, 's'));
  return match ? match[1].trim() : null;
}

/**
 * Extract the text content of the Nth occurrence of an element.
 */
function extractNthElement(xml: string, tag: string, index: number): string | null {
  const regex = new RegExp(`<${escapeRegex(tag)}[^>]*>([^<]+)</${escapeRegex(tag)}>`, 'g');
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    if (count === index) {
      return match[1].trim();
    }
    count++;
  }
  return null;
}

/**
 * Extract the first matching numeric value for an element.
 */
function extractFirstValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${escapeRegex(tag)}[^>]*>([^<]+)</${escapeRegex(tag)}>`, 's'));
  return match ? match[1].trim() : null;
}

/**
 * Extract all matching text values for an element.
 */
function extractAllValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${escapeRegex(tag)}[^>]*>([^<]+)</${escapeRegex(tag)}>`, 'g');
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1].trim());
  }
  return values;
}

/**
 * Count occurrences of a specific tag in the XML.
 */
function countOccurrences(xml: string, tag: string): number {
  const regex = new RegExp(`<${escapeRegex(tag)}[\\s>]`, 'g');
  return (xml.match(regex) || []).length;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
