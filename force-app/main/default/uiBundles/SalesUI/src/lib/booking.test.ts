import { describe, expect, it } from 'vitest';
import { continueToBookingLink, eoiAfterConversionLink, planTotalDiffers, unitsQuery } from './booking';

const browsing = new URLSearchParams('leadId=00Q1&projectId=a0E1&unitType=Apartment&minBedrooms=2&ctx=1');

describe('booking journey links', () => {
  it('sends a lead to conversion with the unit, plan and filters', () => {
    expect(continueToBookingLink(browsing, { kind: 'lead', id: '00Q1' }, 'a0U1', 'a0A1')).toBe(
      '/leads/00Q1/convert?projectId=a0E1&unitType=Apartment&minBedrooms=2&ctx=1&unitId=a0U1&planId=a0A1'
    );
  });

  it('sends a deal straight to the EOI form', () => {
    const params = new URLSearchParams('dealId=0061&projectId=a0E1');
    expect(continueToBookingLink(params, { kind: 'deal', id: '0061' }, 'a0U1', 'a0A1')).toBe(
      '/eois/new?dealId=0061&projectId=a0E1&unitId=a0U1&planId=a0A1'
    );
  });

  it('replaces the lead with the converted deal and keeps the filters', () => {
    const afterConvert = new URLSearchParams('projectId=a0E1&unitType=Apartment&unitId=a0U1&planId=a0A1');
    expect(eoiAfterConversionLink(afterConvert, '0062')).toBe(
      '/eois/new?projectId=a0E1&unitType=Apartment&unitId=a0U1&planId=a0A1&dealId=0062&converted=1'
    );
  });

  it('drops journey keys when going back to the unit list', () => {
    expect(unitsQuery(new URLSearchParams('leadId=00Q1&projectId=a0E1&unitId=a0U1&planId=a0A1'))).toBe('?leadId=00Q1&projectId=a0E1');
  });
});

describe('planTotalDiffers', () => {
  it('flags a plan whose percentages total 100.01% (rounded thirds of 50%)', () => {
    expect(planTotalDiffers({ totalPercentage: 1.0001, totalAmount: 163216.32, effectivePrice: 163200 })).toBe(true);
  });

  it('ignores plans that add up exactly, launch-cheque plans and plans already warned about', () => {
    expect(planTotalDiffers({ totalPercentage: 1, totalAmount: 309600, effectivePrice: 309600 })).toBe(false);
    expect(planTotalDiffers({ totalPercentage: 0.9, totalAmount: 300000, effectivePrice: 309600, hasLaunchCheck: true })).toBe(false);
    expect(planTotalDiffers({ totalPercentage: 0.955, totalAmount: 1, effectivePrice: 2, totalsWarning: true })).toBe(false);
  });
});
