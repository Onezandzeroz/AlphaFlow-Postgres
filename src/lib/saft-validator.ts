import { logger } from '@/lib/logger';
import { VALID_VAT_PERCENTAGES } from '@/lib/vat-utils';
// SAF-T Danish Schema Validation Utility
// Validates mandatory elements according to Danish SAF-T Financial Schema v1.0

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface ValidationError {
  code: string;
  message: string;
  path: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

// Mandatory tags for SAF-T Financial DK v1.0
const MANDATORY_HEADER_TAGS = [
  { path: 'AuditFileVersion', description: 'SAF-T version (must be 1.0)' },
  { path: 'AuditFileCountry', description: 'Country code (must be DK)' },
  { path: 'AuditFileDateCreated', description: 'Creation timestamp' },
  { path: 'SoftwareCompanyName', description: 'Software vendor name' },
  { path: 'SoftwareID', description: 'Software identifier' },
  { path: 'CompanyID', description: 'Company identification number (CVR)' },
  { path: 'Company/RegistrationNumber', description: 'Company registration number' },
  { path: 'Company/Name', description: 'Company name' },
];

const MANDATORY_MASTERFILE_TAGS = [
  { path: 'GeneralLedgerAccounts', description: 'Chart of accounts' },
  { path: 'TaxCodeTable', description: 'VAT code definitions' },
];

// VAT code validation for Danish rates — imported from vat-utils (single source of truth)
// const VALID_DANISH_VAT_RATES moved to VALID_VAT_PERCENTAGES in vat-utils.ts

// CVR number format (8 digits, optionally prefixed with DK)
const CVR_PATTERN = /^(DK)?\d{8}$/;

/**
 * Validates a SAF-T XML document structure using regex-based parsing
 * This works in both browser and Node.js environments
 */
export function validateSAFT(xmlContent: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let totalChecks = 0;
  let passed = 0;

  // Check if XML is empty or null
  if (!xmlContent || xmlContent.trim().length === 0) {
    errors.push({
      code: 'EMPTY_XML',
      message: 'XML content is empty',
      path: 'document',
      severity: 'error',
      suggestion: 'Provide valid XML content',
    });
    return createResult(errors, warnings, totalChecks, passed);
  }

  // 1. Validate root element
  totalChecks++;
  if (!xmlContent.includes('<AuditFile')) {
    errors.push({
      code: 'MISSING_ROOT',
      message: 'Missing root element AuditFile',
      path: 'root',
      severity: 'error',
      suggestion: 'Add <AuditFile> as root element with proper namespace',
    });
  } else {
    passed++;
    
    // Check namespace
    totalChecks++;
    if (!xmlContent.includes('xmlns') || !xmlContent.includes('SAF-T')) {
      warnings.push({
        code: 'NAMESPACE_WARNING',
        message: 'Missing or incorrect SAF-T namespace',
        path: 'AuditFile',
        severity: 'warning',
        suggestion: 'Add xmlns="urn:Oasis/Tax/Accounting/SAF-T/Financial/DK"',
      });
    } else {
      passed++;
    }
  }

  // 2. Validate Header section
  totalChecks++;
  if (!xmlContent.includes('<Header>')) {
    errors.push({
      code: 'MISSING_HEADER',
      message: 'Missing mandatory Header section',
      path: 'AuditFile',
      severity: 'error',
      suggestion: 'Add <Header> element with required company and period information',
    });
  } else {
    // Extract header content
    const headerMatch = xmlContent.match(/<Header>([\s\S]*?)<\/Header>/);
    const headerContent = headerMatch ? headerMatch[1] : '';

    MANDATORY_HEADER_TAGS.forEach((tag) => {
      totalChecks++;
      const tagPattern = new RegExp(`<${tag.path.includes('/') ? tag.path.split('/').pop() : tag.path}>([^<]*)</${tag.path.split('/').pop()}>`, 'i');
      if (!tagPattern.test(headerContent) && !tagPattern.test(xmlContent)) {
        errors.push({
          code: 'MISSING_HEADER_TAG',
          message: `Missing mandatory header field: ${tag.description}`,
          path: `Header/${tag.path}`,
          severity: 'error',
          suggestion: `Add <${tag.path.split('/').pop()}> element`,
        });
      } else {
        passed++;
      }
    });

    // Validate AuditFileVersion
    totalChecks++;
    const versionMatch = xmlContent.match(/<AuditFileVersion>([^<]*)<\/AuditFileVersion>/);
    if (versionMatch) {
      const version = versionMatch[1].trim();
      if (version !== '1.0') {
        warnings.push({
          code: 'VERSION_WARNING',
          message: `SAF-T version ${version} may not be compatible with Danish requirements`,
          path: 'Header/AuditFileVersion',
          severity: 'warning',
          suggestion: 'Use version 1.0 for Danish SAF-T compliance',
        });
      } else {
        passed++;
      }
    }

    // Validate AuditFileCountry
    totalChecks++;
    const countryMatch = xmlContent.match(/<AuditFileCountry>([^<]*)<\/AuditFileCountry>/);
    if (countryMatch) {
      const country = countryMatch[1].trim();
      if (country !== 'DK') {
        errors.push({
          code: 'INVALID_COUNTRY',
          message: `Country code ${country} is not valid for Danish SAF-T`,
          path: 'Header/AuditFileCountry',
          severity: 'error',
          suggestion: 'Use "DK" for Danish SAF-T files',
        });
      } else {
        passed++;
      }
    }

    // Validate CompanyID (CVR format)
    totalChecks++;
    const companyIdMatch = xmlContent.match(/<CompanyID>([^<]*)<\/CompanyID>/);
    if (companyIdMatch) {
      const companyId = companyIdMatch[1].trim();
      if (!CVR_PATTERN.test(companyId)) {
        warnings.push({
          code: 'CVR_FORMAT_WARNING',
          message: 'CompanyID does not match Danish CVR format (8 digits, optionally prefixed with DK)',
          path: 'Header/CompanyID',
          severity: 'warning',
          suggestion: 'Use format DK12345678 or 12345678',
        });
      } else {
        passed++;
      }
    }

    // Validate period dates
    totalChecks++;
    const periodStartMatch = xmlContent.match(/<PeriodStart>([^<]*)<\/PeriodStart>/);
    const periodEndMatch = xmlContent.match(/<PeriodEnd>([^<]*)<\/PeriodEnd>/);
    if (periodStartMatch && periodEndMatch) {
      const startDate = new Date(periodStartMatch[1].trim());
      const endDate = new Date(periodEndMatch[1].trim());
      if (startDate > endDate) {
        errors.push({
          code: 'INVALID_PERIOD',
          message: 'Period start date is after end date',
          path: 'Header/SelectionCriteria',
          severity: 'error',
          suggestion: 'Ensure period start date is before or equal to end date',
        });
      } else {
        passed++;
      }
    }
  }

  // 3. Validate MasterFiles section
  totalChecks++;
  if (!xmlContent.includes('<MasterFiles>')) {
    errors.push({
      code: 'MISSING_MASTERFILES',
      message: 'Missing mandatory MasterFiles section',
      path: 'AuditFile',
      severity: 'error',
      suggestion: 'Add <MasterFiles> element with chart of accounts and tax codes',
    });
  } else {
    MANDATORY_MASTERFILE_TAGS.forEach((tag) => {
      totalChecks++;
      if (!xmlContent.includes(`<${tag.path}>`)) {
        errors.push({
          code: 'MISSING_MASTERFILE_TAG',
          message: `Missing mandatory master file: ${tag.description}`,
          path: `MasterFiles/${tag.path}`,
          severity: 'error',
          suggestion: `Add <${tag.path}> element`,
        });
      } else {
        passed++;
      }
    });

    // Validate at least one account exists
    totalChecks++;
    const accountMatches = xmlContent.match(/<Account>/g);
    if (!accountMatches || accountMatches.length === 0) {
      errors.push({
        code: 'NO_ACCOUNTS',
        message: 'No accounts defined in GeneralLedgerAccounts',
        path: 'MasterFiles/GeneralLedgerAccounts',
        severity: 'error',
        suggestion: 'Add at least one account entry',
      });
    } else {
      passed++;
    }

    // Validate tax codes
    totalChecks++;
    const taxCodeMatches = xmlContent.match(/<TaxCode>[^<]*<\/TaxCode>/g);
    if (!taxCodeMatches || taxCodeMatches.length === 0) {
      warnings.push({
        code: 'NO_TAX_CODES',
        message: 'No tax codes defined in TaxCodeTable',
        path: 'MasterFiles/TaxCodeTable',
        severity: 'warning',
        suggestion: 'Add tax codes for VAT rates used in transactions',
      });
    } else {
      passed++;
    }
  }

  // 4. Validate Totals (optional but recommended)
  totalChecks++;
  if (!xmlContent.includes('<Totals>')) {
    warnings.push({
      code: 'MISSING_TOTALS',
      message: 'Missing Totals section (recommended for Danish compliance)',
      path: 'AuditFile',
      severity: 'warning',
      suggestion: 'Add <Totals> section with transaction counts and amounts',
    });
  } else {
    passed++;
  }

  // 5. Check for transactions
  totalChecks++;
  const transactionMatches = xmlContent.match(/<Transaction>/g);
  if (transactionMatches && transactionMatches.length > 0) {
    passed++;
  }

  return createResult(errors, warnings, totalChecks, passed);
}

function createResult(
  errors: ValidationError[],
  warnings: ValidationError[],
  totalChecks: number,
  passed: number
): ValidationResult {
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalChecks,
      passed,
      failed: errors.length,
      warnings: warnings.length,
    },
  };
}

/**
 * Validates transaction data before SAF-T generation
 */
export function validateTransactionData(transactions: Array<{
  id: string;
  date: Date | string;
  amount: number;
  description: string;
  vatPercent: number;
}>): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Allow empty transactions - this is valid for periods with no activity
  if (transactions.length === 0) {
    return { valid: true, errors: [], warnings: ['No transactions in selected period'] };
  }

  transactions.forEach((t, index) => {
    const prefix = `Transaction ${index + 1}:`;

    if (!t.id || t.id.trim() === '') {
      errors.push(`${prefix} Missing transaction ID`);
    }

    if (!t.date) {
      errors.push(`${prefix} Missing transaction date`);
    } else {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) {
        errors.push(`${prefix} Invalid date format`);
      }
    }

    if (typeof t.amount !== 'number' || isNaN(t.amount)) {
      errors.push(`${prefix} Invalid amount (must be a number)`);
    }

    if (!t.description || t.description.trim() === '') {
      warnings.push(`${prefix} Missing description`);
    }

    if (typeof t.vatPercent !== 'number' || isNaN(t.vatPercent)) {
      errors.push(`${prefix} Invalid VAT percentage`);
    } else if (!(VALID_VAT_PERCENTAGES as readonly number[]).includes(t.vatPercent)) {
      warnings.push(`${prefix} VAT rate ${t.vatPercent}% is not a standard Danish rate (0%, 12%, or 25%)`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log validation results
 */
export function logValidationResults(result: ValidationResult, context: string = 'SAF-T Validation'): void {
  logger.info(`\n=== ${context} ===`);
  logger.info(`Status: ${result.isValid ? '✓ VALID' : '✗ INVALID'}`);
  logger.info(`Summary: ${result.summary.passed}/${result.summary.totalChecks} checks passed`);
  logger.info(`Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);
  
  if (result.errors.length > 0) {
    logger.info('\nErrors:');
    result.errors.forEach((e, i) => {
      logger.info(`  ${i + 1}. [${e.code}] ${e.path}: ${e.message}`);
      if (e.suggestion) logger.info(`     → ${e.suggestion}`);
    });
  }
  
  if (result.warnings.length > 0) {
    logger.info('\nWarnings:');
    result.warnings.forEach((w, i) => {
      logger.info(`  ${i + 1}. [${w.code}] ${w.path}: ${w.message}`);
      if (w.suggestion) logger.info(`     → ${w.suggestion}`);
    });
  }
  
  logger.info('='.repeat(40));
}
