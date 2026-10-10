import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, KeyRound, Search } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { ReservationListRow } from '@/api/salesTypes';
import { TextInput } from '@/components/app/FormControls';
import { useMe } from '@/components/app/MeContext';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Section,
  StatusPill,
} from '@/components/app/Primitives';
import { useApi } from '@/hooks/useApi';
import { date, daysUntil, money, relativeDays } from '@/lib/format';
import {
  RESERVATION_FILTERS,
  isLiveReservation,
  matchesReservationSearch,
  type ReservationFilter,
} from '@/lib/reservations';
import { RESERVATION_STATUS } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

export default function ReservationsPage() {
  const me = useMe();
  const [filter, setFilter] = useState<ReservationFilter>('live');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useApi(
    () => salesApi.reservations(),
    []
  );
  const all = (data?.reservations ?? []).filter(r =>
    matchesReservationSearch(r, search)
  );
  const current = RESERVATION_FILTERS.find(f => f.value === filter)!;
  const rows = all.filter(current.match);

  return (
    <>
      <PageHeader
        eyebrow="Customer commitment"
        title="Reservations"
        description="Reservations on your deals, from the hold after a paid EOI through the contract stage to the sale."
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filter reservations"
          className="flex flex-wrap gap-2"
        >
          {RESERVATION_FILTERS.map(f => (
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
              {data ? (
                <span className="ml-1.5 opacity-75">
                  {all.filter(f.match).length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <TextInput
            type="search"
            aria-label="Search reservations"
            placeholder="Customer, unit or RES number"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading && !data ? (
        <LoadingBlock rows={4} label="Loading reservations" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <Section>
          <EmptyState
            icon={<KeyRound className="size-5" />}
            title={
              data?.reservations.length
                ? 'Nothing in this view'
                : 'No reservations yet'
            }
          >
            {data?.reservations.length
              ? 'Choose another filter or clear the search.'
              : 'Once finance confirms an EOI payment, reserve the unit from the EOI page.'}
          </EmptyState>
        </Section>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map(r => (
              <li key={r.id}>
                <ReservationCard
                  res={r}
                  today={me.today}
                  currency={me.currencyCode}
                />
              </li>
            ))}
          </ul>
          {data?.truncated && (
            <p className="mt-4 text-sm text-muted-foreground">
              Showing your {data.reservations.length} most recent reservations.
            </p>
          )}
        </>
      )}
    </>
  );
}

function ReservationCard({
  res,
  today,
  currency,
}: {
  res: ReservationListRow;
  today: string;
  currency: string;
}) {
  const status =
    RESERVATION_STATUS[res.status ?? ''] ??
    (res.status ? { label: res.status, tone: 'neutral' as const } : null);
  const live = isLiveReservation(res);
  const to = res.eoiId
    ? `/eois/${res.eoiId}`
    : res.accountId
      ? `/customers/account/${res.accountId}`
      : null;
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-brand-navy">
            {res.customerName ?? res.dealName ?? 'Customer'}
          </span>
          {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
          {res.depositVerified === true && res.status !== 'Active' && (
            <StatusPill tone="success">Deposit confirmed</StatusPill>
          )}
          {res.depositVerified === false && live && (
            <StatusPill tone="warning">Deposit awaiting finance</StatusPill>
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {[
            res.name,
            res.unitName ? `Unit ${res.unitName}` : null,
            res.projectName,
            res.eoiName ? `from ${res.eoiName}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {[
            res.netPrice != null
              ? `Net price ${money(res.netPrice, currency)}`
              : null,
            res.deposit != null
              ? `Deposit ${money(res.deposit, currency)}`
              : null,
            res.paymentPlanName,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Milestone res={res} today={today} />
        {to && (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground group-hover:text-brand-navy"
            aria-hidden="true"
          />
        )}
      </div>
    </>
  );
  const box =
    'group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(20,30,60,0.04)] sm:flex-row sm:items-center';
  return to ? (
    <Link
      to={to}
      className={cn(
        box,
        'transition-colors hover:border-brand-steel/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** The date that matters at this stage: hold expiry, deposit confirmation, sale or cancellation. */
function Milestone({ res, today }: { res: ReservationListRow; today: string }) {
  let main: string | null = null;
  let sub: string | null = null;
  let tone = 'text-brand-navy';
  if (res.status === 'Submitted' && res.holdExpiry) {
    const days = daysUntil(res.holdExpiry, today);
    main =
      days !== null && days < 0
        ? 'Hold past expiry'
        : `Hold until ${date(res.holdExpiry)}`;
    sub = relativeDays(res.holdExpiry, today);
    tone =
      days !== null && days < 0
        ? 'text-rose-700'
        : days !== null && days <= 2
          ? 'text-amber-800'
          : tone;
  } else if (res.status === 'PendingWithContracts') {
    main = 'With contracts';
    sub = res.depositVerifiedDate
      ? `Deposit confirmed ${date(res.depositVerifiedDate)}`
      : null;
  } else if (res.status === 'Active') {
    main = res.saleDate ? `Sold ${date(res.saleDate)}` : 'Sold';
  } else if (res.cancelledDate) {
    main = `Ended ${date(res.cancelledDate)}`;
  }
  if (!main) return null;
  return (
    <div className="text-right text-sm">
      <div className={cn('font-medium', tone)}>{main}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
