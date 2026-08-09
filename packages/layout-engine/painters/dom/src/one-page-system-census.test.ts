// Exact-page M0 §4: the canonical `.superdoc-page` element is created in
// exactly ONE place — `renderPageShell` (page-content.ts). The persistent
// scaffold and its bounded content plane share that root factory, so there is
// no second page representation to reconcile. Retired stage and mode
// vocabulary must never appear.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

const SRC_ROOT = path.resolve(__dirname);

const PAGE_CLASS_ADD = 'classList.add(CLASS_NAMES.page)';

// String-joined so this census never trips on its own source.
const RETIRED_STAGE_TOKENS = [
  ['data-v2-stage', 'page'].join('-'),
  ['data-v2-stage', 'visible'].join('-'),
  ['superdoc-stage', 'page'].join('-'),
];
const RETIRED_PAGINATED_PATH_TOKENS = [
  ['geometry', 'only'].join('-'),
  ['exact', 'first', 'content'].join('-'),
  ['paint', 'Page', 'Window'].join(''),
  ['content', 'Mode'].join(''),
];

function collectProductionSources(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files.sort();
}

describe('one-page-system guard (exact-page M0, painter side)', () => {
  it('creates the canonical page element in exactly one place: renderPageShell', () => {
    const sites: string[] = [];
    for (const file of collectProductionSources(SRC_ROOT)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (line.includes(PAGE_CLASS_ADD)) {
          sites.push(`${path.relative(SRC_ROOT, file).split(path.sep).join('/')}:${index + 1}`);
        }
      });
    }
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatch(/^page-content\.ts:\d+$/);
  });

  it('keeps retired stage-page identifiers out of painter source', () => {
    const problems: string[] = [];
    for (const file of collectProductionSources(SRC_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const token of RETIRED_STAGE_TOKENS) {
        if (source.includes(token)) {
          problems.push(`${path.relative(SRC_ROOT, file).split(path.sep).join('/')}: ${token}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps retired paginated painter modes and entries out of painter source', () => {
    const problems: string[] = [];
    for (const file of collectProductionSources(SRC_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const token of RETIRED_PAGINATED_PATH_TOKENS) {
        if (source.includes(token)) {
          problems.push(`${path.relative(SRC_ROOT, file).split(path.sep).join('/')}: ${token}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
