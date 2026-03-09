// ── API Response Types (matching the firapi.php JSON) ──

export interface ApiResponse<T> {
  success: boolean;
  result: T | null;
  error?: string;
}

export interface Championship {
  id: number;
  nome: string;
}

export interface ChampionshipDetail {
  categoria: string;
  fasi: Phase[];
}

export interface Phase {
  fase: string;
  visualizzazione: string; // "1" or "2"
  gironi: Group[];
}

export interface Group {
  girone: string;
  comunicati?: Comunicato[];
  giornate?: Matchday[]; // fallback path
}

export interface Comunicato {
  comunicato: string;
  data_comunicato: string;
  tipi_incontro: MatchType[];
}

export interface MatchType {
  tipo_incontro: string; // "Andata", "Ritorno"
  giornate: Matchday[];
}

export interface Matchday {
  giornata: string; // "Giornata 01"
  partite: RawMatch[];
}

export interface RawMatch {
  data: string;        // "DD/MM/YYYY"
  ora: string;         // "HH:MM"
  campo: string;
  esito: string;       // "DISPUTATA", "ANNULLATA", "RINVIATA", ""
  home_nome: string;
  guest_nome: string;
  punteggio: string;
  arbitro: string;     // "SURNAME,NAME (PV)"
  giudiceLinea1: string;
  giudice1Pv: string;
  giudiceLinea2: string;
  giudice2Pv: string;
  tmo: string;
  tmoPv: string;
  provvisorio?: string;
  rettificato?: string;
  home_logo?: string;
  guest_logo?: string;
}

// ── Domain Models ──

export type OfficialRole =
  | 'Arbitro'
  | 'Assistente'
  | 'TMO';

export interface MatchContext {
  category: string;
  phase: string;
  group: string;
  matchday: string;
  homeTeam: string;
  guestTeam: string;
  date: string;   // DD/MM/YYYY
  time: string;   // HH:MM
  venue: string;
}

export interface OfficialRecord {
  surname: string;
  name: string;
  province: string;
  role: OfficialRole;
  match: MatchContext;
}
