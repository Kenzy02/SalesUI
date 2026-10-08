import { useId, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowRight, Hourglass, Info } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { FileRef, UnitDetail } from '@/api/salesTypes';
import { BookingSteps } from '@/components/app/BookingSteps';
import { CustomerContextBanner, type CustomerContextData, useCustomerContext } from '@/components/app/CustomerContext';
import { useMe } from '@/components/app/MeContext';
import { PaymentPlanList } from '@/components/app/PaymentPlans';
import { BackLink, DetailList, EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { UnitPhoto } from '@/components/app/UnitPhoto';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { continueToBookingLink, unitsQuery } from '@/lib/booking';
import { area, date, money } from '@/lib/format';
import { FINISHING, unitStatus } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

export default function UnitDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const { data: unit, loading, error, errorInfo, reload } = useApi(() => salesApi.unit(id), [id]);
  const customer = useCustomerContext(params);

  const clearCustomer = () => {
    const next = new URLSearchParams(params);
    next.delete('dealId');
    next.delete('leadId');
    next.delete('ctx');
    setParams(next, { replace: true });
  };

  return (
    <>
      {/* Back keeps the project, unit type and other filters the rep was browsing with. */}
      <BackLink to={`/units${unitsQuery(params)}`}>Back to units</BackLink>
      <CustomerContextBanner context={customer.data} error={customer.error} onClear={clearCustomer} />
      {loading && !unit ? (
        <LoadingBlock rows={4} label="Loading unit" />
      ) : error && !unit ? (
        <ErrorState message={error} status={errorInfo?.status} detail={errorInfo?.detail} onRetry={reload} />
      ) : unit ? (
        <UnitView
          unit={unit}
          currency={me.currencyCode}
          canCreateEoi={me.canCreateEoi}
          customer={customer.data}
          params={params}
          onSelectPlan={planId => {
            const next = new URLSearchParams(params);
            next.set('planId', planId);
            setParams(next, { replace: true });
          }}
        />
      ) : null}
    </>
  );
}

function UnitView({
  unit,
  currency,
  canCreateEoi,
  customer,
  params,
  onSelectPlan,
}: {
  unit: UnitDetail;
  currency: string;
  canCreateEoi: boolean;
  customer: CustomerContextData | null;
  params: URLSearchParams;
  onSelectPlan: (planId: string) => void;
}) {
  const s = unitStatus(unit.status);
  const listPrice = unit.pricing.price?.listPrice;
  const plans = unit.pricing.plans ?? [];
  const usablePlans = plans.filter(p => !p.isMisconfigured);
  const selling = unit.projectStatus === 'Selling';
  const hasPlan = usablePlans.length > 0;
  const unitOfferable = canCreateEoi && unit.status === 'Available' && selling && listPrice != null && hasPlan;
  // A deal that already has an EOI (or a record the rep can't edit) can't take a new one.
  const customerBlocks = customer != null && !customer.canStartEoi;
  const canStart = unitOfferable && !customerBlocks;
  // The plan chosen here travels with the booking; a single eligible plan is chosen for the rep.
  const urlPlan = params.get('planId');
  const planId = usablePlans.some(p => p.id === urlPlan) ? (urlPlan as string) : usablePlans.length === 1 ? usablePlans[0].id : '';
  const planName = usablePlans.find(p => p.id === planId)?.name;
  // An already converted lead continues on its deal; any other lead is converted on the way.
  const bookingCustomer =
    customer?.kind === 'lead' && customer.convertedDealId ? { kind: 'deal' as const, id: customer.convertedDealId } : customer;
  const bookingLink = continueToBookingLink(params, bookingCustomer, unit.id, planId || undefined);
  const continueLabel = customer ? `Continue to booking for ${customer.name}` : 'Continue to booking';
  const images = unit.media.filter(m => m.kind === 'image');
  const floorPlans = unit.media.filter(m => m.kind === 'floorplan');

  return (
    <>
      {customer && canStart && <BookingSteps current="unit" withConversion={customer.kind === 'lead' && !customer.convertedDealId} />}
      <PageHeader
        eyebrow={`${unit.projectName ?? ''}${unit.buildingName ? ` · Building ${unit.buildingName}` : ''}`}
        title={`${unit.unitType ?? 'Unit'} ${unit.name ?? ''}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill tone={s.tone}>{s.label}</StatusPill>
            {unit.unitCode && <span>Code {unit.unitCode}</span>}
            {unit.zone && <span>· {unit.zone}</span>}
          </span>
        }
        actions={canStart ? <ContinueButton to={bookingLink} label={continueLabel} ready={!!planId} /> : undefined}
      />

      {unit.myHold && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            You hold this unit with{' '}
            <Link to={`/eois/${unit.myHold.id}`} className="font-semibold underline">
              {unit.myHold.name}
            </Link>{' '}
            until {date(unit.myHold.expiryDate)}.
          </span>
        </div>
      )}
      {unitOfferable && customerBlocks && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-steel" aria-hidden="true" />
          <span>
            {customer?.kind === 'lead'
              ? `${customer.name} is a lead you can't edit in Salesforce, so you can't book for them. Ask the lead owner or your team leader.`
              : `${customer?.name}'s deal already has an EOI or can't be edited by you, so a new EOI can't start from it.`}
          </span>
        </div>
      )}
      {canStart && customer?.kind === 'lead' && !customer.convertedDealId && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-navy/15 bg-brand-mist/60 px-4 py-3 text-sm text-brand-navy">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {customer.name} is still a lead. Choose a payment plan and continue: you'll confirm their details and convert the
            lead into a customer and deal here, then create the EOI. Everything is saved in Salesforce.
          </span>
        </div>
      )}
      {!unitOfferable && !unit.myHold && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-steel" aria-hidden="true" />
          <span>
            {unit.status !== 'Available'
              ? `This unit is ${s.label.toLowerCase()} and can't be offered right now.`
              : !selling
                ? `${unit.projectName} isn't open for sale yet (${unit.projectStatus ?? 'not selling'}).`
                : listPrice == null
                  ? 'This unit has no active price in Salesforce, so it cannot be offered yet.'
                  : !hasPlan
                    ? 'No active payment plan applies to this unit, so it cannot be offered yet.'
                    : 'Your Salesforce access does not allow creating EOIs.'}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Gallery images={images} floorPlans={floorPlans} unitName={unit.name ?? ''} />
          <Section title="Details">
            <DetailList
              columns={3}
              items={[
                { label: 'Bedrooms', value: unit.bedrooms },
                { label: 'Bathrooms', value: unit.bathrooms },
                { label: 'Built-up area', value: area(unit.builtUpArea) },
                { label: 'Floor', value: unit.floor },
                { label: 'Garden', value: unit.gardenArea ? area(unit.gardenArea) : unit.hasGarden ? 'Yes' : 'No' },
                { label: 'Terrace', value: unit.terraceArea ? area(unit.terraceArea) : '—' },
                { label: 'Plot', value: unit.plotArea ? `${area(unit.plotArea)}${unit.plotNumber ? ` · #${unit.plotNumber}` : ''}` : '—' },
                { label: 'View', value: unit.view },
                { label: 'Finishing', value: unit.finishing ? (FINISHING[unit.finishing] ?? unit.finishing) : undefined },
                {
                  label: 'Features',
                  value:
                    [unit.isCorner && 'Corner', unit.isPenthouse && 'Penthouse', unit.hasParking && 'Parking', unit.hasStorage && 'Storage']
                      .filter(Boolean)
                      .join(', ') || '—',
                },
                { label: 'Construction', value: unit.underConstruction ? 'Under construction' : '—' },
                { label: 'Street', value: unit.street },
              ]}
            />
            {unit.otherDetails && <p className="mt-4 text-sm text-muted-foreground">{unit.otherDetails}</p>}
          </Section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Section title="Price">
            {listPrice != null ? (
              <>
                <div className="text-3xl font-semibold tracking-tight text-brand-navy">{money(listPrice, currency)}</div>
                <p className="mt-1 text-xs text-muted-foreground">Current list price from the active price list.</p>
                {unit.pricing.price?.hasMultipleActiveItems && (
                  <p className="mt-2 text-xs font-medium text-amber-800">More than one active price exists for this unit; the most recent is shown.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active price list item for this unit.</p>
            )}
          </Section>
          <Section
            title="Payment plans"
            description={canStart ? 'Choose the plan to offer. You can review it again before the EOI is created.' : "Plans available for this unit's project and zone."}
          >
            {plans.length === 0 ? (
              <EmptyState title="No payment plans apply">No active plan matches this unit's project and zone.</EmptyState>
            ) : canStart ? (
              <div className="space-y-4">
                <PaymentPlanList plans={plans} currency={currency} selectable selectedId={planId} onSelect={onSelectPlan} />
                <ContinueButton to={bookingLink} label={continueLabel} ready={!!planId} block />
                {planName && (
                  <p className="text-xs text-muted-foreground">
                    Selected: <span className="font-medium text-brand-navy">{planName}</span>. Your unit filters are kept if you go back.
                  </p>
                )}
              </div>
            ) : (
              <PaymentPlanList plans={plans} currency={currency} />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

/** "Continue to booking" - asks for a plan first rather than failing later in the form. */
function ContinueButton({ to, label, ready, block }: { to: string; label: string; ready: boolean; block?: boolean }) {
  const hintId = useId();
  if (!ready) {
    return (
      <div className={block ? 'w-full' : undefined}>
        <Button size="lg" disabled className={block ? 'w-full' : undefined} aria-describedby={hintId}>
          {label} <ArrowRight />
        </Button>
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          Choose a payment plan first.
        </p>
      </div>
    );
  }
  return (
    <Button asChild size="lg" className={block ? 'w-full' : undefined}>
      <Link to={to}>
        {label} <ArrowRight />
      </Link>
    </Button>
  );
}

function Gallery({ images, floorPlans, unitName }: { images: FileRef[]; floorPlans: FileRef[]; unitName: string }) {
  const [tab, setTab] = useState<'photos' | 'floorplans'>(images.length || !floorPlans.length ? 'photos' : 'floorplans');
  const [index, setIndex] = useState(0);
  const list = tab === 'photos' ? images : floorPlans;
  const current = list[Math.min(index, Math.max(0, list.length - 1))];

  return (
    <Section className="overflow-hidden">
      <div className="-mx-5 -mt-4">
        <div className="relative aspect-[16/9] bg-muted">
          {list.length ? (
            <UnitPhoto file={current} alt={`${tab === 'photos' ? 'Photo' : 'Floor plan'} of unit ${unitName}${current?.title ? `: ${current.title}` : ''}`} className={tab === 'floorplans' ? 'object-contain bg-white' : undefined} />
          ) : (
            <UnitPhoto file={null} alt="" showMissingLabel={false} />
          )}
          {!list.length && (
            <div className="absolute inset-0 flex items-end justify-center pb-6">
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-brand-navy shadow-sm">
                {tab === 'photos' ? 'No photos have been added in Salesforce yet' : 'No floor plan has been added in Salesforce yet'}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <div role="tablist" aria-label="Media" className="flex gap-1">
          {(['photos', 'floorplans'] as const).map(t => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setIndex(0);
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                tab === t ? 'bg-brand-navy text-white' : 'text-muted-foreground hover:text-brand-navy'
              )}
            >
              {t === 'photos' ? `Photos (${images.length})` : `Floor plans (${floorPlans.length})`}
            </button>
          ))}
        </div>
        {list.length > 1 && (
          <div className="flex gap-2">
            {list.map((f, i) => (
              <button
                key={f.versionId}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${f.title ?? `image ${i + 1}`}`}
                aria-current={i === index}
                className={cn(
                  'size-2.5 rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  i === index ? 'bg-brand-navy' : 'bg-border'
                )}
              />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
