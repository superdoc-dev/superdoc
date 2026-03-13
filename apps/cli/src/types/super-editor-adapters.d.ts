/**
 * Ambient module declarations for the super-editor bridge.
 *
 * At runtime, bun resolves these via the tsconfig `paths` mappings.
 * For typecheck (`tsc --noEmit`), these declarations provide the type
 * surface without pulling in the super-editor source tree (which uses
 * internal path aliases that only its own tsconfig maps).
 */
declare module '@superdoc/super-editor/document-api-adapters' {
  import type { DocumentApiAdapters } from '@superdoc/document-api';

  /**
   * Build the full set of document-api adapters from a super-editor Editor instance.
   * The `editor` param is typed as `unknown` at this boundary because the CLI
   * imports `Editor` from `superdoc/super-editor` (dist types), while the
   * adapter function's source signature uses the internal source `Editor` type.
   */
  export function getDocumentApiAdapters(editor: unknown): DocumentApiAdapters;
}

declare module '@superdoc/super-editor/markdown' {
  interface MarkdownConversionResult {
    /** ProseMirror doc node (typed minimally to avoid PM dependency at the CLI boundary). */
    doc: { readonly content: unknown };
    diagnostics: Array<{ nodeType: string; message: string }>;
  }

  /**
   * Parse Markdown to a full ProseMirror document node via the AST pipeline
   * (remark-parse → mdast → PM JSON). DOM-free — works in headless environments.
   */
  export function markdownToPmDoc(
    markdown: string,
    editor: unknown,
    options?: { dryRun?: boolean },
  ): MarkdownConversionResult;
}
