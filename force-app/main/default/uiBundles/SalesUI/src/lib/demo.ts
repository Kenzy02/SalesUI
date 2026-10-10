/**
 * Demo mode: a fixed set of sample customers with payment schedules, built
 * entirely in the browser. Nothing here is read from or written to
 * Salesforce. Amounts are constant; due dates are relative to "today" so the
 * schedule always looks current. Every name and record number is marked as
 * sample data ("(Sample)", "DEMO-…").
 *
 * The same figures feed the customer cards, the customer overview and the
 * demo commission, so they reconcile everywhere.
 */
import type {
  CustomerCard,
  CustomerList,
  CustomerPortfolio,
  InstallmentCounts,
  NextPayment,
  PortfolioPayments,
  PortfolioUnitDetail,
  SaleStatus,
  ScheduleLine,
  UnitMoney,
} from '@/api/salesTypes';
import type { EoiDocumentData } from './eoiDocument';

/** Demo commission assumptions (not Amwaj policy). */
export const DEMO_RATE_PCT = 1;
export const DEMO_BOOKING_FEE_PCT = 1.5;

export const DEMO_PROJECTS = [
  { id: 'demo-p-gardens', name: 'The Gardenes', nameAr: 'الحدائق' },
  { id: 'demo-p-karbala', name: 'Karblaa Gate', nameAr: 'بوابة كربلاء' },
  { id: 'demo-p-lake', name: 'The Lake', nameAr: 'البحيرة' },
] as const;

type ProjectId = (typeof DEMO_PROJECTS)[number]['id'];
type Plan = 'CASH' | 'STANDARD';

interface UnitSpec {
  unit: string;
  project: ProjectId;
  building: string;
  floor: number;
  area: number;
  bedrooms: number;
  status: SaleStatus;
  /** Net sale value (list price less any approved discount). */
  price: number;
  plan: Plan;
  /** Days before today the EOI was created. */
  eoiDaysAgo: number;
  /** Days before today the reservation was created (reserved or sold units). */
  reservedDaysAgo?: number;
  /** Days before today the sale completed (sold units). */
  soldDaysAgo?: number;
  /** Property-price money received (before refunds). */
  received: number;
  /** Processed refunds of property-price payments. */
  propertyRefund?: number;
  /** Deposit paid but not yet confirmed by finance. */
  depositAwaiting?: boolean;
  /** The booking fee was refunded (released units). */
  feeRefunded?: boolean;
}

interface CustomerSpec {
  id: string;
  name: string;
  nameAr: string;
  mobile: string;
  email: string;
  units: UnitSpec[];
}

/** Down payment 20% at the start, then eight quarterly instalments of 10%. */
const STANDARD = [
  { label: 'Down payment', pct: 20, day: 0 },
  ...Array.from({ length: 8 }, (_, i) => ({
    label: `Instalment ${i + 1}`,
    pct: 10,
    day: 90 * (i + 1),
  })),
];
const CASH = [{ label: 'Full payment', pct: 100, day: 0 }];

const SPECS: CustomerSpec[] = [
  {
    id: 'demo-c1',
    name: 'Layla Kareem (Sample)',
    nameAr: 'ليلى كريم (عينة)',
    mobile: '+964 770 000 0101',
    email: 'layla.sample@example.com',
    units: [
      {
        unit: 'DEMO-G-1204',
        project: 'demo-p-gardens',
        building: 'G12',
        floor: 12,
        area: 165,
        bedrooms: 3,
        status: 'SOLD',
        price: 200000,
        plan: 'STANDARD',
        eoiDaysAgo: 232,
        reservedDaysAgo: 228,
        soldDaysAgo: 200,
        received: 50000,
      },
      {
        unit: 'DEMO-K-0305',
        project: 'demo-p-karbala',
        building: 'K3',
        floor: 3,
        area: 210,
        bedrooms: 4,
        status: 'RESERVED',
        price: 310000,
        plan: 'STANDARD',
        eoiDaysAgo: 9,
        reservedDaysAgo: 5,
        received: 62000,
      },
    ],
  },
  {
    id: 'demo-c2',
    name: 'Omar Al-Saadi (Sample)',
    nameAr: 'عمر الساعدي (عينة)',
    mobile: '+964 771 000 0202',
    email: 'omar.sample@example.com',
    units: [
      {
        unit: 'DEMO-L-0710',
        project: 'demo-p-lake',
        building: 'L7',
        floor: 7,
        area: 246,
        bedrooms: 3,
        status: 'SOLD',
        price: 418200,
        plan: 'STANDARD',
        eoiDaysAgo: 340,
        reservedDaysAgo: 334,
        soldDaysAgo: 300,
        received: 172280,
        propertyRefund: 5000,
      },
    ],
  },
  {
    id: 'demo-c3',
    name: 'Noor Hadi (Sample)',
    nameAr: 'نور هادي (عينة)',
    mobile: '+964 772 000 0303',
    email: 'noor.sample@example.com',
    units: [
      {
        unit: 'DEMO-G-0102',
        project: 'demo-p-gardens',
        building: 'G1',
        floor: 1,
        area: 120,
        bedrooms: 2,
        status: 'SOLD',
        price: 145000,
        plan: 'CASH',
        eoiDaysAgo: 75,
        reservedDaysAgo: 70,
        soldDaysAgo: 60,
        received: 145000,
      },
    ],
  },
  {
    id: 'demo-c4',
    name: 'Yusuf Jabbar (Sample)',
    nameAr: 'يوسف جبار (عينة)',
    mobile: '+964 773 000 0404',
    email: 'yusuf.sample@example.com',
    units: [
      {
        unit: 'DEMO-K-1101',
        project: 'demo-p-karbala',
        building: 'K11',
        floor: 11,
        area: 190,
        bedrooms: 3,
        status: 'EOI_HOLD',
        price: 275000,
        plan: 'STANDARD',
        eoiDaysAgo: 1,
        received: 0,
      },
    ],
  },
  {
    id: 'demo-c5',
    name: 'Sara Mahdi (Sample)',
    nameAr: 'سارة مهدي (عينة)',
    mobile: '+964 774 000 0505',
    email: 'sara.sample@example.com',
    units: [
      {
        unit: 'DEMO-L-0402',
        project: 'demo-p-lake',
        building: 'L4',
        floor: 4,
        area: 175,
        bedrooms: 3,
        status: 'SOLD',
        price: 260000,
        plan: 'STANDARD',
        eoiDaysAgo: 150,
        reservedDaysAgo: 146,
        soldDaysAgo: 120,
        received: 78000,
      },
      {
        unit: 'DEMO-L-0909',
        project: 'demo-p-lake',
        building: 'L9',
        floor: 9,
        area: 140,
        bedrooms: 2,
        status: 'CLOSED',
        price: 236000,
        plan: 'STANDARD',
        eoiDaysAgo: 45,
        received: 0,
        feeRefunded: true,
      },
    ],
  },
  {
    id: 'demo-c6',
    name: 'Ali Hussein (Sample)',
    nameAr: 'علي حسين (عينة)',
    mobile: '+964 775 000 0606',
    email: 'ali.sample@example.com',
    units: [
      {
        unit: 'DEMO-G-0811',
        project: 'demo-p-gardens',
        building: 'G8',
        floor: 8,
        area: 150,
        bedrooms: 2,
        status: 'RESERVED',
        price: 190000,
        plan: 'STANDARD',
        eoiDaysAgo: 3,
        reservedDaysAgo: 0,
        received: 0,
        depositAwaiting: true,
      },
    ],
  },
];

export interface DemoUnit {
  customerId: string;
  customerName: string;
  spec: UnitSpec;
  detail: PortfolioUnitDetail;
  /** Property-price money received less processed refunds (the demo commission base on sold units). */
  netPropertyPaid: number;
  bookingFee: number;
  saleDate?: string;
  projectName: string;
}

export interface DemoDataset {
  today: string;
  customers: CustomerPortfolio[];
  units: DemoUnit[];
}

const cache = new Map<string, DemoDataset>();

/** The demo dataset for a given day (memoised: identical across navigation and refresh). */
export function demoDataset(today: string): DemoDataset {
  let d = cache.get(today);
  if (!d) {
    d = build(today);
    cache.set(today, d);
  }
  return d;
}

function build(today: string): DemoDataset {
  const units: DemoUnit[] = [];
  let n = 0;
  const customers = SPECS.map(c => {
    const details = c.units.map(spec => {
      n += 1;
      const u = buildUnit(c, spec, n, today);
      units.push(u);
      return u.detail;
    });
    const payments = customerPayments(
      details,
      units.filter(u => u.customerId === c.id),
      today
    );
    const counts = {
      sold: details.filter(u => u.saleStatus === 'SOLD').length,
      reserved: details.filter(u => u.saleStatus === 'RESERVED').length,
      eoiHold: details.filter(u => u.saleStatus === 'EOI_HOLD').length,
      closed: details.filter(u => u.saleStatus === 'CLOSED').length,
      deals: details.length,
      myDeals: details.length,
    };
    const portfolio: CustomerPortfolio = {
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      email: c.email,
      counts,
      units: details,
      payments,
      flags: [],
      hiddenRecords: false,
      lastActivity: addDays(
        today,
        -Math.min(
          ...c.units.map(
            u => u.soldDaysAgo ?? u.reservedDaysAgo ?? u.eoiDaysAgo
          )
        )
      ),
      deals: details.map(u => u.deal!),
      paymentsReadable: true,
      truncated: false,
    };
    return portfolio;
  });
  return { today, customers, units };
}

function buildUnit(
  c: CustomerSpec,
  spec: UnitSpec,
  n: number,
  today: string
): DemoUnit {
  const project = DEMO_PROJECTS.find(p => p.id === spec.project)!;
  const num = String(n).padStart(4, '0');
  const bookingFee = round2((spec.price * DEMO_BOOKING_FEE_PCT) / 100);
  const committed = spec.status === 'SOLD' || spec.status === 'RESERVED';
  const startDay = spec.soldDaysAgo ?? spec.reservedDaysAgo;
  const netPropertyPaid = spec.depositAwaiting
    ? 0
    : spec.received - (spec.propertyRefund ?? 0);
  const schedule =
    committed && startDay != null
      ? buildSchedule(spec, addDays(today, -startDay), netPropertyPaid, today)
      : undefined;
  const firstInstalment =
    spec.plan === 'CASH' ? spec.price : round2(spec.price * 0.2);
  const feeRefund = spec.feeRefunded ? bookingFee : 0;
  const refunds = feeRefund + (spec.propertyRefund ?? 0);
  const money: UnitMoney = {
    bookingFee,
    bookingFeeConfirmed: true,
    bookingFeeConfirmedDate: addDays(
      today,
      -(spec.eoiDaysAgo - 1 > 0 ? spec.eoiDaysAgo - 1 : 0)
    ),
    confirmedBookingFee: bookingFee,
    pendingBookingFee: 0,
    confirmedDeposits: spec.depositAwaiting ? 0 : spec.received,
    confirmedTowardPrice: netPropertyPaid,
    pendingDeposits: spec.depositAwaiting ? firstInstalment : 0,
    excludedDeposits: 0,
    refunds,
    refundSource: refunds > 0 ? 'REFUND_REQUEST' : undefined,
    netConfirmed: round2(bookingFee - feeRefund + netPropertyPaid),
    price: committed ? spec.price : undefined,
    flags: [],
  };
  const dealId = `demo-deal-${num}`;
  const eoiId = `demo-eoi-${num}`;
  const saleDate =
    spec.soldDaysAgo != null ? addDays(today, -spec.soldDaysAgo) : undefined;
  const detail: PortfolioUnitDetail = {
    key: `demo-unit-${num}`,
    unitId: `demo-unit-${num}`,
    unitName: spec.unit,
    projectName: project.name,
    saleStatus: spec.status,
    eoiStatus: spec.status === 'CLOSED' ? 'Refunded' : 'Paid',
    reservationStatus:
      spec.status === 'SOLD'
        ? 'Active'
        : spec.status === 'RESERVED'
          ? spec.depositAwaiting
            ? 'Submitted'
            : 'PendingWithContracts'
          : undefined,
    netConfirmed: money.netConfirmed,
    price: committed ? spec.price : undefined,
    dealId,
    deal: {
      id: dealId,
      name: `Sample deal · ${c.name.replace(' (Sample)', '')} – ${project.name}`,
      stage:
        spec.status === 'SOLD'
          ? 'Closed Won'
          : spec.status === 'CLOSED'
            ? 'Closed Lost'
            : spec.status === 'RESERVED'
              ? 'Contracting'
              : 'EOI',
      isClosed: spec.status === 'SOLD' || spec.status === 'CLOSED',
      projectName: project.name,
      isMine: true,
    },
    eoi: {
      id: eoiId,
      name: `DEMO-EOI-${num}`,
      status: spec.status === 'CLOSED' ? 'Refunded' : 'Paid',
      approvalStatus: 'Draft',
      bookingFee,
      paymentVerified: true,
      paymentVerifiedDate: money.bookingFeeConfirmedDate,
      documentAttached: true,
      expiryDate: addDays(today, -spec.eoiDaysAgo + 3),
      offerPrice: spec.price,
      discountPct: 0,
      paymentMethod: spec.plan === 'CASH' ? 'Cash' : 'Installments',
      paymentPlanName:
        spec.plan === 'CASH' ? 'Sample cash plan' : 'Sample 20% + 8 quarterly',
      refundedAmount: feeRefund || undefined,
      refundedDate: feeRefund
        ? addDays(today, -spec.eoiDaysAgo + 10)
        : undefined,
    },
    reservations: committed
      ? [
          {
            id: `demo-res-${num}`,
            name: `DEMO-RES-${num}`,
            status:
              spec.status === 'SOLD'
                ? 'Active'
                : spec.depositAwaiting
                  ? 'Submitted'
                  : 'PendingWithContracts',
            holdExpiry:
              spec.status === 'RESERVED'
                ? addDays(today, -(spec.reservedDaysAgo ?? 0) + 14)
                : undefined,
            listPrice: spec.price,
            discountPct: 0,
            netPrice: spec.price,
            deposit: firstInstalment,
            depositVerified: !spec.depositAwaiting,
            depositVerifiedDate: spec.depositAwaiting
              ? undefined
              : addDays(today, -(spec.reservedDaysAgo ?? 0) + 1),
            saleDate,
            paymentPlanName:
              spec.plan === 'CASH'
                ? 'Sample cash plan'
                : 'Sample 20% + 8 quarterly',
          },
        ]
      : [],
    refunds: refunds
      ? [
          {
            id: `demo-ref-${num}`,
            name: `DEMO-REF-${num}`,
            status: 'Processed',
            approvedAmount: refunds,
            requestedAmount: refunds,
            processedDate: addDays(
              today,
              -Math.max(1, (spec.soldDaysAgo ?? spec.eoiDaysAgo) - 30)
            ),
          },
        ]
      : [],
    saleDate,
    paymentPlanName:
      spec.plan === 'CASH' ? 'Sample cash plan' : 'Sample 20% + 8 quarterly',
    money,
    schedule,
  };
  return {
    customerId: c.id,
    customerName: c.name,
    spec,
    detail,
    netPropertyPaid,
    bookingFee,
    saleDate,
    projectName: project.name,
  };
}

/** Applies the net amount received to the schedule in order and labels each line. */
export function buildSchedule(
  spec: Pick<UnitSpec, 'price' | 'plan'>,
  start: string,
  netPaid: number,
  today: string
): ScheduleLine[] {
  const plan = spec.plan === 'CASH' ? CASH : STANDARD;
  let left = netPaid;
  return plan.map((p, i) => {
    const amount = round2((spec.price * p.pct) / 100);
    const paid = round2(Math.min(amount, Math.max(0, left)));
    left = round2(left - paid);
    const dueDate = addDays(start, p.day);
    const status: ScheduleLine['status'] =
      paid >= amount
        ? 'PAID'
        : paid > 0
          ? 'PARTIAL'
          : dueDate < today
            ? 'OVERDUE'
            : 'UPCOMING';
    return {
      key: `${i}`,
      label: p.label,
      dueDate,
      amount,
      paid,
      paidDate: paid > 0 ? (dueDate <= today ? dueDate : today) : undefined,
      status,
    };
  });
}

function customerPayments(
  details: PortfolioUnitDetail[],
  units: DemoUnit[],
  today: string
): PortfolioPayments {
  const lines = details.flatMap(u => u.schedule ?? []);
  const committed = details.filter(
    u => u.saleStatus === 'SOLD' || u.saleStatus === 'RESERVED'
  );
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const installments: InstallmentCounts = {
    paid: lines.filter(l => l.status === 'PAID').length,
    partial: lines.filter(l => l.status === 'PARTIAL').length,
    overdue: lines.filter(l => l.status === 'OVERDUE').length,
    upcoming: lines.filter(l => l.status === 'UPCOMING').length,
  };
  const outstanding = details.flatMap(u =>
    (u.schedule ?? [])
      .filter(l => l.paid < l.amount)
      .map(l => ({ l, unit: u.unitName }))
  );
  const next = outstanding
    .filter(o => o.l.dueDate >= today)
    .sort((a, b) => a.l.dueDate.localeCompare(b.l.dueDate))[0];
  const nextPayment: NextPayment | null = next
    ? {
        dueDate: next.l.dueDate,
        amount: round2(next.l.amount - next.l.paid),
        label: `${next.l.label} · ${next.unit}`,
      }
    : null;
  const propertyPrice = committed.length
    ? sum(committed.map(u => u.price ?? 0))
    : null;
  const towardPrice = sum(
    committed.map(u => u.money?.confirmedTowardPrice ?? 0)
  );
  return {
    confirmedPaid: sum(details.map(u => u.money?.netConfirmed ?? 0)),
    confirmedBookingFees: sum(units.map(u => u.bookingFee)),
    confirmedDeposits: sum(details.map(u => u.money?.confirmedDeposits ?? 0)),
    refunds: sum(details.map(u => u.money?.refunds ?? 0)),
    pendingConfirmation: sum(details.map(u => u.money?.pendingDeposits ?? 0)),
    excludedDeposits: 0,
    propertyPrice,
    confirmedTowardPrice: towardPrice,
    remainingPayable:
      propertyPrice == null ? null : round2(propertyPrice - towardPrice),
    overdue: sum(
      lines.filter(l => l.dueDate < today).map(l => l.amount - l.paid)
    ),
    nextPayment,
    installmentsRecorded: true,
    installments,
  };
}

/** The customer list, filtered like the live endpoint (search on name and phone, project). */
export function demoCustomers(
  today: string,
  search?: string,
  projectId?: string
): CustomerList {
  const { customers } = demoDataset(today);
  const term = search?.trim().toLowerCase();
  const digits = term?.replace(/\D/g, '');
  const project = DEMO_PROJECTS.find(p => p.id === projectId);
  const matching = customers.filter(
    c =>
      (!term ||
        c.name?.toLowerCase().includes(term) ||
        (!!digits && phoneForms(c.mobile).some(f => f.includes(digits)))) &&
      (!project || c.units.some(u => u.projectName === project.name))
  );
  const cards: CustomerCard[] = matching.map(
    ({ deals: _deals, paymentsReadable: _r, truncated: _t, ...card }) => card
  );
  const sum = (f: (c: CustomerPortfolio) => number | null | undefined) =>
    round2(matching.reduce((a, c) => a + (f(c) ?? 0), 0));
  return {
    customers: cards,
    totals: {
      customers: matching.length,
      sold: matching.reduce((a, c) => a + c.counts.sold, 0),
      reserved: matching.reduce((a, c) => a + c.counts.reserved, 0),
      eoiHold: matching.reduce((a, c) => a + c.counts.eoiHold, 0),
      confirmedPaid: sum(c => c.payments.confirmedPaid),
      pendingConfirmation: sum(c => c.payments.pendingConfirmation),
      remainingPayable: sum(c => c.payments.remainingPayable),
      overdue: sum(c => c.payments.overdue),
    },
    truncated: false,
    paymentsReadable: true,
  };
}

/** +964 7xx… and the local 07xx… form, digits only. */
function phoneForms(phone: string | undefined): string[] {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.startsWith('964') ? [d, `0${d.slice(3)}`] : [d];
}

export function demoCustomer(
  today: string,
  id: string
): CustomerPortfolio | undefined {
  return demoDataset(today).customers.find(c => c.id === id);
}

export const isDemoId = (id: string | undefined) =>
  !!id && id.startsWith('demo-');

/** Sample EOI document data for a demo unit (always marked Demo / Sample, never saved). */
export function demoEoiDocument(
  today: string,
  customerId: string,
  unitKey: string
): EoiDocumentData | undefined {
  const ds = demoDataset(today);
  const unit = ds.units.find(
    u => u.customerId === customerId && u.detail.key === unitKey
  );
  const spec = SPECS.find(c => c.id === customerId);
  if (!unit || !spec) return undefined;
  const project = DEMO_PROJECTS.find(p => p.id === unit.spec.project)!;
  const e = unit.detail.eoi!;
  return {
    canSave: false,
    salesManagerName: 'Sample Sales Manager',
    eoi: {
      id: e.id,
      name: e.name,
      status: e.status,
      statusLabel: e.status,
      createdDate: addDays(today, -unit.spec.eoiDaysAgo),
      expiryDate: e.expiryDate,
      discountPct: 0,
      approvalStatus: 'Draft',
      bookingFee: unit.bookingFee,
      paymentVerified: true,
      paymentMethod: e.paymentMethod,
      paymentMethodLabel: e.paymentMethod,
      paymentPlanName: e.paymentPlanName,
      ownerName: 'Sample Sales Representative',
      unitName: unit.spec.unit,
      unitType: 'Apartment',
      unitTypeLabel: 'Apartment',
      floor: unit.spec.floor,
      area: unit.spec.area,
      bedrooms: unit.spec.bedrooms,
      listPrice: unit.spec.price,
      buildingName: unit.spec.building,
      projectName: project.name,
      projectNameAr: project.nameAr,
    },
    customer: {
      id: spec.id,
      name: spec.name,
      fullNameArabic: spec.nameAr,
      nationalId: `0000${spec.id.slice(-1)}0000000`.slice(0, 12),
      nationalIdDate: '2022-03-15',
      governorate: 'Baghdad',
      district: 'Sample district',
      neighborhood: '901',
      alley: '10',
      houseNumber: '5',
      mobile: spec.mobile,
      email: spec.email,
    },
  };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
