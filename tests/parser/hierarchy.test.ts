import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractMatches } from '../../src/parser/hierarchy.js';
import type { ChampionshipDetail } from '../../src/types.js';

describe('extractMatches', () => {
  it('extracts matches from a real API fixture', async () => {
    const raw = await readFile(
      new URL('../fixtures/sample_dettagli.json', import.meta.url),
      'utf-8',
    );
    const resp = JSON.parse(raw);
    const detail: ChampionshipDetail = resp.result;

    const matches = [...extractMatches(detail)];
    assert.equal(matches.length, 1);

    const { match, context } = matches[0];
    assert.equal(context.category, 'SUPER COPPA MASCHILE');
    assert.equal(context.phase, 'Finale');
    assert.equal(context.group, 'Girone 1');
    assert.equal(context.matchday, 'Giornata 01');
    assert.equal(context.homeTeam, 'RUGBY VIADANA 1970 SSD ARL');
    assert.equal(context.guestTeam, 'RUGBY ROVIGO DELTA SRL SSD');
    assert.equal(context.date, '26/09/2025');
    assert.equal(context.time, '19:00');
    assert.equal(context.venue, 'STADIO TOMMASO FATTORI');
    assert.equal(match.arbitro, 'ROSELLA,FRANCO (RM)');
  });

  it('handles a minimal fixture with one phase and one match', () => {
    const detail: ChampionshipDetail = {
      categoria: 'TEST CUP',
      fasi: [
        {
          fase: 'Regular Season',
          visualizzazione: '1',
          gironi: [
            {
              girone: 'Girone A',
              comunicati: [
                {
                  comunicato: 'C1',
                  data_comunicato: '01/01/2026',
                  tipi_incontro: [
                    {
                      tipo_incontro: 'Andata',
                      giornate: [
                        {
                          giornata: 'Giornata 01',
                          partite: [
                            {
                              data: '10/01/2026',
                              ora: '14:30',
                              home_nome: 'Alpha',
                              guest_nome: 'Beta',
                              punteggio: '-:-',
                              arbitro: 'TEST,REF (BO)',
                              esito: '',
                              campo: 'Campo 1',
                              giudiceLinea1: '',
                              giudice1Pv: '',
                              giudiceLinea2: '',
                              giudice2Pv: '',
                              tmo: '',
                              tmoPv: '',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const matches = [...extractMatches(detail)];
    assert.equal(matches.length, 1);
    assert.equal(matches[0].context.category, 'TEST CUP');
    assert.equal(matches[0].context.phase, 'Regular Season');
    assert.equal(matches[0].context.homeTeam, 'Alpha');
  });

  it('traverses multiple phases, groups, and matchdays', () => {
    const makePartita = (home: string) => ({
      data: '01/01/2026',
      ora: '15:00',
      home_nome: home,
      guest_nome: 'Opponent',
      punteggio: '-:-',
      arbitro: '',
      esito: '',
      campo: '',
      giudiceLinea1: '',
      giudice1Pv: '',
      giudiceLinea2: '',
      giudice2Pv: '',
      tmo: '',
      tmoPv: '',
    });

    const detail: ChampionshipDetail = {
      categoria: 'MULTI',
      fasi: [
        {
          fase: 'Phase A',
          visualizzazione: '2',
          gironi: [
            {
              girone: 'Girone 1',
              comunicati: [
                {
                  comunicato: 'C1',
                  data_comunicato: '01/01/2026',
                  tipi_incontro: [
                    {
                      tipo_incontro: 'Andata',
                      giornate: [
                        { giornata: 'G01', partite: [makePartita('A')] },
                        { giornata: 'G02', partite: [makePartita('B')] },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              girone: 'Girone 2',
              comunicati: [
                {
                  comunicato: 'C2',
                  data_comunicato: '01/01/2026',
                  tipi_incontro: [
                    {
                      tipo_incontro: 'Andata',
                      giornate: [
                        { giornata: 'G01', partite: [makePartita('C')] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          fase: 'Phase B',
          visualizzazione: '1',
          gironi: [
            {
              girone: 'Girone 1',
              comunicati: [
                {
                  comunicato: 'C3',
                  data_comunicato: '01/02/2026',
                  tipi_incontro: [
                    {
                      tipo_incontro: 'Ritorno',
                      giornate: [
                        { giornata: 'G01', partite: [makePartita('D')] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const matches = [...extractMatches(detail)];
    assert.equal(matches.length, 4);
    assert.deepEqual(
      matches.map((m) => m.context.homeTeam),
      ['A', 'B', 'C', 'D'],
    );
  });

  it('handles empty comunicati gracefully', () => {
    const detail: ChampionshipDetail = {
      categoria: 'EMPTY',
      fasi: [
        {
          fase: 'Phase 1',
          visualizzazione: '1',
          gironi: [
            {
              girone: 'Girone 1',
              comunicati: [],
            },
          ],
        },
      ],
    };

    const matches = [...extractMatches(detail)];
    assert.equal(matches.length, 0);
  });

  it('handles missing fasi gracefully', () => {
    const detail = { categoria: 'BROKEN', fasi: undefined } as unknown as ChampionshipDetail;
    const matches = [...extractMatches(detail)];
    assert.equal(matches.length, 0);
  });
});
