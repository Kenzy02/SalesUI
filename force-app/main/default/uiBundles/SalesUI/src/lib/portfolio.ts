/**
 * Display helpers for customer portfolios and commission lines. Amounts are
 * reconciled in Salesforce (AmwajPaymentLedger); this module only labels,
 * orders and filters them.
 */
import type {
  CommissionLine,
  PortfolioUnit,
  SaleStatus,
} from '@/api/salesTypes';
import type { Tone } from './salesLabels';

export const SALE_STATUS: Record<
  SaleStatus,
  { label: string; tone: Tone; plural: string }
> = {
  SOLD: { label: 'Sold', tone: 'success', plural: 'sold' },
  RESERVED: { label: 'Reserved', tone: 'info', plural: 'reserved' },
  EOI_HOLD: { label: 'Held by EOI', tone: 'warning', plural: 'held by EOI' },
  CLOSED: { label: 'Released', tone: 'neutral', plural: 'released' },
};

/** What the unit is waiting for, in the org's process. Never implies a held or reserved unit is owned. */
export function unitStatusDetail(
  u: Pick<PortfolioUnit, 'saleStatus' | 'eoiStatus' | 'reservationStatus'>
): string {
  switch (u.saleStatus) {
    case 'SOLD':
      return 'Reservation active';
    case 'RESERVED':
      return u.reservationStatus === 'PendingWithContracts'
        ? 'Deposit confirmed · with contracts'
        : 'Deposit awaiting finance';
    case 'EOI_HOLD':
      return u.eoiStatus === 'Paid'
        ? 'Booking fee confirmed · not yet reserved'
        : 'Booking fee awaiting finance';
    default:
      if (u.reservationStatus === 'Cancelled') return 'Reservation cancelled';
      if (u.reservationStatus === 'Terminated') return 'Reservation terminated';
      if (u.eoiStatus === 'Refunded') return 'EOI refunded';
      if (u.eoiStatus === 'Expired') return 'EOI expired';
      return 'No longer held';
  }
}

export type CountKey = 'sold' | 'reserved' | 'eoiHold';

export const COUNT_ORDER: { key: CountKey; status: SaleStatus }[] = [
  { key: 'sold', status: 'SOLD' },
  { key: 'reserved', status: 'RESERVED' },
  { key: 'eoiHold', status: 'EOI_HOLD' },
];

/** The first few units for a card, plus how many more there are. */
export function previewUnits<T>(
  units: T[],
  max = 3
): { shown: T[]; more: number } {
  return { shown: units.slice(0, max), more: Math.max(0, units.length - max) };
}

export interface CommissionFilter {
  projectId?: string;
  customerId?: string;
  search?: string;
}

export function filterCommissionLines(
  lines: CommissionLine[],
  f: CommissionFilter
): CommissionLine[] {
  const term = f.search?.trim().toLowerCase();
  return lines.filter(
    l =>
      (!f.projectId || l.projectId === f.projectId) &&
      (!f.customerId || l.customerId === f.customerId) &&
      (!term ||
        [
          l.unitName,
          l.customerName,
          l.eoiName,
          l.reservationName,
          l.dealName,
        ].some(v => v?.toLowerCase().includes(term)))
  );
}

export interface CommissionTotals {
  soldUnits: number;
  saleValue: number;
  /** Sold units whose sale value isn't shared with the user (excluded from saleValue). */
  saleValueMissing: number;
  soldEligible: number;
  soldCommission: number;
  notSoldEligible: number;
  notSoldCommission: number;
}

/** Totals over the given lines; commission is summed from the server's per-line (rounded) amounts. */
export function commissionTotals(lines: CommissionLine[]): CommissionTotals {
  const t: CommissionTotals = {
    soldUnits: 0,
    saleValue: 0,
    saleValueMissing: 0,
    soldEligible: 0,
    soldCommission: 0,
    notSoldEligible: 0,
    notSoldCommission: 0,
  };
  for (const l of lines) {
    if (l.saleStatus === 'SOLD') {
      t.soldUnits += 1;
      if (l.saleValue == null) t.saleValueMissing += 1;
      else t.saleValue += l.saleValue;
      t.soldEligible += l.eligibleBasis;
      t.soldCommission += l.commission;
    } else {
      t.notSoldEligible += l.eligibleBasis;
      t.notSoldCommission += l.commission;
    }
  }
  t.soldCommission = round2(t.soldCommission);
  t.notSoldCommission = round2(t.notSoldCommission);
  return t;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Distinct {id, name} options from lines, sorted by name. */
export function optionsFrom<T>(
  items: T[],
  id: (t: T) => string | undefined,
  name: (t: T) => string | undefined
) {
  const seen = new Map<string, string>();
  for (const it of items) {
    const k = id(it);
    if (k && !seen.has(k)) seen.set(k, name(it) ?? k);
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
