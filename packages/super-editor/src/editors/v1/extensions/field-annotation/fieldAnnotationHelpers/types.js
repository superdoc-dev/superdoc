/**
 * Shared JSDoc typedefs for the `fieldAnnotationHelpers` namespace.
 *
 * Defined once here so each helper file can reference them via
 * `@typedef {import('./types.js').X}` without re-declaring (which
 * would trigger ambiguous `export *` re-exports at the index barrel).
 *
 * @typedef {import('prosemirror-state').EditorState} EditorState
 * @typedef {import('prosemirror-state').Transaction} Transaction
 * @typedef {import('prosemirror-view').EditorView} EditorView
 * @typedef {import('prosemirror-model').Node} PmNode
 * @typedef {import('../../../core/Editor.js').Editor} Editor
 *
 * @typedef {{ node: PmNode; pos: number }} FieldAnnotationEntry
 * @typedef {{ node: PmNode; pos: number; rect: DOMRect }} FieldAnnotationEntryWithRect
 */

// Module marker so TypeScript treats this as a module-scoped declaration
// file rather than a script. No runtime symbols are exported.
export {};
