import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarClock, FileSignature, Hourglass, Users, Wallet } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { Hold } from '@/api/salesTypes';
import { useDemoMode } from '@/components/app/DemoContext';
import { useMe } from '@/components/app/MeContext';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatCard, StatusPill } from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { commissionViewTotals, demoCommissionView } from '@/lib/commissionView';
import { date, daysUntil, money, plural, relativeDays } from '@/lib/format';
import { EOI_STEP, LEAD_STATUS } from '@/lib/salesLabels';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const me = useMe();
  const { demo } = useDemoMode();
  const demoCommission = demo ? commissionViewTotals(demoCommissionView(me.today, me.currencyCode).lines) : null;
  const { data, loading, error, errorInfo, reload } = useApi(() => salesApi.overview(), []);
  const errors = data?.sectionErrors ?? {};
  const holds = data?.holds ?? [];
  const pastExpiry = holds.filter(h => h.isOverdue).length;
  const expiringSoon = holds.filter(h => h.expiresSoon && !h.isOverdue).length;
  const needingAction = (data?.eoisAwaitingAction ?? []).filter(e => e.nextStep !== 'RESERVED');

  return (
    <>
      <PageHeader
        eyebrow="Your sales workspace"
        title={`${greeting()}${me.firstName ? `, ${me.firstName}` : ''}`}
        description="Your leads, unit holds and EOIs from Salesforce, in one place."
        actions={
          <Button asChild size="lg">
            <Link to="/units">
              Find a unit <ArrowRight />
            </Link>
          </Button>
        }
      />

      {loading && !data ? (
        <LoadingBlock rows={4} label="Loading your overview" />
      ) : error && !data ? (
        <ErrorState message={error} status={errorInfo?.status} detail={errorInfo?.detail} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Open leads"
              value={errors.leads ? '—' : (data.openLeads ?? 0)}
              hint={errors.leads ? 'Unavailable' : data.leadsByStatus?.New ? `${data.leadsByStatus.New} new, not yet contacted` : 'Assigned to you'}
              icon={<Users className="size-4" />}
              to="/leads"
            />
            <StatCard
              label="Active holds"
              value={errors.eois ? '—' : holds.length}
              hint={
                errors.eois
                  ? 'Unavailable'
                  : pastExpiry
                    ? `${pastExpiry} past expiry date${expiringSoon ? ` · ${expiringSoon} ending soon` : ''}`
                    : expiringSoon
                      ? `${expiringSoon} ending within 2 days`
                      : 'EOI and reservation holds'
              }
              icon={<Hourglass className="size-4" />}
              to="/eois"
            />
            <StatCard
              label="EOIs needing action"
              value={errors.eois ? '—' : needingAction.length}
              hint="Signature, finance or reservation"
              icon={<FileSignature className="size-4" />}
              to="/eois"
            />
            <StatCard
              label={demoCommission ? 'Commission on collections' : 'Commission estimate'}
              value={
                demoCommission
                  ? money(demoCommission.onCollections, me.currencyCode, 2)
                  : errors.commission || !data.commission
                    ? '—'
                    : money(data.commission.commission, data.commission.currencyCode, 2)
              }
              hint={
                demoCommission
                  ? `Demo data · ${money(demoCommission.totalPotential, me.currencyCode)} total potential`
                  : errors.commission
                  ? 'Unavailable'
                  : data.commission?.ratePct != null
                    ? `Proposed ${data.commission.ratePct}% rule, pending confirmation`
                    : 'No commission rule is active'
              }
              icon={<Wallet className="size-4" />}
              to="/commission"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Section
              className="lg:col-span-3"
              title="Unit holds"
              description="Expiry dates come from Salesforce settings. A hold past its date stays in place until the EOI is marked expired in Salesforce."
              action={
                <Link to="/eois" className="text-sm font-medium text-brand-steel hover:text-brand-navy">
                  All EOIs
                </Link>
              }
            >
              <Panel error={errors.eois} onRetry={reload}>
                {holds.length === 0 ? (
                  <EmptyState icon={<Hourglass className="size-5" />} title="No active holds">
                    Start an EOI from a unit to hold it for your customer.
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-border">
                    {[...holds]
                      .sort((a, b) => (a.holdExpiry ?? '9').localeCompare(b.holdExpiry ?? '9'))
                      .map(h => (
                        <HoldRow key={`${h.holdType}-${h.name}`} hold={h} today={me.today} />
                      ))}
                  </ul>
                )}
              </Panel>
            </Section>

            <Section className="lg:col-span-2" title="Leads by status" description="Leads assigned to you that are not yet converted.">
              <Panel error={errors.leads} onRetry={reload}>
                {!data.openLeads ? (
                  <EmptyState icon={<Users className="size-5" />} title="No open leads assigned to you">
                    New leads routed to you in Salesforce appear here.
                  </EmptyState>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(data.leadsByStatus ?? {}).map(([status, count]) => (
                      <li key={status}>
                        <Link
                          to={`/leads?status=${encodeURIComponent(status)}`}
                          className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <StatusPill tone={LEAD_STATUS[status] ?? 'neutral'}>{status}</StatusPill>
                          <span className="text-sm font-semibold text-brand-navy">{plural(count, 'lead')}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="EOIs needing your attention">
              <Panel error={errors.eois} onRetry={reload}>
                {needingAction.length === 0 ? (
                  <EmptyState icon={<FileSignature className="size-5" />} title="Nothing waiting on you" />
                ) : (
                  <ul className="divide-y divide-border">
                    {needingAction.slice(0, 6).map(e => {
                      const step = e.nextStep ? EOI_STEP[e.nextStep] : null;
                      return (
                        <li key={e.id}>
                          <Link
                            to={`/eois/${e.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg px-1 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-brand-navy">{e.customerName ?? e.dealName ?? e.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {e.name} · Unit {e.unitName ?? '—'} · {e.projectName ?? ''}
                              </div>
                            </div>
                            {step && <StatusPill tone={step.tone}>{step.label}</StatusPill>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </Section>

            <Section title="Follow-ups this week">
              <Panel error={errors.followUps} onRetry={reload}>
                {!me.activitiesEnabled ? (
                  <EmptyState icon={<CalendarClock className="size-5" />} title="Follow-ups aren't enabled for you">
                    Your Salesforce access doesn't include task due dates. Ask your administrator.
                  </EmptyState>
                ) : (data.followUps ?? []).length === 0 ? (
                  <EmptyState icon={<CalendarClock className="size-5" />} title="No follow-ups due">
                    Schedule follow-ups from a lead or customer page.
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-border">
                    {(data.followUps ?? []).map(f => {
                      const overdue = (daysUntil(f.dueDate, me.today) ?? 0) < 0;
                      const target = f.leadId ? `/leads/${f.leadId}` : f.relatedId ? `/customers/${f.relatedId}` : null;
                      const body = (
                        <div className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-brand-navy">{f.subject}</div>
                            <div className="truncate text-xs text-muted-foreground">{f.leadName ?? f.relatedName}</div>
                          </div>
                          <StatusPill tone={overdue ? 'danger' : 'info'}>{overdue ? 'Overdue' : relativeDays(f.dueDate, me.today)}</StatusPill>
                        </div>
                      );
                      return (
                        <li key={f.id}>
                          {target ? (
                            <Link to={target} className="block rounded-lg px-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                              {body}
                            </Link>
                          ) : (
                            body
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </Section>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** One overview panel: its own error state, so other panels keep working. */
function Panel({ error, onRetry, children }: { error?: string; onRetry: () => void; children: ReactNode }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} compact />;
  return <>{children}</>;
}

function HoldRow({ hold, today }: { hold: Hold; today: string }) {
  const tone = hold.isOverdue ? 'danger' : hold.expiresSoon ? 'warning' : 'neutral';
  return (
    <li>
      <Link
        to={`/eois/${hold.eoiId}`}
        className="flex items-center justify-between gap-3 rounded-lg px-1 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="min-w-0">
          <div className="truncate font-medium text-brand-navy">
            Unit {hold.unitName ?? '—'} <span className="font-normal text-muted-foreground">· {hold.projectName}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {hold.customerName ?? '—'} · {hold.holdType === 'EOI' ? 'EOI hold' : 'Reservation hold'} ({hold.name})
          </div>
        </div>
        <div className="shrink-0 text-right">
          <StatusPill tone={tone}>{hold.isOverdue ? `Past expiry (${date(hold.holdExpiry)})` : `Until ${date(hold.holdExpiry)}`}</StatusPill>
          {!hold.isOverdue && hold.holdExpiry && <div className="mt-1 text-xs text-muted-foreground">{relativeDays(hold.holdExpiry, today)}</div>}
        </div>
      </Link>
    </li>
  );
}
