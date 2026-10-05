import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BedDouble, Building2, ChevronLeft, ChevronRight, LayoutGrid, List, Maximize2, Search, SlidersHorizontal } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { UnitRow } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import { FormField, NativeSelect, TextInput } from '@/components/app/FormControls';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { UnitPhoto } from '@/components/app/UnitPhoto';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { area, money } from '@/lib/format';
import { unitStatus } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

const FILTER_KEYS = ['projectId', 'unitType', 'status', 'zone', 'minBedrooms', 'minPrice', 'maxPrice', 'search'] as const;

export default function UnitsPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorageGet('units.view') === 'list' ? 'list' : 'grid'));
  const [showFilters, setShowFilters] = useState(false);
  const facets = useApi(() => salesApi.unitFacets(), []);

  // Default to available units; "Any status" is an explicit empty value.
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    for (const k of FILTER_KEYS) f[k] = params.get(k) ?? '';
    if (!params.has('status')) f.status = 'Available';
    return f;
  }, [params]);
  const page = Number(params.get('page') ?? '1') || 1;

  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== filters.search) update({ search: searchInput.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const units = useApi(() => salesApi.units({ ...filters, page }), [JSON.stringify(filters), page]);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    for (const k of FILTER_KEYS) if (next.get(k) === '' && k !== 'status') next.delete(k);
    next.delete('page');
    setParams(next, { replace: true });
  }

  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseView = (v: 'grid' | 'list') => {
    setView(v);
    localStorageSet('units.view', v);
  };

  const zones = (facets.data?.zones ?? []).filter(z => !filters.projectId || z.projectId === filters.projectId);
  const uniqueZones = [...new Set(zones.map(z => z.zone))];
  const totalPages = units.data ? Math.max(1, Math.ceil(units.data.total / units.data.pageSize)) : 1;
  const activeFilterCount = FILTER_KEYS.filter(k => k !== 'search' && k !== 'status' && filters[k]).length;

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Units"
        description="Live availability and prices from Salesforce. Choose a unit to see its payment plans and start an EOI."
        actions={
          <div role="group" aria-label="Layout" className="flex rounded-lg border border-border bg-white p-0.5">
            <ViewButton active={view === 'grid'} onClick={() => chooseView('grid')} label="Card view">
              <LayoutGrid className="size-4" />
            </ViewButton>
            <ViewButton active={view === 'list'} onClick={() => chooseView('list')} label="List view">
              <List className="size-4" />
            </ViewButton>
          </div>
        }
      />

      <Section className="mb-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
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
          <FormField label="Project" className="md:w-56">
            {p => (
              <NativeSelect {...p} value={filters.projectId} onChange={e => update({ projectId: e.target.value, zone: '' })}>
                <option value="">All projects</option>
                {facets.data?.projects.map(pr => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                    {pr.status && pr.status !== 'Selling' ? ` (${pr.status})` : ''}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
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
            aria-expanded={showFilters}
            aria-controls="more-unit-filters"
            onClick={() => setShowFilters(s => !s)}
          >
            <SlidersHorizontal /> More filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>
        </div>
        <div id="more-unit-filters" hidden={!showFilters} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5">
          <FormField label="Unit type">
            {p => (
              <NativeSelect {...p} value={filters.unitType} onChange={e => update({ unitType: e.target.value })}>
                <option value="">Any type</option>
                {facets.data?.unitTypes.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
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
              <NativeSelect {...p} value={filters.zone} onChange={e => update({ zone: e.target.value })} disabled={uniqueZones.length === 0}>
                <option value="">{uniqueZones.length ? 'Any zone' : 'No zones'}</option>
                {uniqueZones.map(z => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label={`Min price (${me.currencyCode})`}>
            {p => (
              <TextInput {...p} inputMode="numeric" defaultValue={filters.minPrice} onBlur={e => update({ minPrice: digits(e.target.value) })} />
            )}
          </FormField>
          <FormField label={`Max price (${me.currencyCode})`}>
            {p => (
              <TextInput {...p} inputMode="numeric" defaultValue={filters.maxPrice} onBlur={e => update({ maxPrice: digits(e.target.value) })} />
            )}
          </FormField>
        </div>
      </Section>

      {units.loading && !units.data ? (
        <LoadingBlock rows={4} label="Loading units" />
      ) : units.error && !units.data ? (
        <ErrorState message={units.error} onRetry={units.reload} />
      ) : units.data && units.data.units.length === 0 ? (
        <Section>
          <EmptyState icon={<Building2 className="size-5" />} title="No units match these filters">
            Widen the price range or choose another project.
          </EmptyState>
        </Section>
      ) : units.data ? (
        <div className={cn(units.loading && 'opacity-60 transition-opacity')} aria-busy={units.loading}>
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            {units.data.total.toLocaleString('en-US')} units
          </p>
          {view === 'grid' ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {units.data.units.map(u => (
                <li key={u.id}>
                  <UnitCard unit={u} currency={me.currencyCode} />
                </li>
              ))}
            </ul>
          ) : (
            <Section>
              <UnitTable units={units.data.units} currency={me.currencyCode} />
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
}

function UnitCard({ unit, currency }: { unit: UnitRow; currency: string }) {
  const s = unitStatus(unit.status);
  return (
    <Link
      to={`/units/${unit.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(20,30,60,0.04)] transition hover:-translate-y-0.5 hover:border-brand-steel/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[16/10]">
        <UnitPhoto file={unit.coverImage} alt={`Unit ${unit.name}`} />
        <StatusPill tone={s.tone} className="absolute right-3 top-3 shadow-sm">
          {s.label}
        </StatusPill>
      </div>
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-brand-steel">
          {unit.projectName}
          {unit.buildingName ? ` · Building ${unit.buildingName}` : ''}
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
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
        <div className="mt-3 text-xl font-semibold text-brand-navy">{money(unit.listPrice, currency)}</div>
      </div>
    </Link>
  );
}

function UnitTable({ units, currency }: { units: UnitRow[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Unit</th>
            <th scope="col" className="py-2 pr-3 font-medium">Project</th>
            <th scope="col" className="py-2 pr-3 font-medium">Type</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">Bedrooms</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">Area</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">Price</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {units.map(u => {
            const s = unitStatus(u.status);
            return (
              <tr key={u.id} className="hover:bg-muted/50">
                <td className="py-2.5 pr-3">
                  <Link to={`/units/${u.id}`} className="font-medium text-brand-navy hover:underline rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
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

function digits(v: string): string {
  return v.replace(/[^\d]/g, '');
}

function localStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* preference only */
  }
}
