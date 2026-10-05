import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Mail, Phone, Search, Users } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import { useMe } from '@/components/app/MeContext';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { NativeSelect, TextInput } from '@/components/app/FormControls';
import { useApi } from '@/hooks/useApi';
import { area, date, daysUntil } from '@/lib/format';
import { LEAD_STATUS } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

export default function LeadsPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const projectId = params.get('projectId') ?? '';
  const facets = useApi(() => salesApi.unitFacets(), []);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [search, setSearch] = useState(searchInput);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, loading, error, errorInfo, reload } = useApi(
    () => salesApi.leads(status || undefined, search || undefined, projectId || undefined),
    [status, search, projectId]
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const setStatus = (value: string) => setParam('status', value);

  return (
    <>
      <PageHeader
        eyebrow="Customer pipeline"
        title="My leads"
        description="Leads assigned to you in Salesforce. Only leads you own are listed."
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {[{ value: '', label: 'All' }, ...(data?.statusOptions ?? [])].map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStatus(o.value)}
              aria-pressed={status === o.value}
              className={cn(
                'min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                status === o.value
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : 'border-border bg-white text-muted-foreground hover:border-brand-steel hover:text-brand-navy'
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
        <NativeSelect
          aria-label="Filter by project of interest"
          className="sm:w-56"
          value={projectId}
          onChange={e => setParam('projectId', e.target.value)}
        >
          <option value="">All projects of interest</option>
          {facets.data?.projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <TextInput
            type="search"
            aria-label="Search leads by name, mobile or email"
            placeholder="Search name, mobile or email"
            className="pl-9"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        </div>
      </div>
      {projectId && (
        <p className="-mt-2 mb-4 text-xs text-muted-foreground">
          Matches the lead's first or second project of interest. Leads don't record a preferred unit type in Salesforce.
        </p>
      )}

      {loading && !data ? (
        <LoadingBlock rows={5} label="Loading leads" />
      ) : error && !data ? (
        <ErrorState message={error} status={errorInfo?.status} detail={errorInfo?.detail} onRetry={reload} />
      ) : data && data.leads.length === 0 ? (
        <Section>
          <EmptyState icon={<Users className="size-5" />} title={status || search || projectId ? 'No leads match' : 'No leads assigned to you'}>
            {status || search || projectId ? 'Try another status, project or search term.' : 'New leads routed to you in Salesforce will appear here.'}
          </EmptyState>
        </Section>
      ) : data ? (
        <Section className={cn(loading && 'opacity-60 transition-opacity')}>
          <p className="sr-only" aria-live="polite">
            {data.leads.length} leads
          </p>
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Lead</th>
                <th scope="col" className="py-2 pr-3 font-medium">Interest</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 font-medium">Next follow-up</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.leads.map(l => (
                <tr key={l.id} className="group hover:bg-muted/50">
                  <td className="py-3 pr-3">
                    <Link to={`/leads/${l.id}`} className="font-medium text-brand-navy hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded">
                      {l.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[l.mobile, l.source].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div>{l.projectInterest ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {[l.interestedUnit && `Unit ${l.interestedUnit}`, l.desiredArea && area(l.desiredArea)].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <StatusPill tone={LEAD_STATUS[l.status ?? ''] ?? 'neutral'}>{l.status ?? '—'}</StatusPill>
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">
                    <FollowUpText lead={l} today={me.today} />
                  </td>
                  <td className="py-3 text-right">
                    <Link to={`/leads/${l.id}`} aria-label={`Open ${l.name}`} className="inline-flex rounded p-1 text-muted-foreground group-hover:text-brand-navy">
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <ul className="divide-y divide-border md:hidden">
            {data.leads.map(l => (
              <li key={l.id}>
                <Link to={`/leads/${l.id}`} className="flex items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-brand-navy">{l.name}</span>
                      <StatusPill tone={LEAD_STATUS[l.status ?? ''] ?? 'neutral'}>{l.status}</StatusPill>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[l.projectInterest, l.mobile].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {data.leads.length === 200 && (
            <p className="pt-3 text-xs text-muted-foreground">Showing the 200 most recent leads. Search to narrow the list.</p>
          )}
        </Section>
      ) : null}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Phone className="size-3" aria-hidden="true" /> Contact details come from the lead record</span>
        <span className="inline-flex items-center gap-1"><Mail className="size-3" aria-hidden="true" /> Lead assignment is managed by Salesforce routing</span>
      </p>
    </>
  );
}

function FollowUpText({ lead, today }: { lead: { nextFollowUp?: { subject?: string; dueDate?: string }; lastActivityDate?: string }; today: string }) {
  if (lead.nextFollowUp) {
    const overdue = (daysUntil(lead.nextFollowUp.dueDate, today) ?? 0) < 0;
    return (
      <span className={overdue ? 'font-medium text-rose-700' : undefined}>
        {lead.nextFollowUp.subject} · {date(lead.nextFollowUp.dueDate)}
        {overdue ? ' (overdue)' : ''}
      </span>
    );
  }
  return <span>{lead.lastActivityDate ? `Last activity ${date(lead.lastActivityDate)}` : 'None scheduled'}</span>;
}
