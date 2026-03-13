/**
 * Rollup config — generates CJS (.cjs) artifacts alongside the ESM output from tsc.
 *
 * Build order: tsc (ESM + .d.ts) → rollup (parallel .cjs from dist/*.js).
 *
 * Uses `preserveModules` so each source module gets its own .cjs file in the
 * same directory tree. This is critical: tools.ts, skills.ts, and embedded-cli.ts
 * resolve asset directories (../tools, ../skills, ../../platforms) relative to
 * import.meta.url — moving CJS output into a different subtree would break those
 * paths at runtime.
 *
 * Rollup handles two key transformations that make CJS work under type:"module":
 *   1. import.meta.url → pathToFileURL(__filename).href  (Node CJS shim)
 *   2. Internal imports rewritten from .js → .cjs         (avoids ERR_REQUIRE_ESM)
 *
 * NOTE: If a new subpath export is added (e.g. ./helpers/format), add it as an
 * additional entry here so it gets a .cjs counterpart.
 */

import { defineConfig } from 'rollup';

export default defineConfig({
  input: 'dist/index.js',

  output: {
    dir: 'dist',
    format: 'cjs',
    exports: 'named',
    preserveModules: true,
    preserveModulesRoot: 'dist',
    entryFileNames: '[name].cjs',
  },

  // Externalize Node builtins, platform binary packages, and all bare-specifier
  // npm dependencies (anything that isn't a relative or absolute path).
  external: [/^node:/, /@superdoc-dev\/sdk-/, /^[^./]/],
});
