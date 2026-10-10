/**
 * One shape for the My Commission dashboard, from either source:
 *
 * - Live: the existing Salesforce calculation (AmwajCommissionService),
 *   unchanged. Remaining commission isn't shown because instalment receipts
 *   aren't recorded in Salesforce.
 * - Demo: calculated here from the sample dataset under the stated demo
 *   assumptions (DEMO_ASSUMPTIONS). Not Amwaj's approved policy.
 */
import type { Commission, SaleStatus } from '@/api/salesTypes';
import { DEMO_RATE_PCT, demoDataset } from './demo';

export type CommissionSource = 'live' | 'demo';

export interface CommissionViewLine {
  id: string;
  unitName?: string;
  projectId?: string;
  projectName?: string;
  customerId?: string;
  customerName?: string;
  saleStatus: SaleStatus;
  saleDate?: string;
  /** Null when not shared with the user (live). */
  saleValue: number | null;
  eligibleCollections: number;
  ratePct: number | null;
  commissionOnCollections: number;
  /** Rate × unpaid eligible balance; null when it can't be worked out (live). */
  potentialRemaining: number | null;
  /** Links for live lines. */
  eoiId?: string;
  eoiName?: string;
  reservationName?: string;
}

export interface CommissionView {
  source: CommissionSource;
  ratePct: number | null;
  currencyCode: string;
  lines: CommissionViewLine[];
}

export const DEMO_ASSUMPTIONS = [
  `Rate: ${DEMO_RATE_PCT}% of eligible collections.`,
  'Eligible base: property-price payments collected on completed (sold) units.',
  'Taxes and separate booking or admin fees are excluded.',
  'Processed refunds are deducted from eligible collections.',
  'One salesperson per sale; no commission splits.',
  'Potential remaining commission = rate × the unpaid property-price balance.',
];

export function liveCommissionView(c: Commission): CommissionView {
  return {
    source: 'live',
    ratePct: c.ratePct ?? null,
    currencyCode: c.currencyCode,
    // A released unit is listed only while confirmed money on it still earns commission.
    lines: c.lines
      .filter(l => l.saleStatus !== 'CLOSED' || l.commission > 0)
      .map(l => ({
        id: l.eoiId,
        unitName: l.unitName,
        projectId: l.projectId,
        projectName: l.projectName,
        customerId: l.customerId,
        customerName: l.customerName,
        saleStatus: l.saleStatus,
        saleDate: l.saleDate,
        saleValue: l.saleDetailsVisible ? (l.saleValue ?? null) : null,
        eligibleCollections: l.eligibleBasis,
        ratePct: c.ratePct ?? null,
        commissionOnCollections: l.commission,
        potentialRemaining: null,
        eoiId: l.eoiId,
        eoiName: l.eoiName,
        reservationName: l.reservationName,
      })),
  };
}

export function demoCommissionView(
  today: string,
  currencyCode: string
): CommissionView {
  const { units } = demoDataset(today);
  const rate = DEMO_RATE_PCT / 100;
  return {
    source: 'demo',
    ratePct: DEMO_RATE_PCT,
    currencyCode,
    lines: units
      .filter(u => u.detail.saleStatus !== 'CLOSED')
      .map(u => {
        const sold = u.detail.saleStatus === 'SOLD';
        const price = u.spec.price;
        // Completed sales only; the booking fee is never part of the base.
        const eligible = sold ? Math.max(0, u.netPropertyPaid) : 0;
        return {
          id: u.detail.key,
          unitName: u.spec.unit,
          projectId: u.spec.project,
          projectName: u.projectName,
          customerId: u.customerId,
          customerName: u.customerName,
          saleStatus: u.detail.saleStatus,
          saleDate: u.saleDate,
          saleValue: price,
          eligibleCollections: eligible,
          ratePct: DEMO_RATE_PCT,
          commissionOnCollections: round2(eligible * rate),
          potentialRemaining: round2(Math.max(0, price - eligible) * rate),
          eoiName: u.detail.eoi?.name,
          reservationName: u.detail.reservations[0]?.name,
        };
      }),
  };
}

export interface CommissionViewTotals {
  unitsSold: number;
  saleValue: number;
  eligibleCollections: number;
  onCollections: number;
  /** Null when any sold line has no remaining figure (live). */
  potentialRemaining: number | null;
  totalPotential: number | null;
  pipelineUnits: number;
  pipelineOnCollections: number;
  pipelinePotential: number | null;
}

export function commissionViewTotals(
  lines: CommissionViewLine[]
): CommissionViewTotals {
  const sold = lines.filter(l => l.saleStatus === 'SOLD');
  // Reserved and held units, plus released units that still carry commission (live).
  const pipeline = lines.filter(l => l.saleStatus !== 'SOLD');
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const remainingKnown = sold.every(l => l.potentialRemaining != null);
  const onCollections = sum(sold.map(l => l.commissionOnCollections));
  const potentialRemaining = remainingKnown
    ? sum(sold.map(l => l.potentialRemaining ?? 0))
    : null;
  const pipelineKnown = pipeline.every(l => l.potentialRemaining != null);
  return {
    unitsSold: sold.length,
    saleValue: sum(sold.map(l => l.saleValue ?? 0)),
    eligibleCollections: sum(sold.map(l => l.eligibleCollections)),
    onCollections,
    potentialRemaining,
    totalPotential:
      potentialRemaining == null
        ? null
        : round2(onCollections + potentialRemaining),
    pipelineUnits: pipeline.length,
    pipelineOnCollections: sum(pipeline.map(l => l.commissionOnCollections)),
    pipelinePotential: pipelineKnown
      ? sum(
          pipeline.map(
            l => l.commissionOnCollections + (l.potentialRemaining ?? 0)
          )
        )
      : null,
  };
}

export interface ViewFilter {
  projectId?: string;
  customerId?: string;
  search?: string;
}

export function filterViewLines(
  lines: CommissionViewLine[],
  f: ViewFilter
): CommissionViewLine[] {
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
          l.projectName,
        ].some(v => v?.toLowerCase().includes(term)))
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
