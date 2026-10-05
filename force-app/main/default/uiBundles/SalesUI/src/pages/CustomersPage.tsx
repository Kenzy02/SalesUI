import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Handshake, Search } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { DealRow } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { NativeSelect, TextInput } from '@/components/app/FormControls';
import { useApi } from '@/hooks/useApi';
import { money } from '@/lib/format';
import { DEAL_STAGE } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

export function dealProgress(d: DealRow): string {
  if (d.isClosed) return d.stage ?? 'Closed';
  if (d.reservationCreated) return 'Reservation created';
  if (d.eoiCreated) return 'EOI created';
  return 'No EOI yet';
}

export default function CustomersPage() {
  const me = useMe();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') ?? '';
  const facets = useApi(() => salesApi.unitFacets(), []);
  const { data, loading, error, errorInfo, reload } = useApi(
    () => salesApi.deals(search || undefined, projectId || undefined),
    [search, projectId]
  );
  const setProject = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('projectId', value);
    else next.delete('projectId');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Customer deals"
        title="Customers"
        description="Deals you own in Salesforce. An EOI and unit hold always start from one of these deals."
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <NativeSelect aria-label="Filter by deal project" className="sm:w-56" value={projectId} onChange={e => setProject(e.target.value)}>
        <option value="">All projects</option>
        {facets.data?.projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <TextInput
          type="search"
          aria-label="Search customers"
          placeholder="Search customer or deal"
          className="pl-9"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
      </div>
      </div>
      {loading && !data ? (
        <LoadingBlock rows={4} label="Loading customers" />
      ) : error && !data ? (
        <ErrorState message={error} status={errorInfo?.status} detail={errorInfo?.detail} onRetry={reload} />
      ) : data && data.deals.length === 0 ? (
        <Section>
          <EmptyState icon={<Handshake className="size-5" />} title={search || projectId ? 'No customers match' : 'No customer deals assigned to you'}>
            {search || projectId
              ? 'Try another name or project.'
              : 'Deals you own appear here once a qualified lead is converted in Salesforce or a deal is assigned to you.'}
          </EmptyState>
        </Section>
      ) : data ? (
        <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', loading && 'opacity-60')}>
          {data.deals.map(d => (
            <Link
              key={d.id}
              to={`/customers/${d.id}`}
              className="group rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(20,30,60,0.04)] transition-colors hover:border-brand-steel/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-brand-navy">{d.customerName ?? d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{d.mobile ?? d.email ?? '—'}</div>
                </div>
                <StatusPill tone={DEAL_STAGE[d.stage ?? ''] ?? 'neutral'}>{d.stage}</StatusPill>
              </div>
              <div className="mt-3 text-sm">
                <div>{d.projectName ?? 'No project set'}</div>
                <div className="text-xs text-muted-foreground">
                  {d.interestedUnitName ? `Unit ${d.interestedUnitName} · ` : ''}
                  {dealProgress(d)}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="font-medium text-brand-navy">{d.amount ? money(d.amount, me.currencyCode) : ''}</span>
                <ChevronRight className="size-4 text-muted-foreground group-hover:text-brand-navy" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
