import { parseArgs } from 'node:util';
import { DEFAULT_PROVINCES, DEFAULT_DELAY_MS } from './config.js';
import { log, setLogLevel, type LogLevel } from './logger.js';
import { fetchChampionships, fetchAllDetails } from './api/endpoints.js';
import { extractMatches } from './parser/hierarchy.js';
import { extractOfficials } from './parser/officials.js';
import { filterByProvinces } from './filter/provinces.js';
import { writeOutput } from './output/writer.js';
import type { OfficialRecord } from './types.js';

function parseSeason(input: string): { seasonCode: string; sessionId: string } {
  // Accept "2025/2026" or "20252026"
  const cleaned = input.replace('/', '');
  if (!/^\d{8}$/.test(cleaned)) {
    throw new Error(`Invalid season format: "${input}". Expected "2025/2026" or "20252026".`);
  }
  const startYear = parseInt(cleaned.substring(0, 4), 10);
  const endYear = parseInt(cleaned.substring(4, 8), 10);
  if (endYear !== startYear + 1) {
    throw new Error(`Season years must be consecutive: ${startYear}/${endYear}`);
  }
  return { seasonCode: cleaned, sessionId: String(endYear) };
}

/** Convert DD/MM/YYYY to YYYY-MM-DD for comparison. */
function toSortable(ddmmyyyy: string): string {
  const parts = ddmmyyyy.trim().split('/');
  if (parts.length !== 3) return '9999-99-99';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

function parseDateRange(input: string): DateRange {
  const parts = input.split('-').length === 3
    ? [input] // single date DD/MM/YYYY (contains 2 slashes and no dash-separator)
    : input.split('-');

  // Detect if it's a single date or a range
  // Single date: "14/02/2026" (no dash between dates)
  // Range: "14/02/2026-16/02/2026" (dash between two DD/MM/YYYY dates)
  // We split on '-' and if we get 2 parts that look like dates, it's a range
  const dashParts = input.split('-');
  if (dashParts.length === 2 && dashParts[0].includes('/') && dashParts[1].includes('/')) {
    // Range: "14/02/2026-16/02/2026"
    return { from: toSortable(dashParts[0]), to: toSortable(dashParts[1]) };
  }

  // Single date: "14/02/2026"
  const sortable = toSortable(input);
  return { from: sortable, to: sortable };
}

function isDateInRange(matchDate: string, range: DateRange): boolean {
  const sortable = toSortable(matchDate);
  return sortable >= range.from && sortable <= range.to;
}

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      season: { type: 'string' },
      out: { type: 'string', default: 'output.txt' },
      provinces: { type: 'string' },
      date: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      delay: { type: 'string', default: String(DEFAULT_DELAY_MS) },
      'log-level': { type: 'string', default: 'info' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`
Usage: npx tsx src/index.ts [options]

Options:
  --season <YYYY/YYYY>     Season to scrape (required)
  --out <path>             Output file path (default: output.txt)
  --provinces <codes>      Comma-separated province codes
                           (default: BO,FE,FC,MO,PR,PC,RA,RE,RN)
  --date <date|range>      Filter by date (e.g. 14/02/2026)
                           or date range (e.g. 14/02/2026-16/02/2026)
  --dry-run                Fetch and parse but only print summary
  --delay <ms>             Delay between API requests (default: 500)
  --log-level <level>      debug|info|warn|error (default: info)
  --help                   Show this help
`);
    process.exit(0);
  }

  if (!values.season) {
    throw new Error('--season is required. Example: --season 2025/2026');
  }

  const { seasonCode, sessionId } = parseSeason(values.season);
  const provinces = values.provinces
    ? new Set(values.provinces.split(',').map((p) => p.trim().toUpperCase()))
    : DEFAULT_PROVINCES;
  const delayMs = parseInt(values.delay!, 10);
  const logLevel = values['log-level'] as LogLevel;

  const dateRange = values.date ? parseDateRange(values.date) : undefined;

  return {
    seasonCode,
    sessionId,
    outPath: values.out!,
    provinces,
    dateRange,
    dryRun: values['dry-run']!,
    delayMs,
    logLevel,
  };
}

async function main() {
  const args = parseCliArgs();
  setLogLevel(args.logLevel);

  log('info', `Season: ${args.seasonCode}`);
  log('info', `Target provinces: ${[...args.provinces].join(', ')}`);
  if (args.dateRange) log('info', `Date filter: ${args.dateRange.from} to ${args.dateRange.to}`);
  log('info', `Output: ${args.dryRun ? '(dry-run)' : args.outPath}`);

  // Step 1: Fetch championship list
  log('info', 'Fetching championship list...');
  const championships = await fetchChampionships(args.seasonCode);
  log('info', `Found ${championships.length} domestic championships`);

  // Step 2: Fetch details for each championship
  const allDetails = await fetchAllDetails(championships, args.sessionId, args.delayMs);

  // Step 3: Extract all officials from all matches
  const allRecords: OfficialRecord[] = [];
  let totalMatches = 0;
  let totalOfficialSlots = 0;

  for (const { detail } of allDetails) {
    for (const { match, context } of extractMatches(detail)) {
      // Filter by date range if specified
      if (args.dateRange && !isDateInRange(context.date, args.dateRange)) continue;

      totalMatches++;
      const officials = extractOfficials(match, context);
      totalOfficialSlots += officials.length;
      allRecords.push(...officials);
    }
  }

  // Step 4: Filter by provinces
  const filtered = filterByProvinces(allRecords, args.provinces);

  log('info', `Total matches scanned: ${totalMatches}`);
  log('info', `Total official assignments found: ${totalOfficialSlots}`);
  log('info', `Matching Emilia-Romagna officials: ${filtered.length}`);

  // Count unique officials
  const uniqueOfficials = new Set(filtered.map((r) => `${r.surname},${r.name}`));
  log('info', `Unique officials: ${uniqueOfficials.size}`);

  // Step 5: Output
  if (args.dryRun) {
    log('info', 'Dry run complete. No file written.');
    // Print a sample of up to 5 records
    if (filtered.length > 0) {
      log('info', 'Sample records:');
      const { sortRecords, formatRecord, HEADER } = await import('./output/formatter.js');
      const sorted = sortRecords(filtered);
      console.log(HEADER);
      for (const r of sorted.slice(0, 5)) {
        console.log(formatRecord(r));
      }
      if (sorted.length > 5) {
        console.log(`... and ${sorted.length - 5} more`);
      }
    }
  } else {
    await writeOutput(filtered, args.outPath);
  }
}

main().catch((err) => {
  log('error', `Fatal: ${err}`);
  process.exit(1);
});
