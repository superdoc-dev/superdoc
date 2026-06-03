/**
 * Shared JSDoc typedefs for the `trackChangesHelpers` namespace.
 *
 * Defined once here so each helper file can reference them via
 * `@typedef {import('./types.js').X}` without re-declaring (which
 * would trigger ambiguous `export *` re-exports at the index barrel).
 *
 * NOT exported from `index.js`. Reference these types via JSDoc
 * `import()` only; this module intentionally exports no runtime
 * symbols.
 *
 * @typedef {import('prosemirror-model').Node} PmNode
 * @typedef {import('prosemirror-model').Mark} PmMark
 * @typedef {import('prosemirror-state').Transaction} Transaction
 * @typedef {import('prosemirror-state').EditorState} EditorState
 *
 * @typedef {Record<string, unknown>} Attrs
 *
 * @typedef {{ type: string; attrs: Attrs }} MarkSnapshot
 *   Compact mark descriptor used by the tracked-changes pipeline.
 *   `type` is the PM mark type name (e.g. `'bold'`); `attrs` is the
 *   snapshot's attribute bag, always present (`createMarkSnapshot`
 *   normalizes missing attrs to `{}`).
 *
 * @typedef {PmMark | SnapshotLike} MarkLike
 *   Helpers accept either a live ProseMirror mark or a snapshot-shaped
 *   object. Code reads `.type?.name ?? .type` to handle both: PM
 *   `Mark.type` is a `MarkType` object whose `.name` is the string,
 *   while `MarkSnapshot.type` is the string directly. The snapshot side
 *   uses the permissive `SnapshotLike` shape so helpers tolerate the
 *   loose `{ type?, attrs? }` typing that flows through attribute-bag
 *   channels (e.g. `formatChangeMark.attrs.before`).
 *
 * @typedef {{ node: PmNode; pos: number }} NodePosEntry
 *   The standard `findChildren` / `nodesBetween` result shape.
 *
 * @typedef {{ from: number; to: number; mark: PmMark; node?: PmNode }} TrackedMarkRange
 *   A live ProseMirror mark located in a `[from, to]` document range.
 *   Used as `findTrackedMarkBetween`'s non-null return and as the
 *   element shape of `getTrackChanges`'s result array.
 *
 * @typedef {{ type?: string; attrs?: Attrs }} SnapshotLike
 *   Permissive snapshot shape for helper inputs that flow through
 *   loosely-typed channels (e.g. `formatChangeMark.attrs.before`,
 *   which carries snapshots as a plain attribute bag). Helpers that
 *   accept `SnapshotLike[]` tolerate missing fields at runtime;
 *   `getTypeName` returns `undefined` for entries missing `type`, and
 *   attr-merge sites guard with `attrs || {}` /  `{ ...existing.attrs }`.
 *   Helpers that PRODUCE snapshots still return strict `MarkSnapshot`.
 */

// Module marker so TypeScript treats this as a module-scoped declaration
// file rather than a script. No runtime symbols are exported.
export {};
