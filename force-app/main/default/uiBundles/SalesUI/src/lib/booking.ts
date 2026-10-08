/**
 * The lead-to-booking journey keeps everything the rep chose in the URL: the
 * customer (leadId or dealId), the unit, the payment plan, and the unit filters
 * they were browsing with. Each step builds the next link from the current
 * query, so "Back" always lands on the same unit list and nothing is re-entered.
 */

/** Query keys that belong to the journey itself (not to the unit filters). */
type JourneyKey = 'leadId' | 'dealId' | 'unitId' | 'planId' | 'converted';

/** A copy of the current query with journey values set (or removed when empty). */
export function journeyQuery(params: URLSearchParams, changes: Partial<Record<JourneyKey | 'ctx', string | null | undefined>>): string {
  const next = new URLSearchParams(params);
  for (const [k, v] of Object.entries(changes)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  const s = next.toString();
  return s ? `?${s}` : '';
}

/** The unit filters only (journey keys removed), for "Back to units". */
export function unitsQuery(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  for (const k of ['unitId', 'planId', 'converted']) next.delete(k);
  const s = next.toString();
  return s ? `?${s}` : '';
}

/**
 * Where "Continue to booking" goes: a lead is converted first (inside the app);
 * a deal, or no customer yet, goes straight to the EOI form.
 */
export function continueToBookingLink(
  params: URLSearchParams,
  customer: { kind: 'lead' | 'deal'; id: string } | null,
  unitId: string,
  planId: string | undefined
): string {
  if (customer?.kind === 'lead') {
    return `/leads/${customer.id}/convert${journeyQuery(params, { unitId, planId, leadId: null })}`;
  }
  return `/eois/new${journeyQuery(params, { unitId, planId, dealId: customer?.id ?? params.get('dealId') })}`;
}

/** After conversion: the EOI form for the new (or resolved) deal, with the same unit, plan and filters. */
export function eoiAfterConversionLink(params: URLSearchParams, dealId: string, unitId?: string | null): string {
  return `/eois/new${journeyQuery(params, { dealId, leadId: null, unitId: unitId ?? params.get('unitId'), converted: '1' })}`;
}

/**
 * True when a plan's instalment percentages don't add up to exactly 100%, so the
 * priced instalments differ from the list price by rounding in the plan data
 * (e.g. three payments stored as 16.67% = 100.01%). Plans with fixed-amount rows
 * (launch cheques) legitimately differ and are left out.
 */
export function planTotalDiffers(plan: { totalPercentage?: number; totalAmount?: number; effectivePrice?: number; hasLaunchCheck?: boolean; totalsWarning?: boolean }): boolean {
  if (plan.hasLaunchCheck || plan.totalsWarning) return false;
  if (plan.totalAmount == null || plan.effectivePrice == null || plan.totalPercentage == null) return false;
  return Math.abs(plan.totalAmount - plan.effectivePrice) >= 0.01 && Math.abs(plan.totalPercentage - 1) > 0;
}
