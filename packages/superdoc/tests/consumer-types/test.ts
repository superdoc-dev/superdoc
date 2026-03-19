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
import { createTheme, buildTheme } from 'superdoc';

// Super-editor entry point
import type { EditorView, EditorState, Transaction, Schema } from 'superdoc/super-editor';

// Types entry point
import type { ProseMirrorJSON, NodeConfig, MarkConfig } from 'superdoc/types';

// Verify the types are usable (not just importable).
// AssertExtends<false> is a compile error, so signature mismatches fail the build.
type AssertExtends<T extends true> = T;
type _AssertSuperDoc = AssertExtends<SuperDoc extends object ? true : false>;
type _AssertEditorView = AssertExtends<EditorView extends object ? true : false>;
type _AssertJSON = AssertExtends<ProseMirrorJSON extends object ? true : false>;
type _AssertCreateTheme = AssertExtends<typeof createTheme extends (...args: any[]) => string ? true : false>;
type _AssertBuildTheme = AssertExtends<
  typeof buildTheme extends (...args: any[]) => { className: string; css: string } ? true : false
>;
