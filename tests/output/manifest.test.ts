import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildManifest, type Publication } from '../../src/output/manifest.js';

const publication: Publication = {
  file: 'output/2026-11-19.txt', from: '2026-11-19', to: '2026-11-25',
  season: '2026/2027', records: 1, warnings: [],
};

describe('latest-result manifest', () => {
  it('binds the published week to the exact UTF-8 CSV and carries source warnings', () => {
    const csv = 'Surname,Name\nROSSI,PIERLUIGI\n';
    const result = buildManifest({ ...publication, warnings: ['FIR unavailable'] }, csv, new Date('2026-11-19T14:01:00Z'));
    assert.equal(result.sha256, createHash('sha256').update(csv).digest('hex'));
    assert.equal(result.extractedAt, '2026-11-19T14:01:00.000Z');
    assert.deepEqual(result.warnings, ['FIR unavailable']);
    assert.equal(result.records, 1);
  });
  it('supports a successful week with no assignments', () => {
    assert.equal(buildManifest({ ...publication, records: 0 }, 'header\n').records, 0);
  });
  it('refuses unsafe file paths and invalid ranges/counts', () => {
    assert.throws(() => buildManifest({ ...publication, file: '../private.csv' }, ''));
    assert.throws(() => buildManifest({ ...publication, from: '2026-12-01' }, ''));
    assert.throws(() => buildManifest({ ...publication, records: -1 }, ''));
  });
});
