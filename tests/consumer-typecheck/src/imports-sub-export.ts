/**
 * Consumer typecheck: "superdoc/super-editor" sub-export.
 *
 * Verifies the facade entry point works for consumers who import directly
 * from the super-editor sub-path. The RFC classifies this subpath as
 * legacy public compatibility surface: customers may already depend on it,
 * so its types must compile and must resolve to real interfaces, not `any`.
 *
 * The assertions below catch a regression where one of these symbols'
 * types collapses through a shim even though the import itself still
 * resolves.
 */
import {
  Editor,
  PresentationEditor,
  Extensions,
  defineNode,
  defineMark,
  isNodeType,
  SuperToolbar,
} from 'superdoc/super-editor';
import type { EditorState, Transaction, EditorView, Schema, CommandProps, EditorOptions } from 'superdoc/super-editor';

const editor = new Editor({});

// Helper: IsAny<T> resolves to `true` when T is `any`, otherwise false.
type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

// Type-level assertions: each public type imported above must be a real
// interface. If any collapses to `any`, AssertNotAny<T> resolves to `never`
// and the line below fails to compile.
const _real_EditorState: AssertNotAny<EditorState> = true;
const _real_Transaction: AssertNotAny<Transaction> = true;
const _real_EditorView: AssertNotAny<EditorView> = true;
const _real_Schema: AssertNotAny<Schema> = true;
const _real_CommandProps: AssertNotAny<CommandProps> = true;
const _real_EditorOptions: AssertNotAny<EditorOptions> = true;

// Value-level assertion: the imported runtime symbols are not `any`. A
// loose typing on the named export would silently accept anything.
const _real_Editor: AssertNotAny<typeof Editor> = true;
const _real_PresentationEditor: AssertNotAny<typeof PresentationEditor> = true;
const _real_Extensions: AssertNotAny<typeof Extensions> = true;
const _real_defineNode: AssertNotAny<typeof defineNode> = true;
const _real_defineMark: AssertNotAny<typeof defineMark> = true;
const _real_isNodeType: AssertNotAny<typeof isNodeType> = true;
const _real_SuperToolbar: AssertNotAny<typeof SuperToolbar> = true;

void editor;
void _real_EditorState;
void _real_Transaction;
void _real_EditorView;
void _real_Schema;
void _real_CommandProps;
void _real_EditorOptions;
void _real_Editor;
void _real_PresentationEditor;
void _real_Extensions;
void _real_defineNode;
void _real_defineMark;
void _real_isNodeType;
void _real_SuperToolbar;
