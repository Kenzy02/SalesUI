import { Link, useParams } from 'react-router';
import { Building2, FilePlus2, Mail, Smartphone } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import { ActivityPanel } from '@/components/app/ActivityPanel';
import { useMe } from '@/components/app/MeContext';
import { BackLink, DetailList, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { date, money } from '@/lib/format';
import { DEAL_STAGE, EOI_STATUS, EOI_STEP, RESERVATION_STATUS } from '@/lib/salesLabels';
import { dealProgress } from './CustomersPage';

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const { data: deal, loading, error, errorInfo, reload, setData } = useApi(() => salesApi.deal(id), [id]);

  const canStartEoi = deal && !deal.isClosed && !deal.eoiCreated && deal.canEdit && me.canCreateEoi;

  return (
    <>
      <BackLink to="/customers">Customers</BackLink>
      {loading && !deal ? (
        <LoadingBlock rows={4} label="Loading customer" />
      ) : error && !deal ? (
        <ErrorState message={error} status={errorInfo?.status} detail={errorInfo?.detail} onRetry={reload} />
      ) : deal ? (
        <>
          <PageHeader
            eyebrow="Customer deal"
            title={deal.customerName ?? deal.name ?? 'Customer'}
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                <StatusPill tone={DEAL_STAGE[deal.stage ?? ''] ?? 'neutral'}>{deal.stage}</StatusPill>
                <span>{dealProgress(deal)}</span>
                {!deal.isMine && <span>· Owner: {deal.ownerName}</span>}
              </span>
            }
            actions={
              <>
                <Button asChild size="lg" variant={canStartEoi ? 'outline' : 'default'}>
                  <Link to={`/units?dealId=${deal.id}`}>
                    <Building2 /> Find units{deal.projectName ? ` in ${deal.projectName}` : ''}
                  </Link>
                </Button>
                {canStartEoi && (
                  <Button asChild size="lg">
                    <Link to={`/eois/new?dealId=${deal.id}${deal.interestedUnitId ? `&unitId=${deal.interestedUnitId}` : ''}`}>
                      <FilePlus2 /> Start EOI
                    </Link>
                  </Button>
                )}
              </>
            }
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Section title="EOIs" description="Expressions of interest on this deal and where each one stands.">
                {deal.eois.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    No EOI yet.{' '}
                    {canStartEoi ? 'Start one to hold a unit for this customer.' : ''}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {deal.eois.map(e => {
                      const step = e.nextStep ? EOI_STEP[e.nextStep] : null;
                      const status = EOI_STATUS[e.status ?? ''];
                      return (
                        <li key={e.id}>
                          <Link
                            to={`/eois/${e.id}`}
                            className="block rounded-lg border border-border p-3 hover:border-brand-steel/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-brand-navy">
                                {e.name} · Unit {e.unitName ?? '—'}
                              </span>
                              <span className="flex gap-1.5">
                                {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
                                {step && <StatusPill tone={step.tone}>{step.label}</StatusPill>}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {e.projectName} · {e.paymentPlanName ?? 'No plan'} · Hold until {date(e.expiryDate)}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              {deal.reservations.length > 0 && (
                <Section title="Reservations">
                  <ul className="divide-y divide-border">
                    {deal.reservations.map(r => {
                      const s = RESERVATION_STATUS[r.status ?? ''];
                      return (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                          <div>
                            <div className="font-medium text-brand-navy">
                              {r.name} · Unit {r.unitName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              From {r.eoiName} · Net price {money(r.netPrice, me.currencyCode)} · Hold until {date(r.holdExpiry)}
                            </div>
                          </div>
                          {s && <StatusPill tone={s.tone}>{s.label}</StatusPill>}
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}

              <ActivityPanel
                parent="deals"
                parentId={deal.id}
                canEdit={deal.canEdit}
                activities={deal.activities}
                onChange={activities => setData({ ...deal, activities })}
              />
            </div>

            <div className="space-y-6">
              <Section title="Customer">
                <div className="mb-4 flex flex-col gap-2">
                  {deal.mobile && (
                    <Button asChild variant="outline" size="lg" className="justify-start">
                      <a href={`tel:${deal.mobile}`}>
                        <Smartphone /> {deal.mobile}
                      </a>
                    </Button>
                  )}
                  {deal.email && (
                    <Button asChild variant="outline" size="lg" className="justify-start">
                      <a href={`mailto:${deal.email}`}>
                        <Mail /> {deal.email}
                      </a>
                    </Button>
                  )}
                </div>
                <DetailList
                  columns={1}
                  items={[
                    { label: 'Full name (Arabic)', value: deal.customer?.fullNameArabic },
                    { label: 'City', value: deal.customer?.city },
                    {
                      label: 'Address',
                      value:
                        [deal.customer?.houseNumber, deal.customer?.alley, deal.customer?.neighborhood, deal.customer?.district]
                          .filter(Boolean)
                          .join(', ') || undefined,
                    },
                  ]}
                />
              </Section>
              <Section title="Deal">
                <DetailList
                  columns={1}
                  items={[
                    { label: 'Project', value: deal.projectName },
                    { label: 'Interested unit', value: deal.interestedUnitName },
                    { label: 'Amount', value: deal.amount ? money(deal.amount, me.currencyCode) : undefined },
                    { label: 'Expected close', value: date(deal.closeDate) },
                  ]}
                />
              </Section>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
