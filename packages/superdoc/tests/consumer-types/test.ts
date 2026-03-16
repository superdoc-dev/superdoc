/**
 * Consumer typecheck smoke test (SD-2227).
 *
 * This file is compiled with `tsc --noEmit` against the packed superdoc
 * tarball to verify that published .d.ts files are valid for consumers
 * with skipLibCheck: false.
 *
 * It is NOT executed at runtime — only type-checked.
 */

// Main entry point
import type { SuperDoc } from 'superdoc';

// Super-editor entry point
import type { EditorView, EditorState, Transaction, Schema } from 'superdoc/super-editor';

// Types entry point
import type { ProseMirrorJSON, NodeConfig, MarkConfig } from 'superdoc/types';

// Verify the types are usable (not just importable)
type _AssertSuperDoc = SuperDoc extends object ? true : never;
type _AssertEditorView = EditorView extends object ? true : never;
type _AssertJSON = ProseMirrorJSON extends object ? true : never;
