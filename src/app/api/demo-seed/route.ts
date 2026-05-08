import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { seedChartOfAccounts } from '@/lib/seed-chart-of-accounts';
import { JournalEntryStatus, VATCode } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';

// ─── Demo Data Constants ──────────────────────────────────────────

const DEMO_COMPANY = {
  companyName: 'AlphaAi Consulting ApS',
  address: 'Nørrebrogade 42, 2200 København N',
  phone: '+45 12 34 56 78',
  email: 'info@alphaai-consulting.dk',
  cvrNumber: '12345678',
  invoicePrefix: 'AC',
  bankName: 'Nordea',
  bankAccount: '1234 5678901',
  bankRegistration: '1234',
  bankIban: 'DK50 1234 5678 9012 34',
  bankStreet: 'Holmens Kanal 2',
  bankCity: 'København',
  bankCountry: 'Danmark',
  invoiceTerms: 'Netto 30 dage. Betaling via bankoverførsel.',
  companyType: 'ApS',
  invoiceNotesTemplate: null,
};

const DEMO_CONTACTS = [
  {
    name: 'Københavns Erhvervsservice A/S',
    cvrNumber: '98765432',
    email: 'kontakt@kbh-erhverv.dk',
    phone: '+45 33 55 66 77',
    address: 'Bredgade 25, 1260 København K',
    city: 'København',
    postalCode: '1260',
    country: 'Danmark',
    type: 'CUSTOMER' as const,
  },
  {
    name: 'Jørgensen & Partners K/S',
    cvrNumber: '87654321',
    email: 'info@jorgensen-partners.dk',
    phone: '+45 44 88 99 00',
    address: 'Østerbrogade 78, 2100 København Ø',
    city: 'København',
    postalCode: '2100',
    country: 'Danmark',
    type: 'CUSTOMER' as const,
  },
  {
    name: 'Nordisk IT Solutions ApS',
    cvrNumber: '76543210',
    email: 'salg@nordisk-it.dk',
    phone: '+45 55 66 77 88',
    address: 'Technologiparken 12, 2605 Brøndby',
    city: 'Brøndby',
    postalCode: '2605',
    country: 'Danmark',
    type: 'SUPPLIER' as const,
  },
  {
    name: 'GRØN Energi A/S',
    cvrNumber: '65432109',
    email: 'kundeservice@groen-energi.dk',
    phone: '+45 70 20 30 40',
    address: 'Vindmøllevej 5, 2730 Herlev',
    city: 'Herlev',
    postalCode: '2730',
    country: 'Danmark',
    type: 'SUPPLIER' as const,
  },
  {
    name: 'Aarhus Tech Forum ApS',
    cvrNumber: '11223344',
    email: 'projekt@aarhus-techforum.dk',
    phone: '+45 86 12 34 56',
    address: 'IT-Byen 8, 8000 Aarhus C',
    city: 'Aarhus',
    postalCode: '8000',
    country: 'Danmark',
    type: 'CUSTOMER' as const,
  },
  {
    name: 'DSB Erhverv A/S',
    cvrNumber: '55667788',
    email: 'erhverv@dsb.dk',
    phone: '+45 70 13 14 15',
    address: 'Togvej 1, 1577 København V',
    city: 'København',
    postalCode: '1577',
    country: 'Danmark',
    type: 'SUPPLIER' as const,
  },
];

const DEMO_TRANSACTIONS = [
  // ─── January 2025 ───
  { date: '2025-01-05', type: 'SALE' as const, amount: 25000, description: 'Konsulentydelse - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-01-15', type: 'SALE' as const, amount: 18750, description: 'Strategisk rådgivning - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-01-20', type: 'SALE' as const, amount: 8000, description: 'Workshop facilitation - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-01-03', type: 'PURCHASE' as const, amount: 15000, description: 'IT-udstyr - Nordisk IT Solutions', vatPercent: 25 },
  { date: '2025-01-10', type: 'PURCHASE' as const, amount: 2500, description: 'Kontorartikler - Office World', vatPercent: 25 },
  { date: '2025-01-25', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje januar - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-01-31', type: 'SALARY' as const, amount: 45000, description: 'Løn januar - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-01-31', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto januar', vatPercent: 0 },

  // ─── February 2025 ───
  { date: '2025-02-03', type: 'SALE' as const, amount: 40000, description: 'IT-konsulentydelse - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-02-12', type: 'SALE' as const, amount: 15000, description: 'Forretningsudvikling - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-02-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje februar - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-02-14', type: 'PURCHASE' as const, amount: 1800, description: 'Internet og telefon - Telia Danmark', vatPercent: 25 },
  { date: '2025-02-20', type: 'PURCHASE' as const, amount: 4200, description: 'El og varme - GRØN Energi', vatPercent: 25 },
  { date: '2025-02-28', type: 'SALARY' as const, amount: 45000, description: 'Løn februar - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-02-28', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto februar', vatPercent: 0 },

  // ─── March 2025 ───
  { date: '2025-03-01', type: 'SALE' as const, amount: 45000, description: 'Digitaliseringsprojekt - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-03-18', type: 'SALE' as const, amount: 22500, description: 'Processoptimering - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-03-25', type: 'SALE' as const, amount: 12000, description: 'Årsrapport assistance - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-03-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje marts - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-03-05', type: 'PURCHASE' as const, amount: 500, description: 'Regnskabsprogram licens - e-conomic', vatPercent: 25 },
  { date: '2025-03-15', type: 'PURCHASE' as const, amount: 2800, description: 'Rejseomkostninger - DSB Business', vatPercent: 25 },
  { date: '2025-03-31', type: 'SALARY' as const, amount: 45000, description: 'Løn marts - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-03-31', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto marts', vatPercent: 0 },
  { date: '2025-03-31', type: 'Z_REPORT' as const, amount: 18500, description: 'Momsafregning Q1 - SKAT', vatPercent: 0 },

  // ─── April 2025 ───
  { date: '2025-04-02', type: 'SALE' as const, amount: 28750, description: 'Dataanalyse - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-04-15', type: 'SALE' as const, amount: 16250, description: 'Risikoanalyse - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-04-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje april - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-04-08', type: 'PURCHASE' as const, amount: 3600, description: 'Forsikring Q2 - Tryg Forsikring', vatPercent: 25 },
  { date: '2025-04-22', type: 'PURCHASE' as const, amount: 1200, description: 'Kontorartikler refill - Office World', vatPercent: 25 },
  { date: '2025-04-30', type: 'SALARY' as const, amount: 45000, description: 'Løn april - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-04-30', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto april', vatPercent: 0 },

  // ─── May 2025 ───
  { date: '2025-05-05', type: 'SALE' as const, amount: 35000, description: 'Cloud migration rådgivning - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-05-12', type: 'SALE' as const, amount: 20000, description: 'Projektledelse - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-05-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje maj - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-05-10', type: 'PURCHASE' as const, amount: 3000, description: 'IT-support abonnement - Nordisk IT Solutions', vatPercent: 25 },
  { date: '2025-05-18', type: 'PURCHASE' as const, amount: 3800, description: 'El og varme - GRØN Energi', vatPercent: 25 },
  { date: '2025-05-31', type: 'SALARY' as const, amount: 45000, description: 'Løn maj - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-05-31', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto maj', vatPercent: 0 },

  // ─── June 2025 ───
  { date: '2025-06-03', type: 'SALE' as const, amount: 55000, description: 'Systemintegration - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-06-10', type: 'SALE' as const, amount: 18750, description: 'Change management - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-06-18', type: 'SALE' as const, amount: 5600, description: 'Workshop sommerseminar - Aarhus Tech Forum', vatPercent: 12 },
  { date: '2025-06-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje juni - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-06-05', type: 'PURCHASE' as const, amount: 3200, description: 'Rejseomkostninger Aarhus - DSB Business', vatPercent: 25 },
  { date: '2025-06-14', type: 'PURCHASE' as const, amount: 1800, description: 'Internet og telefon - Telia Danmark', vatPercent: 25 },
  { date: '2025-06-30', type: 'SALARY' as const, amount: 45000, description: 'Løn juni - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-06-30', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto juni', vatPercent: 0 },
  { date: '2025-06-30', type: 'Z_REPORT' as const, amount: 22000, description: 'Momsafregning Q2 - SKAT', vatPercent: 0 },

  // ─── July 2025 ───
  { date: '2025-07-02', type: 'SALE' as const, amount: 15000, description: 'Drift og support - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-07-10', type: 'SALE' as const, amount: 10000, description: 'Rådgivning sommer - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-07-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje juli - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-07-08', type: 'PURCHASE' as const, amount: 3600, description: 'Forsikring Q3 - Tryg Forsikring', vatPercent: 25 },
  { date: '2025-07-15', type: 'PURCHASE' as const, amount: 3500, description: 'El og varme - GRØN Energi', vatPercent: 25 },
  { date: '2025-07-31', type: 'SALARY' as const, amount: 45000, description: 'Løn juli - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-07-31', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto juli', vatPercent: 0 },

  // ─── August 2025 ───
  { date: '2025-08-04', type: 'SALE' as const, amount: 42000, description: 'ERP implementering rådgivning - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-08-12', type: 'SALE' as const, amount: 25000, description: 'Forretningsstrategi - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-08-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje august - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-08-06', type: 'PURCHASE' as const, amount: 8500, description: 'IT-udstyr opgradering - Nordisk IT Solutions', vatPercent: 25 },
  { date: '2025-08-20', type: 'PURCHASE' as const, amount: 1800, description: 'Kontorartikler - Office World', vatPercent: 25 },
  { date: '2025-08-31', type: 'SALARY' as const, amount: 45000, description: 'Løn august - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-08-31', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto august', vatPercent: 0 },

  // ─── September 2025 ───
  { date: '2025-09-02', type: 'SALE' as const, amount: 38000, description: 'Digital transformation - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-09-10', type: 'SALE' as const, amount: 20000, description: 'Ledelsesrådgivning - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-09-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje september - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-09-05', type: 'PURCHASE' as const, amount: 5000, description: 'Reklame og markedsføring - Markedsføringsbureauet', vatPercent: 25 },
  { date: '2025-09-14', type: 'PURCHASE' as const, amount: 1800, description: 'Internet og telefon - Telia Danmark', vatPercent: 25 },
  { date: '2025-09-18', type: 'PURCHASE' as const, amount: 4000, description: 'El og varme - GRØN Energi', vatPercent: 25 },
  { date: '2025-09-30', type: 'SALARY' as const, amount: 45000, description: 'Løn september - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-09-30', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto september', vatPercent: 0 },
  { date: '2025-09-30', type: 'Z_REPORT' as const, amount: 19800, description: 'Momsafregning Q3 - SKAT', vatPercent: 0 },

  // ─── October 2025 ───
  { date: '2025-10-01', type: 'SALE' as const, amount: 30000, description: 'Sikkerhedsanalyse - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-10-08', type: 'SALE' as const, amount: 22500, description: 'Compliance rådgivning - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-10-15', type: 'SALE' as const, amount: 8400, description: 'E-læring moduler - Aarhus Tech Forum', vatPercent: 12 },
  { date: '2025-10-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje oktober - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-10-06', type: 'PURCHASE' as const, amount: 3600, description: 'Forsikring Q4 - Tryg Forsikring', vatPercent: 25 },
  { date: '2025-10-20', type: 'PURCHASE' as const, amount: 2500, description: 'Rejseomkostninger - DSB Business', vatPercent: 25 },
  { date: '2025-10-31', type: 'SALARY' as const, amount: 45000, description: 'Løn oktober - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-10-31', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto oktober', vatPercent: 0 },

  // ─── November 2025 ───
  { date: '2025-11-03', type: 'SALE' as const, amount: 32500, description: 'API integration - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-11-10', type: 'SALE' as const, amount: 18750, description: 'Strategisk planlægning 2026 - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-11-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje november - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-11-05', type: 'PURCHASE' as const, amount: 500, description: 'Regnskabsprogram licens - e-conomic', vatPercent: 25 },
  { date: '2025-11-12', type: 'PURCHASE' as const, amount: 2200, description: 'Kontorartikler - Office World', vatPercent: 25 },
  { date: '2025-11-20', type: 'PURCHASE' as const, amount: 4200, description: 'El og varme - GRØN Energi', vatPercent: 25 },
  { date: '2025-11-30', type: 'SALARY' as const, amount: 45000, description: 'Løn november - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-11-30', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto november', vatPercent: 0 },

  // ─── December 2025 ───
  { date: '2025-12-02', type: 'SALE' as const, amount: 20000, description: 'Årsafslutning rådgivning - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2025-12-08', type: 'SALE' as const, amount: 15000, description: 'Budgettering 2026 - Jørgensen & Partners', vatPercent: 25 },
  { date: '2025-12-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje december - KBH Ejendomme', vatPercent: 25 },
  { date: '2025-12-10', type: 'PURCHASE' as const, amount: 3500, description: 'Julearrangement - Eventør ApS', vatPercent: 25 },
  { date: '2025-12-14', type: 'PURCHASE' as const, amount: 1800, description: 'Internet og telefon - Telia Danmark', vatPercent: 25 },
  { date: '2025-12-31', type: 'SALARY' as const, amount: 45000, description: 'Løn december - Alle medarbejdere', vatPercent: 0 },
  { date: '2025-12-31', type: 'BANK' as const, amount: 45000, description: 'Bankoverførsel - Lønkonto december', vatPercent: 0 },
  { date: '2025-12-31', type: 'Z_REPORT' as const, amount: 21000, description: 'Momsafregning Q4 - SKAT', vatPercent: 0 },
  { date: '2025-12-20', type: 'ADJUSTMENT' as const, amount: 5000, description: 'Årsregulering afskrivninger - Intern justering', vatPercent: 0 },
  { date: '2025-12-31', type: 'BANK' as const, amount: 50000, description: 'Årets overskud overført til opsparingskonto', vatPercent: 0 },
];

// Helper: compute net amount (excl. VAT) and VAT from a gross amount
function vatSplit(gross: number, rate: number) {
  const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  const vat = Math.round((gross - net) * 100) / 100;
  return { net, vat };
}

// ─── Journal Entry Templates ──────────────────────────────────────
// Each entry must be balanced: total debit === total credit
// Accounts: 1000=Cash, 1100=Bank Account, 1200=Receivables, 1800=IT Equipment
//           2000=Payables, 2200=VAT Payable, 2400=Salaries Payable
//           3000=Share Capital, 3300=Net Income
//           4000=Goods Sales, 4100=Service Revenue, 5000=Other Operating Income
//           4510=Output VAT, 4520=Output VAT 12%
//           5410=Input VAT, 5420=Input VAT 12%
//           6000=Cost of Goods Sold, 7000=Salaries, 7100=Employer Contributions, 7200=Pension
//           8000=Rent, 8100=Utilities, 8200=Transportation, 8300=Travel
//           8400=Insurance, 8500=Accounting Fees, 8600=Telecom, 8700=Office Supplies
//           8800=Advertising, 8900=Depreciation
//           9000=Financial Expenses, 9100=Interest Expenses, 9200=Financial Income, 9300=Interest Income

interface JELine {
  accountNumber: string;
  debit: number;
  credit: number;
  description: string;
  vatCode?: VATCode;
}

interface JETemplate {
  date: string;
  description: string;
  reference: string;
  lines: JELine[];
}

const DEMO_JOURNAL_ENTRIES: JETemplate[] = [
  // ─── January 2025 ───
  // 1. Jan 1 – Initial capital contribution
  {
    date: '2025-01-01',
    description: 'Indskud af aktiekapital – Stifter',
    reference: 'DEMO-2025-001',
    lines: [
      { accountNumber: '1100', debit: 500000, credit: 0, description: 'Bankindbetaling' },
      { accountNumber: '3000', debit: 0, credit: 500000, description: 'Aktiekapital' },
    ],
  },
  // 2. Jan 3 – IT equipment purchase (gross 15,000)
  {
    date: '2025-01-03',
    description: 'Køb af IT-udstyr – Nordisk IT Solutions',
    reference: 'DEMO-2025-002',
    lines: [
      { accountNumber: '1800', debit: 12000, credit: 0, description: 'IT-udstyr (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 3. Jan 5 – Consulting sale (gross 25,000)
  {
    date: '2025-01-05',
    description: 'Salg af konsulentydelse – Københavns Erhvervsservice',
    reference: 'DEMO-2025-003',
    lines: [
      { accountNumber: '1200', debit: 25000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 20000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 5000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 4. Jan 10 – Office supplies (gross 2,500)
  {
    date: '2025-01-10',
    description: 'Køb af kontorartikler – Office World',
    reference: 'DEMO-2025-004',
    lines: [
      { accountNumber: '8700', debit: 2000, credit: 0, description: 'Kontorartikler (netto)' },
      { accountNumber: '5410', debit: 500, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 2500, description: 'Betaling via bank' },
    ],
  },
  // 5. Jan 15 – Strategic advisory sale (gross 18,750)
  {
    date: '2025-01-15',
    description: 'Strategisk rådgivning – Jørgensen & Partners',
    reference: 'DEMO-2025-005',
    lines: [
      { accountNumber: '1200', debit: 18750, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 15000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 3750, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 6. Jan 20 – Workshop facilitation (gross 8,000)
  {
    date: '2025-01-20',
    description: 'Workshop facilitation – Københavns Erhvervsservice',
    reference: 'DEMO-2025-006',
    lines: [
      { accountNumber: '1200', debit: 8000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 6400, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 1600, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 7. Jan 25 – Rent January (gross 15,000)
  {
    date: '2025-01-25',
    description: 'Husleje januar – KBH Ejendomme',
    reference: 'DEMO-2025-007',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 8. Jan 31 – Salary January (gross 45,000)
  {
    date: '2025-01-31',
    description: 'Løn januar – Alle medarbejdere',
    reference: 'DEMO-2025-008',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },
  // 9. Jan 31 – Customer payment received (Jan receivables)
  {
    date: '2025-01-31',
    description: 'Kundebetaling modtaget – Januar salg',
    reference: 'DEMO-2025-009',
    lines: [
      { accountNumber: '1100', debit: 51750, credit: 0, description: 'Bankindbetaling fra kunder' },
      { accountNumber: '1200', debit: 0, credit: 51750, description: 'Afstemt tilgodehavende' },
    ],
  },

  // ─── February 2025 ───
  // 10. Feb 1 – Rent February (gross 15,000)
  {
    date: '2025-02-01',
    description: 'Husleje februar – KBH Ejendomme',
    reference: 'DEMO-2025-010',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 11. Feb 3 – IT consulting sale (gross 40,000)
  {
    date: '2025-02-03',
    description: 'IT-konsulentydelse – Københavns Erhvervsservice',
    reference: 'DEMO-2025-011',
    lines: [
      { accountNumber: '1200', debit: 40000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 32000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 8000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 12. Feb 14 – Telecom (gross 1,800)
  {
    date: '2025-02-14',
    description: 'Internet og telefon – Telia Danmark',
    reference: 'DEMO-2025-012',
    lines: [
      { accountNumber: '8600', debit: 1440, credit: 0, description: 'Telefon og internet (netto)' },
      { accountNumber: '5410', debit: 360, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 1800, description: 'Betaling via bank' },
    ],
  },
  // 13. Feb 20 – Utilities (gross 4,200)
  {
    date: '2025-02-20',
    description: 'El og varme – GRØN Energi A/S',
    reference: 'DEMO-2025-013',
    lines: [
      { accountNumber: '8100', debit: 3360, credit: 0, description: 'El, vand og varme (netto)' },
      { accountNumber: '5410', debit: 840, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 4200, description: 'Betaling via bank' },
    ],
  },
  // 14. Feb 28 – Salary February (gross 45,000)
  {
    date: '2025-02-28',
    description: 'Løn februar – Alle medarbejdere',
    reference: 'DEMO-2025-014',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },

  // ─── March 2025 ───
  // 15. Mar 1 – Rent March (gross 15,000)
  {
    date: '2025-03-01',
    description: 'Husleje marts – KBH Ejendomme',
    reference: 'DEMO-2025-015',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 16. Mar 5 – Accounting software licence (gross 500)
  {
    date: '2025-03-05',
    description: 'Regnskabsprogram licens – e-conomic',
    reference: 'DEMO-2025-016',
    lines: [
      { accountNumber: '8500', debit: 400, credit: 0, description: 'Regnskabshonorar (netto)' },
      { accountNumber: '5410', debit: 100, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 500, description: 'Betaling via bank' },
    ],
  },
  // 17. Mar 15 – Travel expenses (gross 2,800)
  {
    date: '2025-03-15',
    description: 'Rejseomkostninger – DSB Business',
    reference: 'DEMO-2025-017',
    lines: [
      { accountNumber: '8300', debit: 2240, credit: 0, description: 'Rejseomkostninger (netto)' },
      { accountNumber: '5410', debit: 560, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 2800, description: 'Betaling via bank' },
    ],
  },
  // 18. Mar 18 – Process optimization sale (gross 22,500)
  {
    date: '2025-03-18',
    description: 'Processoptimering – Jørgensen & Partners',
    reference: 'DEMO-2025-018',
    lines: [
      { accountNumber: '1200', debit: 22500, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 18000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 4500, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 19. Mar 31 – Salary March (gross 45,000)
  {
    date: '2025-03-31',
    description: 'Løn marts – Alle medarbejdere',
    reference: 'DEMO-2025-019',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },
  // 20. Mar 31 – Q1 VAT settlement
  {
    date: '2025-03-31',
    description: 'Momsafregning Q1 – SKAT',
    reference: 'DEMO-2025-020',
    lines: [
      { accountNumber: '4510', debit: 22850, credit: 0, description: 'Udgående moms Q1' },
      { accountNumber: '5410', debit: 0, credit: 11360, description: 'Indgående moms Q1' },
      { accountNumber: '2200', debit: 0, credit: 11490, description: 'Moms til betaling' },
    ],
  },

  // ─── April 2025 ───
  // 21. Apr 1 – Rent April (gross 15,000)
  {
    date: '2025-04-01',
    description: 'Husleje april – KBH Ejendomme',
    reference: 'DEMO-2025-021',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 22. Apr 8 – Quarterly insurance (gross 3,600)
  {
    date: '2025-04-08',
    description: 'Forsikring kvartal 2 – Tryg Forsikring',
    reference: 'DEMO-2025-022',
    lines: [
      { accountNumber: '8400', debit: 2880, credit: 0, description: 'Forsikring (netto)' },
      { accountNumber: '5410', debit: 720, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 3600, description: 'Betaling via bank' },
    ],
  },
  // 23. Apr 2 – Data analysis sale (gross 28,750)
  {
    date: '2025-04-02',
    description: 'Dataanalyse – Københavns Erhvervsservice',
    reference: 'DEMO-2025-023',
    lines: [
      { accountNumber: '1200', debit: 28750, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 23000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 5750, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 24. Apr 30 – Salary April (gross 45,000)
  {
    date: '2025-04-30',
    description: 'Løn april – Alle medarbejdere',
    reference: 'DEMO-2025-024',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },

  // ─── May 2025 ───
  // 25. May 1 – Rent May (gross 15,000)
  {
    date: '2025-05-01',
    description: 'Husleje maj – KBH Ejendomme',
    reference: 'DEMO-2025-025',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 26. May 5 – Cloud migration sale (gross 35,000)
  {
    date: '2025-05-05',
    description: 'Cloud migration rådgivning – Københavns Erhvervsservice',
    reference: 'DEMO-2025-026',
    lines: [
      { accountNumber: '1200', debit: 35000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 28000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 7000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 27. May 10 – IT support subscription (gross 3,000)
  {
    date: '2025-05-10',
    description: 'IT-support abonnement – Nordisk IT Solutions',
    reference: 'DEMO-2025-027',
    lines: [
      { accountNumber: '8600', debit: 2400, credit: 0, description: 'IT-support (netto)' },
      { accountNumber: '5410', debit: 600, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 3000, description: 'Betaling via bank' },
    ],
  },
  // 28. May 31 – Salary May (gross 45,000)
  {
    date: '2025-05-31',
    description: 'Løn maj – Alle medarbejdere',
    reference: 'DEMO-2025-028',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },

  // ─── June 2025 ───
  // 29. Jun 1 – Rent June (gross 15,000)
  {
    date: '2025-06-01',
    description: 'Husleje juni – KBH Ejendomme',
    reference: 'DEMO-2025-029',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 30. Jun 3 – Systemintegration sale (gross 55,000)
  {
    date: '2025-06-03',
    description: 'Systemintegration – Københavns Erhvervsservice',
    reference: 'DEMO-2025-030',
    lines: [
      { accountNumber: '1200', debit: 55000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 44000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 11000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 31. Jun 18 – Workshop sale 12% VAT (gross 5,600)
  {
    date: '2025-06-18',
    description: 'Workshop sommerseminar – Aarhus Tech Forum',
    reference: 'DEMO-2025-031',
    lines: [
      { accountNumber: '1200', debit: 5600, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 5000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4520', debit: 0, credit: 600, description: 'Udgående moms 12%', vatCode: 'S12' },
    ],
  },
  // 32. Jun 5 – Travel expenses Aarhus (gross 3,200)
  {
    date: '2025-06-05',
    description: 'Rejseomkostninger Aarhus – DSB Business',
    reference: 'DEMO-2025-032',
    lines: [
      { accountNumber: '8300', debit: 2560, credit: 0, description: 'Rejseomkostninger (netto)' },
      { accountNumber: '5410', debit: 640, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 3200, description: 'Betaling via bank' },
    ],
  },
  // 33. Jun 30 – Salary June (gross 45,000)
  {
    date: '2025-06-30',
    description: 'Løn juni – Alle medarbejdere',
    reference: 'DEMO-2025-033',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },
  // 34. Jun 30 – Q2 VAT payment to SKAT
  {
    date: '2025-06-30',
    description: 'Momsbetaling Q2 – SKAT',
    reference: 'DEMO-2025-034',
    lines: [
      { accountNumber: '2200', debit: 22000, credit: 0, description: 'Momsbetaling' },
      { accountNumber: '1100', debit: 0, credit: 22000, description: 'Betaling via bank' },
    ],
  },

  // ─── July 2025 ───
  // 35. Jul 1 – Rent July (gross 15,000)
  {
    date: '2025-07-01',
    description: 'Husleje juli – KBH Ejendomme',
    reference: 'DEMO-2025-035',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 36. Jul 8 – Insurance Q3 (gross 3,600)
  {
    date: '2025-07-08',
    description: 'Forsikring kvartal 3 – Tryg Forsikring',
    reference: 'DEMO-2025-036',
    lines: [
      { accountNumber: '8400', debit: 2880, credit: 0, description: 'Forsikring (netto)' },
      { accountNumber: '5410', debit: 720, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 3600, description: 'Betaling via bank' },
    ],
  },
  // 37. Jul 31 – Salary July (gross 45,000)
  {
    date: '2025-07-31',
    description: 'Løn juli – Alle medarbejdere',
    reference: 'DEMO-2025-037',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },

  // ─── August 2025 ───
  // 38. Aug 1 – Rent August (gross 15,000)
  {
    date: '2025-08-01',
    description: 'Husleje august – KBH Ejendomme',
    reference: 'DEMO-2025-038',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 39. Aug 4 – ERP consulting sale (gross 42,000)
  {
    date: '2025-08-04',
    description: 'ERP implementering rådgivning – Københavns Erhvervsservice',
    reference: 'DEMO-2025-039',
    lines: [
      { accountNumber: '1200', debit: 42000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 33600, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 8400, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 40. Aug 6 – IT equipment upgrade (gross 8,500)
  {
    date: '2025-08-06',
    description: 'IT-udstyr opgradering – Nordisk IT Solutions',
    reference: 'DEMO-2025-040',
    lines: [
      { accountNumber: '1800', debit: 6800, credit: 0, description: 'IT-udstyr (netto)' },
      { accountNumber: '5410', debit: 1700, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 8500, description: 'Betaling via bank' },
    ],
  },
  // 41. Aug 31 – Salary August (gross 45,000)
  {
    date: '2025-08-31',
    description: 'Løn august – Alle medarbejdere',
    reference: 'DEMO-2025-041',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },

  // ─── September 2025 ───
  // 42. Sep 1 – Rent September (gross 15,000)
  {
    date: '2025-09-01',
    description: 'Husleje september – KBH Ejendomme',
    reference: 'DEMO-2025-042',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 43. Sep 2 – Digital transformation sale (gross 38,000)
  {
    date: '2025-09-02',
    description: 'Digital transformation – Københavns Erhvervsservice',
    reference: 'DEMO-2025-043',
    lines: [
      { accountNumber: '1200', debit: 38000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 30400, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 7600, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 44. Sep 5 – Advertising (gross 5,000)
  {
    date: '2025-09-05',
    description: 'Reklame og markedsføring – Markedsføringsbureauet',
    reference: 'DEMO-2025-044',
    lines: [
      { accountNumber: '8800', debit: 4000, credit: 0, description: 'Reklame (netto)' },
      { accountNumber: '5410', debit: 1000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 5000, description: 'Betaling via bank' },
    ],
  },
  // 45. Sep 30 – Salary September (gross 45,000)
  {
    date: '2025-09-30',
    description: 'Løn september – Alle medarbejdere',
    reference: 'DEMO-2025-045',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },
  // 46. Sep 30 – Q3 VAT payment to SKAT
  {
    date: '2025-09-30',
    description: 'Momsbetaling Q3 – SKAT',
    reference: 'DEMO-2025-046',
    lines: [
      { accountNumber: '2200', debit: 19800, credit: 0, description: 'Momsbetaling' },
      { accountNumber: '1100', debit: 0, credit: 19800, description: 'Betaling via bank' },
    ],
  },

  // ─── October 2025 ───
  // 47. Oct 1 – Rent October (gross 15,000)
  {
    date: '2025-10-01',
    description: 'Husleje oktober – KBH Ejendomme',
    reference: 'DEMO-2025-047',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 48. Oct 6 – Insurance Q4 (gross 3,600)
  {
    date: '2025-10-06',
    description: 'Forsikring kvartal 4 – Tryg Forsikring',
    reference: 'DEMO-2025-048',
    lines: [
      { accountNumber: '8400', debit: 2880, credit: 0, description: 'Forsikring (netto)' },
      { accountNumber: '5410', debit: 720, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 3600, description: 'Betaling via bank' },
    ],
  },
  // 49. Oct 1 – Security analysis sale (gross 30,000)
  {
    date: '2025-10-01',
    description: 'Sikkerhedsanalyse – Københavns Erhvervsservice',
    reference: 'DEMO-2025-049',
    lines: [
      { accountNumber: '1200', debit: 30000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 24000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 6000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 50. Oct 15 – E-learning sale 12% VAT (gross 8,400)
  {
    date: '2025-10-15',
    description: 'E-læring moduler – Aarhus Tech Forum',
    reference: 'DEMO-2025-050',
    lines: [
      { accountNumber: '1200', debit: 8400, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 7500, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4520', debit: 0, credit: 900, description: 'Udgående moms 12%', vatCode: 'S12' },
    ],
  },
  // 51. Oct 20 – Travel expenses (gross 2,500)
  {
    date: '2025-10-20',
    description: 'Rejseomkostninger – DSB Business',
    reference: 'DEMO-2025-051',
    lines: [
      { accountNumber: '8300', debit: 2000, credit: 0, description: 'Rejseomkostninger (netto)' },
      { accountNumber: '5410', debit: 500, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 2500, description: 'Betaling via bank' },
    ],
  },
  // 52. Oct 31 – Salary October (gross 45,000)
  {
    date: '2025-10-31',
    description: 'Løn oktober – Alle medarbejdere',
    reference: 'DEMO-2025-052',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },

  // ─── November 2025 ───
  // 53. Nov 1 – Rent November (gross 15,000)
  {
    date: '2025-11-01',
    description: 'Husleje november – KBH Ejendomme',
    reference: 'DEMO-2025-053',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 54. Nov 3 – API integration sale (gross 32,500)
  {
    date: '2025-11-03',
    description: 'API integration – Københavns Erhvervsservice',
    reference: 'DEMO-2025-054',
    lines: [
      { accountNumber: '1200', debit: 32500, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 26000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 6500, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 55. Nov 5 – Accounting licence (gross 500)
  {
    date: '2025-11-05',
    description: 'Regnskabsprogram licens – e-conomic',
    reference: 'DEMO-2025-055',
    lines: [
      { accountNumber: '8500', debit: 400, credit: 0, description: 'Regnskabshonorar (netto)' },
      { accountNumber: '5410', debit: 100, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 500, description: 'Betaling via bank' },
    ],
  },
  // 56. Nov 30 – Salary November (gross 45,000)
  {
    date: '2025-11-30',
    description: 'Løn november – Alle medarbejdere',
    reference: 'DEMO-2025-056',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },

  // ─── December 2025 ───
  // 57. Dec 1 – Rent December (gross 15,000)
  {
    date: '2025-12-01',
    description: 'Husleje december – KBH Ejendomme',
    reference: 'DEMO-2025-057',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 58. Dec 2 – Year-end advisory sale (gross 20,000)
  {
    date: '2025-12-02',
    description: 'Årsafslutning rådgivning – Københavns Erhvervsservice',
    reference: 'DEMO-2025-058',
    lines: [
      { accountNumber: '1200', debit: 20000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 16000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 4000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 59. Dec 10 – Christmas event (gross 3,500)
  {
    date: '2025-12-10',
    description: 'Julearrangement – Eventør ApS',
    reference: 'DEMO-2025-059',
    lines: [
      { accountNumber: '8700', debit: 2800, credit: 0, description: 'Personalearrangement (netto)' },
      { accountNumber: '5410', debit: 700, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 3500, description: 'Betaling via bank' },
    ],
  },
  // 60. Dec 20 – Depreciation adjustment
  {
    date: '2025-12-20',
    description: 'Afskrivning på IT-udstyr – Årsregulering',
    reference: 'DEMO-2025-060',
    lines: [
      { accountNumber: '8900', debit: 8000, credit: 0, description: 'Afskrivning IT-udstyr' },
      { accountNumber: '1800', debit: 0, credit: 8000, description: 'Nedskrivning af anlægsaktiv' },
    ],
  },
  // 61. Dec 31 – Salary December (gross 45,000)
  {
    date: '2025-12-31',
    description: 'Løn december – Alle medarbejdere',
    reference: 'DEMO-2025-061',
    lines: [
      { accountNumber: '7000', debit: 35000, credit: 0, description: 'Bruttoløn' },
      { accountNumber: '7100', debit: 7500, credit: 0, description: 'Arbejdsgiverbidrag (ATP)' },
      { accountNumber: '7200', debit: 2500, credit: 0, description: 'Pension' },
      { accountNumber: '1100', debit: 0, credit: 45000, description: 'Betaling via bank' },
    ],
  },
  // 62. Dec 31 – Interest income from bank
  {
    date: '2025-12-31',
    description: 'Renteindtægt – Nordea bankindskud',
    reference: 'DEMO-2025-062',
    lines: [
      { accountNumber: '1100', debit: 2400, credit: 0, description: 'Renter modtaget' },
      { accountNumber: '9300', debit: 0, credit: 2400, description: 'Renteindtægt' },
    ],
  },
  // 63. Dec 31 – Bank interest expense
  {
    date: '2025-12-31',
    description: 'Renteomkostning – Banklån',
    reference: 'DEMO-2025-063',
    lines: [
      { accountNumber: '9100', debit: 1200, credit: 0, description: 'Renteomkostning' },
      { accountNumber: '1100', debit: 0, credit: 1200, description: 'Renter betalt' },
    ],
  },
  // 64. Dec 31 – Q4 VAT payment to SKAT
  {
    date: '2025-12-31',
    description: 'Momsbetaling Q4 – SKAT',
    reference: 'DEMO-2025-064',
    lines: [
      { accountNumber: '2200', debit: 21000, credit: 0, description: 'Momsbetaling' },
      { accountNumber: '1100', debit: 0, credit: 21000, description: 'Betaling via bank' },
    ],
  },
  // 65. Dec 31 – Other operating income
  {
    date: '2025-12-15',
    description: 'Refusion af udgifter – Tidligere kunde',
    reference: 'DEMO-2025-065',
    lines: [
      { accountNumber: '1100', debit: 3000, credit: 0, description: 'Bankindbetaling' },
      { accountNumber: '5000', debit: 0, credit: 3000, description: 'Andre driftsindtægter' },
    ],
  },
];

// ─── Demo Invoice Templates ───────────────────────────────────────

interface InvoiceTemplate {
  invoiceNumber: string;
  customerName: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;
  customerCvr: string;
  issueDate: string;
  dueDate: string;
  lineItems: { description: string; quantity: number; unitPrice: number; vatPercent: number; accountNumber: string }[];
  notes: string;
  contactIndex: number; // index into DEMO_CONTACTS
  status: 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';
}

const DEMO_INVOICES: InvoiceTemplate[] = [
  // ─── Q1 2025 ───
  // 1. Jan – PAID
  {
    invoiceNumber: 'AC-2025-0001',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-01-05',
    dueDate: '2025-02-04',
    lineItems: [
      { description: 'Konsulentydelse – Forretningsanalyse', quantity: 10, unitPrice: 2000, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Tak for samarbejdet.',
    contactIndex: 0,
    status: 'PAID',
  },
  // 2. Jan – PAID
  {
    invoiceNumber: 'AC-2025-0002',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-01-15',
    dueDate: '2025-02-14',
    lineItems: [
      { description: 'Strategisk rådgivning', quantity: 15, unitPrice: 1000, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Faktura for rådgivningsopgave januar 2025.',
    contactIndex: 1,
    status: 'PAID',
  },
  // 3. Feb – PAID
  {
    invoiceNumber: 'AC-2025-0003',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-02-03',
    dueDate: '2025-03-05',
    lineItems: [
      { description: 'IT-konsulentydelse – Systemimplementering', quantity: 20, unitPrice: 1600, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Fase 1 af systemimplementering.',
    contactIndex: 0,
    status: 'PAID',
  },
  // 4. Feb – PAID
  {
    invoiceNumber: 'AC-2025-0004',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-02-12',
    dueDate: '2025-03-14',
    lineItems: [
      { description: 'Forretningsudviklingsworkshop', quantity: 2, unitPrice: 7500, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Workshop forretningsudvikling februar 2025.',
    contactIndex: 1,
    status: 'PAID',
  },
  // 5. Mar – PAID
  {
    invoiceNumber: 'AC-2025-0005',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-03-01',
    dueDate: '2025-03-31',
    lineItems: [
      { description: 'Digitaliseringsprojekt – Fase 1', quantity: 30, unitPrice: 1500, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Faktura for digitaliseringsprojekt marts 2025.',
    contactIndex: 0,
    status: 'PAID',
  },
  // 6. Mar – PAID
  {
    invoiceNumber: 'AC-2025-0006',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-03-18',
    dueDate: '2025-04-17',
    lineItems: [
      { description: 'Processoptimering', quantity: 15, unitPrice: 1500, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Processoptimeringsopgave for Jørgensen & Partners.',
    contactIndex: 1,
    status: 'PAID',
  },

  // ─── Q2 2025 ───
  // 7. Apr – PAID
  {
    invoiceNumber: 'AC-2025-0007',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-04-02',
    dueDate: '2025-05-02',
    lineItems: [
      { description: 'Dataanalyse og rapportering', quantity: 23, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Faktura for dataanalyse april 2025.',
    contactIndex: 0,
    status: 'PAID',
  },
  // 8. Apr – CANCELLED
  {
    invoiceNumber: 'AC-2025-0008',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-04-15',
    dueDate: '2025-05-15',
    lineItems: [
      { description: 'Risikoanalyse – Annulleret projekt', quantity: 13, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Annulleret – kunden har aflyst projektet.',
    contactIndex: 1,
    status: 'CANCELLED',
  },
  // 9. May – PAID
  {
    invoiceNumber: 'AC-2025-0009',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-05-05',
    dueDate: '2025-06-04',
    lineItems: [
      { description: 'Cloud migration rådgivning', quantity: 28, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Faktura for cloud migration maj 2025.',
    contactIndex: 0,
    status: 'PAID',
  },
  // 10. Jun – PAID
  {
    invoiceNumber: 'AC-2025-0010',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-06-03',
    dueDate: '2025-07-03',
    lineItems: [
      { description: 'Systemintegration – Fase 2', quantity: 44, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Faktura for systemintegration juni 2025.',
    contactIndex: 0,
    status: 'PAID',
  },
  // 11. Jun – PAID
  {
    invoiceNumber: 'AC-2025-0011',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-06-10',
    dueDate: '2025-07-10',
    lineItems: [
      { description: 'Change management workshop', quantity: 15, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Change management for Jørgensen & Partners juni 2025.',
    contactIndex: 1,
    status: 'PAID',
  },
  // 12. Jun – PAID (Aarhus Tech Forum, 12% VAT)
  {
    invoiceNumber: 'AC-2025-0012',
    customerName: 'Aarhus Tech Forum ApS',
    customerAddress: 'IT-Byen 8, 8000 Aarhus C',
    customerEmail: 'projekt@aarhus-techforum.dk',
    customerPhone: '+45 86 12 34 56',
    customerCvr: '11223344',
    issueDate: '2025-06-18',
    dueDate: '2025-07-18',
    lineItems: [
      { description: 'Workshop sommerseminar – E-læring', quantity: 4, unitPrice: 1400, vatPercent: 12, accountNumber: '4100' },
    ],
    notes: 'Workshop for Aarhus Tech Forum – nedsat moms.',
    contactIndex: 4,
    status: 'PAID',
  },

  // ─── Q3 2025 ───
  // 13. Jul – SENT (overdue)
  {
    invoiceNumber: 'AC-2025-0013',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-07-10',
    dueDate: '2025-08-09',
    lineItems: [
      { description: 'Rådgivning sommer – Strategisk analyse', quantity: 8, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Faktura for sommerrådgivning juli 2025.',
    contactIndex: 1,
    status: 'SENT',
  },
  // 14. Aug – PAID
  {
    invoiceNumber: 'AC-2025-0014',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-08-04',
    dueDate: '2025-09-03',
    lineItems: [
      { description: 'ERP implementering rådgivning', quantity: 336, unitPrice: 100, vatPercent: 25, accountNumber: '4100' },
      { description: 'Projektledelse – Uge 32-33', quantity: 2, unitPrice: 4200, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'ERP rådgivning august 2025.',
    contactIndex: 0,
    status: 'PAID',
  },
  // 15. Sep – PAID
  {
    invoiceNumber: 'AC-2025-0015',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-09-02',
    dueDate: '2025-10-02',
    lineItems: [
      { description: 'Digital transformation – Analyse og planlægning', quantity: 304, unitPrice: 100, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Faktura for digital transformation september 2025.',
    contactIndex: 0,
    status: 'PAID',
  },

  // ─── Q4 2025 ───
  // 16. Oct – PAID
  {
    invoiceNumber: 'AC-2025-0016',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-10-08',
    dueDate: '2025-11-07',
    lineItems: [
      { description: 'Compliance rådgivning – GDPR audit', quantity: 18, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'GDPR compliance rådgivning oktober 2025.',
    contactIndex: 1,
    status: 'PAID',
  },
  // 17. Oct – PAID (Aarhus Tech Forum, 12% VAT)
  {
    invoiceNumber: 'AC-2025-0017',
    customerName: 'Aarhus Tech Forum ApS',
    customerAddress: 'IT-Byen 8, 8000 Aarhus C',
    customerEmail: 'projekt@aarhus-techforum.dk',
    customerPhone: '+45 86 12 34 56',
    customerCvr: '11223344',
    issueDate: '2025-10-15',
    dueDate: '2025-11-14',
    lineItems: [
      { description: 'E-læring moduler – Sikkerhedstræning', quantity: 6, unitPrice: 1400, vatPercent: 12, accountNumber: '4100' },
    ],
    notes: 'E-læring for Aarhus Tech Forum – nedsat moms.',
    contactIndex: 4,
    status: 'PAID',
  },
  // 18. Nov – SENT
  {
    invoiceNumber: 'AC-2025-0018',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-11-03',
    dueDate: '2025-12-03',
    lineItems: [
      { description: 'API integration – Design og implementering', quantity: 26, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'API integration november 2025.',
    contactIndex: 0,
    status: 'SENT',
  },
  // 19. Dec – DRAFT
  {
    invoiceNumber: 'AC-2025-0019',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2025-12-02',
    dueDate: '2026-01-01',
    lineItems: [
      { description: 'Årsafslutning rådgivning', quantity: 16, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Kladde – Årsafslutning rådgivning december 2025.',
    contactIndex: 0,
    status: 'DRAFT',
  },
  // 20. Dec – CANCELLED
  {
    invoiceNumber: 'AC-2025-0020',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2025-12-08',
    dueDate: '2026-01-07',
    lineItems: [
      { description: 'Budgettering 2026 – Annulleret aftale', quantity: 12, unitPrice: 1250, vatPercent: 25, accountNumber: '4100' },
    ],
    notes: 'Annulleret – aftalen blev ikke indgået.',
    contactIndex: 1,
    status: 'CANCELLED',
  },
];

// ─── Seeding Helpers ──────────────────────────────────────────

const DANISH_MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];

function shiftYear(dateStr: string, year: number): string {
  return `${year}-${dateStr.slice(5)}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysToDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function groupByMonth<T extends { date: string }>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const m = parseInt(item.date.split('-')[1]);
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(item);
  }
  return map;
}

const TX_BY_MONTH = groupByMonth(DEMO_TRANSACTIONS);
const JE_BY_MONTH = groupByMonth(DEMO_JOURNAL_ENTRIES);

// Generate transactions spanning 3 years from templates
function expandTransactions(startYear: number, endYear: number, endMonth: number) {
  const out: typeof DEMO_TRANSACTIONS = [];
  for (let y = startYear; y <= endYear; y++) {
    const maxM = y === endYear ? endMonth : 12;
    for (let m = 1; m <= maxM; m++) {
      const templates = TX_BY_MONTH.get(m) ?? [];
      for (const tx of templates) {
        // Replace year references in descriptions (template uses 2025 / 2026)
        let desc = tx.description
          .replace(/2025/g, String(y))
          .replace(/2026/g, String(y + 1));
        out.push({ ...tx, date: shiftYear(tx.date, y), description: desc });
      }
    }
  }
  return out;
}

// Generate journal entries spanning 3 years from templates
function expandJournalEntries(startYear: number, endYear: number, endMonth: number) {
  const out: (JETemplate & { status: JournalEntryStatus })[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const maxM = y === endYear ? endMonth : 12;
    for (let m = 1; m <= maxM; m++) {
      const templates = JE_BY_MONTH.get(m) ?? [];
      for (const je of templates) {
        // Capital contribution only in the first year
        if (y > startYear && je.description.includes('aktiekapital')) continue;

        // Update reference with actual year
        const refNum = je.reference.match(/DEMO-\d+-(\d+)/)?.[1] ?? '001';
        const ref = `DEMO-${y}-${refNum}`;
        const status: JournalEntryStatus = (y === endYear && m === endMonth) ? 'DRAFT' : 'POSTED';

        out.push({ ...je, date: shiftYear(je.date, y), reference: ref, status });
      }
    }
  }
  return out;
}

// Generate recent invoices (~8 months) with realistic overdue dates
function generateDynamicInvoices(NOW: Date) {
  const CY = NOW.getFullYear();
  const CM = NOW.getMonth(); // 0-indexed

  const seqByYear = new Map<number, number>();
  function nextSeq(year: number): number {
    const s = (seqByYear.get(year) ?? 0) + 1;
    seqByYear.set(year, s);
    return s;
  }

  function makeInv(tIdx: number, issueDate: Date, dueDate: Date, status: InvoiceTemplate['status']): InvoiceTemplate {
    const t = DEMO_INVOICES[tIdx];
    const iy = issueDate.getFullYear();
    const seq = nextSeq(iy);
    return {
      ...t,
      invoiceNumber: `AC-${iy}-${String(seq).padStart(4, '0')}`,
      issueDate: fmtDate(issueDate),
      dueDate: fmtDate(dueDate),
      notes: t.notes.replace(/2025/g, String(iy)).replace(/2026/g, String(iy + 1)),
      status,
    };
  }

  const result: InvoiceTemplate[] = [];

  // Placements: [templateIdx, monthsAgo, status]
  // monthsAgo = how many months before the current month the issue date falls in
  const placements: [number, number, InvoiceTemplate['status']][] = [
    // 8 months ago
    [0, 7, 'PAID'],
    [1, 7, 'PAID'],
    // 7 months ago
    [2, 6, 'PAID'],
    [3, 6, 'PAID'],
    // 6 months ago
    [4, 5, 'PAID'],
    [5, 5, 'PAID'],
    // 5 months ago
    [6, 4, 'PAID'],
    [7, 4, 'CANCELLED'],
    // 4 months ago
    [8, 3, 'PAID'],
    [9, 3, 'PAID'],
    // 3 months ago
    [10, 2, 'PAID'],
    [11, 2, 'PAID'],
    // 2 months ago
    [13, 1, 'PAID'],
    [14, 1, 'PAID'],
    [15, 1, 'PAID'],
    [16, 1, 'PAID'],
    // Current month
    [18, 0, 'DRAFT'],
    [19, 0, 'CANCELLED'],
  ];

  for (const [tIdx, monthsAgo, status] of placements) {
    const issue = new Date(CY, CM - monthsAgo, 5);
    const due = addDaysToDate(issue, 30);
    result.push(makeInv(tIdx, issue, due, status));
  }

  // SENT (overdue) invoices: due date between 1-30 days before NOW
  // Template 12 (Jørgensen): due ~20 days ago, issued ~50 days ago
  {
    const due = addDaysToDate(NOW, -20);
    const issue = addDaysToDate(due, -30);
    result.push(makeInv(12, issue, due, 'SENT'));
  }
  // Template 17 (KBH Erhvervsservice): due ~8 days ago, issued ~38 days ago
  {
    const due = addDaysToDate(NOW, -8);
    const issue = addDaysToDate(due, -30);
    result.push(makeInv(17, issue, due, 'SENT'));
  }

  const currentYearSeq = seqByYear.get(CY) ?? 0;
  return { invoices: result, currentYearInvoiceCount: currentYearSeq };
}

// ─── Seeding Function (exported for reuse) ────────────────────────

async function seedDemoData(userId: string): Promise<Record<string, number>> {
  const NOW = new Date();
  const CURRENT_YEAR = NOW.getFullYear();
  const CURRENT_MONTH = NOW.getMonth() + 1; // 1-indexed
  const START_YEAR = CURRENT_YEAR - 2;

  // Generate dynamic invoice data upfront
  const { invoices: dynamicInvoices, currentYearInvoiceCount } = generateDynamicInvoices(NOW);

  // 1. Find or create demo Company
  let demoCompany = await db.company.findFirst({
    where: {
      members: { some: { userId } },
      isDemo: true
    }
  });

  if (!demoCompany) {
    // Inherit AppOwner widget defaults for the demo company
    const appOwnerCompany = await db.company.findUnique({
      where: { name: 'AlphaAi' },
      select: { dashboardWidgets: true },
    });
    const inheritedWidgets = appOwnerCompany?.dashboardWidgets ?? null;

    demoCompany = await db.company.create({
      data: {
        name: DEMO_COMPANY.companyName || 'Demo Company',
        address: DEMO_COMPANY.address || '',
        phone: DEMO_COMPANY.phone || '',
        email: DEMO_COMPANY.email || '',
        cvrNumber: DEMO_COMPANY.cvrNumber || 'DEMO-00000000',
        invoicePrefix: DEMO_COMPANY.invoicePrefix || 'INV',
        bankName: DEMO_COMPANY.bankName || '',
        bankAccount: DEMO_COMPANY.bankAccount || '',
        bankRegistration: DEMO_COMPANY.bankRegistration || '',
        bankIban: DEMO_COMPANY.bankIban || null,
        bankStreet: DEMO_COMPANY.bankStreet || null,
        bankCity: DEMO_COMPANY.bankCity || null,
        bankCountry: DEMO_COMPANY.bankCountry || null,
        invoiceTerms: DEMO_COMPANY.invoiceTerms || 'Betaling forfalder senest 30 dage efter\nfakturadatoen. Ved forsinkelse, påløber\nder renter efter Renteloven.\nEvt. spørgsmål, så kontakt os venligst.',
        invoiceNotesTemplate: DEMO_COMPANY.invoiceNotesTemplate || null,
        companyType: DEMO_COMPANY.companyType || null,
        nextInvoiceSequence: currentYearInvoiceCount + 1,
        currentYear: CURRENT_YEAR,
        isDemo: true,
        dashboardWidgets: inheritedWidgets,
      },
    });
    await db.userCompany.create({
      data: {
        userId,
        companyId: demoCompany.id,
        role: 'OWNER',
      },
    });
  }
  const companyId = demoCompany.id;
  const companyInfoCount = demoCompany ? 1 : 0;

  // 2. Seed chart of accounts for demo (idempotent — skips if already exists)
  const accountsSeeded = await seedChartOfAccounts(userId, companyId, true);

  // 3. Create contacts
  const contacts = await db.contact.createMany({
    data: DEMO_CONTACTS.map((c) => ({
      ...c,
      isDemo: true,
      isActive: true,
      userId,
      companyId,
    })),
  });

  // Fetch created contacts for invoice linking
  const createdContacts = await db.contact.findMany({
    where: { companyId, isDemo: true },
    orderBy: { createdAt: 'asc' },
  });

  // 4. Create transactions (3 years, STOP at current month)
  const expandedTransactions = expandTransactions(START_YEAR, CURRENT_YEAR, CURRENT_MONTH);
  const transactions = await db.transaction.createMany({
    data: expandedTransactions.map((t) => ({
      date: new Date(t.date),
      type: t.type,
      amount: t.amount,
      currency: 'DKK',
      description: t.description,
      vatPercent: t.vatPercent,
      isDemo: true,
      cancelled: false,
      userId,
      companyId,
    })),
  });

  // 5. Look up demo accounts (needed for invoice line items + journal entries)
  const accounts = await db.account.findMany({
    where: { companyId, isDemo: true },
    select: { id: true, number: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.number, a.id]));

  // 6. Create invoices (recent ~8 months with realistic overdue)
  let invoicesCount = 0;
  for (const inv of dynamicInvoices) {
    const subtotal = inv.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const vatTotal = inv.lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice * item.vatPercent) / 100, 0);
    const total = subtotal + vatTotal;
    const contact = createdContacts[inv.contactIndex];

    // Resolve accountNumber to accountId for each line item
    const lineItemsWithAccountId = inv.lineItems.map(li => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      vatPercent: li.vatPercent,
      accountId: accountMap.get(li.accountNumber) || '',
    }));

    await db.invoice.create({
      data: {
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        customerAddress: inv.customerAddress,
        customerEmail: inv.customerEmail,
        customerPhone: inv.customerPhone,
        customerCvr: inv.customerCvr,
        issueDate: new Date(inv.issueDate),
        dueDate: new Date(inv.dueDate),
        lineItems: JSON.stringify(lineItemsWithAccountId),
        subtotal,
        vatTotal,
        total,
        currency: 'DKK',
        status: inv.status,
        notes: inv.notes,
        isDemo: true,
        cancelled: inv.status === 'CANCELLED',
        contactId: contact?.id ?? null,
        userId,
        companyId,
      },
    });
    invoicesCount++;
  }

  // 7. Create journal entries (3 years, DRAFT only for current month)
  let journalEntriesCount = 0;
  const expandedJE = expandJournalEntries(START_YEAR, CURRENT_YEAR, CURRENT_MONTH);
  for (const je of expandedJE) {
    const totalDebit = je.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = je.lines.reduce((s, l) => s + l.credit, 0);

    // Safety check — should always pass with our static data
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      logger.error(`[Demo Seed] Unbalanced journal entry ${je.reference}: debit=${totalDebit}, credit=${totalCredit}`);
      continue;
    }

    // Verify all accounts exist
    const missingAccounts = je.lines
      .map((l) => l.accountNumber)
      .filter((num) => !accountMap.has(num));
    if (missingAccounts.length > 0) {
      logger.warn(`[Demo Seed] Skipping journal entry ${je.reference} – missing accounts: ${missingAccounts.join(', ')}`);
      continue;
    }

    await db.journalEntry.create({
      data: {
        date: new Date(je.date),
        description: je.description,
        reference: je.reference,
        status: je.status,
        isDemo: true,
        cancelled: false,
        userId,
        companyId,
        lines: {
          create: je.lines.map((l) => {
            const accountId = accountMap.get(l.accountNumber)!;
            return {
              accountId,
              debit: l.debit,
              credit: l.credit,
              description: l.description,
              vatCode: l.vatCode ?? null,
            };
          }),
        },
      },
    });
    journalEntriesCount++;
  }

  // 8. Create fiscal periods (3 years × 12 months)
  const fiscalPeriods = await db.fiscalPeriod.createMany({
    data: Array.from({ length: 3 }, (_, i) => {
      const year = START_YEAR + i;
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => ({
        year,
        month,
        status: 'OPEN' as const,
        isDemo: true,
        userId,
        companyId,
      }));
    }).flat(),
  });

  // 9. Enable demo mode for the user
  await db.user.update({
    where: { id: userId },
    data: { demoModeEnabled: true },
  });

  return {
    accountsSeeded,
    companyInfo: companyInfoCount,
    contacts: contacts.count,
    transactions: transactions.count,
    invoices: invoicesCount,
    journalEntries: journalEntriesCount,
    fiscalPeriods: fiscalPeriods.count,
  };
}


// ─── Route Handler ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    // Check if demo data already exists
    const existingDemoTransactions = await db.transaction.count({
      where: { ...tenantFilter(ctx), isDemo: true },
    });

    if (existingDemoTransactions > 0) {
      // Return existing counts
      const [transactions, invoices, journalEntries, contacts, companyInfo, fiscalPeriods] = await Promise.all([
        db.transaction.count({ where: { ...tenantFilter(ctx), isDemo: true } }),
        db.invoice.count({ where: { ...tenantFilter(ctx), isDemo: true } }),
        db.journalEntry.count({ where: { ...tenantFilter(ctx), isDemo: true } }),
        db.contact.count({ where: { ...tenantFilter(ctx), isDemo: true } }),
        db.company.count({ where: { ...tenantFilter(ctx), isDemo: true } }),
        db.fiscalPeriod.count({ where: { ...tenantFilter(ctx), isDemo: true } }),
      ]);

      return NextResponse.json({
        message: 'Demo data already exists',
        alreadySeeded: true,
        transactions,
        invoices,
        journalEntries,
        contacts,
        companyInfo,
        fiscalPeriods,
      });
    }

    // Seed all demo data
    const counts = await seedDemoData(ctx.id);

    await auditLog({
      action: 'CREATE',
      entityType: 'System',
      entityId: ctx.activeCompanyId!,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      metadata: {
        type: 'demo_seed',
        counts: {
          transactions: counts.transactions,
          invoices: counts.invoices,
          journalEntries: counts.journalEntries,
        },
      },
    });

    return NextResponse.json({
      message: 'Demo data seeded successfully',
      alreadySeeded: false,
      ...counts,
    });
  } catch (error) {
    logger.error('[Demo Seed] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
