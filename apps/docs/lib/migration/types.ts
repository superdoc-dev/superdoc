/**
 * Typed model for the v1 → v2 migration catalog.
 *
 * The catalog is the factual source for every published migration mapping: the
 * removed-exports reference page, the machine-readable JSON at
 * `/migration/v1-to-v2.json`, and the CI drift gate.
 *
 * AIDEV-NOTE: Facts that a code catalog can answer must be DERIVED, not hand
 * written. `scripts/generate-migration-catalog.ts` reads the real v1 and v2
 * public export lists and fails when a hand-authored entry disagrees with the
 * package. Prose (disposition, replacement guidance) is authored here; the
 * symbol inventory is not.
 */

/**
 * How much work a mapping requires. Chosen so a reader can triage an entire
 * migration by scanning one column, and so the machine-readable output can be
 * filtered without parsing prose.
 */
export type MigrationDisposition =
  /** A direct substitution with equivalent behavior. Safe to apply mechanically. */
  | 'mechanical'
  /** A replacement exists, but the semantics differ. Requires reading and re-verification. */
  | 'redesign'
  /** No v2 equivalent. The capability must be removed or rebuilt outside SuperDoc. */
  | 'unsupported';

/**
 * How a v1 usage fails once the package is upgraded. This drives the guide's
 * two top-level sections and is the single most useful field for diagnosing a
 * migration in progress.
 */
export type MigrationFailureMode =
  /**
   * Module resolution fails in every module system. The build breaks before
   * any code runs.
   */
  | 'unresolved-path'
  /**
   * The module resolves but the name is absent.
   *
   * AIDEV-NOTE: NOT reliably build-time. ESM and TypeScript reject a missing
   * named import, but `const { Editor } = require('superdoc')` binds
   * `undefined` and fails later at the call site. The v2 package publishes a
   * `require` condition, so CJS is a supported consumer path.
   */
  | 'missing-export'
  /** Imports resolve and typecheck, but the value is inert at runtime. */
  | 'runtime'
  /** Config is accepted and typechecks, but v2 ignores it or refuses to start. */
  | 'config-silent';

/** Which part of a consumer integration an entry applies to. */
export type MigrationSurface =
  | 'package'
  | 'editor-internals'
  | 'custom-ui'
  | 'extensions'
  | 'collaboration'
  | 'converter';

/** Fields shared by every entry, regardless of whether `v1` is a group label. */
type MigrationEntryBase = {
  /** Stable identifier. Referenced by tooling output and never renamed. */
  id: string;
  /** The v1 symbol, import path, or config field a consumer would search for. */
  v1: string;
  /** The supported v2 surface, or null when nothing replaces it. */
  v2: string | null;
  disposition: MigrationDisposition;
  failureMode: MigrationFailureMode;
  surface: MigrationSurface;
  /**
   * What a consumer sees when this breaks. Written as an observable symptom
   * rather than a quoted error string: exact wording varies by bundler, engine,
   * and minifier, so treating it as a stable API would be wrong.
   */
  symptom: string;
  /** Why the replacement differs, when `disposition` is not `mechanical`. */
  notes?: string;
  /** Docs path for the fuller explanation. */
  docsPath?: string;
  /**
   * Text `docsPath` must contain for the link to count as teaching this row.
   *
   * The migration-catalog test derives this from `v2` when it can, which only
   * works while `v2` names a symbol. Set it when `v2` is prose or a list, so a
   * word like `the` cannot stand in for the guidance the row promises.
   */
  docsMarker?: string;
};

/**
 * An entry whose `v1` is a name a consumer would literally import or type.
 *
 * AIDEV-NOTE: `isGroup` and `v1Symbols` are declared `never` rather than
 * omitted so an entry cannot carry half the grouping contract. This is a
 * discriminated union precisely because the pairing was previously enforced
 * only by a test, which let `v1Symbols: []` with no `isGroup` slip through.
 */
type MigrationSymbolEntry = MigrationEntryBase & {
  isGroup?: never;
  v1Symbols?: never;
};

/**
 * An entry whose `v1` is a human-readable group label covering several symbols.
 *
 * Both fields are required together: the label alone is not resolvable, so the
 * concrete names must be published as data. Without them a tool resolving
 * `ContextMenuContribution` from a consumer's source would have to scrape the
 * English `notes` to discover which row covers it.
 */
type MigrationGroupEntry = MigrationEntryBase & {
  isGroup: true;
  /** Concrete v1 names this entry covers. Must be non-empty. */
  v1Symbols: [string, ...string[]];
};

export type MigrationEntry = MigrationSymbolEntry | MigrationGroupEntry;

export type MigrationCatalog = {
  /**
   * v1 package version the removed-symbol inventory was derived from.
   *
   * AIDEV-NOTE: Pinned deliberately. v1 is frozen, so this is a stable baseline.
   * The v2 version is NOT recorded here: it changes every prerelease, and
   * asserting it would fail the drift gate on unrelated releases. Generated
   * output stamps the live v2 version at build time instead.
   */
  v1Version: string;
  /** Runtime values v1 exported from the package root. Asserted against the snapshot. */
  v1ExportCount: number;
  /** Code subpaths v1 published, excluding the root and CSS. Asserted against the snapshot. */
  v1SubpathCount: number;
  entries: MigrationEntry[];
};
