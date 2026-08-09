// Ambient declaration for Vue SFC modules (`*.vue`).
//
// Vite handles `.vue` resolution at build time; tsc has no resolver for them
// without the official Vue TS plugin. The composables in this package import
// SFCs lazily (e.g. `await import('../components/surfaces/FindReplaceSurface.vue')`)
// and only ever use them as opaque tokens passed to `markRaw()`.
//
// Declared as a type-only ambient module so the `// @ts-check`-gated files
// can import `.vue` modules without resorting to per-import suppression.
// The shape is intentionally opaque; the build keeps the real Vue component.
declare module '*.vue' {
  const component: unknown;
  export default component;
}
