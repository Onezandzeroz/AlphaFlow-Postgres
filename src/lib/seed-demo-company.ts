/**
 * Seed script for the demo company "Nordisk Erhverv ApS"
 *
 * Creates a clean, easy-to-follow demo dataset for a stable IT consulting
 * company in Copenhagen. Covers the previous full year (all 12 months CLOSED)
 * through the current date (past months CLOSED, current month OPEN).
 *
 * Architecture: Journal entries are the SINGLE SOURCE OF TRUTH.
 * Invoices, transactions, and bank statements reference the same business events.
 *
 * All dates are computed dynamically from `new Date()`.
 */

import { db } from '@/lib/db'
import { seedChartOfAccounts } from '@/lib/seed-chart-of-accounts'
import {
  TransactionType,
  InvoiceStatus,
  JournalEntryStatus,
  ContactType,
  PeriodStatus,
  VATCode,
  RecurringFrequency,
  RecurringStatus,
  ReconciliationStatus,
} from '@prisma/client'

// ─── Helpers ──────────────────────────────────────────────────────

/** Create a Date at midnight UTC for a given year/month/day */
function d(year: number, month: number, day: number): Date {
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`)
}

/** Round to 2 decimal places */
function r(n: number): number {
  return Math.round(n * 100) / 100
}

/** Compute 25% VAT from net amount */
function vat25(net: number): number {
  return r(net * 0.25)
}

/** Net + 25% VAT */
function gross25(net: number): number {
  return r(net * 1.25)
}

/** Pseudo-random seeded number for deterministic output */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

/** Add days to a Date (safe) */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** Get last day of month */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// ─── Dynamic Date Ranges ──────────────────────────────────────────

const NOW = new Date()
const CURRENT_YEAR = NOW.getFullYear()
const CURRENT_MONTH = NOW.getMonth() + 1 // 1-indexed
const PREV_YEAR = CURRENT_YEAR - 1

// Danish month names
const MONTH_NAMES = [
  'januar', 'februar', 'marts', 'april', 'maj', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'december',
]

// ─── Stable Company Parameters (no growth — mature business) ─────

const SALARY_GROSS = 85000
const SALARY_EMPLOYER = 15000   // ATP, AM-bidrag
const SALARY_PENSION = 8000     // pensionsbidrag
const SALARY_TOTAL = SALARY_GROSS + SALARY_EMPLOYER + SALARY_PENSION // 108,000

const RENT_NET = 18000
const TELECOM_NET = 5000
const INSURANCE_Q = 12000       // quarterly, VAT exempt
const DEPRECIATION_Q = 10000    // quarterly

const OPENING_BALANCE = 500000
const CARRIED_RECEIVABLES = 200000 // pre-existing receivables from prior period

// Service descriptions for invoices
const SERVICE_DESCRIPTIONS = [
  'IT-rådgivning og konsulentbistand',
  'Systemintegration og implementation',
  'Cloud migration og infrastruktur',
  'Digital transformation og strategi',
  'Udvikling af kundespecifikke løsninger',
  'Drift og vedligeholdelse af IT-systemer',
]

// ─── Contact Data ─────────────────────────────────────────────────

interface ContactSeed {
  name: string
  cvrNumber: string
  email: string
  phone: string
  address: string
  city: string
  postalCode: string
  type: ContactType
  notes: string
}

const CONTACT_DATA: ContactSeed[] = [
  // 4 Customers
  {
    name: 'DataDrift ApS',
    cvrNumber: '28473650',
    email: 'kundeservice@datadrift.dk',
    phone: '+45 33 98 76 54',
    address: 'Amagerbrogade 88',
    city: 'København S',
    postalCode: '2300',
    type: 'CUSTOMER',
    notes: 'IT services kunde – løbende rådgivningsopgaver',
  },
  {
    name: 'Copenhagen Digital Hub',
    cvrNumber: '31927481',
    email: 'info@cphdigitalhub.dk',
    phone: '+45 33 54 32 10',
    address: 'Nørrebrogade 15',
    city: 'København N',
    postalCode: '2200',
    type: 'CUSTOMER',
    notes: 'Digital transformationskunde – større projekter',
  },
  {
    name: 'Skandinavisk Tech Solutions',
    cvrNumber: '27584930',
    email: 'hello@skanditech.dk',
    phone: '+45 86 12 34 56',
    address: 'Banegårdspladsen 7',
    city: 'Aarhus C',
    postalCode: '8000',
    type: 'CUSTOMER',
    notes: 'Konsulentkunde – rådgivning og support',
  },
  {
    name: 'Nordic Cloud Partners',
    cvrNumber: '34216758',
    email: 'contact@nordiccloudpartners.dk',
    phone: '+45 33 21 98 76',
    address: 'Østergade 22',
    city: 'København K',
    postalCode: '1100',
    type: 'CUSTOMER',
    notes: 'Cloud migreringskunde – store implementationer',
  },
  // 3 Suppliers
  {
    name: 'TechSupply Danmark',
    cvrNumber: '25837491',
    email: 'salg@techsupply.dk',
    phone: '+45 43 22 11 00',
    address: 'Herlev Hovedgade 120',
    city: 'Herlev',
    postalCode: '2730',
    type: 'SUPPLIER',
    notes: 'IT hardware leverandør – servere, workstations, peripherals',
  },
  {
    name: 'København Kontor Service',
    cvrNumber: '29104837',
    email: 'ordre@kbhkontor.dk',
    phone: '+45 33 14 55 66',
    address: 'Frederikssundsvej 34',
    city: 'København NV',
    postalCode: '2400',
    type: 'SUPPLIER',
    notes: 'Kontorartikler og kontormøbler',
  },
  {
    name: 'Dansk IT Sikkerhed',
    cvrNumber: '31746295',
    email: 'support@danskitsikkerhed.dk',
    phone: '+45 86 18 77 88',
    address: 'Søndergade 55',
    city: 'Aarhus C',
    postalCode: '8000',
    type: 'SUPPLIER',
    notes: 'Sikkerhedstjenester – penetration tests, audit, compliance',
  },
  // 1 Insurance supplier
  {
    name: 'Nordisk Forsikring A/S',
    cvrNumber: '20845731',
    email: 'forsikring@nordiskforsikring.dk',
    phone: '+45 33 77 88 99',
    address: 'Bredgade 30',
    city: 'København K',
    postalCode: '1260',
    type: 'SUPPLIER',
    notes: 'Erhvervsforsikring – ansvars- og indboforsikring',
  },
]

// ─── Precompute Revenue Data ─────────────────────────────────────

interface RevenueItem {
  net: number
  vat: number
  gross: number
  customerIdx: number
  serviceDesc: string
}

/**
 * Pre-generate deterministic revenue for each month so that
 * invoices, JEs, and transactions all reference the same amounts.
 */
function precomputeRevenue(): Map<string, RevenueItem[]> {
  const map = new Map<string, RevenueItem[]>()

  for (const year of [PREV_YEAR, CURRENT_YEAR]) {
    const maxMonth = year === CURRENT_YEAR ? CURRENT_MONTH : 12
    for (let m = 1; m <= maxMonth; m++) {
      const items: RevenueItem[] = []
      for (let i = 0; i < 2; i++) {
        const seed = year * 10000 + m * 100 + i
        // Range [55000, 95000], average ~75,000
        const net = 55000 + Math.round(seededRandom(seed) * 40000 / 500) * 500
        const vat = vat25(net)
        const gross = gross25(net)
        const customerIdx = Math.floor(seededRandom(seed + 1) * 4)
        const descIdx = Math.floor(seededRandom(seed + 2) * SERVICE_DESCRIPTIONS.length)
        items.push({
          net,
          vat,
          gross,
          customerIdx,
          serviceDesc: SERVICE_DESCRIPTIONS[descIdx],
        })
      }
      map.set(`${year}-${m}`, items)
    }
  }
  return map
}

const REVENUE_MAP = precomputeRevenue()

// ─── Invoice Seed Types ──────────────────────────────────────────

interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  vatPercent: number
}

interface InvoiceSeed {
  invoiceNumber: string
  contactIndex: number
  issueDate: Date
  dueDate: Date
  status: InvoiceStatus
  lineItems: InvoiceLineItem[]
  cancelled?: boolean
  cancelReason?: string
}

/**
 * Build invoices: 2/month, consistently.
 *
 * Status rules:
 * - Prev year: all PAID except 1 CANCELLED (month 6, invoice 2)
 * - Cur year months 1..CURRENT_MONTH-2: all PAID
 * - Cur year month CURRENT_MONTH-1 (if >= 1): 1 PAID + 1 SENT (not overdue)
 * - Cur year month CURRENT_MONTH: 1 DRAFT + 1 SENT (overdue ~10 days)
 */
function buildInvoices(): InvoiceSeed[] {
  const invoices: InvoiceSeed[] = []
  let seq = 1

  // The one CANCELLED invoice in prev year month 6, index 1
  const CANCELLED_KEY = `${PREV_YEAR}-6`

  for (const year of [PREV_YEAR, CURRENT_YEAR]) {
    const isCurYear = year === CURRENT_YEAR
    const maxMonth = isCurYear ? CURRENT_MONTH : 12

    for (let m = 1; m <= maxMonth; m++) {
      const key = `${year}-${m}`
      const items = REVENUE_MAP.get(key)
      if (!items) continue

      for (let i = 0; i < 2; i++) {
        const item = items[i]
        const invoiceNumber = `NE-${year}-${String(seq).padStart(4, '0')}`
        seq++

        // Determine status
        let status: InvoiceStatus
        let issueDate: Date
        let dueDate: Date
        let cancelled = false
        let cancelReason: string | undefined

        if (!isCurYear) {
          // Previous year
          if (key === CANCELLED_KEY && i === 1) {
            status = 'CANCELLED'
            cancelled = true
            cancelReason = 'Dublet faktura – annulleret'
          } else {
            status = 'PAID'
          }
          issueDate = d(year, m, 5 + i * 10)
          dueDate = addDays(issueDate, 30)
        } else if (m < CURRENT_MONTH - 1) {
          // Current year, well in the past
          status = 'PAID'
          issueDate = d(year, m, 5 + i * 10)
          dueDate = addDays(issueDate, 30)
        } else if (m === CURRENT_MONTH - 1 && CURRENT_MONTH > 1) {
          // Previous month in current year
          if (i === 0) {
            status = 'PAID'
          } else {
            // SENT, due date in the future (not overdue)
            status = 'SENT'
          }
          issueDate = d(year, m, 5 + i * 10)
          dueDate = addDays(issueDate, 30)
        } else {
          // Current month
          issueDate = d(year, m, 5 + i * 10)
          dueDate = addDays(issueDate, 30)
          if (i === 0) {
            status = 'DRAFT'
          } else {
            // SENT, overdue by ~10 days
            status = 'SENT'
            dueDate = addDays(NOW, -10)
            issueDate = addDays(dueDate, -30)
          }
        }

        // Build line items
        const lineItems: InvoiceLineItem[] = [
          { description: item.serviceDesc, quantity: 1, unitPrice: item.net, vatPercent: 25 },
        ]
        // Occasionally add a second line (30% chance, but not for CANCELLED/DRAFT)
        if (
          status === 'PAID' || status === 'SENT'
        ) {
          if (seededRandom(year * 10000 + m * 100 + i * 7 + 99) > 0.7) {
            const extra = Math.round(item.net * 0.12 / 500) * 500
            lineItems.push({
              description: 'Tillægsydelser og dokumentation',
              quantity: 1,
              unitPrice: Math.max(5000, extra),
              vatPercent: 25,
            })
          }
        }

        invoices.push({
          invoiceNumber,
          contactIndex: item.customerIdx,
          issueDate,
          dueDate,
          status,
          lineItems,
          cancelled,
          cancelReason,
        })
      }
    }
  }

  return invoices
}

// ─── Transaction Seed Types ──────────────────────────────────────

interface TransactionSeed {
  date: Date
  type: TransactionType
  amount: number
  description: string
  vatPercent: number
  key: string                // unique key for post-creation ID lookup (e.g. "rent-2024-1")
  contactIndex?: number
}

/**
 * Build transactions — ONLY purchases, salary, and bank transfers.
 *
 * Live system architecture: SALE transactions do NOT exist in the DB.
 * Sales come from Invoice records → client creates virtual transactions (inv- prefix).
 * This seed mirrors that: invoices provide the sale data, and revenue JEs
 * use invoice-number references so enrichInvoicesWithVAT() can match them.
 */
function buildTransactions(): TransactionSeed[] {
  const txns: TransactionSeed[] = []

  for (const year of [PREV_YEAR, CURRENT_YEAR]) {
    const maxMonth = year === CURRENT_YEAR ? CURRENT_MONTH : 12

    for (let m = 1; m <= maxMonth; m++) {
      const key = `${year}-${m}`
      const items = REVENUE_MAP.get(key)
      if (!items) continue

      // Salary (15th)
      txns.push({
        date: d(year, m, 15),
        type: 'SALARY',
        amount: SALARY_TOTAL,
        description: `Lønninger ${MONTH_NAMES[m - 1]} ${year}`,
        vatPercent: 0,
        key: `salary-${year}-${m}`,
      })

      // Rent (1st) — NET amount (live convention: PURCHASE amount = net)
      txns.push({
        date: d(year, m, 1),
        type: 'PURCHASE',
        amount: RENT_NET,
        description: `Husleje ${MONTH_NAMES[m - 1]} – Vesterbrogade 42`,
        vatPercent: 25,
        key: `rent-${year}-${m}`,
      })

      // Telecom (5th) — NET amount
      txns.push({
        date: d(year, m, 5),
        type: 'PURCHASE',
        amount: TELECOM_NET,
        description: `Telefon og internet ${MONTH_NAMES[m - 1]} ${year}`,
        vatPercent: 25,
        key: `telecom-${year}-${m}`,
      })

      // Quarterly events
      const quarter = Math.ceil(m / 3)

      // Insurance (quarter start months) — no VAT
      if (m === 1 || m === 4 || m === 7 || m === 10) {
        txns.push({
          date: d(year, m, 10),
          type: 'PURCHASE',
          amount: INSURANCE_Q,
          description: `Erhvervsforsikring Q${quarter} – Nordisk Forsikring`,
          vatPercent: 0,
          key: `insurance-${year}-${m}`,
          contactIndex: 7,
        })
      }

      // VAT settlement (quarter end)
      if (m % 3 === 0) {
        const outputVat = calcQuarterlyOutputVat(year, quarter)
        const inputVat = calcQuarterlyInputVat(year, quarter)
        const netVat = r(outputVat - inputVat)
        txns.push({
          date: d(year, m, lastDayOfMonth(year, m)),
          type: 'BANK',
          amount: netVat,
          description: `Momsbetaling Q${quarter} ${year}`,
          vatPercent: 0,
          key: `vat-${year}-${m}`,
        })
      }
    }
  }

  return txns
}

// ─── Journal Entry Seed Types ────────────────────────────────────

interface JELineSeed {
  accountNumber: string
  debit: number
  credit: number
  vatCode?: VATCode
  description?: string
}

interface JESeed {
  date: Date
  description: string
  reference?: string
  status: JournalEntryStatus
  lines: JELineSeed[]
}

/** Sum up output VAT from revenue for a given quarter */
function calcQuarterlyOutputVat(year: number, quarter: number): number {
  let total = 0
  for (let m = (quarter - 1) * 3 + 1; m <= quarter * 3; m++) {
    const items = REVENUE_MAP.get(`${year}-${m}`)
    if (!items) continue
    for (let i = 0; i < items.length; i++) {
      // Skip CANCELLED
      if (year === PREV_YEAR && m === 6 && i === 1) continue
      // Skip DRAFT
      if (year === CURRENT_YEAR && m === CURRENT_MONTH && i === 0) continue
      total += items[i].vat
    }
  }
  return r(total)
}

/** Sum up input VAT from rent + telecom for a given quarter */
function calcQuarterlyInputVat(year: number, quarter: number): number {
  const months = quarter === 1 && year === PREV_YEAR ? 2 : 3
  let total = 0
  for (let j = 0; j < months; j++) {
    const m = (quarter - 1) * 3 + 1 + j
    total += vat25(RENT_NET) + vat25(TELECOM_NET)
  }
  return r(total)
}

/**
 * Determine whether a revenue item should have a payment JE.
 * Payment JEs are created for PAID invoices whose payment date has passed.
 */
function shouldHavePaymentJE(year: number, month: number, idx: number): boolean {
  // CANCELLED: no JE at all
  if (year === PREV_YEAR && month === 6 && idx === 1) return false
  // DRAFT: no JE at all
  if (year === CURRENT_YEAR && month === CURRENT_MONTH && idx === 0) return false

  // Previous year: all paid
  if (year === PREV_YEAR) return true

  // Current year: paid if month + 1 <= CURRENT_MONTH - 1
  // (i.e., payment would have arrived 30 days after issue in the next month)
  return month + 1 <= CURRENT_MONTH - 1
}

/**
 * Determine whether a revenue item should have a revenue JE.
 * All non-DRAFT, non-CANCELLED invoices get a revenue JE.
 */
function shouldHaveRevenueJE(year: number, month: number, idx: number): boolean {
  if (year === PREV_YEAR && month === 6 && idx === 1) return false // CANCELLED
  if (year === CURRENT_YEAR && month === CURRENT_MONTH && idx === 0) return false // DRAFT
  return true
}

/**
 * Build all journal entries — the SINGLE SOURCE OF TRUTH.
 *
 * Reference patterns MUST match live API exactly:
 *   - Revenue JEs:   reference = {invoiceNumber}          → enrichInvoicesWithVAT()
 *   - Payment JEs:   reference = {invoiceNumber}-IND      → cash receipt (skipped by enrichInvoicesWithVAT)
 *   - Purchase JEs:  reference = TX-{transactionId8}      → enrichTransactionsWithVAT()
 *   - Salary JEs:    reference = TX-{transactionId8}      → enrichTransactionsWithVAT()
 *   - Bank JEs:      reference = TX-{transactionId8}      → enrichTransactionsWithVAT()
 *   - Depreciation:  reference = AFS-YYYY-Qx              → no VAT enrichment needed
 *   - Special JEs:   reference = descriptive identifier   → no VAT enrichment needed
 */
function buildJournalEntries(
  txIdMap: Map<string, string>,
  invoiceNumberMap: Map<string, string>,
): JESeed[] {
  const entries: JESeed[] = []

  /** Build TX- reference from a transaction key */
  const txRef = (key: string): string => {
    const txId = txIdMap.get(key)
    if (!txId) throw new Error(`Transaction ID not found for key: ${key}`)
    return `TX-${txId.slice(0, 8)}`
  }

  /** Build invoice number reference from revenue key */
  const invRef = (revenueKey: string): string => {
    const invNum = invoiceNumberMap.get(revenueKey)
    if (!invNum) throw new Error(`Invoice number not found for revenue key: ${revenueKey}`)
    return invNum
  }

  // ── Opening balance: Share capital injection ──
  entries.push({
    date: d(PREV_YEAR, 1, 1),
    description: 'Indbetaling af selskabskapital ved stiftelse',
    reference: 'STIFTELSE-001',
    status: 'POSTED',
    lines: [
      { accountNumber: '1100', debit: OPENING_BALANCE, credit: 0, vatCode: 'NONE', description: 'Indskud af selskabskapital på bankkonto' },
      { accountNumber: '3000', debit: 0, credit: OPENING_BALANCE, vatCode: 'NONE', description: 'Selskabskapital' },
    ],
  })

  // ── Carried-forward receivables from prior period ──
  const carriedVat = vat25(r(CARRIED_RECEIVABLES / 1.25))
  const carriedNet = r(CARRIED_RECEIVABLES - carriedVat)
  entries.push({
    date: d(PREV_YEAR, 1, 1),
    description: 'Tilgodehavender fra foregående periode',
    reference: 'REST-ÅBNING',
    status: 'POSTED',
    lines: [
      { accountNumber: '1200', debit: CARRIED_RECEIVABLES, credit: 0, vatCode: 'NONE', description: 'Tilgodehavender overført' },
      { accountNumber: '4100', debit: 0, credit: carriedNet, vatCode: 'NONE', description: 'Serviceydelser foregående periode' },
      { accountNumber: '4510', debit: 0, credit: carriedVat, vatCode: 'S25', description: 'Udgående moms foregående periode' },
    ],
  })

  // ── Payment of carried receivables (Jan 3) ──
  entries.push({
    date: d(PREV_YEAR, 1, 3),
    description: 'Kundebetaling modtaget – tilgodehavender fra foregående periode',
    reference: 'BET-REST-ÅBNING',
    status: 'POSTED',
    lines: [
      { accountNumber: '1100', debit: CARRIED_RECEIVABLES, credit: 0, vatCode: 'NONE', description: 'Indbetaling fra kunde' },
      { accountNumber: '1200', debit: 0, credit: CARRIED_RECEIVABLES, vatCode: 'NONE', description: 'Kreditering af tilgodehavende' },
    ],
  })

  // ── Per-month entries ──
  for (const year of [PREV_YEAR, CURRENT_YEAR]) {
    const isCurYear = year === CURRENT_YEAR
    const maxMonth = isCurYear ? CURRENT_MONTH : 12

    for (let m = 1; m <= maxMonth; m++) {
      const key = `${year}-${m}`
      const items = REVENUE_MAP.get(key)
      if (!items) continue

      const quarter = Math.ceil(m / 3)

      // ── Revenue JEs: reference = invoiceNumber (for enrichInvoicesWithVAT) ──
      for (let i = 0; i < 2; i++) {
        if (!shouldHaveRevenueJE(year, m, i)) continue

        const item = items[i]
        const revenueKey = `${year}-${m}-${i}`
        const invoiceNumber = invRef(revenueKey)
        const customer = CONTACT_DATA[item.customerIdx]
        const day = 5 + i * 10

        entries.push({
          date: d(year, m, day),
          description: `Faktura ${customer.name} – ${item.serviceDesc} ${MONTH_NAMES[m - 1]} ${year}`,
          reference: invoiceNumber,
          status: 'POSTED',
          lines: [
            { accountNumber: '1200', debit: item.gross, credit: 0, vatCode: 'NONE', description: `Tilgodehavende fra ${customer.name}` },
            { accountNumber: '4100', debit: 0, credit: item.net, vatCode: 'NONE', description: `Serviceydelse – ${item.serviceDesc}` },
            { accountNumber: '4510', debit: 0, credit: item.vat, vatCode: 'S25', description: 'Udgående moms 25%' },
          ],
        })
      }

      // ── Payment JEs: reference = {invoiceNumber}-IND (cash receipt pattern) ──
      for (let i = 0; i < 2; i++) {
        if (!shouldHavePaymentJE(year, m, i)) continue

        const item = items[i]
        const revenueKey = `${year}-${m}-${i}`
        const invoiceNumber = invRef(revenueKey)
        const customer = CONTACT_DATA[item.customerIdx]
        const day = 5 + i * 10
        const paymentDate = addDays(d(year, m, day), 30)

        entries.push({
          date: paymentDate,
          description: `Kundebetaling modtaget – ${customer.name} (${invoiceNumber})`,
          reference: `${invoiceNumber}-IND`,
          status: 'POSTED',
          lines: [
            { accountNumber: '1100', debit: item.gross, credit: 0, vatCode: 'NONE', description: `Indbetaling fra ${customer.name}` },
            { accountNumber: '1200', debit: 0, credit: item.gross, vatCode: 'NONE', description: 'Kreditering af tilgodehavende' },
          ],
        })
      }

      // ── Salary JE: reference = TX-{salaryTxId8} ──
      entries.push({
        date: d(year, m, 25),
        description: `Lønafregning ${MONTH_NAMES[m - 1]} ${year}`,
        reference: txRef(`salary-${year}-${m}`),
        status: 'POSTED',
        lines: [
          { accountNumber: '7000', debit: SALARY_GROSS, credit: 0, vatCode: 'NONE', description: 'Bruttolønninger' },
          { accountNumber: '7100', debit: SALARY_EMPLOYER, credit: 0, vatCode: 'NONE', description: 'ATP og arbejdsgiverbidrag' },
          { accountNumber: '7200', debit: SALARY_PENSION, credit: 0, vatCode: 'NONE', description: 'Pensionsbidrag' },
          { accountNumber: '1100', debit: 0, credit: SALARY_TOTAL, vatCode: 'NONE', description: 'Udbetaling fra bankkonto' },
        ],
      })

      // ── Rent JE: reference = TX-{rentTxId8} (has K25 on INPUT_VAT account) ──
      entries.push({
        date: d(year, m, 1),
        description: `Husleje ${MONTH_NAMES[m - 1]} ${year} – Vesterbrogade 42`,
        reference: txRef(`rent-${year}-${m}`),
        status: 'POSTED',
        lines: [
          { accountNumber: '8000', debit: RENT_NET, credit: 0, vatCode: 'NONE', description: 'Husleje ekskl. moms' },
          { accountNumber: '5410', debit: vat25(RENT_NET), credit: 0, vatCode: 'K25', description: 'Indgående moms 25%' },
          { accountNumber: '1100', debit: 0, credit: gross25(RENT_NET), vatCode: 'NONE', description: 'Betaling fra bankkonto' },
        ],
      })

      // ── Telecom JE: reference = TX-{telecomTxId8} (has K25 on INPUT_VAT account) ──
      entries.push({
        date: d(year, m, 5),
        description: `Telefon og internet ${MONTH_NAMES[m - 1]} ${year}`,
        reference: txRef(`telecom-${year}-${m}`),
        status: 'POSTED',
        lines: [
          { accountNumber: '8600', debit: TELECOM_NET, credit: 0, vatCode: 'NONE', description: 'Telefon og internet ekskl. moms' },
          { accountNumber: '5410', debit: vat25(TELECOM_NET), credit: 0, vatCode: 'K25', description: 'Indgående moms 25%' },
          { accountNumber: '1100', debit: 0, credit: gross25(TELECOM_NET), vatCode: 'NONE', description: 'Betaling fra bankkonto' },
        ],
      })

      // ── Quarterly entries ──
      const isQuarterEnd = m % 3 === 0
      const isQuarterStart = m === 1 || m === 4 || m === 7 || m === 10

      // Insurance (quarter start) — no VAT
      if (isQuarterStart) {
        entries.push({
          date: d(year, m, 10),
          description: `Erhvervsforsikring Q${quarter} ${year} – Nordisk Forsikring A/S`,
          reference: txRef(`insurance-${year}-${m}`),
          status: 'POSTED',
          lines: [
            { accountNumber: '8400', debit: INSURANCE_Q, credit: 0, vatCode: 'NONE', description: 'Forsikringspræmie (momsfri)' },
            { accountNumber: '1100', debit: 0, credit: INSURANCE_Q, vatCode: 'NONE', description: 'Betaling fra bankkonto' },
          ],
        })
      }

      // Depreciation (quarter end) — no VAT, no enrichment needed
      if (isQuarterEnd) {
        entries.push({
          date: d(year, m, lastDayOfMonth(year, m)),
          description: `Afskrivning på IT-udstyr Q${quarter} ${year}`,
          reference: `AFS-${year}-Q${quarter}`,
          status: 'POSTED',
          lines: [
            { accountNumber: '8900', debit: DEPRECIATION_Q, credit: 0, vatCode: 'NONE', description: 'Afskrivning IT-udstyr' },
            { accountNumber: '1800', debit: 0, credit: DEPRECIATION_Q, vatCode: 'NONE', description: 'Nedskrivning af anlægsaktiv' },
          ],
        })
      }

      // VAT Settlement (quarter end)
      if (isQuarterEnd) {
        const outputVat = calcQuarterlyOutputVat(year, quarter)
        const inputVat = calcQuarterlyInputVat(year, quarter)
        const netVat = r(outputVat - inputVat)

        entries.push({
          date: d(year, m, lastDayOfMonth(year, m)),
          description: `Momsafregning Q${quarter} ${year} – indbetaling til Skattestyrelsen`,
          reference: txRef(`vat-${year}-${m}`),
          status: 'POSTED',
          lines: [
            { accountNumber: '4510', debit: outputVat, credit: 0, vatCode: 'NONE', description: `Udgående moms Q${quarter} afregnet` },
            { accountNumber: '5410', debit: 0, credit: inputVat, vatCode: 'NONE', description: `Indgående moms Q${quarter} afregnet` },
            { accountNumber: '1100', debit: 0, credit: netVat, vatCode: 'NONE', description: 'Momsbetaling fra bankkonto' },
          ],
        })
      }
    }
  }

  // ── Year-end closing for previous year ──
  const prevYearRevenue = calcTotalAccountCredit(PREV_YEAR, '4100')
  const prevYearExpenses =
    calcTotalAccountDebit(PREV_YEAR, '7000') +
    calcTotalAccountDebit(PREV_YEAR, '7100') +
    calcTotalAccountDebit(PREV_YEAR, '7200') +
    calcTotalAccountDebit(PREV_YEAR, '8000') +
    calcTotalAccountDebit(PREV_YEAR, '8400') +
    calcTotalAccountDebit(PREV_YEAR, '8600') +
    calcTotalAccountDebit(PREV_YEAR, '8900')
  const prevYearNetIncome = r(prevYearRevenue - prevYearExpenses)

  if (prevYearNetIncome > 0) {
    entries.push({
      date: d(PREV_YEAR, 12, 31),
      description: `Årsafslut ${PREV_YEAR} – resultatoverførsel til overskud`,
      reference: `AARSAFSLUT-${PREV_YEAR}`,
      status: 'POSTED',
      lines: [
        { accountNumber: '3300', debit: prevYearNetIncome, credit: 0, vatCode: 'NONE', description: 'Årets resultat lukkes' },
        { accountNumber: '3400', debit: 0, credit: prevYearNetIncome, vatCode: 'NONE', description: 'Overført til overskud (egenkapital)' },
      ],
    })
  }

  // Sort all entries chronologically
  entries.sort((a, b) => a.date.getTime() - b.date.getTime())

  return entries
}

/** Helper: sum all debit amounts for a given account and year across existing entries */
function calcTotalAccountDebit(year: number, accountNumber: string): number {
  let total = 0
  // Revenue entries: 2 per month × 12 months
  for (let m = 1; m <= 12; m++) {
    const items = REVENUE_MAP.get(`${year}-${m}`)
    if (!items) continue
    for (let i = 0; i < items.length; i++) {
      if (year === PREV_YEAR && m === 6 && i === 1) continue
    }
  }
  // Salary: 12 months
  if (accountNumber === '7000') total += SALARY_GROSS * 12
  if (accountNumber === '7100') total += SALARY_EMPLOYER * 12
  if (accountNumber === '7200') total += SALARY_PENSION * 12
  // Rent: 12 months
  if (accountNumber === '8000') total += RENT_NET * 12
  // Insurance: 4 quarters
  if (accountNumber === '8400') total += INSURANCE_Q * 4
  // Telecom: 12 months
  if (accountNumber === '8600') total += TELECOM_NET * 12
  // Depreciation: 4 quarters
  if (accountNumber === '8900') total += DEPRECIATION_Q * 4
  return r(total)
}

/** Helper: sum revenue credits for a given year */
function calcTotalAccountCredit(year: number, _accountNumber: string): number {
  let total = 0
  for (let m = 1; m <= 12; m++) {
    const items = REVENUE_MAP.get(`${year}-${m}`)
    if (!items) continue
    for (let i = 0; i < items.length; i++) {
      // Skip CANCELLED
      if (year === PREV_YEAR && m === 6 && i === 1) continue
      total += items[i].net
    }
  }
  return r(total)
}

// ─── Bank Statement Seed Types ───────────────────────────────────

interface StatementLineSeed {
  date: Date
  description: string
  reference: string | null
  amount: number
  balance: number
  reconciliationStatus: ReconciliationStatus
}

interface BankStatementSeed {
  startDate: Date
  endDate: Date
  openingBalance: number
  closingBalance: number
  lines: StatementLineSeed[]
}

/**
 * Build 4 quarterly bank statements per year = up to 8 total.
 *
 * Each statement's lines mirror the JEs affecting bank (1100):
 * - Salary out (LØN)
 * - Rent out (LEJE)
 * - Telecom out (TEL)
 * - 2x Sales in (BET-SALG)
 * - Insurance out (FOR) on quarter start
 * - VAT settlement out (MOMS) on quarter end
 *
 * Balance is tracked cumulatively. An adjustment line ensures
 * the closing balance matches the target trajectory.
 */
function buildBankStatements(): BankStatementSeed[] {
  const statements: BankStatementSeed[] = []

  // Target quarterly closing balances (computed from cash flow analysis)
  // Prev year: start 500K, grow ~77.75K/quarter → end ~811K
  // Cur year: start ~811K, grow ~77.75K/quarter → end ~1,122K
  const targetGrowth = 77750

  for (const year of [PREV_YEAR, CURRENT_YEAR]) {
    const isCurYear = year === CURRENT_YEAR
    const maxMonth = isCurYear ? CURRENT_MONTH : 12

    for (let q = 0; q < 4; q++) {
      const qStart = q * 3 + 1
      const qEnd = Math.min(q * 3 + 3, maxMonth)

      if (qStart > maxMonth) break
      // Only create statement for complete quarters or the current partial quarter
      const isPartialQuarter = qEnd < q * 3 + 3

      const startDate = d(year, qStart, 1)
      const endDate = d(year, qEnd, lastDayOfMonth(year, qEnd))

      // Opening balance: 500K for prev-year Q1, then previous quarter's close
      let openBal: number
      if (year === PREV_YEAR && q === 0) {
        openBal = OPENING_BALANCE
      } else if (year === PREV_YEAR) {
        openBal = OPENING_BALANCE + targetGrowth * q
      } else if (q === 0) {
        openBal = OPENING_BALANCE + targetGrowth * 4
      } else {
        openBal = OPENING_BALANCE + targetGrowth * 4 + targetGrowth * q
      }
      openBal = Math.round(openBal)

      // Target closing balance
      let closeTarget: number
      if (isPartialQuarter) {
        // Partial quarter: grow proportionally
        const monthsInQ = qEnd - qStart + 1
        closeTarget = openBal + Math.round(targetGrowth * monthsInQ / 3)
      } else {
        closeTarget = openBal + Math.round(targetGrowth)
      }
      closeTarget = Math.round(closeTarget)

      const lines: StatementLineSeed[] = []
      let balance = openBal

      for (let m = qStart; m <= qEnd; m++) {
        const mm = String(m).padStart(2, '0')
        const quarter = Math.ceil(m / 3)
        const items = REVENUE_MAP.get(`${year}-${m}`)
        if (!items) continue

        // Rent out (1st)
        const rentAmt = -gross25(RENT_NET)
        balance = Math.round(balance + rentAmt)
        lines.push({
          date: d(year, m, 1),
          description: `Husleje – Vesterbrogade 42`,
          reference: `LEJE-${year}-${mm}`,
          amount: rentAmt,
          balance,
          reconciliationStatus: 'MATCHED',
        })

        // Carried receivables payment (prev year Jan only)
        if (year === PREV_YEAR && m === 1 && q === 0) {
          balance = Math.round(balance + CARRIED_RECEIVABLES)
          lines.push({
            date: d(year, 1, 3),
            description: 'Kundebetaling – tilgodehavende foregående periode',
            reference: 'BET-REST-ÅBNING',
            amount: CARRIED_RECEIVABLES,
            balance,
            reconciliationStatus: 'MATCHED',
          })
        }

        // Telecom out (5th)
        const telAmt = -gross25(TELECOM_NET)
        balance = Math.round(balance + telAmt)
        lines.push({
          date: d(year, m, 5),
          description: 'Telefon og internet',
          reference: `TEL-${year}-${mm}`,
          amount: telAmt,
          balance,
          reconciliationStatus: 'MATCHED',
        })

        // 2x Sales in (payment of previous month's invoices)
        for (let i = 0; i < 2; i++) {
          // Revenue payments: month m receives payments for month m-1's invoices
          const prevMonth = m - 1
          const prevYear = prevMonth === 0 ? year - 1 : year
          const prevM = prevMonth === 0 ? 12 : prevMonth
          const prevItems = REVENUE_MAP.get(`${prevYear}-${prevM}`)
          if (!prevItems) continue

          // Skip CANCELLED
          if (prevYear === PREV_YEAR && prevM === 6 && i === 1) continue
          // For current year, only create payment lines for months that have passed
          if (prevYear === CURRENT_YEAR && prevM > CURRENT_MONTH - 1) continue

          const item = prevItems[i]
          const refNum = `BET-SALG-${prevYear}-${String(prevM).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
          const customer = CONTACT_DATA[item.customerIdx]
          const shortName = customer.name.split(' ')[0]

          balance = Math.round(balance + item.gross)
          lines.push({
            date: d(year, m, 5 + i * 10),
            description: `${shortName} – projektbetaling`,
            reference: refNum,
            amount: item.gross,
            balance,
            reconciliationStatus: 'MATCHED',
          })
        }

        // Insurance out (quarter start)
        if (m === 1 || m === 4 || m === 7 || m === 10) {
          balance = Math.round(balance - INSURANCE_Q)
          lines.push({
            date: d(year, m, 10),
            description: 'Nordisk Forsikring A/S – erhvervsforsikring',
            reference: `FOR-${year}-Q${quarter}`,
            amount: -INSURANCE_Q,
            balance,
            reconciliationStatus: 'MATCHED',
          })
        }

        // Salary out (25th)
        balance = Math.round(balance - SALARY_TOTAL)
        lines.push({
          date: d(year, m, 25),
          description: `Lønafregning ${MONTH_NAMES[m - 1]}`,
          reference: `LØN-${year}-${mm}`,
          amount: -SALARY_TOTAL,
          balance,
          reconciliationStatus: 'MATCHED',
        })

        // VAT settlement out (quarter end)
        if (m % 3 === 0) {
          const outputVat = calcQuarterlyOutputVat(year, quarter)
          const inputVat = calcQuarterlyInputVat(year, quarter)
          const netVat = r(outputVat - inputVat)

          balance = Math.round(balance - netVat)
          lines.push({
            date: d(year, m, lastDayOfMonth(year, m)),
            description: `Skattestyrelsen – Moms Q${quarter}`,
            reference: `MOMS-${year}-Q${quarter}`,
            amount: -netVat,
            balance,
            reconciliationStatus: 'MATCHED',
          })
        }
      }

      // Adjustment line to hit target closing balance
      const diff = closeTarget - Math.round(balance)
      if (Math.abs(diff) > 0) {
        lines.push({
          date: endDate,
          description: diff > 0 ? 'Renteindtægt – bankindestående' : 'Diverse bankomkostninger',
          reference: null,
          amount: diff,
          balance: closeTarget,
          reconciliationStatus: 'AI_SUGGESTED',
        })
      }

      statements.push({
        startDate,
        endDate,
        openingBalance: openBal,
        closingBalance: closeTarget,
        lines,
      })
    }
  }

  return statements
}

// ─── Budget Data ──────────────────────────────────────────────────

interface BudgetAccountEntry {
  accountNumber: string
  monthlyAmounts: number[] // Jan–Dec
}

function buildBudgets(): { year: number; entries: BudgetAccountEntry[]; name: string }[] {
  const baseRevenue = 160000 // 2 × ~80K avg per month

  return [PREV_YEAR, CURRENT_YEAR].map((year) => ({
    year,
    name: `Budget ${year} – Nordisk Erhverv ApS`,
    entries: [
      {
        accountNumber: '4100',
        monthlyAmounts: Array.from({ length: 12 }, (_, i) =>
          Math.round(baseRevenue * (0.85 + seededRandom(year * 10 + i) * 0.3) / 100) * 100
        ),
      },
      { accountNumber: '7000', monthlyAmounts: Array(12).fill(SALARY_GROSS) },
      { accountNumber: '7100', monthlyAmounts: Array(12).fill(SALARY_EMPLOYER) },
      { accountNumber: '7200', monthlyAmounts: Array(12).fill(SALARY_PENSION) },
      { accountNumber: '8000', monthlyAmounts: Array(12).fill(RENT_NET) },
      {
        accountNumber: '8400',
        monthlyAmounts: [INSURANCE_Q, 0, 0, INSURANCE_Q, 0, 0, INSURANCE_Q, 0, 0, INSURANCE_Q, 0, 0],
      },
      { accountNumber: '8600', monthlyAmounts: Array(12).fill(TELECOM_NET) },
      { accountNumber: '8700', monthlyAmounts: Array(12).fill(5000) },
      {
        accountNumber: '8800',
        monthlyAmounts: Array.from({ length: 12 }, () =>
          Math.round((3000 + seededRandom(year * 77) * 5000) / 100) * 100
        ),
      },
      {
        accountNumber: '8900',
        monthlyAmounts: [0, 0, DEPRECIATION_Q, 0, 0, DEPRECIATION_Q, 0, 0, DEPRECIATION_Q, 0, 0, DEPRECIATION_Q],
      },
      { accountNumber: '9000', monthlyAmounts: Array.from({ length: 12 }, (_, i) => i === 0 || i === 6 ? 2000 : 0) },
    ],
  }))
}

// ─── Main Seed Function ──────────────────────────────────────────

export async function seedDemoCompany(demoCompanyId: string, systemUserId: string): Promise<void> {
  // ─── Idempotency check ─────────────────────────────────────────
  const existingContacts = await db.contact.count({
    where: { companyId: demoCompanyId, isDemo: true },
  })
  if (existingContacts > 0) {
    console.log('[seed-demo-company] Demo data already exists for company', demoCompanyId, '– skipping')
    return
  }

  console.log('[seed-demo-company] Seeding demo data for company', demoCompanyId)

  // ─── 1. Chart of Accounts ──────────────────────────────────────
  const accountsCreated = await seedChartOfAccounts(systemUserId, demoCompanyId, true)
  console.log(`[seed-demo-company] Created ${accountsCreated} accounts`)

  // Build account number → ID map
  const accounts = await db.account.findMany({ where: { companyId: demoCompanyId, isDemo: true } })
  const accountMap = new Map<string, string>()
  for (const a of accounts) {
    accountMap.set(a.number, a.id)
  }
  const ac = (number: string): string => {
    const id = accountMap.get(number)
    if (!id) throw new Error(`Account ${number} not found in demo company`)
    return id
  }

  // ─── 2. Contacts ──────────────────────────────────────────────
  console.log('[seed-demo-company] Creating contacts...')
  const contactIds: string[] = []
  for (const c of CONTACT_DATA) {
    const contact = await db.contact.create({
      data: {
        name: c.name,
        cvrNumber: c.cvrNumber,
        email: c.email,
        phone: c.phone,
        address: c.address,
        city: c.city,
        postalCode: c.postalCode,
        country: 'Danmark',
        type: c.type,
        notes: c.notes,
        isActive: true,
        isDemo: true,
        userId: systemUserId,
        companyId: demoCompanyId,
      },
    })
    contactIds.push(contact.id)
  }
  console.log(`[seed-demo-company] Created ${contactIds.length} contacts`)

  // ─── 3. Invoices ──────────────────────────────────────────────
  console.log('[seed-demo-company] Creating invoices...')
  const invoiceSeeds = buildInvoices()
  const invoiceIds: string[] = []
  for (const inv of invoiceSeeds) {
    const subtotal = inv.lineItems.reduce((sum, li) => sum + r(li.quantity * li.unitPrice), 0)
    const vatTotal = inv.lineItems.reduce((sum, li) => sum + r(li.quantity * li.unitPrice * li.vatPercent / 100), 0)
    const total = r(subtotal + vatTotal)

    const contact = CONTACT_DATA[inv.contactIndex]

    const invoice = await db.invoice.create({
      data: {
        invoiceNumber: inv.invoiceNumber,
        customerName: contact.name,
        customerAddress: `${contact.address}, ${contact.postalCode} ${contact.city}`,
        customerEmail: contact.email,
        customerPhone: contact.phone,
        customerCvr: contact.cvrNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        lineItems: JSON.stringify(inv.lineItems),
        subtotal,
        vatTotal,
        total,
        currency: 'DKK',
        status: inv.status,
        cancelled: inv.cancelled ?? false,
        cancelReason: inv.cancelReason ?? null,
        contactId: contactIds[inv.contactIndex],
        isDemo: true,
        userId: systemUserId,
        companyId: demoCompanyId,
      },
    })
    invoiceIds.push(invoice.id)
  }
  console.log(`[seed-demo-company] Created ${invoiceIds.length} invoices`)

  // ─── 4. Transactions ──────────────────────────────────────────
  // Create transactions INDIVIDUALLY to get their IDs for TX- references on JEs.
  // PURCHASE transactions store NET amounts (matching live API convention).
  // SALE transactions are NOT stored in the DB — sales come from Invoice records,
  // and the client creates virtual transactions (inv- prefix) for display.
  console.log('[seed-demo-company] Creating transactions...')
  const transactionSeeds = buildTransactions()
  const txIdMap = new Map<string, string>()  // key → transaction.id

  for (const t of transactionSeeds) {
    const tx = await db.transaction.create({
      data: {
        date: t.date,
        type: t.type,
        amount: Math.abs(t.amount),
        currency: 'DKK',
        description: t.description,
        vatPercent: t.vatPercent,
        isDemo: true,
        userId: systemUserId,
        companyId: demoCompanyId,
        // invoiceId is NOT set for PURCHASE/SALARY/BANK transactions
        // (sales come from Invoice records, not DB transactions)
        invoiceId: null,
      },
    })
    txIdMap.set(t.key, tx.id)
  }
  console.log(`[seed-demo-company] Created ${txIdMap.size} transactions`)

  // ─── 4b. Build invoice number map for JE references ─────────
  // Maps revenueKey (e.g. "2024-1-0") → invoiceNumber (e.g. "NE-2024-0001")
  // This is used by buildJournalEntries() to set invoice-number references
  // on revenue JEs so that enrichInvoicesWithVAT() can find them.
  const invoiceNumberMap = new Map<string, string>()
  let _invSeqIdx = 0
  for (const year of [PREV_YEAR, CURRENT_YEAR]) {
    const maxMonth = year === CURRENT_YEAR ? CURRENT_MONTH : 12
    for (let m = 1; m <= maxMonth; m++) {
      for (let i = 0; i < 2; i++) {
        const invSeed = invoiceSeeds[_invSeqIdx]
        if (invSeed) {
          invoiceNumberMap.set(`${year}-${m}-${i}`, invSeed.invoiceNumber)
        }
        _invSeqIdx++
      }
    }
  }

  // ─── 5. Journal Entries ───────────────────────────────────────
  console.log('[seed-demo-company] Creating journal entries...')
  const jeSeeds = buildJournalEntries(txIdMap, invoiceNumberMap)

  // Validate ALL entries balance before creating
  for (let i = 0; i < jeSeeds.length; i++) {
    const je = jeSeeds[i]
    const totalDebit = je.lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = je.lines.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(
        `Journal entry #${i + 1} "${je.description}" is NOT balanced: debit=${totalDebit}, credit=${totalCredit}, diff=${r(totalDebit - totalCredit)}`
      )
    }
  }

  let jeCount = 0
  for (const je of jeSeeds) {
    await db.journalEntry.create({
      data: {
        date: je.date,
        description: je.description,
        reference: je.reference ?? null,
        status: je.status,
        cancelled: false,
        isDemo: true,
        userId: systemUserId,
        companyId: demoCompanyId,
        lines: {
          create: je.lines.map((l) => ({
            accountId: ac(l.accountNumber),
            debit: l.debit,
            credit: l.credit,
            vatCode: l.vatCode ?? null,
            description: l.description ?? null,
          })),
        },
      },
    })
    jeCount++
  }
  console.log(`[seed-demo-company] Created ${jeCount} journal entries`)

  // ─── 6. Fiscal Periods ────────────────────────────────────────
  console.log('[seed-demo-company] Creating fiscal periods...')
  const fiscalPeriodData: {
    year: number
    month: number
    status: PeriodStatus
    lockedAt: Date | null
    lockedBy: string | null
    isDemo: boolean
    userId: string
    companyId: string
  }[] = []

  for (const year of [PREV_YEAR, CURRENT_YEAR]) {
    const isCurYear = year === CURRENT_YEAR
    const maxMonth = isCurYear ? CURRENT_MONTH : 12

    for (let m = 1; m <= maxMonth; m++) {
      let status: PeriodStatus
      if (!isCurYear) {
        status = 'CLOSED'
      } else if (m < CURRENT_MONTH) {
        status = 'CLOSED'
      } else {
        status = 'OPEN'
      }

      fiscalPeriodData.push({
        year,
        month: m,
        status,
        lockedAt: status === 'CLOSED' ? d(year, m, lastDayOfMonth(year, m)) : null,
        lockedBy: status === 'CLOSED' ? systemUserId : null,
        isDemo: true,
        userId: systemUserId,
        companyId: demoCompanyId,
      })
    }
  }

  const fpResult = await db.fiscalPeriod.createMany({ data: fiscalPeriodData })
  console.log(`[seed-demo-company] Created ${fpResult.count} fiscal periods`)

  // ─── 7. Bank Connection ───────────────────────────────────────
  console.log('[seed-demo-company] Creating bank connection...')
  // Determine current bank balance from the latest bank statement target
  const latestBalance = Math.round(OPENING_BALANCE + 77750 * 4 + 77750 * Math.floor((CURRENT_MONTH - 1) / 3))

  const bankConnection = await db.bankConnection.create({
    data: {
      bankName: 'Nordea',
      provider: 'Nordigen',
      registrationNumber: '1234',
      accountNumber: '567890',
      iban: 'DK50 1234 5678 9012 3456',
      accountName: 'Nordisk Erhverv ApS – Erhvervskonto',
      currentBalance: latestBalance,
      lastSyncAt: NOW,
      nextSyncAt: addDays(NOW, 1),
      syncFrequency: 'daily',
      status: 'ACTIVE',
      isDemo: true,
      userId: systemUserId,
      companyId: demoCompanyId,
    },
  })
  console.log(`[seed-demo-company] Created bank connection: ${bankConnection.id}`)

  // ─── 8. Bank Statements ───────────────────────────────────────
  console.log('[seed-demo-company] Creating bank statements...')
  const statementSeeds = buildBankStatements()
  let stmtCount = 0
  let stmtLineCount = 0
  for (const ss of statementSeeds) {
    const stmt = await db.bankStatement.create({
      data: {
        bankAccount: '1234 567890',
        startDate: ss.startDate,
        endDate: ss.endDate,
        openingBalance: ss.openingBalance,
        closingBalance: ss.closingBalance,
        fileName: `Nordea_Kontoudskrift_${ss.startDate.toISOString().slice(0, 10)}_${ss.endDate.toISOString().slice(0, 10)}.csv`,
        importDate: new Date(Math.min(NOW.getTime(), ss.endDate.getTime() + 86400000)),
        importSource: 'CSV_UPLOAD',
        reconciled: ss.lines.every((l) => l.reconciliationStatus === 'MATCHED'),
        reconciledAt: ss.lines.every((l) => l.reconciliationStatus === 'MATCHED')
          ? new Date(Math.min(NOW.getTime(), ss.endDate.getTime() + 86400000))
          : null,
        isDemo: true,
        userId: systemUserId,
        companyId: demoCompanyId,
        bankConnectionId: bankConnection.id,
        lines: {
          create: ss.lines.map((l) => ({
            date: l.date,
            description: l.description,
            reference: l.reference,
            amount: l.amount,
            balance: l.balance,
            reconciliationStatus: l.reconciliationStatus,
            matchedAt: l.reconciliationStatus === 'MATCHED' ? l.date : null,
            matchConfidence: l.reconciliationStatus === 'AI_SUGGESTED' ? 0.92 : l.reconciliationStatus === 'MATCHED' ? 1.0 : null,
            matchMethod: l.reconciliationStatus === 'AI_SUGGESTED' ? 'AI' : l.reconciliationStatus === 'MATCHED' ? 'AUTO' : null,
          })),
        },
      },
    })
    stmtCount++
    stmtLineCount += ss.lines.length
  }
  console.log(`[seed-demo-company] Created ${stmtCount} bank statements with ${stmtLineCount} lines`)

  // ─── 9. Budgets ───────────────────────────────────────────────
  console.log('[seed-demo-company] Creating budgets...')
  const budgetData = buildBudgets()

  for (const bd of budgetData) {
    const budget = await db.budget.create({
      data: {
        name: bd.name,
        year: bd.year,
        notes: 'Årligt budget for IT-konsulentvirksomhed',
        isActive: true,
        isDemo: true,
        userId: systemUserId,
        companyId: demoCompanyId,
      },
    })

    const budgetEntryData = bd.entries.map((be) => ({
      budgetId: budget.id,
      accountId: ac(be.accountNumber),
      january: be.monthlyAmounts[0],
      february: be.monthlyAmounts[1],
      march: be.monthlyAmounts[2],
      april: be.monthlyAmounts[3],
      may: be.monthlyAmounts[4],
      june: be.monthlyAmounts[5],
      july: be.monthlyAmounts[6],
      august: be.monthlyAmounts[7],
      september: be.monthlyAmounts[8],
      october: be.monthlyAmounts[9],
      november: be.monthlyAmounts[10],
      december: be.monthlyAmounts[11],
    }))
    await db.budgetEntry.createMany({ data: budgetEntryData })
    console.log(`[seed-demo-company] Created budget ${bd.year} with ${budgetEntryData.length} account entries`)
  }

  // ─── 10. Recurring Entries ────────────────────────────────────
  console.log('[seed-demo-company] Creating recurring entries...')

  // 10a. Monthly rent
  await db.recurringEntry.create({
    data: {
      name: 'Månedlig husleje – Vesterbrogade 42',
      description: 'Husleje for kontorlokaler på Vesterbrogade 42, København V. Betaling den 1. i måneden.',
      frequency: 'MONTHLY',
      status: 'ACTIVE',
      startDate: d(PREV_YEAR, 1, 1),
      endDate: d(CURRENT_YEAR, 12, 31),
      nextExecution: d(CURRENT_YEAR, CURRENT_MONTH + 1 > 12 ? 1 : CURRENT_MONTH + 1, 1),
      lastExecuted: d(CURRENT_YEAR, CURRENT_MONTH, 1),
      lines: JSON.stringify([
        { accountNumber: '8000', debit: RENT_NET, credit: 0, vatCode: 'K25', description: 'Husleje ekskl. moms' },
        { accountNumber: '5410', debit: vat25(RENT_NET), credit: 0, vatCode: 'NONE', description: 'Indgående moms 25%' },
        { accountNumber: '1100', debit: 0, credit: gross25(RENT_NET), vatCode: 'NONE', description: 'Betaling fra bankkonto' },
      ]),
      reference: 'LEJE-REC',
      isDemo: true,
      userId: systemUserId,
      companyId: demoCompanyId,
    },
  })

  // 10b. Quarterly insurance
  await db.recurringEntry.create({
    data: {
      name: 'Kvartalsvis erhvervsforsikring – Nordisk Forsikring A/S',
      description: 'Erhvervsansvars- og indboforsikring. Betaling kvartalsvis den 10. i måneden.',
      frequency: 'QUARTERLY',
      status: 'ACTIVE',
      startDate: d(PREV_YEAR, 1, 10),
      endDate: d(CURRENT_YEAR, 12, 31),
      nextExecution: d(CURRENT_YEAR, Math.ceil(CURRENT_MONTH / 3) * 3 + 1 > 12 ? 1 : Math.ceil(CURRENT_MONTH / 3) * 3 + 1, 10),
      lastExecuted: d(CURRENT_YEAR, Math.max(1, Math.ceil(CURRENT_MONTH / 3) * 3 - 2), 10),
      lines: JSON.stringify([
        { accountNumber: '8400', debit: INSURANCE_Q, credit: 0, vatCode: 'K0', description: 'Forsikringspræmie (momsfri)' },
        { accountNumber: '1100', debit: 0, credit: INSURANCE_Q, vatCode: 'NONE', description: 'Betaling fra bankkonto' },
      ]),
      reference: 'FOR-REC',
      isDemo: true,
      userId: systemUserId,
      companyId: demoCompanyId,
    },
  })

  // 10c. Monthly telecom
  await db.recurringEntry.create({
    data: {
      name: 'Månedlig telefon og internet',
      description: 'Telefonabonnementer og internetforbindelse. Betaling den 5. i måneden.',
      frequency: 'MONTHLY',
      status: 'ACTIVE',
      startDate: d(PREV_YEAR, 1, 1),
      endDate: d(CURRENT_YEAR, 12, 31),
      nextExecution: d(CURRENT_YEAR, CURRENT_MONTH + 1 > 12 ? 1 : CURRENT_MONTH + 1, 5),
      lastExecuted: d(CURRENT_YEAR, CURRENT_MONTH, 5),
      lines: JSON.stringify([
        { accountNumber: '8600', debit: TELECOM_NET, credit: 0, vatCode: 'K25', description: 'Telefon og internet ekskl. moms' },
        { accountNumber: '5410', debit: vat25(TELECOM_NET), credit: 0, vatCode: 'NONE', description: 'Indgående moms 25%' },
        { accountNumber: '1100', debit: 0, credit: gross25(TELECOM_NET), vatCode: 'NONE', description: 'Betaling fra bankkonto' },
      ]),
      reference: 'TEL-REC',
      isDemo: true,
      userId: systemUserId,
      companyId: demoCompanyId,
    },
  })

  console.log('[seed-demo-company] Created 3 recurring entries')
  console.log('[seed-demo-company] ✅ Demo company seeding complete!')
}
