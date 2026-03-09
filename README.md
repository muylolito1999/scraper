# fir-officials-scraper

A TypeScript CLI tool that scrapes match officials (referees, assistants, TMO) from the Italian Rugby Federation (FIR) API for domestic championships, filtered by province.

By default it targets Emilia-Romagna provinces: BO, FE, FC, MO, PR, PC, RA, RE, RN.

## How it works

The scraper runs a five-stage pipeline:

1. **Fetch championships** — queries the FIR API (`federugby.it/matchcentre/firapi.php`) for all domestic championships in the given season.
2. **Fetch details** — for each championship, fetches the full hierarchy of phases, groups, matchdays, and matches, with a configurable delay between requests to avoid rate-limiting.
3. **Extract officials** — walks the nested hierarchy using generator functions and parses official names and provinces from each match (up to 4 per match: referee, two assistants, TMO).
4. **Filter** — keeps only officials whose province is in the target set. Optionally filters by date or date range.
5. **Output** — sorts results and writes RFC 4180-compliant CSV.

## Project structure

```
src/
├── index.ts              # Entry point, CLI argument parsing, orchestration
├── types.ts              # TypeScript type definitions
├── config.ts             # Constants (API URL, provinces, retry config, sort orders)
├── logger.ts             # Log-level-aware logger
├── api/
│   ├── client.ts         # HTTP fetch with retry and exponential backoff
│   └── endpoints.ts      # FIR API calls (championship list, details)
├── parser/
│   ├── hierarchy.ts      # Generator that yields matches from the nested hierarchy
│   └── officials.ts      # Parses official names, provinces, and roles
├── filter/
│   └── provinces.ts      # Province-set filter
└── output/
    ├── formatter.ts      # CSV formatting and multi-level sorting
    └── writer.ts         # File/stdout writer

tests/
├── parser/
│   ├── hierarchy.test.ts
│   └── officials.test.ts
├── filter/
│   └── provinces.test.ts
├── output/
│   └── formatter.test.ts
└── fixtures/
    └── sample_dettagli.json   # Real API response used in tests
```

## Usage

```bash
npm install
npm start -- --season 2025/2026
```

### CLI flags

| Flag | Description | Default |
|---|---|---|
| `--season` | Season in `YYYY/YYYY` format (required) | — |
| `--out <path>` | Output file path | `output.txt` |
| `--provinces <codes>` | Comma-separated province codes | BO,FE,FC,MO,PR,PC,RA,RE,RN |
| `--date <date\|range>` | Single date (`DD/MM/YYYY`) or range (`DD/MM/YYYY-DD/MM/YYYY`) | all dates |
| `--dry-run` | Preview results without writing to file | off |
| `--delay <ms>` | Delay between API requests in milliseconds | 500 |
| `--log-level` | `debug`, `info`, `warn`, or `error` | `info` |

### Examples

```bash
# Scrape full season, default provinces
npm start -- --season 2025/2026

# Specific provinces and date range
npm start -- --season 2025/2026 --provinces BO,MO,PR --date 01/02/2026-28/02/2026

# Dry run with debug logging
npm start -- --season 2025/2026 --dry-run --log-level debug
```

## Output format

CSV with columns:

```
Cognome,Nome,Ruolo,Squadra Casa,Squadra Trasferta,Categoria,Fase,Girone,Giornata,Data,Ora,Luogo
```

Records are sorted by:
1. Date (ascending)
2. Time (ascending)
3. Category (predefined priority order)
4. Group/girone (ascending)
5. Home team (ascending)
6. Role (Arbitro → Assistente → TMO)

## Tests

```bash
npm test
```

Uses Node.js built-in test runner with `tsx` for TypeScript execution. Covers hierarchy parsing, official name parsing, province filtering, and CSV formatting/sorting.

## Design notes

- **No runtime dependencies** — uses only Node.js built-in modules (`fetch`, `node:fs`, `node:util`).
- **Retry with backoff** — the HTTP client retries up to 3 times with exponential backoff and handles 429 rate-limit responses.
- **Generator-based parsing** — `extractMatches()` yields matches lazily from the deeply nested API response, keeping memory usage low.
- **RFC 4180 CSV** — fields containing commas, quotes, or newlines are properly quoted and escaped.
