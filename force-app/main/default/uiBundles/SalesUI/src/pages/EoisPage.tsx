import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, FilePlus2, FileSignature } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { EoiRow } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { date, daysUntil, money, relativeDays } from '@/lib/format';
import { EOI_STATUS, EOI_STEP } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

type Filter = 'action' | 'holds' | 'reserved' | 'closed' | 'all';

const FILTERS: { value: Filter; label: string; match: (e: EoiRow) => boolean }[] = [
  { value: 'action', label: 'Needs action', match: e => !!e.nextStep && !['RESERVED', 'CLOSED'].includes(e.nextStep) },
  { value: 'holds', label: 'Active holds', match: e => e.unitStatus === 'Held' && e.nextStep !== 'CLOSED' },
  { value: 'reserved', label: 'Reserved', match: e => e.nextStep === 'RESERVED' },
  { value: 'closed', label: 'Expired / refunded', match: e => e.nextStep === 'CLOSED' },
  { value: 'all', label: 'All', match: () => true },
];

export default function EoisPage() {
  const me = useMe();
  const [filter, setFilter] = useState<Filter>('action');
  const { data, loading, error, reload } = useApi(() => salesApi.eois(), []);
  const all = data?.eois ?? [];
  const current = FILTERS.find(f => f.value === filter)!;
  const rows = all.filter(current.match);

  return (
    <>
      <PageHeader
        eyebrow="Customer commitment"
        title="EOIs & holds"
        description="Expressions of interest on your deals: unit holds, signed documents, finance confirmation and reservations."
        actions={
          me.canCreateEoi ? (
            <Button asChild size="lg">
              <Link to="/eois/new">
                <FilePlus2 /> New EOI
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div role="group" aria-label="Filter EOIs" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const count = all.filter(f.match).length;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                filter === f.value
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : 'border-border bg-white text-muted-foreground hover:border-brand-steel hover:text-brand-navy'
              )}
            >
              {f.label}
              {data ? <span className="ml-1.5 opacity-75">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <LoadingBlock rows={4} label="Loading EOIs" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <Section>
          <EmptyState icon={<FileSignature className="size-5" />} title={all.length ? 'Nothing in this view' : 'No EOIs yet'}>
            {all.length ? 'Choose another filter to see your other EOIs.' : 'Start an EOI from a unit or a customer to hold a unit.'}
          </EmptyState>
        </Section>
      ) : (
        <ul className="space-y-3">
          {rows.map(e => (
            <li key={e.id}>
              <EoiCard eoi={e} today={me.today} currency={me.currencyCode} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EoiCard({ eoi, today, currency }: { eoi: EoiRow; today: string; currency: string }) {
  const step = eoi.nextStep ? EOI_STEP[eoi.nextStep] : null;
  const status = EOI_STATUS[eoi.status ?? ''];
  const days = daysUntil(eoi.expiryDate, today);
  const holdLive = eoi.nextStep && !['RESERVED', 'CLOSED'].includes(eoi.nextStep);
  return (
    <Link
      to={`/eois/${eoi.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(20,30,60,0.04)] transition-colors hover:border-brand-steel/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-brand-navy">{eoi.customerName ?? eoi.dealName ?? 'Customer'}</span>
          {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
          {step && <StatusPill tone={step.tone}>{step.label}</StatusPill>}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {eoi.name} · Unit {eoi.unitName ?? '—'} · {eoi.projectName}
          {eoi.netUnitPrice != null ? ` · ${money(eoi.netUnitPrice, currency)}` : ''}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {holdLive && eoi.expiryDate && (
          <div className="text-right text-sm">
            <div className={cn('font-medium', days !== null && days < 0 ? 'text-rose-700' : days !== null && days <= 2 ? 'text-amber-800' : 'text-brand-navy')}>
              {days !== null && days < 0 ? 'Hold past expiry' : `Hold until ${date(eoi.expiryDate)}`}
            </div>
            <div className="text-xs text-muted-foreground">{relativeDays(eoi.expiryDate, today)}</div>
          </div>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-brand-navy" aria-hidden="true" />
      </div>
    </Link>
  );
}
