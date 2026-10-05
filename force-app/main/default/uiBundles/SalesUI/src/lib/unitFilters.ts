import type { UnitFacets } from '@/api/salesTypes';

/**
 * Unit types present in a project's inventory (or across all projects), with
 * available counts, in the Unit_Type__c picklist order. Unit_Type__c is an
 * independent picklist with no record types, so the inventory is what says
 * which types a project offers.
 */
export function unitTypesFor(facets: UnitFacets | null, projectId: string): { value: string; available: number }[] {
  if (!facets) return [];
  const counts = new Map<string, number>();
  for (const t of facets.typesByProject) {
    if (projectId && t.projectId !== projectId) continue;
    counts.set(t.unitType, (counts.get(t.unitType) ?? 0) + t.available);
  }
  const order = facets.unitTypes.map(o => o.value);
  return [...counts.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([value, available]) => ({ value, available }));
}

/** The unit type to keep after switching project: cleared when the new project has none of that type. */
export function unitTypeAfterProjectChange(facets: UnitFacets | null, projectId: string, unitType: string): string {
  if (!unitType) return '';
  return unitTypesFor(facets, projectId).some(t => t.value === unitType) ? unitType : '';
}
