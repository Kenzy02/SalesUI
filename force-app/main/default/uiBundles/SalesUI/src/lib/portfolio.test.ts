import { describe, expect, it } from 'vitest';
import type { CommissionLine } from '@/api/salesTypes';
import { amount } from './format';
import {
  commissionTotals,
  filterCommissionLines,
  optionsFrom,
  previewUnits,
  unitStatusDetail,
} from './portfolio';

function line(over: Partial<CommissionLine>): CommissionLine {
  return {
    eoiId: 'e',
    signed: true,
    saleStatus: 'SOLD',
    saleDetailsVisible: true,
    excludedDeposits: 0,
    propertyPayments: 0,
    bookingFees: 0,
    tax: 0,
    refunds: 0,
    unconfirmedBookingFees: 0,
    unconfirmedPropertyPayments: 0,
    netCollected: 0,
    eligibleBasis: 0,
    commission: 0,
    state: 'ELIGIBLE',
    ...over,
  };
}

describe('unit status wording', () => {
  it('never describes a held or reserved unit as owned', () => {
    expect(
      unitStatusDetail({
        saleStatus: 'RESERVED',
        reservationStatus: 'Submitted',
      })
    ).toBe('Deposit awaiting finance');
    expect(
      unitStatusDetail({
        saleStatus: 'RESERVED',
        reservationStatus: 'PendingWithContracts',
      })
    ).toBe('Deposit confirmed · with contracts');
    expect(
      unitStatusDetail({ saleStatus: 'EOI_HOLD', eoiStatus: 'Submitted' })
    ).toBe('Booking fee awaiting finance');
    expect(
      unitStatusDetail({ saleStatus: 'EOI_HOLD', eoiStatus: 'Paid' })
    ).toBe('Booking fee confirmed · not yet reserved');
  });

  it('explains why a unit was released', () => {
    expect(
      unitStatusDetail({
        saleStatus: 'CLOSED',
        eoiStatus: 'Paid',
        reservationStatus: 'Cancelled',
      })
    ).toBe('Reservation cancelled');
    expect(
      unitStatusDetail({ saleStatus: 'CLOSED', eoiStatus: 'Expired' })
    ).toBe('EOI expired');
    expect(
      unitStatusDetail({ saleStatus: 'CLOSED', eoiStatus: 'Refunded' })
    ).toBe('EOI refunded');
  });
});

describe('card unit preview', () => {
  it('shows a few units and counts the rest', () => {
    expect(previewUnits([1, 2, 3, 4, 5])).toEqual({
      shown: [1, 2, 3],
      more: 2,
    });
    expect(previewUnits([1])).toEqual({ shown: [1], more: 0 });
  });
});

describe('commission totals', () => {
  const lines = [
    line({
      eoiId: '1',
      projectId: 'p1',
      customerId: 'c1',
      unitName: 'A1',
      saleValue: 300000,
      eligibleBasis: 60000,
      commission: 600,
    }),
    line({
      eoiId: '2',
      projectId: 'p2',
      customerId: 'c2',
      unitName: 'B7',
      saleValue: undefined,
      eligibleBasis: 0,
      commission: 0,
      state: 'NO_CONFIRMED_COLLECTIONS',
    }),
    line({
      eoiId: '3',
      projectId: 'p1',
      customerId: 'c2',
      unitName: 'A9',
      saleStatus: 'RESERVED',
      eligibleBasis: 4500,
      commission: 45,
    }),
  ];

  it('is commission on confirmed collections, kept apart from units not yet sold', () => {
    const t = commissionTotals(lines);
    expect(t.soldUnits).toBe(2);
    expect(t.soldEligible).toBe(60000);
    expect(t.soldCommission).toBe(600);
    expect(t.saleValue).toBe(300000);
    expect(t.saleValueMissing).toBe(1);
    expect(t.notSoldCommission).toBe(45);
  });

  it('filters by project, customer and unit text', () => {
    expect(
      filterCommissionLines(lines, { projectId: 'p1' }).map(l => l.eoiId)
    ).toEqual(['1', '3']);
    expect(
      filterCommissionLines(lines, { customerId: 'c2' }).map(l => l.eoiId)
    ).toEqual(['2', '3']);
    expect(
      filterCommissionLines(lines, { search: 'b7' }).map(l => l.eoiId)
    ).toEqual(['2']);
    expect(
      commissionTotals(filterCommissionLines(lines, { customerId: 'c2' }))
        .soldCommission
    ).toBe(0);
  });

  it('builds sorted, distinct filter options', () => {
    expect(
      optionsFrom(
        lines,
        l => l.customerId,
        l => (l.customerId === 'c1' ? 'Zaid' : 'Ali')
      )
    ).toEqual([
      { value: 'c2', label: 'Ali' },
      { value: 'c1', label: 'Zaid' },
    ]);
  });
});

describe('amount', () => {
  it('shows cents only when there are any', () => {
    expect(amount(2448, 'USD')).toBe('$2,448');
    expect(amount(27205.44, 'USD')).toBe('$27,205.44');
    expect(amount(null, 'USD')).toBe('—');
  });
});
