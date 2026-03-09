import { log } from '../logger.js';
import type { OfficialRole, RawMatch, MatchContext, OfficialRecord } from '../types.js';

interface ParsedOfficial {
  surname: string;
  name: string;
  province: string;
  role: OfficialRole;
}

/**
 * Parse the referee field: "SURNAME,NAME (PV)"
 * Province is embedded in the string inside parentheses.
 */
function parseReferee(arbitro: string): ParsedOfficial | null {
  const trimmed = arbitro.trim();
  if (!trimmed || trimmed === '( )' || trimmed === '()') return null;

  // Match: everything before last " (XX)" captures name, XX is province
  const match = trimmed.match(/^(.+),(.+)\s+\(([A-Za-z]{2})\)\s*$/);
  if (!match) {
    // Try without province (some entries may lack it)
    const nameOnly = trimmed.match(/^(.+),(.+)$/);
    if (nameOnly) {
      log('debug', `Referee without province: "${trimmed}"`);
      return {
        surname: nameOnly[1].trim(),
        name: nameOnly[2].trim(),
        province: '',
        role: 'Arbitro',
      };
    }
    log('debug', `Could not parse referee: "${trimmed}"`);
    return null;
  }

  return {
    surname: match[1].trim(),
    name: match[2].trim(),
    province: match[3].toUpperCase(),
    role: 'Arbitro',
  };
}

/**
 * Parse assistant referee or TMO: name and province are in separate fields.
 * Name format: "SURNAME,NAME"
 */
function parseAssistantOrTmo(
  nameField: string,
  pvField: string,
  role: OfficialRole,
): ParsedOfficial | null {
  const name = nameField.trim();
  const pv = pvField.trim();
  if (!name) return null;

  const commaIdx = name.indexOf(',');
  if (commaIdx === -1) {
    log('debug', `No comma in ${role} name: "${name}"`);
    return null;
  }

  return {
    surname: name.substring(0, commaIdx).trim(),
    name: name.substring(commaIdx + 1).trim(),
    province: pv.toUpperCase(),
    role,
  };
}

/**
 * Extract all officials from a single match.
 * Returns 0–4 OfficialRecord entries.
 */
export function extractOfficials(
  match: RawMatch,
  context: MatchContext,
): OfficialRecord[] {
  const records: OfficialRecord[] = [];

  const referee = parseReferee(match.arbitro ?? '');
  if (referee) {
    records.push({ ...referee, match: context });
  }

  const ar1 = parseAssistantOrTmo(
    match.giudiceLinea1 ?? '',
    match.giudice1Pv ?? '',
    'Assistente',
  );
  if (ar1) {
    records.push({ ...ar1, match: context });
  }

  const ar2 = parseAssistantOrTmo(
    match.giudiceLinea2 ?? '',
    match.giudice2Pv ?? '',
    'Assistente',
  );
  if (ar2) {
    records.push({ ...ar2, match: context });
  }

  const tmo = parseAssistantOrTmo(
    match.tmo ?? '',
    match.tmoPv ?? '',
    'TMO',
  );
  if (tmo) {
    records.push({ ...tmo, match: context });
  }

  return records;
}
