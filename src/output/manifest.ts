import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';

export interface Publication {
  file: string;
  from: string;
  to: string;
  season: string;
  records: number;
  warnings: string[];
}

/** A hash binds the pointer to the exact CSV, including empty successful weeks. */
export function buildManifest(publication: Publication, csv: string, now = new Date()) {
  if (!/^output\/\d{4}-\d{2}-\d{2}\.txt$/.test(publication.file)) {
    throw new Error('Published file must be output/YYYY-MM-DD.txt');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publication.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(publication.to) || publication.from > publication.to) {
    throw new Error('Invalid publication date range');
  }
  if (!Number.isInteger(publication.records) || publication.records < 0) {
    throw new Error('Invalid publication record count');
  }
  return {
    version: 1,
    ...publication,
    sha256: createHash('sha256').update(csv, 'utf8').digest('hex'),
    extractedAt: now.toISOString(),
  };
}

export async function writeManifest(
  manifestPath: string,
  outPath: string,
  meta: Omit<Publication, 'file'>,
): Promise<void> {
  const csv = await readFile(outPath, 'utf8');
  const file = relative(process.cwd(), outPath).replaceAll('\\', '/');
  await writeFile(manifestPath, JSON.stringify(buildManifest({ ...meta, file }, csv), null, 2) + '\n', 'utf8');
}
