import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Building2,
  CircleDollarSign,
  Hourglass,
  Search,
  Target,
  Wallet,
} from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import { useDemoMode } from '@/components/app/DemoContext';
import { NativeSelect, TextInput } from '@/components/app/FormControls';
import { InfoTip } from '@/components/app/InfoTip';
import { useMe } from '@/components/app/MeContext';
import { SaleStatusPill } from '@/components/app/Portfolio';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Section,
  StatusPill,
} from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import {
  DEMO_ASSUMPTIONS,
  commissionViewTotals,
  demoCommissionView,
  filterViewLines,
  liveCommissionView,
  type CommissionView,
  type CommissionViewLine,
} from '@/lib/commissionView';
import { amount, date, money } from '@/lib/format';
import { optionsFrom } from '@/lib/portfolio';
import { cn } from '@/lib/utils';

const REMAINING_TIP =
  'Instalment receipts aren’t recorded in Salesforce, so the unpaid balance (and the commission still to come on it) can’t be worked out yet.';

export default function CommissionPage() {
  const me = useMe();
  const { demo } = useDemoMode();
  const {
    data: view,
    loading,
    error,
    errorInfo,
    reload,
  } = useApi<CommissionView>(
    () =>
      demo
        ? Promise.resolve(demoCommissionView(me.today, me.currencyCode))
        : salesApi.commission().then(liveCommissionView),
    [demo]
  );
  const [projectId, setProjectId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  // Filters belong to one data source: reset them when switching between live and demo.
  const [source, setSource] = useState(view?.source);
  if (view && view.source !== source) {
    setSource(view.source);
    setProjectId('');
    setCustomerId('');
    setSearch('');
  }

  const all = useMemo(() => view?.lines ?? [], [view]);
  const lines = useMemo(
    () => filterViewLines(all, { projectId, customerId, search }),
    [all, projectId, customerId, search]
  );
  const sold = lines.filter(l => l.saleStatus === 'SOLD');
  // Reserved and held units, plus released units that still carry commission (live).
  const pipeline = lines.filter(l => l.saleStatus !== 'SOLD');
  const t = commissionViewTotals(lines);
  const projects = useMemo(
    () =>
      optionsFrom(
        all,
        l => l.projectId,
        l => l.projectName
      ),
    [all]
  );
  const customers = useMemo(
    () =>
      optionsFrom(
        all,
        l => l.customerId,
        l => l.customerName
      ),
    [all]
  );
  const filtered = Boolean(projectId || customerId || search.trim());
  const cur = view?.currencyCode ?? me.currencyCode;
  const m = (v: number | null | undefined) =>
    v == null ? '—' : money(v, cur, 2);
  const live = view?.source === 'live';

  return (
    <>
      <PageHeader
        eyebrow="My performance"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            My commission
            {!demo && view?.ratePct != null ? (
              <StatusPill tone="neutral" className="text-xs">
                Estimate · {view.ratePct}% proposed rate
              </StatusPill>
            ) : null}
          </span>
        }
        description="Commission on the units you sold, from the payments collected on them."
      />
      {loading && !view ? (
        <LoadingBlock rows={4} label="Loading commission" />
      ) : error && !view ? (
        <ErrorState
          message={error}
          status={errorInfo?.status}
          detail={errorInfo?.detail}
          onRetry={reload}
        />
      ) : view ? (
        <div className={cn('space-y-6', loading && 'opacity-60')}>
          {view.ratePct == null && live && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              No commission rate is active, so no commission is calculated.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <NativeSelect
              aria-label="Filter by project"
              className="sm:w-52"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by customer"
              className="sm:w-60"
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
            >
              <option value="">All customers</option>
              {customers.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <TextInput
                type="search"
                aria-label="Search unit, customer or record"
                placeholder="Search unit or customer"
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {filtered && (
              <Button
                variant="ghost"
                onClick={() => {
                  setProjectId('');
                  setCustomerId('');
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          <dl
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            aria-label={
              filtered
                ? 'Totals for the filtered units'
                : 'Totals for your sold units'
            }
          >
            <Stat
              icon={<CircleDollarSign />}
              label="Commission on collections"
              value={m(t.onCollections)}
              hint={`${money(t.eligibleCollections, cur)} collected on sold units`}
              accent
            />
            <Stat
              icon={<Hourglass />}
              label="Potential remaining commission"
              value={
                t.potentialRemaining == null
                  ? 'Not recorded'
                  : m(t.potentialRemaining)
              }
              hint={
                t.potentialRemaining == null
                  ? undefined
                  : 'On the unpaid balance of sold units'
              }
              tip={t.potentialRemaining == null ? REMAINING_TIP : undefined}
              muted={t.potentialRemaining == null}
            />
            <Stat
              icon={<Target />}
              label="Total potential commission"
              value={
                t.totalPotential == null ? 'Not recorded' : m(t.totalPotential)
              }
              hint={
                t.totalPotential == null
                  ? undefined
                  : 'Collected plus remaining'
              }
              tip={t.totalPotential == null ? REMAINING_TIP : undefined}
              muted={t.totalPotential == null}
            />
            <Stat
              icon={<Building2 />}
              label="Units sold"
              value={String(t.unitsSold)}
              hint={`${money(t.saleValue, cur)} total sale value`}
            />
          </dl>

          <Section
            title="Sold units"
            action={
              <span className="text-sm text-muted-foreground">
                {sold.length} {sold.length === 1 ? 'unit' : 'units'}
              </span>
            }
          >
            {sold.length === 0 ? (
              <EmptyState
                icon={<Wallet className="size-5" />}
                title={filtered ? 'No sold units match' : 'No sold units yet'}
              >
                {filtered
                  ? 'Try another project, customer or search.'
                  : 'Units appear here once their sale completes.'}
              </EmptyState>
            ) : (
              <SoldTable lines={sold} m={m} cur={cur} live={live} />
            )}
          </Section>

          {pipeline.length > 0 && (
            <Section
              title={
                pipeline.some(l => l.saleStatus === 'CLOSED')
                  ? 'Reserved, held and released units'
                  : 'Reserved and held units'
              }
              description="Not included in the totals above until the sale completes."
              action={
                <span className="text-right text-sm text-muted-foreground">
                  {live ? (
                    <>
                      On collections{' '}
                      <span className="font-semibold text-brand-navy">
                        {m(t.pipelineOnCollections)}
                      </span>
                    </>
                  ) : (
                    <>
                      Potential if completed{' '}
                      <span className="font-semibold text-brand-navy">
                        {m(t.pipelinePotential)}
                      </span>
                    </>
                  )}
                </span>
              }
            >
              <PipelineList lines={pipeline} m={m} cur={cur} live={live} />
            </Section>
          )}

          <details className="group rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer select-none font-medium text-brand-navy marker:text-brand-steel">
              How it’s calculated
            </summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
              {demo ? (
                <>
                  <p>
                    Demo assumptions (sample figures, not Amwaj’s approved
                    compensation policy):
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {DEMO_ASSUMPTIONS.map(a => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                  <p>
                    Example: a $200,000 sale with $50,000 collected shows $500
                    on collections, $1,500 remaining and $2,000 in total.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Commission = {view.ratePct ?? '—'}% of the payments finance
                    has confirmed on units from deals you own, once the signed
                    EOI is on file, less processed refunds. The rate is proposed
                    and not yet confirmed policy.
                  </p>
                  <p>Example: $60,000 collected × 1% = $600.</p>
                  <p>
                    Payouts aren’t recorded in Salesforce, so nothing is shown
                    as paid to you.
                  </p>
                </>
              )}
            </div>
          </details>
        </div>
      ) : null}
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tip,
  accent,
  muted,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tip?: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(20,30,60,0.04)]',
        accent ? 'border-brand-steel/40' : 'border-border'
      )}
    >
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="text-brand-steel [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0">{label}</span>
        {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
      </dt>
      <dd
        className={cn(
          'mt-2 text-xl font-semibold tracking-tight sm:text-2xl',
          muted
            ? 'text-base italic text-muted-foreground sm:text-base'
            : 'text-brand-navy'
        )}
      >
        {value}
      </dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function UnitCell({
  line: l,
  live,
}: {
  line: CommissionViewLine;
  live: boolean;
}) {
  return (
    <div className="min-w-0">
      {live && l.eoiId ? (
        <Link
          to={`/eois/${l.eoiId}`}
          className="font-medium text-brand-navy hover:underline"
        >
          {l.unitName ?? '—'}
        </Link>
      ) : (
        <span className="font-medium text-brand-navy">{l.unitName ?? '—'}</span>
      )}
      <div className="text-xs text-muted-foreground">
        {l.projectName ?? 'No project'}
      </div>
    </div>
  );
}

function CustomerCell({ line: l }: { line: CommissionViewLine }) {
  return l.customerId ? (
    <Link
      to={`/customers/account/${l.customerId}`}
      className="hover:text-brand-navy hover:underline"
    >
      {l.customerName ?? 'Customer'}
    </Link>
  ) : (
    <>{l.customerName ?? '—'}</>
  );
}

function Collected({
  line: l,
  cur,
}: {
  line: CommissionViewLine;
  cur: string;
}) {
  const pct = l.saleValue
    ? Math.min(100, Math.round((l.eligibleCollections / l.saleValue) * 100))
    : null;
  return (
    <div>
      <div className="tabular-nums">{amount(l.eligibleCollections, cur)}</div>
      {pct != null && (
        <div
          className="mt-1 flex items-center gap-2"
          aria-label={`${pct}% of the sale value collected`}
        >
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-brand-steel"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground">{pct}%</span>
        </div>
      )}
    </div>
  );
}

function SoldTable({
  lines,
  m,
  cur,
  live,
}: {
  lines: CommissionViewLine[];
  m: (v: number | null) => string;
  cur: string;
  live: boolean;
}) {
  const remaining = (l: CommissionViewLine) =>
    l.potentialRemaining == null ? (
      <span className="italic text-muted-foreground">Not recorded</span>
    ) : (
      m(l.potentialRemaining)
    );
  return (
    <>
      {/* Desktop and tablet */}
      <div className="relative -mx-4 hidden overflow-x-auto md:block sm:-mx-6">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">Commission per sold unit</caption>
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium sm:pl-6">
                Unit
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Customer
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Sale value
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Eligible collections
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Rate
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                On collections
              </th>
              <th
                scope="col"
                className="px-4 py-2 text-right font-medium sm:pr-6"
              >
                Potential remaining
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map(l => (
              <tr key={l.id} className="align-top">
                <td className="px-4 py-3 sm:pl-6">
                  <UnitCell line={l} live={live} />
                  {l.saleDate && (
                    <div className="text-xs text-muted-foreground">
                      Sold {date(l.saleDate)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <CustomerCell line={l} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {l.saleValue == null ? (
                    <span className="italic text-muted-foreground">
                      Not shared
                    </span>
                  ) : (
                    amount(l.saleValue, cur)
                  )}
                </td>
                <td className="px-3 py-3">
                  <Collected line={l} cur={cur} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {l.ratePct == null ? '—' : `${l.ratePct}%`}
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-brand-navy">
                  {m(l.commissionOnCollections)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums sm:pr-6">
                  {remaining(l)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phone */}
      <ul className="space-y-3 md:hidden">
        {lines.map(l => (
          <li key={l.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <UnitCell line={l} live={live} />
              <div className="text-right">
                <div className="text-base font-semibold text-brand-navy">
                  {m(l.commissionOnCollections)}
                </div>
                <div className="text-xs text-muted-foreground">
                  on collections
                </div>
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="text-right">
                <CustomerCell line={l} />
              </dd>
              <dt className="text-muted-foreground">Sale value</dt>
              <dd className="text-right tabular-nums">
                {l.saleValue == null ? 'Not shared' : amount(l.saleValue, cur)}
              </dd>
              <dt className="text-muted-foreground">Eligible collections</dt>
              <dd className="text-right tabular-nums">
                {amount(l.eligibleCollections, cur)}
              </dd>
              <dt className="text-muted-foreground">Rate</dt>
              <dd className="text-right">
                {l.ratePct == null ? '—' : `${l.ratePct}%`}
              </dd>
              <dt className="text-muted-foreground">Potential remaining</dt>
              <dd className="text-right tabular-nums">{remaining(l)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function PipelineList({
  lines,
  m,
  cur,
  live,
}: {
  lines: CommissionViewLine[];
  m: (v: number | null) => string;
  cur: string;
  live: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {lines.map(l => (
        <li
          key={l.id}
          className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <UnitCell line={l} live={live} />
            <SaleStatusPill status={l.saleStatus} />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm sm:justify-end">
            <span className="text-muted-foreground">
              <CustomerCell line={l} />
            </span>
            {l.saleValue != null && (
              <span className="tabular-nums text-muted-foreground">
                {amount(l.saleValue, cur)} sale value
              </span>
            )}
            {live && l.eligibleCollections === 0 ? (
              <span className="text-muted-foreground">
                No confirmed collections yet
              </span>
            ) : live ? (
              <span className="tabular-nums">
                <span className="font-semibold text-brand-navy">
                  {m(l.commissionOnCollections)}
                </span>{' '}
                <span className="text-muted-foreground">
                  on {amount(l.eligibleCollections, cur)} collected
                </span>
              </span>
            ) : (
              <span className="tabular-nums">
                <span className="font-semibold text-brand-navy">
                  {m(l.potentialRemaining)}
                </span>{' '}
                <span className="text-muted-foreground">if completed</span>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
