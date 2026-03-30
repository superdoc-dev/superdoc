/**
 * Ambient type declarations for @superdoc/super-editor internal converter modules.
 *
 * These modules are exposed via package.json exports but lack .d.ts files
 * because the source is JavaScript with JSDoc annotations. This file provides
 * minimal type declarations to satisfy TypeScript's module resolution.
 */

declare module '@superdoc/super-editor/converter/internal/v3/handlers/w/pPr/index.js' {
  import type { OoxmlTranslator } from '@superdoc/style-engine/ooxml';
  export const translator: OoxmlTranslator;
}

declare module '@superdoc/super-editor/converter/internal/v3/handlers/w/rpr/index.js' {
  import type { OoxmlTranslator } from '@superdoc/style-engine/ooxml';
  export const translator: OoxmlTranslator;
}
