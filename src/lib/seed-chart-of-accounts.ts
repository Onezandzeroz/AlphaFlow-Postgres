/**
 * Seed utility for the standard Danish Chart of Accounts (Standardkontoplan)
 *
 * Creates a complete set of accounts following the Danish accounting standard
 * based on the FSR (Foreningen af Statsautoriserede Revisorer) standard chart.
 * Account numbering follows Danish convention:
 *   1xxx = Assets (Aktiver)
 *   2xxx = Liabilities (Gæld)
 *   3xxx = Equity (Egenkapital)
 *   4xxx-5xxx = Revenue (Indtægter)
 *   6xxx-9xxx = Expenses (Omkostninger)
 */

import { db } from '@/lib/db'
import { AccountType, AccountGroup } from '@prisma/client'

interface SeedAccount {
  number: string
  name: string
  nameEn: string
  type: AccountType
  group: AccountGroup
  description?: string
}

/**
 * Standard Danish chart of accounts
 */
const DANISH_CHART_OF_ACCOUNTS: SeedAccount[] = [
  // ─── ASSETS (1xxx) ───────────────────────────────────────────────
  {
    number: '1000',
    name: 'Kasse',
    nameEn: 'Cash',
    type: 'ASSET',
    group: 'CASH',
    description: 'Likvide beholdninger i kassen',
  },
  {
    number: '1100',
    name: 'Bankkonto',
    nameEn: 'Bank Account',
    type: 'ASSET',
    group: 'BANK',
    description: 'Virksomhedens bankkonto',
  },
  {
    number: '1200',
    name: 'Tilgodehavender fra salg',
    nameEn: 'Accounts Receivable',
    type: 'ASSET',
    group: 'RECEIVABLES',
    description: 'Kunde tilgodehavender fra vare- og tjenesteydelsessalg',
  },
  {
    number: '1240',
    name: 'Tilgodehavender fra medarbejdere',
    nameEn: 'Employee Receivables',
    type: 'ASSET',
    group: 'RECEIVABLES',
    description: 'Tilgodehavender fra ansatte f.eks. lån eller avance',
  },
  {
    number: '1300',
    name: 'Varelager',
    nameEn: 'Inventory',
    type: 'ASSET',
    group: 'INVENTORY',
    description: 'Varelager til salgsvirksomhed',
  },
  {
    number: '1400',
    name: 'Varelager - Indkøbspris',
    nameEn: 'Inventory at Cost',
    type: 'ASSET',
    group: 'INVENTORY',
    description: 'Varelager værdiansat til indkøbspris',
  },
  {
    number: '1700',
    name: 'Kørende maskiner og udstyr',
    nameEn: 'Machinery & Equipment',
    type: 'ASSET',
    group: 'FIXED_ASSETS',
    description: 'Produktionsmaskiner og driftsudstyr',
  },
  {
    number: '1800',
    name: 'IT-udstyr',
    nameEn: 'IT Equipment',
    type: 'ASSET',
    group: 'FIXED_ASSETS',
    description: 'Computere, servere og andet IT-udstyr',
  },
  {
    number: '1900',
    name: 'Kontante værdipapirer',
    nameEn: 'Cash Equivalents',
    type: 'ASSET',
    group: 'OTHER_ASSETS',
    description: 'Korte finansielle placeringer',
  },

  // ─── LIABILITIES (2xxx) ──────────────────────────────────────────
  {
    number: '2000',
    name: 'Leverandørgæld',
    nameEn: 'Accounts Payable',
    type: 'LIABILITY',
    group: 'PAYABLES',
    description: 'Skyldige beløb til leverandører af varer og tjenesteydelser',
  },
  {
    number: '2100',
    name: 'Skyldige skatter og afgifter',
    nameEn: 'Taxes Payable',
    type: 'LIABILITY',
    group: 'PAYABLES',
    description: 'Skyldig A-skat, AM-bidrag m.m.',
  },
  {
    number: '2200',
    name: 'Momsgæld',
    nameEn: 'VAT Payable',
    type: 'LIABILITY',
    group: 'OTHER_LIABILITIES',
    description: 'Udgående moms til Skattestyrelsen',
  },
  {
    number: '2300',
    name: 'Modtaget forudbetaling',
    nameEn: 'Deferred Revenue',
    type: 'LIABILITY',
    group: 'OTHER_LIABILITIES',
    description: 'Forudbetalte beløb fra kunder',
  },
  {
    number: '2400',
    name: 'Personalegæld',
    nameEn: 'Salaries Payable',
    type: 'LIABILITY',
    group: 'PAYABLES',
    description: 'Skyldige lønninger og andre personaleomkostninger',
  },
  {
    number: '2500',
    name: 'Skyldige renter',
    nameEn: 'Interest Payable',
    type: 'LIABILITY',
    group: 'SHORT_TERM_DEBT',
    description: 'Akkumulerede renteomkostninger',
  },
  {
    number: '2600',
    name: 'Banklån',
    nameEn: 'Bank Loan',
    type: 'LIABILITY',
    group: 'LONG_TERM_DEBT',
    description: 'Langfristede banklån',
  },
  {
    number: '2700',
    name: 'Andre langfristede gæld',
    nameEn: 'Other Long-term Debt',
    type: 'LIABILITY',
    group: 'LONG_TERM_DEBT',
    description: 'Andre langfristede forpligtelser',
  },

  // ─── EQUITY (3xxx) ───────────────────────────────────────────────
  {
    number: '3000',
    name: 'Aktiekapital',
    nameEn: 'Share Capital',
    type: 'EQUITY',
    group: 'SHARE_CAPITAL',
    description: 'Selskabets tegnede aktiekapital',
  },
  {
    number: '3100',
    name: 'Overkurs',
    nameEn: 'Share Premium',
    type: 'EQUITY',
    group: 'SHARE_CAPITAL',
    description: 'Overkurs ved udstedelse af aktier',
  },
  {
    number: '3200',
    name: 'Reserver',
    nameEn: 'Reserves',
    type: 'EQUITY',
    group: 'RETAINED_EARNINGS',
    description: 'Opbyggede reserver og fonds',
  },
  {
    number: '3300',
    name: 'Årets resultat',
    nameEn: 'Net Income for the Year',
    type: 'EQUITY',
    group: 'RETAINED_EARNINGS',
    description: 'Årets resultat før overførsel',
  },
  {
    number: '3400',
    name: 'Overført resultat',
    nameEn: 'Retained Earnings',
    type: 'EQUITY',
    group: 'RETAINED_EARNINGS',
    description: 'Akkumulerede overskud fra tidligere år',
  },

  // ─── REVENUE (4xxx-5xxx) ─────────────────────────────────────────
  {
    number: '4000',
    name: 'Salg af varer',
    nameEn: 'Goods Sales',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Salgsindtægter fra varesalg indenlands',
  },
  {
    number: '4100',
    name: 'Salg af tjenesteydelser',
    nameEn: 'Service Revenue',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Indtægter fra tjenesteydelsessalg',
  },
  {
    number: '4200',
    name: 'Salg af varer EU',
    nameEn: 'EU Goods Sales',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Salgsindtægter fra varesalg til EU-lande (IGS)',
  },
  {
    number: '4300',
    name: 'Salg af varer udenfor EU',
    nameEn: 'Export Sales',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Salgsindtægter fra vareslag uden for EU (eksport)',
  },
  {
    number: '5000',
    name: 'Andre driftsindtægter',
    nameEn: 'Other Operating Income',
    type: 'REVENUE',
    group: 'OTHER_REVENUE',
    description: 'Diverse driftsindtægter',
  },
  {
    number: '4510',
    name: 'Udgående moms',
    nameEn: 'Output VAT',
    type: 'LIABILITY',
    group: 'OUTPUT_VAT',
    description: 'Udgående moms af salg (25% standard)',
  },
  {
    number: '4520',
    name: 'Udgående moms 12%',
    nameEn: 'Output VAT 12%',
    type: 'LIABILITY',
    group: 'OUTPUT_VAT',
    description: 'Udgående moms af nedsat sats (12%)',
  },
  {
    number: '5410',
    name: 'Indgående moms',
    nameEn: 'Input VAT',
    type: 'ASSET',
    group: 'INPUT_VAT',
    description: 'Indgående moms af køb (25% standard)',
  },
  {
    number: '5420',
    name: 'Indgående moms 12%',
    nameEn: 'Input VAT 12%',
    type: 'ASSET',
    group: 'INPUT_VAT',
    description: 'Indgående moms af nedsat sats (12%)',
  },
  {
    number: '5100',
    name: 'Tilgodehavender nedskrevet',
    nameEn: 'Bad Debt Recovery',
    type: 'REVENUE',
    group: 'OTHER_REVENUE',
    description: 'Indtægter fra nedskrivning af tilgodehavender',
  },
  {
    number: '5200',
    name: 'Varebundne tilskud',
    nameEn: 'Goods-related Subsidies',
    type: 'REVENUE',
    group: 'OTHER_REVENUE',
    description: 'Modtagne tilskud knyttet til varekøb',
  },

  // ─── EXPENSES (6xxx-9xxx) ────────────────────────────────────────
  {
    number: '6000',
    name: 'Vareforbrug',
    nameEn: 'Cost of Goods Sold',
    type: 'EXPENSE',
    group: 'COST_OF_GOODS',
    description: 'Vareforbrug i salgsvirksomhed',
  },
  {
    number: '6100',
    name: 'Indkøb af varer',
    nameEn: 'Purchases',
    type: 'EXPENSE',
    group: 'COST_OF_GOODS',
    description: 'Indkøb af varer til videresalg',
  },
  {
    number: '6200',
    name: 'Vareforbrug til videresalg',
    nameEn: 'Goods for Resale',
    type: 'EXPENSE',
    group: 'COST_OF_GOODS',
    description: 'Vareforbrug til videresalg i perioden',
  },
  {
    number: '7000',
    name: 'Lønninger',
    nameEn: 'Salaries',
    type: 'EXPENSE',
    group: 'PERSONNEL',
    description: 'Brutto lønninger til ansatte',
  },
  {
    number: '7100',
    name: 'Arbejdsgiverbidrag',
    nameEn: 'Employer Contributions',
    type: 'EXPENSE',
    group: 'PERSONNEL',
    description: 'Arbejdsgiverbidrag incl. ATP, Feriepenge m.m.',
  },
  {
    number: '7200',
    name: 'Pensionsbidrag',
    nameEn: 'Pension Contributions',
    type: 'EXPENSE',
    group: 'PERSONNEL',
    description: 'Arbejdsgivers pensionsbidrag',
  },
  {
    number: '8000',
    name: 'Husleje',
    nameEn: 'Rent',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Leje af lokaler og faciliteter',
  },
  {
    number: '8100',
    name: 'El, vand og varme',
    nameEn: 'Utilities',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'El, vand, varme og affaldsafgift',
  },
  {
    number: '8200',
    name: 'Kørselsomkostninger',
    nameEn: 'Transportation',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Brændstof, bilafgift og vedligeholdelse af køretøjer',
  },
  {
    number: '8300',
    name: 'Rejseomkostninger',
    nameEn: 'Travel',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Rejse- og opholdsudgifter i forbindelse med arbejde',
  },
  {
    number: '8400',
    name: 'Forsikring',
    nameEn: 'Insurance',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Erhvervsforsikringer m.m.',
  },
  {
    number: '8500',
    name: 'Regnskabs- og revisionshonorar',
    nameEn: 'Accounting Fees',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Honorar til revisor og regnskabsassistance',
  },
  {
    number: '8600',
    name: 'Telefon og internet',
    nameEn: 'Telecom',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Telefonabonnementer og internetforbindelse',
  },
  {
    number: '8700',
    name: 'Kontorartikler',
    nameEn: 'Office Supplies',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Kontorartikler og tryksager',
  },
  {
    number: '8800',
    name: 'Reklame og markedsføring',
    nameEn: 'Advertising',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Markedsføring, reklamer og PR',
  },
  {
    number: '8900',
    name: 'Avancement',
    nameEn: 'Depreciation',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Afskrivninger på anlægsaktiver (avanceringsordningen)',
  },
  {
    number: '9000',
    name: 'Finansielle omkostninger',
    nameEn: 'Financial Expenses',
    type: 'EXPENSE',
    group: 'FINANCIAL_EXPENSE',
    description: 'Diverse finansielle omkostninger',
  },
  {
    number: '9100',
    name: 'Renteomkostninger',
    nameEn: 'Interest Expenses',
    type: 'EXPENSE',
    group: 'FINANCIAL_EXPENSE',
    description: 'Renteomkostninger på lån og gæld',
  },
  {
    number: '9200',
    name: 'Finansielle indtægter',
    nameEn: 'Financial Income',
    type: 'REVENUE',
    group: 'FINANCIAL_INCOME',
    description: 'Diverse finansielle indtægter',
  },
  {
    number: '9300',
    name: 'Renteindtægter',
    nameEn: 'Interest Income',
    type: 'REVENUE',
    group: 'FINANCIAL_INCOME',
    description: 'Renteindtægter fra bankindeståender m.m.',
  },
  {
    number: '9400',
    name: 'Kapitalgevinst/-tab',
    nameEn: 'Capital Gains/Losses',
    type: 'EXPENSE',
    group: 'FINANCIAL_EXPENSE',
    description: 'Gevinster eller tab på salg af aktiver',
  },
  {
    number: '9500',
    name: 'Årets skat af resultat',
    nameEn: 'Corporate Tax',
    type: 'EXPENSE',
    group: 'TAX',
    description: 'Selskabsskat af årets resultat',
  },
]

/**
 * Seeds the standard Danish chart of accounts for a given user.
 *
 * This function is idempotent for a given isDemo value — if the user already has accounts
 * with the matching isDemo flag, it will not create duplicates.
 *
 * @param userId - The ID of the user to seed accounts for
 * @param isDemo - Whether these are demo accounts (default: false)
 * @returns The number of accounts created
 */
export async function seedChartOfAccounts(userId: string, companyId: string, isDemo: boolean = false): Promise<number> {
  // Check if the user already has accounts with this isDemo flag — skip seeding to avoid duplicates
  const existingCount = await db.account.count({
    where: { companyId, isDemo },
  })

  if (existingCount > 0) {
    return 0
  }

  // Create all accounts in a single transaction for atomicity
  const result = await db.account.createMany({
    data: DANISH_CHART_OF_ACCOUNTS.map((account) => ({
      number: account.number,
      name: account.name,
      nameEn: account.nameEn,
      type: account.type,
      group: account.group,
      description: account.description,
      isActive: true,
      isSystem: true,
      isDemo,
      userId,
      companyId,
    })),
  })

  return result.count
}
