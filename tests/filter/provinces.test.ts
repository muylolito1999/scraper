import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterByProvinces } from '../../src/filter/provinces.js';
import type { OfficialRecord, MatchContext } from '../../src/types.js';

const baseContext: MatchContext = {
  category: 'TEST',
  phase: 'Phase 1',
  group: 'Girone 1',
  matchday: 'Giornata 01',
  homeTeam: 'Team A',
  guestTeam: 'Team B',
  date: '01/01/2026',
  time: '15:00',
  venue: 'Stadio',
};

function makeRecord(province: string): OfficialRecord {
  return {
    surname: 'TEST',
    name: 'PERSON',
    province,
    role: 'Arbitro',
    match: baseContext,
  };
}

describe('filterByProvinces', () => {
  it('filters to matching provinces only', () => {
    const records = [
      makeRecord('BO'),
      makeRecord('RM'),
      makeRecord('PR'),
      makeRecord('MI'),
    ];
    const result = filterByProvinces(records, new Set(['BO', 'PR']));
    assert.equal(result.length, 2);
    assert.equal(result[0].province, 'BO');
    assert.equal(result[1].province, 'PR');
  });

  it('returns empty when no provinces match', () => {
    const records = [makeRecord('RM'), makeRecord('MI')];
    const result = filterByProvinces(records, new Set(['BO', 'FE']));
    assert.equal(result.length, 0);
  });

  it('excludes officials with empty province', () => {
    const records = [makeRecord(''), makeRecord('BO')];
    const result = filterByProvinces(records, new Set(['BO']));
    assert.equal(result.length, 1);
    assert.equal(result[0].province, 'BO');
  });

  it('works with all Emilia-Romagna default provinces', () => {
    const ER = new Set(['BO', 'FE', 'FC', 'MO', 'PR', 'PC', 'RA', 'RE', 'RN']);
    const records = [
      makeRecord('BO'),
      makeRecord('FE'),
      makeRecord('FC'),
      makeRecord('MO'),
      makeRecord('PR'),
      makeRecord('PC'),
      makeRecord('RA'),
      makeRecord('RE'),
      makeRecord('RN'),
      makeRecord('RM'),
    ];
    const result = filterByProvinces(records, ER);
    assert.equal(result.length, 9);
  });

  it('handles empty input array', () => {
    const result = filterByProvinces([], new Set(['BO']));
    assert.equal(result.length, 0);
  });
});
