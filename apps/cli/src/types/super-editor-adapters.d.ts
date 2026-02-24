/**
 * Ambient module declaration for the super-editor adapter bridge.
 *
 * At runtime, bun resolves this via the tsconfig `paths` mapping.
 * For typecheck (`tsc --noEmit`), this declaration provides the type
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
