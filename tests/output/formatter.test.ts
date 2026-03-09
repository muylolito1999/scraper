import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatRecord, sortRecords, HEADER } from '../../src/output/formatter.js';
import type { OfficialRecord, MatchContext } from '../../src/types.js';

function makeContext(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    category: 'TEST',
    phase: 'Phase 1',
    group: 'Girone 1',
    matchday: 'Giornata 01',
    homeTeam: 'Team A',
    guestTeam: 'Team B',
    date: '01/01/2026',
    time: '15:00',
    venue: 'Stadio Test',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<OfficialRecord> = {}): OfficialRecord {
  return {
    surname: 'ROSSI',
    name: 'MARCO',
    province: 'BO',
    role: 'Arbitro',
    match: makeContext(),
    ...overrides,
  };
}

describe('HEADER', () => {
  it('has the correct format', () => {
    assert.equal(HEADER, 'Surname,Name,Role,Team1 vs Team2,Category,Date,Time,Location');
  });
});

describe('formatRecord', () => {
  it('formats a basic record', () => {
    const line = formatRecord(makeRecord());
    assert.equal(line, 'ROSSI,MARCO,Arbitro,Team A vs Team B,TEST,01/01/2026,15:00,Stadio Test');
  });

  it('quotes fields with commas', () => {
    const record = makeRecord({
      match: makeContext({ venue: 'Campo A, Settore 1' }),
    });
    const line = formatRecord(record);
    assert.ok(line.includes('"Campo A, Settore 1"'));
  });

  it('escapes double quotes in fields', () => {
    const record = makeRecord({
      match: makeContext({ category: 'SERIE A "ELITE" MASCHILE' }),
    });
    const line = formatRecord(record);
    assert.ok(line.includes('"SERIE A ""ELITE"" MASCHILE"'));
  });

  it('formats the user screenshot example (Sergi)', () => {
    const record: OfficialRecord = {
      surname: 'SERGI',
      name: 'MIRCO',
      province: 'BO',
      role: 'Assistente',
      match: {
        category: 'SERIE A "ELITE" MASCHILE',
        phase: 'Regular Season',
        group: 'Girone 1',
        matchday: 'Giornata 11',
        homeTeam: 'RUGBY VIADANA 1970',
        guestTeam: 'BIELLA RUGBY CLUB',
        date: '14/02/2026',
        time: '13:00',
        venue: 'CAMPO L.ZAFFANELLA N 2',
      },
    };
    const line = formatRecord(record);
    assert.ok(line.startsWith('SERGI,MIRCO,Assistente,'));
    assert.ok(line.includes('RUGBY VIADANA 1970 vs BIELLA RUGBY CLUB'));
    assert.ok(line.includes('14/02/2026'));
    assert.ok(line.includes('13:00'));
    assert.ok(line.includes('CAMPO L.ZAFFANELLA N 2'));
  });
});

describe('sortRecords', () => {
  it('sorts by date ascending', () => {
    const records = [
      makeRecord({ match: makeContext({ date: '15/02/2026' }) }),
      makeRecord({ match: makeContext({ date: '01/01/2026' }) }),
      makeRecord({ match: makeContext({ date: '10/02/2026' }) }),
    ];
    const sorted = sortRecords(records);
    assert.deepEqual(
      sorted.map((r) => r.match.date),
      ['01/01/2026', '10/02/2026', '15/02/2026'],
    );
  });

  it('sorts by time when dates are equal', () => {
    const records = [
      makeRecord({ match: makeContext({ time: '18:00' }) }),
      makeRecord({ match: makeContext({ time: '14:30' }) }),
      makeRecord({ match: makeContext({ time: '10:00' }) }),
    ];
    const sorted = sortRecords(records);
    assert.deepEqual(
      sorted.map((r) => r.match.time),
      ['10:00', '14:30', '18:00'],
    );
  });

  it('sorts by category priority when date and time are equal', () => {
    const records = [
      makeRecord({ match: makeContext({ category: 'SERIE B' }) }),
      makeRecord({ match: makeContext({ category: 'SERIE A "ELITE" MASCHILE' }) }),
      makeRecord({ match: makeContext({ category: 'SERIE A1' }) }),
    ];
    const sorted = sortRecords(records);
    assert.deepEqual(
      sorted.map((r) => r.match.category),
      ['SERIE A "ELITE" MASCHILE', 'SERIE A1', 'SERIE B'],
    );
  });

  it('sorts by girone within same category', () => {
    const records = [
      makeRecord({ match: makeContext({ category: 'SERIE A1', group: 'Girone 2' }) }),
      makeRecord({ match: makeContext({ category: 'SERIE A1', group: 'Girone 1' }) }),
    ];
    const sorted = sortRecords(records);
    assert.deepEqual(
      sorted.map((r) => r.match.group),
      ['Girone 1', 'Girone 2'],
    );
  });

  it('sorts by role priority within same match', () => {
    const ctx = makeContext();
    const records = [
      makeRecord({ role: 'TMO', match: ctx }),
      makeRecord({ role: 'Arbitro', match: ctx }),
      makeRecord({ role: 'Assistente', match: ctx }),
      makeRecord({ role: 'Assistente', match: ctx }),
    ];
    const sorted = sortRecords(records);
    assert.deepEqual(
      sorted.map((r) => r.role),
      ['Arbitro', 'Assistente', 'Assistente', 'TMO'],
    );
  });
});
