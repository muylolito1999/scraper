import { ROLE_SORT_ORDER, CATEGORY_SORT_ORDER } from '../config.js';
import type { OfficialRecord } from '../types.js';

export const HEADER = 'Surname,Name,Role,Team1 vs Team2,Category,Date,Time,Location';

function quoteField(value: string): string {
  // RFC 4180: quote if field contains comma, double-quote, or newline
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function displayRole(r: OfficialRecord): string {
  // Female form for MUNARINI,CLARA when she's the referee
  if (r.role === 'Arbitro' && r.surname === 'MUNARINI' && r.name === 'CLARA') {
    return 'Arbitra';
  }
  return r.role;
}

export function formatRecord(r: OfficialRecord): string {
  const matchup = `${r.match.homeTeam} vs ${r.match.guestTeam}`;
  const fields = [
    r.surname,
    r.name,
    displayRole(r),
    matchup,
    r.match.category,
    r.match.date,
    r.match.time,
    r.match.venue,
  ];
  return fields.map(quoteField).join(',');
}

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD for sorting.
 */
function toSortableDate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('/');
  if (parts.length !== 3) return '9999-99-99';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function sortRecords(records: OfficialRecord[]): OfficialRecord[] {
  return [...records].sort((a, b) => {
    // 1. Date ascending
    const dateA = toSortableDate(a.match.date);
    const dateB = toSortableDate(b.match.date);
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    // 2. Time ascending
    if (a.match.time !== b.match.time) return a.match.time.localeCompare(b.match.time);

    // 3. Category by priority order
    const catA = CATEGORY_SORT_ORDER.findIndex(p => a.match.category.includes(p));
    const catB = CATEGORY_SORT_ORDER.findIndex(p => b.match.category.includes(p));
    const priA = catA === -1 ? 999 : catA;
    const priB = catB === -1 ? 999 : catB;
    if (priA !== priB) return priA - priB;
    if (a.match.category !== b.match.category) return a.match.category.localeCompare(b.match.category);

    // 4. Group (girone) ascending — Girone 1 before Girone 2
    if (a.match.group !== b.match.group) return a.match.group.localeCompare(b.match.group);

    // 5. Match (home team as proxy)
    if (a.match.homeTeam !== b.match.homeTeam) return a.match.homeTeam.localeCompare(b.match.homeTeam);

    // 6. Role priority
    return (ROLE_SORT_ORDER[a.role] ?? 99) - (ROLE_SORT_ORDER[b.role] ?? 99);
  });
}
