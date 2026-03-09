import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractOfficials } from '../../src/parser/officials.js';
import type { RawMatch, MatchContext } from '../../src/types.js';

const baseContext: MatchContext = {
  category: 'TEST',
  phase: 'Phase 1',
  group: 'Girone 1',
  matchday: 'Giornata 01',
  homeTeam: 'Team A',
  guestTeam: 'Team B',
  date: '01/01/2026',
  time: '15:00',
  venue: 'Stadio Test',
};

function makeMatch(overrides: Partial<RawMatch> = {}): RawMatch {
  return {
    data: '01/01/2026',
    ora: '15:00',
    campo: 'Stadio Test',
    esito: 'DISPUTATA',
    home_nome: 'Team A',
    guest_nome: 'Team B',
    punteggio: '10:20',
    arbitro: '',
    giudiceLinea1: '',
    giudice1Pv: '',
    giudiceLinea2: '',
    giudice2Pv: '',
    tmo: '',
    tmoPv: '',
    ...overrides,
  };
}

describe('extractOfficials', () => {
  describe('referee parsing', () => {
    it('parses standard referee with province', () => {
      const match = makeMatch({ arbitro: 'MERLI,DARIO (AN)' });
      const officials = extractOfficials(match, baseContext);
      const ref = officials.find((o) => o.role === 'Arbitro');
      assert.ok(ref);
      assert.equal(ref.surname, 'MERLI');
      assert.equal(ref.name, 'DARIO');
      assert.equal(ref.province, 'AN');
    });

    it('parses referee with apostrophe in surname', () => {
      const match = makeMatch({ arbitro: "D'ELIA,DANTE (BA)" });
      const officials = extractOfficials(match, baseContext);
      const ref = officials.find((o) => o.role === 'Arbitro');
      assert.ok(ref);
      assert.equal(ref.surname, "D'ELIA");
      assert.equal(ref.name, 'DANTE');
      assert.equal(ref.province, 'BA');
    });

    it('skips placeholder "( )"', () => {
      const match = makeMatch({ arbitro: '( )' });
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.filter((o) => o.role === 'Arbitro').length, 0);
    });

    it('skips padded placeholder "  ( )"', () => {
      const match = makeMatch({ arbitro: '  ( )' });
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.filter((o) => o.role === 'Arbitro').length, 0);
    });

    it('skips empty string', () => {
      const match = makeMatch({ arbitro: '' });
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.filter((o) => o.role === 'Arbitro').length, 0);
    });

    it('handles referee with trailing space', () => {
      const match = makeMatch({ arbitro: 'ROSELLA,FRANCO (RM) ' });
      const officials = extractOfficials(match, baseContext);
      const ref = officials.find((o) => o.role === 'Arbitro');
      assert.ok(ref);
      assert.equal(ref.surname, 'ROSELLA');
      assert.equal(ref.name, 'FRANCO');
      assert.equal(ref.province, 'RM');
    });
  });

  describe('assistant referee parsing', () => {
    it('parses AR1 with separate province field', () => {
      const match = makeMatch({
        giudiceLinea1: 'BISETTO,LUCA',
        giudice1Pv: 'TV',
      });
      const officials = extractOfficials(match, baseContext);
      const ar1 = officials.find((o) => o.role === 'Assistente');
      assert.ok(ar1);
      assert.equal(ar1.surname, 'BISETTO');
      assert.equal(ar1.name, 'LUCA');
      assert.equal(ar1.province, 'TV');
    });

    it('parses AR2 with apostrophe in surname', () => {
      const match = makeMatch({
        giudiceLinea2: "PIER'ANTONI,FRANCESCO",
        giudice2Pv: 'RM',
      });
      const officials = extractOfficials(match, baseContext);
      const ar2 = officials.find((o) => o.role === 'Assistente');
      assert.ok(ar2);
      assert.equal(ar2.surname, "PIER'ANTONI");
      assert.equal(ar2.name, 'FRANCESCO');
      assert.equal(ar2.province, 'RM');
    });

    it('parses multi-word first name', () => {
      const match = makeMatch({
        giudiceLinea1: 'LOCATELLI,MATTEO ANGELO',
        giudice1Pv: 'BG',
      });
      const officials = extractOfficials(match, baseContext);
      const ar1 = officials.find((o) => o.role === 'Assistente');
      assert.ok(ar1);
      assert.equal(ar1.surname, 'LOCATELLI');
      assert.equal(ar1.name, 'MATTEO ANGELO');
      assert.equal(ar1.province, 'BG');
    });

    it('skips empty AR fields', () => {
      const match = makeMatch({
        giudiceLinea1: '   ',
        giudice1Pv: 'BO',
      });
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.filter((o) => o.role === 'Assistente').length, 0);
    });

    it('handles empty province', () => {
      const match = makeMatch({
        giudiceLinea1: 'SMITH,JOHN',
        giudice1Pv: '',
      });
      const officials = extractOfficials(match, baseContext);
      const ar1 = officials.find((o) => o.role === 'Assistente');
      assert.ok(ar1);
      assert.equal(ar1.province, '');
    });
  });

  describe('TMO parsing', () => {
    it('parses TMO with province', () => {
      const match = makeMatch({
        tmo: 'VIVARINI,GIUSEPPE',
        tmoPv: 'BL',
      });
      const officials = extractOfficials(match, baseContext);
      const tmo = officials.find((o) => o.role === 'TMO');
      assert.ok(tmo);
      assert.equal(tmo.surname, 'VIVARINI');
      assert.equal(tmo.name, 'GIUSEPPE');
      assert.equal(tmo.province, 'BL');
    });

    it('skips empty TMO', () => {
      const match = makeMatch({ tmo: '', tmoPv: '' });
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.filter((o) => o.role === 'TMO').length, 0);
    });
  });

  describe('full match extraction', () => {
    it('extracts all 4 officials from a complete match', () => {
      const match = makeMatch({
        arbitro: 'ROSELLA,FRANCO (RM)',
        giudiceLinea1: 'CHIRNOAGA,GABRIEL IONUT',
        giudice1Pv: 'RM',
        giudiceLinea2: "PIER'ANTONI,FRANCESCO",
        giudice2Pv: 'RM',
        tmo: 'SCHIPANI,VINCENZO',
        tmoPv: 'BN',
      });
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.length, 4);
      assert.deepEqual(
        officials.map((o) => o.role),
        ['Arbitro', 'Assistente', 'Assistente', 'TMO'],
      );
    });

    it('returns empty array when no officials are assigned', () => {
      const match = makeMatch();
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.length, 0);
    });

    it('attaches correct match context to each official', () => {
      const match = makeMatch({ arbitro: 'MUNARINI,CLARA (PR)' });
      const officials = extractOfficials(match, baseContext);
      assert.equal(officials.length, 1);
      assert.equal(officials[0].match.category, 'TEST');
      assert.equal(officials[0].match.homeTeam, 'Team A');
      assert.equal(officials[0].match.venue, 'Stadio Test');
    });
  });
});
