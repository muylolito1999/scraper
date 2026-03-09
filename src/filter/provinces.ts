import type { OfficialRecord } from '../types.js';

export function filterByProvinces(
  records: OfficialRecord[],
  provinces: Set<string>,
): OfficialRecord[] {
  return records.filter((r) => provinces.has(r.province));
}
