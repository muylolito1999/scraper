export const BASE_URL = 'https://federugby.it/matchcentre/firapi.php';

export const DEFAULT_PROVINCES = new Set([
  'BO', 'FE', 'FC', 'MO', 'PR', 'PC', 'RA', 'RE', 'RN',
]);

// Officials always extracted regardless of the province filter
// (refs from other provinces who are now part of our group). Matched on name only.
export const ALWAYS_INCLUDED_OFFICIALS = [
  { surname: 'MERLI', name: 'DARIO' },
];

export const DEFAULT_DELAY_MS = 500;

export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30_000,
  timeout: 30_000,
};

// Championship IDs below this threshold are international (Six Nations, etc.)
// and fail on the dettagli endpoint — skip them.
export const MIN_DOMESTIC_ID = 10_000_000_000;

export const ROLE_SORT_ORDER: Record<string, number> = {
  'Arbitro': 0,
  'Assistente': 1,
  'TMO': 2,
};

export const CATEGORY_SORT_ORDER: string[] = [
  'SERIE A "ELITE" MASCHILE',
  'SUPER COPPA MASCHILE',
  'COPPA ITALIA MASCHILE',
  'SERIE A "ELITE" FEMMINILE',
  'COPPA CONFERENCE FEMMIN.',
  'SERIE A1',
  'SERIE A FEMMINILE',
  'SERIE B',
  'UNDER 18 TITOLO',
];
