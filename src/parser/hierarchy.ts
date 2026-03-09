import type {
  ChampionshipDetail,
  RawMatch,
  MatchContext,
  Phase,
  Group,
  Matchday,
} from '../types.js';

export interface MatchWithContext {
  match: RawMatch;
  context: MatchContext;
}

function* yieldFromMatchday(
  matchday: Matchday,
  category: string,
  phase: string,
  group: string,
): Generator<MatchWithContext> {
  for (const partita of matchday.partite ?? []) {
    yield {
      match: partita,
      context: {
        category,
        phase,
        group,
        matchday: matchday.giornata ?? '',
        homeTeam: (partita.home_nome ?? '').trim(),
        guestTeam: (partita.guest_nome ?? '').trim(),
        date: (partita.data ?? '').trim(),
        time: (partita.ora ?? '').trim(),
        venue: (partita.campo ?? '').trim(),
      },
    };
  }
}

function* yieldFromGroup(
  girone: Group,
  category: string,
  phase: string,
): Generator<MatchWithContext> {
  const groupName = (girone.girone ?? '').trim();

  // Primary path: comunicati → tipi_incontro → giornate → partite
  for (const comunicato of girone.comunicati ?? []) {
    for (const tipoIncontro of comunicato.tipi_incontro ?? []) {
      for (const giornata of tipoIncontro.giornate ?? []) {
        yield* yieldFromMatchday(giornata, category, phase, groupName);
      }
    }
  }

  // Fallback path: direct giornate on the group (defensive)
  for (const giornata of girone.giornate ?? []) {
    yield* yieldFromMatchday(giornata, category, phase, groupName);
  }
}

export function* extractMatches(
  detail: ChampionshipDetail,
): Generator<MatchWithContext> {
  const category = (detail.categoria ?? '').trim();

  for (const fase of detail.fasi ?? []) {
    const phaseName = (fase.fase ?? '').trim();

    for (const girone of fase.gironi ?? []) {
      yield* yieldFromGroup(girone, category, phaseName);
    }
  }
}
