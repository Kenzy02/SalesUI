import { describe, expect, it } from 'vitest';
import type { Commission } from '@/api/salesTypes';
import {
  buildSchedule,
  demoCustomer,
  demoCustomers,
  demoDataset,
  demoEoiDocument,
} from './demo';
import {
  commissionViewTotals,
  demoCommissionView,
  filterViewLines,
  liveCommissionView,
} from './commissionView';

const TODAY = '2026-10-10';

describe('demo dataset', () => {
  it('is deterministic for a given day', () => {
    expect(JSON.stringify(demoCustomers(TODAY))).toBe(
      JSON.stringify(demoCustomers(TODAY))
    );
  });

  it('marks every customer and record as sample data', () => {
    for (const c of demoDataset(TODAY).customers) {
      expect(c.name).toMatch(/\(Sample\)$/);
      for (const u of c.units) {
        expect(u.unitName).toMatch(/^DEMO-/);
        expect(u.eoi?.name).toMatch(/^DEMO-EOI-/);
      }
    }
  });

  it('reconciles schedules, unit money and customer cards', () => {
    for (const c of demoDataset(TODAY).customers) {
      let towardPrice = 0;
      for (const u of c.units) {
        const schedule = u.schedule ?? [];
        const paid = schedule.reduce((a, l) => a + l.paid, 0);
        if (schedule.length) {
          expect(Math.round(paid * 100) / 100).toBe(
            u.money!.confirmedTowardPrice
          );
          expect(schedule.reduce((a, l) => a + l.amount, 0)).toBeCloseTo(
            u.price!,
            2
          );
        }
        if (u.saleStatus === 'SOLD' || u.saleStatus === 'RESERVED')
          towardPrice += u.money!.confirmedTowardPrice;
      }
      const p = c.payments;
      expect(p.confirmedPaid).toBeCloseTo(
        c.units.reduce((a, u) => a + u.money!.netConfirmed, 0),
        2
      );
      if (p.propertyPrice != null)
        expect(p.remainingPayable).toBeCloseTo(
          p.propertyPrice - towardPrice,
          2
        );
    }
    const list = demoCustomers(TODAY);
    expect(list.totals.confirmedPaid).toBeCloseTo(
      list.customers.reduce((a, c) => a + (c.payments.confirmedPaid ?? 0), 0),
      2
    );
  });

  it('labels instalments: paid, part paid, overdue, upcoming', () => {
    const lines = buildSchedule(
      { price: 200000, plan: 'STANDARD' },
      '2026-03-24',
      50000,
      TODAY
    );
    expect(lines.slice(0, 4).map(l => l.status)).toEqual([
      'PAID',
      'PARTIAL',
      'OVERDUE',
      'UPCOMING',
    ]);
    expect(lines[1].paid).toBe(10000);
  });

  it('filters by search, phone digits and project', () => {
    expect(demoCustomers(TODAY, 'layla').customers.map(c => c.id)).toEqual([
      'demo-c1',
    ]);
    expect(demoCustomers(TODAY, '0771').customers.map(c => c.id)).toEqual([
      'demo-c2',
    ]);
    const lake = demoCustomers(TODAY, undefined, 'demo-p-lake');
    expect(lake.customers.map(c => c.id).sort()).toEqual([
      'demo-c2',
      'demo-c5',
    ]);
    expect(lake.totals.sold).toBe(2);
  });

  it('builds a sample EOI document that can never be saved', () => {
    const c = demoCustomer(TODAY, 'demo-c1')!;
    const doc = demoEoiDocument(TODAY, 'demo-c1', c.units[0].key)!;
    expect(doc.canSave).toBe(false);
    expect(doc.eoi.name).toMatch(/^DEMO-EOI-/);
  });
});

describe('demo commission (stated assumptions)', () => {
  const view = demoCommissionView(TODAY, 'USD');

  it('matches the brief: $200,000 sale with $50,000 collected', () => {
    const l = view.lines.find(x => x.unitName === 'DEMO-G-1204')!;
    expect(l.eligibleCollections).toBe(50000);
    expect(l.commissionOnCollections).toBe(500);
    expect(l.potentialRemaining).toBe(1500);
    expect(l.commissionOnCollections + l.potentialRemaining!).toBe(2000);
  });

  it('excludes the booking fee and deducts processed refunds', () => {
    const omar = view.lines.find(x => x.unitName === 'DEMO-L-0710')!;
    expect(omar.eligibleCollections).toBe(172280 - 5000);
    expect(omar.commissionOnCollections).toBe(1672.8);
  });

  it('keeps reserved and held units out of the sold totals', () => {
    const t = commissionViewTotals(view.lines);
    const sold = view.lines.filter(l => l.saleStatus === 'SOLD');
    expect(t.unitsSold).toBe(4);
    expect(t.onCollections).toBeCloseTo(
      sold.reduce((a, l) => a + l.commissionOnCollections, 0),
      2
    );
    expect(t.totalPotential).toBeCloseTo(
      sold.reduce((a, l) => a + (l.saleValue ?? 0), 0) * 0.01,
      2
    );
    expect(t.pipelineUnits).toBe(3);
    expect(t.pipelineOnCollections).toBe(0);
    expect(t.pipelinePotential).toBeCloseTo(
      (310000 + 275000 + 190000) * 0.01,
      2
    );
  });

  it('a fully paid sale has no remaining commission', () => {
    expect(
      view.lines.find(x => x.unitName === 'DEMO-G-0102')!.potentialRemaining
    ).toBe(0);
  });

  it('filters lines and totals together', () => {
    const lake = filterViewLines(view.lines, { projectId: 'demo-p-lake' });
    expect(commissionViewTotals(lake).unitsSold).toBe(2);
    expect(
      filterViewLines(view.lines, { search: 'noor' }).map(l => l.unitName)
    ).toEqual(['DEMO-G-0102']);
  });
});

describe('live commission view', () => {
  it('lists a released unit only while it still carries commission', () => {
    const live = liveCommissionView({
      ratePct: 1,
      currencyCode: 'USD',
      lines: [
        {
          eoiId: 'a',
          saleStatus: 'CLOSED',
          saleDetailsVisible: true,
          eligibleBasis: 1393,
          commission: 13.93,
        },
        {
          eoiId: 'b',
          saleStatus: 'CLOSED',
          saleDetailsVisible: true,
          eligibleBasis: 0,
          commission: 0,
        },
      ],
    } as unknown as Commission);
    expect(live.lines.map(l => l.id)).toEqual(['a']);
    expect(commissionViewTotals(live.lines).unitsSold).toBe(0);
    expect(commissionViewTotals(live.lines).pipelineOnCollections).toBe(13.93);
  });

  it('keeps the Salesforce figures and shows no remaining commission', () => {
    const live = liveCommissionView({
      ratePct: 1,
      currencyCode: 'USD',
      lines: [
        {
          eoiId: 'e1',
          saleStatus: 'SOLD',
          saleValue: 418200,
          saleDetailsVisible: true,
          eligibleBasis: 110823,
          commission: 1108.23,
        },
        {
          eoiId: 'e2',
          saleStatus: 'RESERVED',
          saleDetailsVisible: true,
          eligibleBasis: 4644,
          commission: 46.44,
        },
      ],
    } as unknown as Commission);
    const t = commissionViewTotals(live.lines);
    expect(t.onCollections).toBe(1108.23);
    expect(t.potentialRemaining).toBeNull();
    expect(t.totalPotential).toBeNull();
    expect(t.pipelineOnCollections).toBe(46.44);
  });
});
