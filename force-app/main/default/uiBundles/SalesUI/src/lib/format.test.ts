import { describe, expect, it } from 'vitest';
import { area, date, daysUntil, initials, money, parseDate, percent, relativeDays } from './format';

describe('format', () => {
  it('formats money in the org currency', () => {
    expect(money(259200, 'USD')).toBe('$259,200');
    expect(money(686.88, 'USD', 2)).toBe('$686.88');
    expect(money(undefined, 'USD')).toBe('—');
  });

  it('reads Salesforce dates as local calendar days', () => {
    const d = parseDate('2026-10-08')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 8]);
    expect(date('2026-10-08')).toBe('8 Oct 2026');
    expect(date(undefined)).toBe('—');
  });

  it('counts days to a hold expiry', () => {
    expect(daysUntil('2026-10-08', '2026-10-05')).toBe(3);
    expect(daysUntil('2026-10-04', '2026-10-05')).toBe(-1);
    expect(relativeDays('2026-10-05', '2026-10-05')).toBe('today');
    expect(relativeDays('2026-10-19', '2026-10-05')).toBe('in 14 days');
    expect(relativeDays('2026-10-01', '2026-10-05')).toBe('4 days ago');
  });

  it('formats areas, percentages and initials', () => {
    expect(area(162)).toBe('162 m²');
    expect(percent(5)).toBe('5%');
    expect(initials('Xp1st Admin')).toBe('XA');
    expect(initials(undefined)).toBe('?');
  });
});
