import { create } from 'xmlbuilder2';

/**
 * OIOUBL XML Generator for Danish Peppol BIS
 * Generates valid OIOUBL Invoice XML for e-invoicing
 */

export interface OIOUBLInvoiceData {
  // Invoice identification
  invoiceId: string;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  
  // Supplier/Seller information
  supplier: {
    id: string;
    name: string;
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    country?: string; // ISO country code, e.g., 'DK'
    vatNumber?: string; // Without country prefix
    contactEmail?: string;
    contactPhone?: string;
  };
  
  // Customer/Buyer information
  customer: {
    id: string;
    name: string;
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    vatNumber?: string;
    contactEmail?: string;
  };
  
  // Invoice line items
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitCode: string; // e.g., 'EA' (Each), 'HUR' (Hour), 'KGM' (Kilogram)
    unitPrice: number; // Price per unit excluding VAT
    vatPercent: number;
    vatCategoryCode: string; // 'S' = Standard rate, 'Z' = Zero rate, 'E' = Exempt
  }>;
  
  // Totals
  taxTotal: number; // Total VAT amount
  payableAmount: number; // Total including VAT
  taxExclusiveAmount: number; // Total excluding VAT
  taxInclusiveAmount: number; // Total including VAT
  
  // Payment information
  paymentMeansCode?: string; // e.g., '30' = Credit transfer
  paymentAccountId?: string; // Bank account number (IBAN or local)
  paymentReference?: string; // Payment reference/KID
  
  // Currency
  currencyCode: string; // e.g., 'DKK'
}

// Default supplier information for testing
export const DEFAULT_SUPPLIER: OIOUBLInvoiceData['supplier'] = {
  id: 'DK12345678',
  name: 'Dansk Bogholderi ApS',
  streetAddress: 'Hovedgaden 123',
  city: 'København',
  postalCode: '1000',
  country: 'DK',
  vatNumber: 'DK12345678',
  contactEmail: 'info@danskbogholderi.dk',
  contactPhone: '+45 12 34 56 78',
};

// Default customer information for testing
export const DEFAULT_CUSTOMER: OIOUBLInvoiceData['customer'] = {
  id: 'CUST001',
  name: 'Kunde ApS',
  streetAddress: 'Strøget 45',
  city: 'Aarhus',
  postalCode: '8000',
  country: 'DK',
  vatNumber: 'DK87654321',
  contactEmail: 'kunde@example.dk',
};

/**
 * Generate tax subtotals grouped by VAT rate
 */
function generateTaxSubtotals(data: OIOUBLInvoiceData): Record<string, unknown>[] | Record<string, unknown> {
  // Group lines by VAT rate + category code
  const vatGroups = new Map<string, { taxable: number; tax: number; percent: number; code: string }>();
  for (const line of data.lines) {
    const key = `${line.vatPercent}-${line.vatCategoryCode}`;
    const lineAmount = line.quantity * line.unitPrice;
    const vatAmount = lineAmount * line.vatPercent / 100;
    const group = vatGroups.get(key) || { taxable: 0, tax: 0, percent: line.vatPercent, code: line.vatCategoryCode };
    group.taxable += lineAmount;
    group.tax += vatAmount;
    vatGroups.set(key, group);
  }

  const subtotals = Array.from(vatGroups.values()).map(group => ({
    'cbc:TaxableAmount': {
      '@currencyID': data.currencyCode,
      '#': group.taxable.toFixed(2),
    },
    'cbc:TaxAmount': {
      '@currencyID': data.currencyCode,
      '#': group.tax.toFixed(2),
    },
    'cac:TaxCategory': {
      'cbc:ID': group.code,
      'cbc:Percent': group.percent.toString(),
      'cac:TaxScheme': {
        'cbc:ID': 'VAT',
      },
    },
  }));

  // If only one group, return it directly (not as array)
  return subtotals.length === 1 ? subtotals[0] : subtotals;
}

/**
 * Generate OIOUBL Invoice XML string
 */
export function generateOIOUBL(data: OIOUBLInvoiceData): string {
  const invoice = {
    Invoice: {
      '@xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      '@xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      '@xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      
      // Document identification
      'cbc:UBLVersionID': '2.1',
      'cbc:CustomizationID': 'urn:cen.eu:en16931:2017',
      'cbc:ProfileID': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
      'cbc:ID': data.invoiceId,
      'cbc:IssueDate': data.issueDate,
      'cbc:InvoiceTypeCode': '380', // Commercial invoice
      'cbc:DocumentCurrencyCode': data.currencyCode,
      
      // Optional due date
      ...(data.dueDate && { 'cbc:DueDate': data.dueDate }),
      
      // Supplier/Seller Party
      'cac:AccountingSupplierParty': {
        'cac:Party': {
          'cbc:EndpointID': {
            '@schemeID': '0184', // CVR number scheme for Denmark
            '#': data.supplier.id,
          },
          'cac:PartyIdentification': {
            'cbc:ID': {
              '@schemeID': '0184',
              '#': data.supplier.id,
            },
          },
          'cac:PartyName': {
            'cbc:Name': data.supplier.name,
          },
          'cac:PostalAddress': {
            'cbc:StreetName': data.supplier.streetAddress || 'Unknown',
            'cbc:CityName': data.supplier.city || 'Unknown',
            'cbc:PostalZone': data.supplier.postalCode || '0000',
            'cac:Country': {
              'cbc:IdentificationCode': data.supplier.country || 'DK',
            },
          },
          'cac:PartyTaxScheme': {
            'cbc:CompanyID': data.supplier.vatNumber || '',
            'cac:TaxScheme': {
              'cbc:ID': 'VAT',
            },
          },
          'cac:PartyLegalEntity': {
            'cbc:RegistrationName': data.supplier.name,
            'cbc:CompanyID': data.supplier.vatNumber || '',
          },
          ...(data.supplier.contactEmail || data.supplier.contactPhone
            ? {
                'cac:Contact': {
                  ...(data.supplier.contactEmail && {
                    'cbc:ElectronicMail': data.supplier.contactEmail,
                  }),
                  ...(data.supplier.contactPhone && {
                    'cbc:Telephone': data.supplier.contactPhone,
                  }),
                },
              }
            : {}),
        },
      },
      
      // Customer/Buyer Party
      'cac:AccountingCustomerParty': {
        'cac:Party': {
          'cbc:EndpointID': {
            '@schemeID': '0184',
            '#': data.customer.id,
          },
          'cac:PartyIdentification': {
            'cbc:ID': {
              '@schemeID': '0184',
              '#': data.customer.id,
            },
          },
          'cac:PartyName': {
            'cbc:Name': data.customer.name,
          },
          'cac:PostalAddress': {
            'cbc:StreetName': data.customer.streetAddress || 'Unknown',
            'cbc:CityName': data.customer.city || 'Unknown',
            'cbc:PostalZone': data.customer.postalCode || '0000',
            'cac:Country': {
              'cbc:IdentificationCode': data.customer.country || 'DK',
            },
          },
          ...(data.customer.vatNumber
            ? {
                'cac:PartyTaxScheme': {
                  'cbc:CompanyID': data.customer.vatNumber,
                  'cac:TaxScheme': {
                    'cbc:ID': 'VAT',
                  },
                },
              }
            : {}),
          'cac:PartyLegalEntity': {
            'cbc:RegistrationName': data.customer.name,
            ...(data.customer.vatNumber && {
              'cbc:CompanyID': data.customer.vatNumber,
            }),
          },
          ...(data.customer.contactEmail
            ? {
                'cac:Contact': {
                  'cbc:ElectronicMail': data.customer.contactEmail,
                },
              }
            : {}),
        },
      },
      
      // Payment Means
      ...(data.paymentAccountId
        ? {
            'cac:PaymentMeans': {
              'cbc:PaymentMeansCode': data.paymentMeansCode || '30',
              'cac:PayeeFinancialAccount': {
                'cbc:ID': data.paymentAccountId,
                ...(data.paymentReference && {
                  'cbc:PaymentNote': data.paymentReference,
                }),
              },
            },
          }
        : {}),
      
      // Tax Total
      'cac:TaxTotal': {
        'cbc:TaxAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxTotal.toFixed(2),
        },
        // Generate TaxSubtotal for each unique VAT rate
        'cac:TaxSubtotal': generateTaxSubtotals(data),
      },
      
      // Legal Monetary Total
      'cac:LegalMonetaryTotal': {
        'cbc:LineExtensionAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxExclusiveAmount.toFixed(2),
        },
        'cbc:TaxExclusiveAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxExclusiveAmount.toFixed(2),
        },
        'cbc:TaxInclusiveAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxInclusiveAmount.toFixed(2),
        },
        'cbc:PayableAmount': {
          '@currencyID': data.currencyCode,
          '#': data.payableAmount.toFixed(2),
        },
      },
      
      // Invoice Lines
      'cac:InvoiceLine': data.lines.map((line) => ({
        'cbc:ID': line.id,
        'cbc:InvoicedQuantity': {
          '@unitCode': line.unitCode,
          '#': line.quantity.toString(),
        },
        'cbc:LineExtensionAmount': {
          '@currencyID': data.currencyCode,
          '#': (line.quantity * line.unitPrice).toFixed(2),
        },
        'cac:Item': {
          'cbc:Description': line.description,
          'cbc:Name': line.description,
          'cac:ClassifiedTaxCategory': {
            'cbc:ID': line.vatCategoryCode,
            'cbc:Percent': line.vatPercent.toString(),
            'cac:TaxScheme': {
              'cbc:ID': 'VAT',
            },
          },
        },
        'cac:Price': {
          'cbc:PriceAmount': {
            '@currencyID': data.currencyCode,
            '#': line.unitPrice.toFixed(2),
          },
        },
      })),
    },
  };
  
  // Generate XML
  const doc = create(invoice);
  return doc.end({ prettyPrint: true });
}

/**
 * Get VAT category code based on percentage
 */
export function getVATCategoryCode(vatPercent: number): string {
  if (vatPercent === 0) return 'Z'; // Zero rate
  if (vatPercent === 25) return 'S'; // Standard rate (Danish standard)
  return 'S'; // Standard rate for other percentages
}

/**
 * Generate a unique invoice ID
 */
export function generateInvoiceId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timestamp}-${random}`;
}
