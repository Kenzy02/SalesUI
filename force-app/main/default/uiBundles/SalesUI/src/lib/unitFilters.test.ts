import { describe, expect, it } from 'vitest';
import type { UnitFacets } from '@/api/salesTypes';
import { unitTypeAfterProjectChange, unitTypesFor } from './unitFilters';

// Shape of the AmwajReact inventory (available counts as of 5 Oct 2026).
const facets: UnitFacets = {
  projects: [],
  zones: [],
  statuses: [],
  unitTypes: ['Apartment', 'Villa', 'Townhouse', 'Twin House', 'Office'].map(v => ({ value: v, label: v })),
  typesByProject: [
    { projectId: 'gardens', unitType: 'Apartment', available: 166, total: 233 },
    { projectId: 'kadhimyah', unitType: 'Villa', available: 137, total: 200 },
    { projectId: 'kadhimyah', unitType: 'Twin House', available: 30, total: 33 },
    { projectId: 'karbala', unitType: 'Villa', available: 167, total: 233 },
  ],
};

describe('unit type options', () => {
  it('lists only the types a project actually has, in picklist order', () => {
    expect(unitTypesFor(facets, 'kadhimyah')).toEqual([
      { value: 'Villa', available: 137 },
      { value: 'Twin House', available: 30 },
    ]);
    expect(unitTypesFor(facets, 'gardens').map(t => t.value)).toEqual(['Apartment']);
  });

  it('sums availability across projects when no project is chosen', () => {
    expect(unitTypesFor(facets, '')).toEqual([
      { value: 'Apartment', available: 166 },
      { value: 'Villa', available: 304 },
      { value: 'Twin House', available: 30 },
    ]);
  });

  it('clears an incompatible unit type when the project changes', () => {
    expect(unitTypeAfterProjectChange(facets, 'gardens', 'Villa')).toBe('');
    expect(unitTypeAfterProjectChange(facets, 'karbala', 'Villa')).toBe('Villa');
    expect(unitTypeAfterProjectChange(facets, '', 'Twin House')).toBe('Twin House');
  });
});
