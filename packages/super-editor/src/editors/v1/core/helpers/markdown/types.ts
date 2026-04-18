/**
 * Types for the Markdown → ProseMirror AST conversion pipeline.
 */

import type { Node as PmNode, Fragment, Schema } from 'prosemirror-model';
import type { Editor } from '../../Editor.js';

// ---------------------------------------------------------------------------
// Conversion options
// ---------------------------------------------------------------------------

export interface MarkdownConversionOptions {
  /** When true, skip side-effects like numbering allocation (for dry-run validation). */
  dryRun?: boolean;
  /**
   * When true (default), detect pandoc-style fixed-width ASCII tables in the
   * markdown source and rewrite them as GFM pipe tables before AST parsing.
   * Set to `false` to skip this normalization step.
   */
  normalizeFixedWidthTables?: boolean;
}

// ---------------------------------------------------------------------------
// Conversion results
// ---------------------------------------------------------------------------

export interface MarkdownConversionResult {
  /** The converted ProseMirror document node. */
  doc: PmNode;
  /** Diagnostics for unsupported or problematic mdast nodes. */
  diagnostics: MarkdownDiagnostic[];
}

export interface MarkdownFragmentResult {
  /** The converted ProseMirror fragment (for insertion, not full doc). */
  fragment: Fragment;
  /** Diagnostics for unsupported or problematic mdast nodes. */
  diagnostics: MarkdownDiagnostic[];
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = 'warning' | 'error';

export interface MarkdownDiagnostic {
  severity: DiagnosticSeverity;
  /** The mdast node type that triggered the diagnostic. */
  nodeType: string;
  /** Human-readable explanation. */
  message: string;
  /** Line/column in the source markdown (if available from mdast position). */
  position?: { line: number; column: number };
}

// ---------------------------------------------------------------------------
// mdast-to-PM mapper context
// ---------------------------------------------------------------------------

/**
 * Shared context threaded through the mdast → ProseMirror mapping walk.
 * Carries the editor, schema, accumulated diagnostics, and conversion options.
 */
export interface MdastConversionContext {
  editor: Editor;
  schema: Schema;
  diagnostics: MarkdownDiagnostic[];
  options: MarkdownConversionOptions;
}
