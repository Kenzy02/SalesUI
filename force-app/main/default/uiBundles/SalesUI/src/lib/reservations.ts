/**
 * Filters for the reservations list. Statuses are the org's Reservation__c
 * picklist values: Submitted (on hold) → PendingWithContracts (deposit
 * confirmed) → Active (sold); Cancelled / Terminated end it.
 */
import type { ReservationListRow } from '@/api/salesTypes';

export type ReservationFilter = 'live' | 'deposit' | 'sold' | 'closed' | 'all';

const LIVE = new Set(['Submitted', 'PendingWithContracts']);
const CLOSED = new Set(['Cancelled', 'Terminated']);

export const isLiveReservation = (r: ReservationListRow) =>
  LIVE.has(r.status ?? '');

export const RESERVATION_FILTERS: {
  value: ReservationFilter;
  label: string;
  match: (r: ReservationListRow) => boolean;
}[] = [
  { value: 'live', label: 'Live', match: isLiveReservation },
  {
    value: 'deposit',
    label: 'Deposit awaiting finance',
    match: r => isLiveReservation(r) && r.depositVerified === false,
  },
  { value: 'sold', label: 'Sold', match: r => r.status === 'Active' },
  {
    value: 'closed',
    label: 'Cancelled',
    match: r => CLOSED.has(r.status ?? ''),
  },
  { value: 'all', label: 'All', match: () => true },
];

/** Case-insensitive match on customer, unit, project, reservation, EOI or deal. */
export function matchesReservationSearch(
  r: ReservationListRow,
  term: string
): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return [
    r.customerName,
    r.unitName,
    r.projectName,
    r.name,
    r.eoiName,
    r.dealName,
  ].some(v => v?.toLowerCase().includes(t));
}
