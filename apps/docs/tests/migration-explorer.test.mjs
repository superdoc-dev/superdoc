import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { DISPOSITION_LABELS as CATALOG_DISPOSITION_LABELS, MIGRATION_CATALOG } from '../lib/migration/catalog.ts';
import { DISPOSITION_LABELS, EXPLORER_ROWS, buildFacets, filterRows } from '../lib/migration/explorer.ts';

// The explorer exists to answer one question: "my build printed this name, what
// replaces it?" These tests protect that path, not the rendering.

test('every catalog entry becomes a row', () => {
  assert.equal(EXPLORER_ROWS.length, MIGRATION_CATALOG.entries.length);
});

// The explorer and the generated page print the same disposition text. A second
// definition would let them drift with nothing failing, so the explorer
// re-exports the catalog's mapping rather than declaring its own.
test('disposition labels come from the catalog, not a copy', async () => {
  const source = await readFile(new URL('../lib/migration/explorer.ts', import.meta.url), 'utf8');

  assert.equal(DISPOSITION_LABELS, CATALOG_DISPOSITION_LABELS, 'the explorer must re-export the catalog mapping');
  assert.doesNotMatch(
    source,
    /export const DISPOSITION_LABELS/,
    'explorer.ts redefines DISPOSITION_LABELS; re-export it from catalog.ts instead',
  );
});

// AIDEV-NOTE: The reason `v1Symbols` exists. A reader who hit `ZoomMode` has
// that exact string and nothing else; the row is labelled
// `superdoc/ui type exports`, which they would never think to search for. If
// this breaks, the grouped entry becomes unreachable by the only name the
// reader has.
test('searching a grouped symbol finds the row that covers it', () => {
  for (const symbol of ['ZoomMode', 'DocumentExportInput', 'ContextMenuContribution']) {
    const matches = filterRows(EXPLORER_ROWS, { search: symbol });
    assert.deepEqual(
      matches.map((row) => row.id),
      ['subpath-export.ui-types'],
      `${symbol} should resolve to the grouped superdoc/ui entry`,
    );
  }
});

test('search matches a plain entry by its own name', () => {
  const matches = filterRows(EXPLORER_ROWS, { search: 'SuperConverter' });
  assert.deepEqual(
    matches.map((row) => row.id),
    ['root.SuperConverter'],
  );
});

test('search is case-insensitive and matches replacements and notes', () => {
  assert.ok(filterRows(EXPLORER_ROWS, { search: 'superconverter' }).length > 0, 'lowercased symbol');
  assert.ok(filterRows(EXPLORER_ROWS, { search: 'activeEditor' }).length > 0, 'v2 replacement');
  assert.ok(filterRows(EXPLORER_ROWS, { search: 'ProseMirror' }).length > 0, 'notes prose');
});

test('an empty query returns every row', () => {
  assert.equal(filterRows(EXPLORER_ROWS, {}).length, EXPLORER_ROWS.length);
  assert.equal(filterRows(EXPLORER_ROWS, { search: '   ' }).length, EXPLORER_ROWS.length);
});

test('an unmatched search returns nothing rather than everything', () => {
  assert.deepEqual(filterRows(EXPLORER_ROWS, { search: 'no-such-symbol-anywhere' }), []);
});

test('filters combine as AND, not OR', () => {
  const runtime = filterRows(EXPLORER_ROWS, { failureMode: 'runtime' });
  const unsupported = filterRows(EXPLORER_ROWS, { disposition: 'unsupported' });
  const both = filterRows(EXPLORER_ROWS, { failureMode: 'runtime', disposition: 'unsupported' });

  assert.ok(both.length < runtime.length + unsupported.length, 'combining must narrow, not widen');
  for (const row of both) {
    assert.equal(row.failureMode, 'runtime');
    assert.equal(row.disposition, 'unsupported');
  }
});

test('search combines with a filter', () => {
  const searchOnly = filterRows(EXPLORER_ROWS, { search: 'superdoc/' });
  const narrowed = filterRows(EXPLORER_ROWS, { search: 'superdoc/', failureMode: 'unresolved-path' });

  assert.ok(narrowed.length > 0, 'the combination should still match something');
  assert.ok(narrowed.length <= searchOnly.length);
  for (const row of narrowed) assert.equal(row.failureMode, 'unresolved-path');
});

test('facet counts match what the filter returns', () => {
  const facets = buildFacets(EXPLORER_ROWS);

  for (const facet of facets.failureModes) {
    assert.equal(
      filterRows(EXPLORER_ROWS, { failureMode: facet.id }).length,
      facet.count,
      `${facet.label} count disagrees with its own filter`,
    );
  }

  for (const facet of facets.dispositions) {
    assert.equal(
      filterRows(EXPLORER_ROWS, { disposition: facet.id }).length,
      facet.count,
      `${facet.label} count disagrees with its own filter`,
    );
  }
});

test('facets cover every row and omit empty ones', () => {
  const facets = buildFacets(EXPLORER_ROWS);
  const sum = (list) => list.reduce((total, facet) => total + facet.count, 0);

  assert.equal(sum(facets.failureModes), EXPLORER_ROWS.length, 'failure modes must partition the rows');
  assert.equal(sum(facets.dispositions), EXPLORER_ROWS.length, 'dispositions must partition the rows');

  // A zero-count chip is a dead end. The catalog has no mechanical entries, so
  // that facet must not render at all.
  for (const facet of [...facets.failureModes, ...facets.dispositions]) {
    assert.ok(facet.count > 0, `${facet.label} renders with no rows behind it`);
  }
});

test('grouped rows expose their symbols and plain rows do not', () => {
  for (const row of EXPLORER_ROWS) {
    const entry = MIGRATION_CATALOG.entries.find((candidate) => candidate.id === row.id);
    assert.deepEqual(row.v1Symbols, entry.v1Symbols ?? []);
  }
});
