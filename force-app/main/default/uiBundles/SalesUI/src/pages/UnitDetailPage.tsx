import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { FilePlus2, Hourglass, Info } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { FileRef, UnitDetail } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import { PaymentPlanList } from '@/components/app/PaymentPlans';
import { BackLink, DetailList, EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { UnitPhoto } from '@/components/app/UnitPhoto';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { area, date, money } from '@/lib/format';
import { FINISHING, unitStatus } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

export default function UnitDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const { data: unit, loading, error, reload } = useApi(() => salesApi.unit(id), [id]);

  return (
    <>
      <BackLink to="/units">Units</BackLink>
      {loading && !unit ? (
        <LoadingBlock rows={4} label="Loading unit" />
      ) : error && !unit ? (
        <ErrorState message={error} onRetry={reload} />
      ) : unit ? (
        <UnitView unit={unit} currency={me.currencyCode} canCreateEoi={me.canCreateEoi} />
      ) : null}
    </>
  );
}

function UnitView({ unit, currency, canCreateEoi }: { unit: UnitDetail; currency: string; canCreateEoi: boolean }) {
  const s = unitStatus(unit.status);
  const listPrice = unit.pricing.price?.listPrice;
  const plans = unit.pricing.plans ?? [];
  const selling = unit.projectStatus === 'Selling';
  const hasPlan = plans.some(p => !p.isMisconfigured);
  const canStart = canCreateEoi && unit.status === 'Available' && selling && listPrice != null && hasPlan;
  const images = unit.media.filter(m => m.kind === 'image');
  const floorPlans = unit.media.filter(m => m.kind === 'floorplan');

  return (
    <>
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
        actions={
          canStart ? (
            <Button asChild size="lg">
              <Link to={`/eois/new?unitId=${unit.id}`}>
                <FilePlus2 /> Start EOI &amp; hold this unit
              </Link>
            </Button>
          ) : undefined
        }
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
      {!canStart && !unit.myHold && (
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
          <Section title="Payment plans" description="Plans available for this unit's project and zone.">
            {plans.length === 0 ? (
              <EmptyState title="No payment plans apply">No active plan matches this unit's project and zone.</EmptyState>
            ) : (
              <PaymentPlanList plans={plans} currency={currency} />
            )}
          </Section>
        </div>
      </div>
    </>
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
