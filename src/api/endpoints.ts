import { BASE_URL, MIN_DOMESTIC_ID } from '../config.js';
import { log } from '../logger.js';
import { fetchJson, sleep } from './client.js';
import type {
  ApiResponse,
  Championship,
  ChampionshipDetail,
} from '../types.js';

export async function fetchChampionships(
  seasonCode: string,
): Promise<Championship[]> {
  const url = `${BASE_URL}?action=categorie&stag=${seasonCode}`;
  log('debug', `Fetching championships: ${url}`);

  const resp = await fetchJson<ApiResponse<Championship[]>>(url);
  if (!resp.success || !resp.result) {
    throw new Error(`Failed to fetch championships: ${resp.error ?? 'unknown error'}`);
  }

  // Filter out blank entries and international championships
  return resp.result.filter((c) => {
    const name = c.nome.trim();
    if (!name) {
      log('debug', `Skipping blank championship id=${c.id}`);
      return false;
    }
    if (c.id < MIN_DOMESTIC_ID) {
      log('debug', `Skipping international championship: ${name} (id=${c.id})`);
      return false;
    }
    return true;
  });
}

export async function fetchChampionshipDetails(
  championshipId: number,
  sessionId: string,
): Promise<ChampionshipDetail | null> {
  const url = `${BASE_URL}?action=dettagli&id=${championshipId}&session_id=${sessionId}`;
  log('debug', `Fetching details: ${url}`);

  try {
    const resp = await fetchJson<ApiResponse<ChampionshipDetail>>(url);
    if (!resp.success || !resp.result) {
      log('warn', `No data for championship ${championshipId}: ${resp.error ?? 'empty result'}`);
      return null;
    }
    return resp.result;
  } catch (err) {
    log('warn', `Failed to fetch details for championship ${championshipId}: ${err}`);
    return null;
  }
}

export async function fetchAllDetails(
  championships: Championship[],
  sessionId: string,
  delayMs: number,
): Promise<{ championship: Championship; detail: ChampionshipDetail }[]> {
  const results: { championship: Championship; detail: ChampionshipDetail }[] = [];

  for (let i = 0; i < championships.length; i++) {
    const champ = championships[i];
    log('info', `[${i + 1}/${championships.length}] ${champ.nome} (${champ.id})...`);

    const detail = await fetchChampionshipDetails(champ.id, sessionId);
    if (detail) {
      results.push({ championship: champ, detail });
    }

    if (i < championships.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}
