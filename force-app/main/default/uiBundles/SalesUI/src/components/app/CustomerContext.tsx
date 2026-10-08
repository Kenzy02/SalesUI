import { Link } from 'react-router';
import { UserRound, X } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import { useApi } from '@/hooks/useApi';

/**
 * The customer a rep is finding a unit for, carried in the URL (?dealId= or ?leadId=)
 * from Customers / My leads through Units and unit detail into the EOI form.
 */
export interface CustomerContextData {
  kind: 'deal' | 'lead';
  id: string;
  name: string;
  /** Recorded project interest (deal Project__c, or lead Project_Interest__c). */
  projectId?: string;
  projectName?: string;
  /** Unit type of the recorded interested unit; the org stores no other unit-type preference. */
  unitType?: string;
  interestedUnitName?: string;
  /**
   * Whether "Continue to booking" is offered. A deal must be open, without an EOI and
   * editable; a lead is converted inside the app on the way (it must be editable).
   */
  canStartEoi: boolean;
  /** For a lead that is already converted: its deal, so booking continues there. */
  convertedDealId?: string;
}

export function contextFromParams(params: URLSearchParams): { dealId?: string; leadId?: string } {
  return { dealId: params.get('dealId') ?? undefined, leadId: params.get('leadId') ?? undefined };
}

/** Query string carrying only the customer context (for links that start a new browse). */
export function contextQuery(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const k of ['dealId', 'leadId']) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function useCustomerContext(params: URLSearchParams) {
  const { dealId, leadId } = contextFromParams(params);
  return useApi<CustomerContextData | null>(async () => {
    if (dealId) {
      const d = await salesApi.deal(dealId);
      return {
        kind: 'deal',
        id: d.id,
        name: d.customerName ?? d.name ?? 'Customer',
        projectId: d.projectId,
        projectName: d.projectName,
        unitType: d.interestedUnitType,
        interestedUnitName: d.interestedUnitName,
        canStartEoi: !d.isClosed && !d.eoiCreated && d.canEdit,
      };
    }
    if (leadId) {
      const l = await salesApi.lead(leadId);
      return {
        kind: 'lead',
        id: l.id,
        name: l.name ?? 'Lead',
        projectId: l.projectInterestId,
        projectName: l.projectInterest,
        unitType: l.interestedUnitType,
        interestedUnitName: l.interestedUnit,
        canStartEoi: l.canEdit,
        convertedDealId: l.convertedDealId,
      };
    }
    return null;
  }, [dealId, leadId]);
}

export function CustomerContextBanner({
  context,
  error,
  onClear,
}: {
  context: CustomerContextData | null;
  error?: string | null;
  onClear: () => void;
}) {
  if (error) {
    return (
      <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span>The selected customer couldn't be loaded ({error}). You can still browse units.</span>
        <button type="button" onClick={onClear} className="font-medium underline">
          Browse without a customer
        </button>
      </div>
    );
  }
  if (!context) return null;
  const back = context.kind === 'deal' ? `/customers/${context.id}` : `/leads/${context.id}`;
  return (
    <div className="sticky top-[7.25rem] z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-navy/20 bg-brand-mist px-4 py-3 text-sm shadow-sm">
      <div className="flex min-w-0 items-start gap-2.5">
        <UserRound className="mt-0.5 size-4 shrink-0 text-brand-navy" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-semibold text-brand-navy">
            Finding a unit for{' '}
            <Link to={back} className="underline decoration-brand-steel/50 underline-offset-2 hover:decoration-brand-navy">
              {context.name}
            </Link>
            {context.kind === 'lead' && <span className="font-normal text-muted-foreground"> (lead)</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {context.projectName ? `Recorded interest: ${context.projectName}` : 'No project interest recorded'}
            {context.interestedUnitName
              ? ` · interested unit ${context.interestedUnitName}${context.unitType ? ` (${context.unitType})` : ''}`
              : ''}
            {context.kind === 'lead'
              ? context.convertedDealId
                ? ' · Already converted; booking continues on their deal.'
                : ' · Choose a unit and plan, then continue to booking to convert the lead here.'
              : ''}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-steel hover:bg-white hover:text-brand-navy focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-3.5" aria-hidden="true" /> Browse without customer
      </button>
    </div>
  );
}
