import { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { Plan } from '@/api/salesTypes';
import { StatusPill } from '@/components/app/Primitives';
import { money } from '@/lib/format';
import { FREQUENCY, INSTALLMENT_TYPE } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

const pct = (fraction?: number) => (fraction == null ? '—' : `${(fraction * 100).toFixed(fraction * 100 % 1 === 0 ? 0 : 2)}%`);

/**
 * Payment plans exactly as PaymentPlanViewerController prices them (the logic
 * behind the org's amwajPaymentPlanViewer component). Nothing is recalculated here.
 */
export function PaymentPlanList({
  plans,
  currency,
  selectable,
  selectedId,
  onSelect,
}: {
  plans: Plan[];
  currency: string;
  selectable?: boolean;
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(plans.length === 1 ? plans[0].id : null);
  return (
    <ul className="space-y-3" role={selectable ? 'radiogroup' : undefined} aria-label={selectable ? 'Payment plan' : undefined}>
      {plans.map(plan => {
        const expanded = open === plan.id;
        const selected = selectedId === plan.id;
        const disabled = plan.isMisconfigured;
        return (
          <li
            key={plan.id}
            className={cn(
              'rounded-lg border bg-white transition-colors',
              selected ? 'border-brand-navy ring-2 ring-brand-navy/15' : 'border-border'
            )}
          >
            <div className="flex items-start gap-3 p-3">
              {selectable && (
                <input
                  type="radio"
                  name="payment-plan"
                  className="mt-1 size-4 accent-[#1f2a5c]"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onSelect?.(plan.id)}
                  aria-label={plan.name}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-brand-navy">{plan.name}</span>
                  {plan.specificity === 'Zone' && <StatusPill tone="brand">Zone plan</StatusPill>}
                  {plan.hasLaunchCheck && <StatusPill tone="info">Launch cheque</StatusPill>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[
                    plan.installmentCount != null && `${plan.installmentCount} payments`,
                    plan.durationYears ? `${plan.durationYears} years` : null,
                    plan.installmentFrequency && FREQUENCY[plan.installmentFrequency],
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {disabled && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-700">
                    <AlertTriangle className="size-3.5" aria-hidden="true" /> Not available: {plan.misconfiguredReason}
                  </p>
                )}
              </div>
              <div className="text-right">
                {plan.totalAmount != null && <div className="font-semibold text-brand-navy">{money(plan.totalAmount, currency)}</div>}
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-brand-steel hover:text-brand-navy focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-expanded={expanded}
                  aria-controls={`plan-${plan.id}`}
                  onClick={() => setOpen(expanded ? null : plan.id)}
                >
                  {expanded ? 'Hide schedule' : 'Show schedule'}
                  <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                </button>
              </div>
            </div>
            {expanded && (
              <div id={`plan-${plan.id}`} className="border-t border-border px-3 pb-3">
                {plan.description && <p className="pt-3 text-sm text-muted-foreground">{plan.description}</p>}
                <div className="overflow-x-auto">
                  <table className="mt-2 w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="py-1.5 pr-2 font-medium">#</th>
                        <th scope="col" className="py-1.5 pr-2 font-medium">Payment</th>
                        <th scope="col" className="py-1.5 pr-2 text-right font-medium">Share</th>
                        <th scope="col" className="py-1.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(plan.rows ?? []).map((r, i) => (
                        <tr key={i}>
                          <td className="py-1.5 pr-2 text-muted-foreground">{r.seq ?? i + 1}</td>
                          <td className="py-1.5 pr-2">
                            {r.label || INSTALLMENT_TYPE[r.installmentType ?? ''] || r.installmentType}
                            {r.isPostHandover && <span className="ml-1 text-xs text-muted-foreground">(after handover)</span>}
                          </td>
                          <td className="py-1.5 pr-2 text-right">{pct(r.pct)}</td>
                          <td className="py-1.5 text-right font-medium">{money(r.amount, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(plan.preHandoverAmount != null || plan.postHandoverAmount != null) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Before handover {money(plan.preHandoverAmount, currency)} ({pct(plan.preHandoverPct)}) · After handover{' '}
                    {money(plan.postHandoverAmount, currency)} ({pct(plan.postHandoverPct)})
                  </p>
                )}
                {plan.totalsWarning && (
                  <p className="mt-2 text-xs font-medium text-amber-800">
                    The plan's percentages don't add up to 100%. Check with your sales admin before offering it.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
