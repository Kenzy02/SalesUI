import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Handshake, Phone, Search } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { CustomerCard, DealRow } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Section,
} from '@/components/app/Primitives';
import {
  FLAG_TEXT,
  HiddenRecordsNote,
  InstallmentSummary,
  MoneyValue,
  SaleStatusPill,
  TIPS,
  Unavailable,
} from '@/components/app/Portfolio';
import { useDemoMode } from '@/components/app/DemoContext';
import { InfoTip } from '@/components/app/InfoTip';
import { DEMO_PROJECTS, demoCustomers } from '@/lib/demo';
import { NativeSelect, TextInput } from '@/components/app/FormControls';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { amount, date, initials, plural } from '@/lib/format';
import {
  COUNT_ORDER,
  SALE_STATUS,
  previewUnits,
  unitStatusDetail,
} from '@/lib/portfolio';
import { cn } from '@/lib/utils';

const PAGE = 24;

export function dealProgress(d: DealRow): string {
  if (d.isClosed) return d.stage ?? 'Closed';
  if (d.reservationCreated) return 'Reservation created';
  if (d.eoiCreated) return 'EOI created';
  return 'No EOI yet';
}

export default function CustomersPage() {
  const me = useMe();
  const { demo } = useDemoMode();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Page size, reset whenever the filters change.
  const [paging, setPaging] = useState({ key: '', count: PAGE });
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') ?? '';
  const facets = useApi(() => salesApi.unitFacets(), []);
  const { data, loading, error, errorInfo, reload } = useApi(
    () =>
      demo
        ? Promise.resolve(
            demoCustomers(me.today, search || undefined, projectId || undefined)
          )
        : salesApi.customers(search || undefined, projectId || undefined),
    [search, projectId, demo]
  );
  const projects: { id: string; name?: string }[] = demo
    ? [...DEMO_PROJECTS]
    : (facets.data?.projects ?? []);
  const filterKey = `${search}|${projectId}|${demo}`;
  const shown = paging.key === filterKey ? paging.count : PAGE;
  const setProject = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('projectId', value);
    else next.delete('projectId');
    setParams(next, { replace: true });
  };
  const filtered = Boolean(search || projectId);
  const cur = me.currencyCode;

  return (
    <>
      <PageHeader
        eyebrow="My customers"
        title={
          <span className="inline-flex items-center gap-2">
            Customers
          </span>
        }
        description="One card per customer, with their units and payments."
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <NativeSelect
          aria-label="Filter by project"
          className="sm:w-56"
          value={projectId}
          onChange={e => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <TextInput
            type="search"
            aria-label="Search customers"
            placeholder="Search name or phone"
            className="pl-9"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
      </div>
      {loading && !data ? (
        <LoadingBlock rows={4} label="Loading customers" />
      ) : error && !data ? (
        <ErrorState
          message={error}
          status={errorInfo?.status}
          detail={errorInfo?.detail}
          onRetry={reload}
        />
      ) : data && data.customers.length === 0 ? (
        <Section>
          <EmptyState
            icon={<Handshake className="size-5" />}
            title={
              filtered ? 'No customers match' : 'No customers on your deals yet'
            }
          >
            {filtered
              ? 'Try another name, phone number or project.'
              : 'Customers appear here once a lead is converted or a deal is assigned to you.'}
          </EmptyState>
        </Section>
      ) : data ? (
        <div className={cn('space-y-4', loading && 'opacity-60')}>
          <dl
            aria-label={
              filtered
                ? 'Totals for the matching customers'
                : 'Totals for all your customers'
            }
            className={cn(
              'grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border',
              demo ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-5'
            )}
          >
            <Total
              label={filtered ? 'Matching customers' : 'Customers'}
              value={data.totals.customers}
            />
            <Total label="Units sold" value={data.totals.sold} />
            <Total label="Reserved" value={data.totals.reserved} />
            <Total label="Held by EOI" value={data.totals.eoiHold} />
            <Total
              label={
                <>
                  Confirmed paid <InfoTip>{TIPS.confirmedPaid}</InfoTip>
                </>
              }
              value={
                <MoneyValue value={data.totals.confirmedPaid} currency={cur} />
              }
              className={demo ? undefined : 'col-span-2 sm:col-span-1'}
            />
            {demo && (
              <Total
                label="Remaining payable"
                value={
                  <MoneyValue
                    value={data.totals.remainingPayable}
                    currency={cur}
                  />
                }
              />
            )}
          </dl>
          {data.truncated && (
            <p role="status" className="text-sm text-amber-900">
              You have more records than this page can combine. Narrow the list
              with a project or search to see complete figures.
            </p>
          )}
          <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {data.customers.slice(0, shown).map(c => (
              <li key={c.id} className="min-w-0">
                <CustomerCardView customer={c} currency={cur} />
              </li>
            ))}
          </ul>
          {data.customers.length > shown && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() =>
                  setPaging({ key: filterKey, count: shown + PAGE })
                }
              >
                Show more customers ({data.customers.length - shown} more)
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function Total({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-card px-4 py-3', className)}>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-xl font-semibold tracking-tight text-brand-navy">
        {value}
      </dd>
    </div>
  );
}

function CustomerCardView({
  customer: c,
  currency,
}: {
  customer: CustomerCard;
  currency: string;
}) {
  const { shown, more } = previewUnits(c.units);
  const phone = c.mobile ?? c.phone;
  const to = `/customers/account/${c.id}`;
  const p = c.payments;
  const hasUnits = c.units.length > 0;
  const committed = c.counts.sold + c.counts.reserved > 0;
  return (
    <article
      aria-labelledby={`customer-${c.id}`}
      className="flex h-full flex-col rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(20,30,60,0.04)]"
    >
      {/* 1. Who */}
      <header className="flex items-start gap-3 px-4 pt-4">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-mist text-sm font-semibold text-brand-navy"
          aria-hidden="true"
        >
          {initials(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id={`customer-${c.id}`}
            className="truncate text-base font-semibold text-brand-navy"
          >
            <Link
              to={to}
              className="hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded"
            >
              {c.name ?? 'Unnamed customer'}
            </Link>
          </h2>
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-navy"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              <span dir="ltr">{phone}</span>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No phone recorded</p>
          )}
        </div>
      </header>

      {/* 2. Units and where each stands */}
      <div className="px-4 pt-3">
        <div className="flex flex-wrap gap-1.5" aria-label="Units by status">
          {COUNT_ORDER.map(({ key, status }) => (
            <span
              key={key}
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                c.counts[key] > 0
                  ? 'bg-brand-mist font-medium text-brand-navy'
                  : 'bg-muted/60 text-muted-foreground'
              )}
            >
              <span className="font-semibold">{c.counts[key]}</span>{' '}
              {SALE_STATUS[status].plural}
            </span>
          ))}
        </div>
        {hasUnits ? (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {shown.map(u => (
              <li
                key={u.key}
                className="flex items-start justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    Unit {u.unitName ?? '—'}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {u.projectName ?? 'No project'}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {unitStatusDetail(u)}
                  </div>
                </div>
                <SaleStatusPill status={u.saleStatus} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No EOI or reservation yet · {plural(c.counts.deals, 'deal')}
          </p>
        )}
        {more > 0 && (
          <Link
            to={to}
            className="mt-1.5 inline-block text-sm font-medium text-brand-steel hover:text-brand-navy hover:underline"
          >
            View all {c.units.length} units
          </Link>
        )}
      </div>

      {/* 3. Payment summary */}
      <dl className="mx-4 mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg bg-muted/50 px-3 py-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Confirmed paid</dt>
          <dd className="text-lg font-semibold text-brand-navy">
            <MoneyValue value={p.confirmedPaid} currency={currency} />
          </dd>
          {p.refunds != null && p.refunds > 0 && (
            <dd className="text-xs text-muted-foreground">
              after {amount(p.refunds, currency)} refunded
            </dd>
          )}
        </div>
        {committed ? (
          <div>
            <dt className="text-xs text-muted-foreground">Remaining payable</dt>
            <dd className="text-lg font-semibold text-brand-navy">
              {p.installmentsRecorded ? (
                <MoneyValue value={p.remainingPayable} currency={currency} />
              ) : (
                <NotRecorded />
              )}
            </dd>
            <dd className="text-xs text-muted-foreground">
              of <MoneyValue value={p.propertyPrice} currency={currency} /> unit
              price
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs text-muted-foreground">Awaiting finance</dt>
            <dd className="font-medium">
              {p.pendingConfirmation == null ? (
                <Unavailable>Not available</Unavailable>
              ) : p.pendingConfirmation > 0 ? (
                amount(p.pendingConfirmation, currency)
              ) : (
                'None'
              )}
            </dd>
          </div>
        )}
        {committed && (
          <>
            <div>
              <dt className="text-xs text-muted-foreground">Instalments</dt>
              <dd className="font-medium">
                {p.installmentsRecorded && p.installments ? (
                  <InstallmentSummary counts={p.installments} />
                ) : (
                  <NotRecorded />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {p.installmentsRecorded && p.overdue
                  ? 'Overdue'
                  : 'Next payment'}
              </dt>
              <dd className="font-medium">
                {!p.installmentsRecorded ? (
                  <NotRecorded />
                ) : p.overdue ? (
                  <span className="text-rose-700">
                    {amount(p.overdue, currency)}
                  </span>
                ) : p.nextPayment ? (
                  <>
                    {amount(p.nextPayment.amount, currency)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {' '}
                      · {date(p.nextPayment.dueDate)}
                    </span>
                  </>
                ) : (
                  'None due'
                )}
              </dd>
            </div>
            {(p.pendingConfirmation ?? 0) > 0 && (
              <div className="col-span-2 text-xs text-amber-900">
                {amount(p.pendingConfirmation, currency)} awaiting finance
                confirmation
              </div>
            )}
          </>
        )}
      </dl>

      {(c.hiddenRecords || c.flags.length > 0) && (
        <div className="mx-4 mt-2 space-y-1">
          {c.hiddenRecords && <HiddenRecordsNote />}
          {c.flags.map(f => (
            <p key={f} className="text-xs text-amber-900">
              {FLAG_TEXT[f]}
            </p>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-4 pt-3 text-xs text-muted-foreground">
        <span>
          {plural(c.counts.deals, 'deal')}
          {c.counts.closed > 0 ? ` · ${c.counts.closed} released` : ''}
        </span>
        <Button asChild variant="outline" size="lg">
          <Link to={to} aria-label={`View ${c.name ?? 'customer'}`}>
            View customer <ChevronRight />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function NotRecorded() {
  return (
    <span className="inline-flex items-center gap-1">
      <Unavailable />
      <InfoTip label="Why not recorded">{TIPS.notRecorded}</InfoTip>
    </span>
  );
}
