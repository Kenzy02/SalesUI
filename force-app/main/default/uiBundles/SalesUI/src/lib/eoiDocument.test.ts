import { describe, expect, it } from 'vitest';
import { eoiFileName, eoiPricing } from './eoiDocument';

const base = { id: 'a', listPrice: 200000, bookingFee: 3000 };

describe('eoiPricing', () => {
  it('uses the list price when there is no discount', () => {
    expect(eoiPricing(base)).toEqual({
      listPrice: 200000,
      discount: { kind: 'none' },
      netPrice: 200000,
      bookingFee: 3000,
    });
  });

  it('deducts an approved discount only', () => {
    const p = eoiPricing({
      ...base,
      discountPct: 2,
      approvalStatus: 'Approved',
    });
    expect(p.discount).toEqual({ kind: 'approved', pct: 2, amount: 4000 });
    expect(p.netPrice).toBe(196000);
  });

  it('never treats a requested or rejected discount as a commitment', () => {
    for (const approvalStatus of ['Submitted', 'Draft', undefined]) {
      const p = eoiPricing({ ...base, discountPct: 3, approvalStatus });
      expect(p.discount.kind).toBe('pending');
      expect(p.netPrice).toBe(200000);
    }
    expect(
      eoiPricing({ ...base, discountPct: 3, approvalStatus: 'Rejected' })
        .netPrice
    ).toBe(200000);
  });

  it('defers to the reservation when the discount is approved there', () => {
    const p = eoiPricing({
      ...base,
      discountPct: 3,
      approvalStatus: 'Approved',
      discountOnReservation: true,
    });
    expect(p.discount.kind).toBe('onReservation');
    expect(p.netPrice).toBe(200000);
  });

  it('leaves prices empty when not recorded', () => {
    expect(eoiPricing({ id: 'b' })).toEqual({
      listPrice: undefined,
      discount: { kind: 'none' },
      netPrice: undefined,
      bookingFee: undefined,
    });
  });
});

describe('eoiFileName', () => {
  it('names the file after the EOI number', () => {
    expect(eoiFileName('EOI-00000105')).toBe('Amwaj-EOI-00000105.pdf');
    expect(eoiFileName('EOI 7/x', true)).toBe('Amwaj-EOI-EOI-7-x-DEMO.pdf');
    expect(eoiFileName(undefined)).toBe('Amwaj-EOI-EOI.pdf');
  });
});
