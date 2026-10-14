import { ALWAYS_INCLUDED_OFFICIALS } from '../config.js';
import type { OfficialRecord } from '../types.js';

type OfficialKey = Pick<OfficialRecord, 'surname' | 'name'>;

function isAlwaysIncluded(r: OfficialRecord, alwaysInclude: OfficialKey[]): boolean {
  return alwaysInclude.some((o) => o.surname === r.surname && o.name === r.name);
}

export function filterByProvinces(
  records: OfficialRecord[],
  provinces: Set<string>,
  alwaysInclude: OfficialKey[] = ALWAYS_INCLUDED_OFFICIALS,
): OfficialRecord[] {
  return records.filter(
    (r) => provinces.has(r.province) || isAlwaysIncluded(r, alwaysInclude),
  );
}
