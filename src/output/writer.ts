import { writeFile } from 'node:fs/promises';
import type { OfficialRecord } from '../types.js';
import { HEADER, formatRecord, sortRecords } from './formatter.js';
import { log } from '../logger.js';

export async function writeOutput(
  records: OfficialRecord[],
  outPath: string | null,
): Promise<void> {
  const sorted = sortRecords(records);
  const lines = [HEADER, ...sorted.map(formatRecord)];
  const content = lines.join('\n') + '\n';

  if (outPath) {
    await writeFile(outPath, content, 'utf-8');
    log('info', `Wrote ${sorted.length} records to ${outPath}`);
  } else {
    process.stdout.write(content);
  }
}
