import { describe, expect, it } from 'vitest';
import type { ReservationListRow } from '@/api/salesTypes';
import { RESERVATION_FILTERS, matchesReservationSearch } from './reservations';

const rows: ReservationListRow[] = [
  {
    id: '1',
    name: 'RES-1',
    status: 'Submitted',
    depositVerified: false,
    customerName: 'Hassan Ali',
    unitName: 'A106',
  },
  {
    id: '2',
    name: 'RES-2',
    status: 'PendingWithContracts',
    depositVerified: true,
    unitName: 'A107',
  },
  {
    id: '3',
    name: 'RES-3',
    status: 'Active',
    depositVerified: true,
    unitName: 'A105',
  },
  { id: '4', name: 'RES-4', status: 'Cancelled', depositVerified: false },
  { id: '5', name: 'RES-5', status: 'Terminated' },
];

const ids = (filter: string) =>
  rows
    .filter(RESERVATION_FILTERS.find(f => f.value === filter)!.match)
    .map(r => r.id);

describe('reservation filters', () => {
  it('splits live, sold and cancelled reservations', () => {
    expect(ids('live')).toEqual(['1', '2']);
    expect(ids('sold')).toEqual(['3']);
    expect(ids('closed')).toEqual(['4', '5']);
    expect(ids('all')).toHaveLength(5);
  });

  it('only flags unconfirmed deposits on live reservations', () => {
    expect(ids('deposit')).toEqual(['1']);
  });

  it('searches customer, unit and record numbers', () => {
    expect(
      rows.filter(r => matchesReservationSearch(r, 'hassan')).map(r => r.id)
    ).toEqual(['1']);
    expect(
      rows.filter(r => matchesReservationSearch(r, 'a10')).map(r => r.id)
    ).toEqual(['1', '2', '3']);
    expect(rows.filter(r => matchesReservationSearch(r, '  ')).length).toBe(5);
  });
});
