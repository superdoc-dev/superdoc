'use client';

import { useId, useMemo, useState } from 'react';
import {
  DISPOSITION_LABELS,
  EXPLORER_META,
  EXPLORER_ROWS,
  buildFacets,
  filterRows,
  type ExplorerRow,
} from '@/lib/migration/explorer';
import type { MigrationDisposition, MigrationFailureMode } from '@/lib/migration/types';
import styles from './migration-explorer.module.css';

/**
 * Searchable view of the v1 → v2 migration catalog.
 *
 * AIDEV-NOTE: This is a progressive enhancement, not the source of truth. The
 * generated Markdown table in `removed-apis.mdx` remains the fallback for
 * no-JS readers, search engines, and agents, and `lib/llm-markdown.ts` renders
 * a machine-readable form. Never move a fact into this component that does not
 * also reach those surfaces.
 */
export function MigrationExplorer() {
  const [search, setSearch] = useState('');
  const [failureMode, setFailureMode] = useState<MigrationFailureMode | null>(null);
  const [disposition, setDisposition] = useState<MigrationDisposition | null>(null);
  const searchId = useId();

  const facets = useMemo(() => buildFacets(EXPLORER_ROWS), []);

  // AIDEV-NOTE: Results render only once a query is active. Showing all 46 rows
  // on load put 92 rows on the page, because the canonical Markdown tables below
  // list the same entries. It also meant a no-JS reader saw inert controls above
  // a result set they could not affect; now they see the prompt and scroll to the
  // tables, which is the correct fallback.
  const hasQuery = search.trim().length > 0 || failureMode !== null || disposition !== null;
  const rows = useMemo(
    () => (hasQuery ? filterRows(EXPLORER_ROWS, { search, failureMode, disposition }) : []),
    [hasQuery, search, failureMode, disposition],
  );

  return (
    <div className={`sd-migration-explorer ${styles.explorer}`}>
      <div className={styles.toolbar}>
        <label className={styles.search} htmlFor={searchId}>
          <svg
            width='15'
            height='15'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.2'
            aria-hidden
          >
            <circle cx='11' cy='11' r='7' />
            <path d='m20 20-3.5-3.5' />
          </svg>
          <input
            id={searchId}
            type='search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='SuperConverter, editor.commands, ZoomMode…'
            aria-label='Search removed v1 APIs'
          />
        </label>

        <div className={styles.facetGroup} role='group' aria-label='Filter by when it fails'>
          <span className={styles.facetLabel}>Fails</span>
          {facets.failureModes.map((facet) => (
            <button
              key={facet.id}
              type='button'
              className={styles.chip}
              aria-pressed={failureMode === facet.id}
              onClick={() => setFailureMode(failureMode === facet.id ? null : (facet.id as MigrationFailureMode))}
            >
              {facet.label}
              <span className={styles.count}>{facet.count}</span>
            </button>
          ))}
        </div>

        <div className={styles.facetGroup} role='group' aria-label='Filter by migration effort'>
          <span className={styles.facetLabel}>Effort</span>
          {facets.dispositions.map((facet) => (
            <button
              key={facet.id}
              type='button'
              className={styles.chip}
              aria-pressed={disposition === facet.id}
              onClick={() => setDisposition(disposition === facet.id ? null : (facet.id as MigrationDisposition))}
            >
              {facet.label}
              <span className={styles.count}>{facet.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Announced politely so a screen-reader user hears the result count
          change without the focus leaving the search field. */}
      <p className={styles.status} role='status' aria-live='polite'>
        {hasQuery
          ? `${rows.length} of ${EXPLORER_META.total} entries`
          : `${EXPLORER_META.total} entries. Search or filter to narrow them.`}
      </p>

      {!hasQuery ? (
        <p className={styles.idle}>
          Every entry is listed in the tables below. Search a v1 name, or filter, to jump straight to one.
        </p>
      ) : rows.length > 0 ? (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.caption}>
              Removed v1 APIs and their v2 replacements, filtered by the controls above
            </caption>
            <colgroup>
              <col className={styles.colV1} />
              <col className={styles.colV2} />
              <col className={styles.colMigration} />
              <col className={styles.colSymptom} />
              <col className={styles.colNotes} />
            </colgroup>
            <thead>
              <tr>
                <th scope='col'>v1</th>
                <th scope='col'>v2</th>
                <th scope='col'>Migration</th>
                <th scope='col'>What you see</th>
                <th scope='col'>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ExplorerTableRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>
          No entry matches that search. Every removed name is listed in the table below this section.
        </p>
      )}
    </div>
  );
}

function ExplorerTableRow({ row }: { row: ExplorerRow }) {
  return (
    <tr>
      <td data-label='v1'>
        <code>{row.v1}</code>
        {row.v1Symbols.length > 0 && (
          // Grouped rows exist because one v2 change removed many names at once.
          // Listing them keeps the row findable by the name a compiler printed.
          <span className={styles.symbols}>{row.v1Symbols.join(', ')}</span>
        )}
      </td>
      <td data-label='v2' className={styles.v2}>
        {row.v2 ? <code>{row.v2}</code> : <span className={styles.none}>None</span>}
      </td>
      <td data-label='Migration'>
        <span className={`${styles.pill} ${styles[row.disposition]}`}>{DISPOSITION_LABELS[row.disposition]}</span>
      </td>
      <td data-label='What you see' className={styles.prose}>
        {row.symptom}
      </td>
      <td data-label='Notes' className={styles.prose}>
        {row.notes}
        {row.docsPath && (
          <>
            {' '}
            <a className={styles.more} href={row.docsPath}>
              Read more →
            </a>
          </>
        )}
      </td>
    </tr>
  );
}
