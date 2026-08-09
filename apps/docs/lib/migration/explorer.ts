/**
 * View model for the Removed-in-v2 explorer.
 *
 * AIDEV-NOTE: Derived from `MIGRATION_CATALOG`, never hand-maintained. The
 * explorer is a presentation of the same data the generated page and
 * `/migration/v1-to-v2.json` project, so a catalog change reaches all three
 * without a second edit. Keep this free of React so it stays testable and can
 * run in the machine-readable renderer.
 */

import { DISPOSITION_DEFINITIONS, DISPOSITION_LABELS, MIGRATION_CATALOG } from './catalog';
import type { MigrationDisposition, MigrationEntry, MigrationFailureMode } from './types';

/** Row shape the explorer renders. Flattened so filtering never re-reads the catalog. */
export type ExplorerRow = {
  id: string;
  v1: string;
  /** Concrete names a grouped row covers. Empty for a plain entry. */
  v1Symbols: string[];
  v2: string | null;
  disposition: MigrationDisposition;
  failureMode: MigrationFailureMode;
  symptom: string;
  notes: string;
  docsPath: string | null;
  /** Pre-lowercased haystack. Built once so keystroke filtering stays cheap. */
  searchText: string;
};

export type ExplorerFacet = {
  id: string;
  label: string;
  /** Count of rows this facet matches. Rendered so a reader sees scope before clicking. */
  count: number;
};

export const FAILURE_MODE_LABELS: Record<MigrationFailureMode, string> = {
  'unresolved-path': 'Import path gone',
  'missing-export': 'Name gone',
  runtime: 'Fails at runtime',
  'config-silent': 'Silently ignored',
};

// AIDEV-NOTE: Re-exported, not redefined. `DISPOSITION_LABELS` lives in
// catalog.ts because the generated page prints the same strings; a second copy
// here would let the explorer and the docs drift apart with no test failing.
// Failure-mode labels have no such twin, so they are defined above.
export { DISPOSITION_LABELS };

function toRow(entry: MigrationEntry): ExplorerRow {
  const v1Symbols = entry.v1Symbols ?? [];

  return {
    id: entry.id,
    v1: entry.v1,
    v1Symbols: [...v1Symbols],
    v2: entry.v2,
    disposition: entry.disposition,
    failureMode: entry.failureMode,
    symptom: entry.symptom,
    notes: entry.notes ?? '',
    docsPath: entry.docsPath ?? null,
    // v1Symbols are included so searching `ZoomMode` finds the grouped row that
    // covers it. Without them a reader who hit a concrete build error would get
    // no result for the name their compiler printed.
    searchText: [entry.v1, ...v1Symbols, entry.v2 ?? '', entry.notes ?? ''].join(' ').toLowerCase(),
  };
}

export const EXPLORER_ROWS: ExplorerRow[] = MIGRATION_CATALOG.entries.map(toRow);

/**
 * Facets over failure mode and disposition.
 *
 * Both dimensions are offered because they answer different questions: failure
 * mode is "when does this bite me", disposition is "how much work is it".
 */
export function buildFacets(rows: readonly ExplorerRow[]): {
  failureModes: ExplorerFacet[];
  dispositions: ExplorerFacet[];
} {
  const countBy = <T extends string>(pick: (row: ExplorerRow) => T, labels: Record<T, string>): ExplorerFacet[] =>
    (Object.keys(labels) as T[])
      .map((key) => ({ id: key, label: labels[key], count: rows.filter((row) => pick(row) === key).length }))
      // A zero-count facet is a dead end; the catalog has no mechanical entries.
      .filter((facet) => facet.count > 0);

  return {
    failureModes: countBy((row) => row.failureMode, FAILURE_MODE_LABELS),
    dispositions: countBy((row) => row.disposition, DISPOSITION_LABELS),
  };
}

export type ExplorerQuery = {
  search?: string;
  failureMode?: MigrationFailureMode | null;
  disposition?: MigrationDisposition | null;
};

/** Applies a query. Filters are AND-ed; an empty query returns every row. */
export function filterRows(rows: readonly ExplorerRow[], query: ExplorerQuery): ExplorerRow[] {
  const search = query.search?.trim().toLowerCase() ?? '';

  return rows.filter((row) => {
    if (query.failureMode && row.failureMode !== query.failureMode) return false;
    if (query.disposition && row.disposition !== query.disposition) return false;
    return !search || row.searchText.includes(search);
  });
}

export const EXPLORER_META = {
  v1Version: MIGRATION_CATALOG.v1Version,
  total: EXPLORER_ROWS.length,
  dispositionDefinitions: DISPOSITION_DEFINITIONS,
};
