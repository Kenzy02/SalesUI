import { Link } from 'react-router';
import { Info, Wallet } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatCard, StatusPill } from '@/components/app/Primitives';
import { useApi } from '@/hooks/useApi';
import { money } from '@/lib/format';
import { COMMISSION_STATE } from '@/lib/salesLabels';

export default function CommissionPage() {
  const { data: c, loading, error, reload } = useApi(() => salesApi.commission(), []);
  const m = (v: number | undefined | null, digits = 2) => money(v ?? 0, c?.currencyCode ?? 'USD', digits);
  const rate = c?.ratePct;

  return (
    <>
      <PageHeader
        eyebrow="My performance"
        title="My commission"
        description="Calculated by Salesforce from collections finance has confirmed on your deals. Nothing here is entered by hand."
      />
      {loading && !c ? (
        <LoadingBlock rows={4} label="Calculating commission" />
      ) : error && !c ? (
        <ErrorState message={error} onRetry={reload} />
      ) : c ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Calculated commission"
              value={m(c.commission)}
              hint={rate != null ? `${rate}% of eligible collections` : 'Commission rate not configured'}
              icon={<Wallet className="size-4" />}
            />
            <StatCard label="Eligible collections" value={m(c.eligibleBasis, 0)} hint="Confirmed, on signed EOIs" />
            <StatCard label="Waiting for signed EOI" value={m(c.awaitingSignatureBasis, 0)} hint="Confirmed, but the EOI isn't signed yet" />
            <StatCard
              label="Commission paid"
              value={c.paidTracked ? m(c.paid) : 'Not tracked'}
              hint={c.paidTracked ? undefined : 'Salesforce has no record of commission payouts yet'}
            />
          </div>

          <Section title="What makes up my commission" action={rate != null ? <StatusPill tone="brand">{rate}% rate</StatusPill> : undefined}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Collection</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Confirmed amount</th>
                    <th scope="col" className="py-2 text-right font-medium">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <Row label="Property payments" hint="Reservation deposits confirmed by finance" amount={m(c.propertyPayments, 0)} commission={rate != null ? m(c.propertyCommission) : '—'} />
                  <Row label="Booking fees" hint="EOI reservation fees confirmed by finance" amount={m(c.bookingFees, 0)} commission={rate != null ? m(c.bookingFeeCommission) : '—'} />
                  <Row label="Tax" hint="Not recorded in Salesforce, so nothing is counted" amount={c.taxRecorded ? m(c.tax, 0) : 'Not recorded'} commission={c.taxRecorded && rate != null ? m(c.taxCommission) : '—'} />
                  <Row label="Refunds" hint="Processed refunds are deducted" amount={c.refunds ? `− ${m(c.refunds, 0)}` : m(0, 0)} commission={c.refunds && rate != null ? `− ${m(c.refundCommission)}` : '—'} />
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-navy/20 font-semibold text-brand-navy">
                    <th scope="row" className="py-3 pr-3 text-left">Total eligible</th>
                    <td className="py-3 pr-3 text-right">{m(c.eligibleBasis, 0)}</td>
                    <td className="py-3 text-right">{m(c.commission)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The split by collection type is for reference; the total is calculated per EOI and rounded to the cent, so the lines can differ from it by a few cents.
            </p>
          </Section>

          <Section title="By customer and EOI">
            {c.lines.length === 0 ? (
              <EmptyState icon={<Wallet className="size-5" />} title="No EOIs on your deals yet">
                Commission appears here once your customers have EOIs and finance confirms their payments.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-medium">Customer · EOI</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Property</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Booking fee</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Refunds</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Eligible</th>
                      <th scope="col" className="py-2 text-right font-medium">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {c.lines.map(l => {
                      const s = COMMISSION_STATE[l.state];
                      const pending = l.unconfirmedBookingFees + l.unconfirmedPropertyPayments;
                      return (
                        <tr key={l.eoiId} className="align-top">
                          <td className="py-3 pr-3">
                            <Link to={`/eois/${l.eoiId}`} className="font-medium text-brand-navy hover:underline">
                              {l.customerName ?? l.dealName}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {l.eoiName} · Unit {l.unitName} · {l.projectName}
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <StatusPill tone={s.tone}>{s.label}</StatusPill>
                            {pending > 0 && (
                              <div className="mt-1 text-xs text-muted-foreground">{m(pending, 0)} awaiting finance confirmation</div>
                            )}
                          </td>
                          <td className="py-3 pr-3 text-right">{m(l.propertyPayments, 0)}</td>
                          <td className="py-3 pr-3 text-right">{m(l.bookingFees, 0)}</td>
                          <td className="py-3 pr-3 text-right">{l.refunds ? `− ${m(l.refunds, 0)}` : '—'}</td>
                          <td className="py-3 pr-3 text-right font-medium">{m(l.eligibleBasis, 0)}</td>
                          <td className="py-3 text-right font-semibold text-brand-navy">{m(l.commission)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section>
            <div className="flex gap-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-steel" aria-hidden="true" />
              <div className="space-y-1.5">
                <p>
                  <strong className="text-brand-navy">How it works.</strong> An EOI starts earning commission once its signed document is on file
                  in Salesforce. Collections confirmed before signing count from that moment. Each confirmation is counted once, and later
                  confirmations are added automatically.
                </p>
                <p>Requested or scheduled payments that finance hasn't confirmed are never counted. Processed refunds reduce the total.</p>
                <p>Commission belongs to the owner of the customer deal. Payout approval and payment happen outside this app.</p>
              </div>
            </div>
          </Section>
        </div>
      ) : null}
    </>
  );
}

function Row({ label, hint, amount, commission }: { label: string; hint: string; amount: string; commission: string }) {
  return (
    <tr>
      <th scope="row" className="py-3 pr-3 text-left font-normal">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </th>
      <td className="py-3 pr-3 text-right">{amount}</td>
      <td className="py-3 text-right">{commission}</td>
    </tr>
  );
}
