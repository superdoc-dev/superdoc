import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

const RETIRED_TOKENS = [
  ['DomPainterPersistentPage', 'Exactness'].join(''),
  ['data-v2-persistent-page', 'pending'].join('-'),
  ['persistent-page', 'pending-skeleton'].join('-'),
  ['pending', 'layout'].join('-'),
  ['degraded', 'unsupported'].join('-'),
];

function productionSources(dir = __dirname): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      productionSources(full).forEach((file) => files.push(file));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(full);
    }
  }
  return files.sort();
}

describe('persistent-page loading presentation census', () => {
  it('keeps pending-page presentation out of DomPainter production source', () => {
    const problems: string[] = [];
    for (const file of productionSources()) {
      const source = fs.readFileSync(file, 'utf8');
      for (const token of RETIRED_TOKENS) {
        if (source.includes(token)) problems.push(`${path.relative(__dirname, file)}: ${token}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
