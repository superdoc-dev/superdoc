/**
 * Consumer typecheck: prosemirror coexistence (IT-852 regression test).
 *
 * Verifies that installing superdoc alongside prosemirror packages
 * does NOT override real prosemirror types with `any`. This was the
 * exact bug reported by a customer using Tiptap + SuperDoc together.
 *
 * If the old ambient `declare module 'prosemirror-model' { export type Node = any }`
 * shims are still present, the assertions below will fail because the
 * prosemirror types will all be `any` instead of their real shapes.
 */

import type { Node, Schema, Fragment } from 'prosemirror-model';
import type { EditorState, Transaction, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

// Also import the same types from superdoc to ensure both resolve
import type { EditorState as SDEditorState, Schema as SDSchema, EditorView as SDEditorView } from 'superdoc';

// --------------------------------------------------------------------------
// Assert prosemirror types are REAL (not `any`).
//
// Strategy: assign a value that would only be valid if the type is `any`.
// If the type is real, TypeScript will error on the assignment.
// If the type is `any` (from ambient shims), the assignment silently passes.
//
// We use @ts-expect-error: if the type IS real, the assignment is an error
// and @ts-expect-error suppresses it (test passes). If the type is `any`,
// there's no error to suppress and @ts-expect-error itself becomes an error
// (TS2578: "Unused '@ts-expect-error' directive" — test fails, catching
// the regression).
// --------------------------------------------------------------------------

// prosemirror-model: Node should NOT be `any`
// @ts-expect-error — Node is a class, not assignable from string
const _node: Node = 'not a node';

// prosemirror-model: Schema should NOT be `any`
// @ts-expect-error — Schema is a class, not assignable from number
const _schema: Schema = 42;

// prosemirror-model: Fragment should NOT be `any`
// @ts-expect-error — Fragment is a class, not assignable from boolean
const _fragment: Fragment = true;

// prosemirror-state: EditorState should NOT be `any`
// @ts-expect-error — EditorState is a class, not assignable from string
const _state: EditorState = 'not a state';

// prosemirror-state: Transaction should NOT be `any`
// @ts-expect-error — Transaction is a class, not assignable from number
const _tx: Transaction = 99;

// prosemirror-state: Plugin should NOT be `any`
// @ts-expect-error — Plugin is a class, not assignable from string
const _plugin: Plugin = 'not a plugin';

// prosemirror-view: EditorView should NOT be `any`
// @ts-expect-error — EditorView is a class, not assignable from boolean
const _view: EditorView = false;

// --------------------------------------------------------------------------
// Verify superdoc re-exports resolve to the SAME real types, not `any`.
// --------------------------------------------------------------------------

// @ts-expect-error — SDEditorState (from superdoc) should also be real
const _sdState: SDEditorState = 'not a state';

// @ts-expect-error — SDSchema (from superdoc) should also be real
const _sdSchema: SDSchema = 42;

// @ts-expect-error — SDEditorView (from superdoc) should also be real
const _sdView: SDEditorView = false;
