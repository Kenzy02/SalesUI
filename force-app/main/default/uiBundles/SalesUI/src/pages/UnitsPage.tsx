import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  BedDouble,
  Building2,
  ChevronLeft,
  ChevronRight,
  Info,
  LayoutGrid,
  List,
  Maximize2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { ProjectFacet, UnitRow } from '@/api/salesTypes';
import { CustomerContextBanner, useCustomerContext } from '@/components/app/CustomerContext';
import { useMe } from '@/components/app/MeContext';
import { FormField, NativeSelect, TextInput } from '@/components/app/FormControls';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { UnitPhoto } from '@/components/app/UnitPhoto';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { area, money } from '@/lib/format';
import { unitStatus } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';
import { unitTypeAfterProjectChange, unitTypesFor } from '@/lib/unitFilters';

/** Inventory__c filters, all applied on the server (count and pages cover every match). */
const FILTER_KEYS = ['projectId', 'unitType', 'status', 'zone', 'minBedrooms', 'minPrice', 'maxPrice', 'search'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
/** Non-filter keys kept in the URL: customer context, paging, and "customer interest already applied". */
const KEEP_KEYS = ['dealId', 'leadId', 'ctx'];

export default function UnitsPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>(() => (storageGet('units.view') === 'list' ? 'list' : 'grid'));
  const [showMore, setShowMore] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const facets = useApi(() => salesApi.unitFacets(), []);
  const customer = useCustomerContext(params);

  // Available units by default; "Any status" is an explicit empty value in the URL.
  const filters = useMemo(() => {
    const f = {} as Record<FilterKey, string>;
    for (const k of FILTER_KEYS) f[k] = params.get(k) ?? '';
    if (!params.has('status')) f.status = 'Available';
    return f;
  }, [params]);
  const page = Number(params.get('page') ?? '1') || 1;

  const update = (changes: Partial<Record<FilterKey | 'ctx' | 'dealId' | 'leadId', string>>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' && k !== 'status') next.delete(k);
      else next.set(k, v as string);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // Start from the customer's recorded interest once; later changes are the rep's own browsing.
  useEffect(() => {
    const c = customer.data;
    if (!c || params.get('ctx') === '1' || !facets.data) return;
    const changes: Record<string, string> = { ctx: '1' };
    if (c.projectId && !params.get('projectId')) changes.projectId = c.projectId;
    const typeKnown = facets.data.typesByProject.some(t => t.projectId === (changes.projectId ?? params.get('projectId')) && t.unitType === c.unitType);
    if (c.unitType && typeKnown && !params.get('unitType')) changes.unitType = c.unitType;
    update(changes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.data, facets.data]);

  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== filters.search) update({ search: searchInput.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const units = useApi(() => salesApi.units({ ...filters, page }), [JSON.stringify(filters), page]);

  const projects = facets.data?.projects ?? [];
  const selectedProject = projects.find(p => p.id === filters.projectId);
  const typeOptions = useMemo(() => unitTypesFor(facets.data, filters.projectId), [facets.data, filters.projectId]);
  const zones = [...new Set((facets.data?.zones ?? []).filter(z => !filters.projectId || z.projectId === filters.projectId).map(z => z.zone))];

  const chooseProject = (projectId: string) => {
    const changes: Partial<Record<FilterKey, string>> = { projectId, zone: '' };
    if (filters.unitType && !unitTypeAfterProjectChange(facets.data, projectId, filters.unitType)) {
      changes.unitType = '';
      const name = projects.find(p => p.id === projectId)?.name ?? 'this project';
      setAnnouncement(`Unit type ${filters.unitType} cleared: ${name} has no ${filters.unitType} units.`);
    } else {
      setAnnouncement('');
    }
    update(changes);
  };

  const clearAll = () => {
    const next = new URLSearchParams();
    for (const k of KEEP_KEYS) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    setSearchInput('');
    setAnnouncement('');
    setParams(next, { replace: true });
  };

  const clearCustomer = () => {
    const next = new URLSearchParams(params);
    next.delete('dealId');
    next.delete('leadId');
    next.delete('ctx');
    setParams(next, { replace: true });
  };

  const chips = activeChips(filters, projects, me.currencyCode);
  const totalPages = units.data ? Math.max(1, Math.ceil(units.data.total / units.data.pageSize)) : 1;
  const linkSuffix = `?${params.toString()}`;

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Units"
        description="Live availability and prices from Salesforce. Pick the customer's project, then the unit type."
        actions={
          <div role="group" aria-label="Layout" className="flex rounded-lg border border-border bg-white p-0.5">
            <ViewButton active={view === 'grid'} onClick={() => setViewStored('grid')} label="Card view">
              <LayoutGrid className="size-4" />
            </ViewButton>
            <ViewButton active={view === 'list'} onClick={() => setViewStored('list')} label="List view">
              <List className="size-4" />
            </ViewButton>
          </div>
        }
      />

      <CustomerContextBanner context={customer.data} error={customer.error} onClear={clearCustomer} />

      <Section className="mb-4">
        {facets.error ? (
          <ErrorState message={facets.error} status={facets.errorInfo?.status} detail={facets.errorInfo?.detail} onRetry={facets.reload} compact />
        ) : (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-brand-navy">1. Project</legend>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                <ChoiceChip active={!filters.projectId} onClick={() => chooseProject('')}>
                  All projects
                </ChoiceChip>
                {projects.map(p => (
                  <ChoiceChip key={p.id} active={filters.projectId === p.id} onClick={() => chooseProject(p.id)}>
                    {p.name}
                    {p.availableUnits != null && <span className="ml-1.5 opacity-70">{p.availableUnits}</span>}
                    {p.status && p.status !== 'Selling' && <span className="ml-1.5 text-[11px] opacity-80">({p.status})</span>}
                  </ChoiceChip>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Numbers show available units in each project.</p>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-brand-navy">
                2. Unit type{selectedProject ? ` in ${selectedProject.name}` : ''}
              </legend>
              <div className="flex flex-wrap gap-2">
                <ChoiceChip active={!filters.unitType} onClick={() => update({ unitType: '' })}>
                  Any type
                </ChoiceChip>
                {typeOptions.map(t => (
                  <ChoiceChip key={t.value} active={filters.unitType === t.value} onClick={() => update({ unitType: t.value })}>
                    {t.value}
                    <span className="ml-1.5 opacity-70">{t.available}</span>
                  </ChoiceChip>
                ))}
              </div>
              <p className="sr-only" aria-live="polite">
                {announcement}
              </p>
              {announcement && <p className="mt-1 text-xs font-medium text-amber-800">{announcement}</p>}
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-end">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <TextInput
                  type="search"
                  aria-label="Search units by unit, code or building"
                  placeholder="Search unit, code or building"
                  className="pl-9"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                />
              </div>
              <FormField label="Availability" className="md:w-44">
                {p => (
                  <NativeSelect {...p} value={filters.status} onChange={e => update({ status: e.target.value })}>
                    <option value="">Any status</option>
                    {facets.data?.statuses.map(s => (
                      <option key={s.value} value={s.value}>
                        {unitStatus(s.value).label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <Button
                variant="outline"
                size="lg"
                className="h-10"
                aria-expanded={showMore}
                aria-controls="more-unit-filters"
                onClick={() => setShowMore(s => !s)}
              >
                <SlidersHorizontal /> More filters
              </Button>
            </div>
            <div id="more-unit-filters" hidden={!showMore} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Bedrooms">
                {p => (
                  <NativeSelect {...p} value={filters.minBedrooms} onChange={e => update({ minBedrooms: e.target.value })}>
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>
                        {n}+
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField label="Zone">
                {p => (
                  <NativeSelect {...p} value={filters.zone} onChange={e => update({ zone: e.target.value })} disabled={zones.length === 0}>
                    <option value="">{zones.length ? 'Any zone' : 'No zones recorded'}</option>
                    {zones.map(z => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <PriceInput label={`Min price (${me.currencyCode})`} value={filters.minPrice} onCommit={v => update({ minPrice: v })} />
              <PriceInput label={`Max price (${me.currencyCode})`} value={filters.maxPrice} onCommit={v => update({ maxPrice: v })} />
            </div>
          </div>
        )}
      </Section>

      {selectedProject && selectedProject.hasPaymentPlans === false && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="note">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>{selectedProject.name}</strong> has no active payment plan in Salesforce, so EOIs can't be created for its units yet.
            You can still check availability. Ask your sales admin to publish a plan.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
        <span className="text-sm font-medium text-brand-navy">
          {units.data ? `${units.data.total.toLocaleString('en-US')} ${units.data.total === 1 ? 'unit' : 'units'} match` : 'Searching…'}
        </span>
        {chips.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => removeChip(c.key)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-brand-navy hover:border-brand-steel focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={`Remove filter ${c.label}`}
          >
            {c.label} <X className="size-3" aria-hidden="true" />
          </button>
        ))}
        {chips.length > 0 && (
          <button type="button" onClick={clearAll} className="text-xs font-semibold text-brand-steel underline-offset-2 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {units.loading && !units.data ? (
        <LoadingBlock rows={4} label="Loading units" />
      ) : units.error && !units.data ? (
        <ErrorState message={units.error} status={units.errorInfo?.status} detail={units.errorInfo?.detail} onRetry={units.reload} />
      ) : units.data && units.data.units.length === 0 ? (
        <Section>
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="No units match these filters"
            action={
              chips.length ? (
                <Button variant="outline" size="lg" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            Try another unit type, widen the price range, or include other availability statuses.
          </EmptyState>
        </Section>
      ) : units.data ? (
        <div className={cn(units.loading && 'opacity-60 transition-opacity')} aria-busy={units.loading}>
          {view === 'grid' ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {units.data.units.map(u => (
                <li key={u.id}>
                  <UnitCard unit={u} currency={me.currencyCode} to={`/units/${u.id}${linkSuffix}`} />
                </li>
              ))}
            </ul>
          ) : (
            <Section>
              <UnitTable units={units.data.units} currency={me.currencyCode} linkSuffix={linkSuffix} />
            </Section>
          )}
          {totalPages > 1 && (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" size="lg" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                <ChevronLeft /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="lg" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                Next <ChevronRight />
              </Button>
            </nav>
          )}
        </div>
      ) : null}
    </>
  );

  function removeChip(key: FilterKey) {
    if (key === 'search') setSearchInput('');
    update({ [key]: key === 'status' ? 'Available' : '' });
  }

  function setPage(p: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setViewStored(v: 'grid' | 'list') {
    setView(v);
    storageSet('units.view', v);
  }
}

function activeChips(f: Record<FilterKey, string>, projects: ProjectFacet[], currency: string) {
  const chips: { key: FilterKey; label: string }[] = [];
  if (f.projectId) chips.push({ key: 'projectId', label: projects.find(p => p.id === f.projectId)?.name ?? 'Project' });
  if (f.unitType) chips.push({ key: 'unitType', label: f.unitType });
  if (f.status !== 'Available') chips.push({ key: 'status', label: f.status ? unitStatus(f.status).label : 'Any status' });
  if (f.zone) chips.push({ key: 'zone', label: f.zone });
  if (f.minBedrooms) chips.push({ key: 'minBedrooms', label: `${f.minBedrooms}+ bedrooms` });
  if (f.minPrice) chips.push({ key: 'minPrice', label: `From ${money(Number(f.minPrice), currency)}` });
  if (f.maxPrice) chips.push({ key: 'maxPrice', label: `Up to ${money(Number(f.maxPrice), currency)}` });
  if (f.search) chips.push({ key: 'search', label: `“${f.search}”` });
  return chips;
}

function UnitCard({ unit, currency, to }: { unit: UnitRow; currency: string; to: string }) {
  const s = unitStatus(unit.status);
  return (
    <Link
      to={to}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(20,30,60,0.04)] transition hover:-translate-y-0.5 hover:border-brand-steel/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[16/9]">
        <UnitPhoto file={unit.coverImage} alt={`Unit ${unit.name}`} />
        <StatusPill tone={s.tone} className="absolute right-3 top-3 shadow-sm">
          {s.label}
        </StatusPill>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-steel">
          {unit.projectName}
          {unit.buildingName ? ` · Building ${unit.buildingName}` : ''}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-brand-navy">
            {unit.unitType ?? 'Unit'} {unit.name}
          </h2>
          {unit.zone && <span className="text-xs text-muted-foreground">{unit.zone}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {unit.bedrooms != null && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="size-4" aria-hidden="true" /> {unit.bedrooms} bed
            </span>
          )}
          {unit.builtUpArea != null && (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="size-3.5" aria-hidden="true" /> {area(unit.builtUpArea)}
            </span>
          )}
          {unit.floor != null && <span>Floor {unit.floor}</span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="text-xl font-semibold text-brand-navy">{money(unit.listPrice, currency)}</div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-steel group-hover:text-brand-navy">
            Plans & EOI <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function UnitTable({ units, currency, linkSuffix }: { units: UnitRow[]; currency: string; linkSuffix: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Units matching the filters</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Unit</th>
            <th scope="col" className="py-2 pr-3 font-medium">Project</th>
            <th scope="col" className="py-2 pr-3 font-medium">Type</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Bedrooms</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Area</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Price</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {units.map(u => {
            const s = unitStatus(u.status);
            return (
              <tr key={u.id} className="hover:bg-muted/50">
                <td className="py-2.5 pr-3">
                  <Link to={`/units/${u.id}${linkSuffix}`} className="rounded font-medium text-brand-navy hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    {u.name}
                  </Link>
                  {u.buildingName && <span className="text-xs text-muted-foreground"> · Bldg {u.buildingName}</span>}
                </td>
                <td className="py-2.5 pr-3">{u.projectName}</td>
                <td className="py-2.5 pr-3">{u.unitType ?? '—'}</td>
                <td className="py-2.5 pr-3 text-right">{u.bedrooms ?? '—'}</td>
                <td className="py-2.5 pr-3 text-right">{area(u.builtUpArea)}</td>
                <td className="py-2.5 pr-3 text-right font-medium">{money(u.listPrice, currency)}</td>
                <td className="py-2.5">
                  <StatusPill tone={s.tone}>{s.label}</StatusPill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChoiceChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active ? 'border-brand-navy bg-brand-navy text-white' : 'border-border bg-white text-foreground hover:border-brand-steel hover:text-brand-navy'
      )}
    >
      {children}
    </button>
  );
}

function PriceInput({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  const commit = () => {
    const digits = text.replace(/[^\d]/g, '');
    if (digits !== value) onCommit(digits);
  };
  return (
    <FormField label={label}>
      {p => (
        <TextInput
          {...p}
          inputMode="numeric"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
        />
      )}
    </FormField>
  );
}

function ViewButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'flex size-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active ? 'bg-brand-navy text-white' : 'text-muted-foreground hover:text-brand-navy'
      )}
    >
      {children}
    </button>
  );
}

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* preference only */
  }
}
