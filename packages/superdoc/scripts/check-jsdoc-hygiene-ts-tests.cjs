#!/usr/bin/env node
/**
 * Tests for `check-jsdoc-hygiene-ts.cjs`.
 *
 * Protects the scanner against two failure modes:
 *
 *   1. Silent false-positives — flagging legitimate documentation
 *      tags (@deprecated, @example, @typeParam, etc.).
 *   2. Silent false-negatives — the "scanner returns nothing for
 *      everything" failure mode, where AST field-name drift or a
 *      logic bug makes the gate look like it's working when it
 *      isn't.
 *
 * Each fixture is an in-memory TypeScript source snippet plus the
 * expected list of (tag, class) pairs the scanner should emit.
 *
 * Wired into check:public:superdoc as the `jsdoc-hygiene-ts-test`
 * stage, which runs immediately before `jsdoc-hygiene-ts` so AST
 * drift surfaces here, not as a silent zero-result downstream.
 *
 * File is intentionally named `*-tests.cjs` (not `*.test.cjs`) so
 * vitest doesn't pick it up via the `*.test.*` glob — this is a
 * standalone Node runner, not a vitest suite.
 *
 * Run manually with:
 *   node packages/superdoc/scripts/check-jsdoc-hygiene-ts-tests.cjs
 */

const { findViolations } = require('./check-jsdoc-hygiene-ts.cjs');

const FIXTURES = [
  // ─── Negative control ────────────────────────────────────────────
  // Clean public method with TS-only types and prose-only JSDoc.
  // Asserts the scanner returns ZERO hits — catches the "silent
  // false-negative" failure mode where the scanner produces nothing
  // and looks like it's working.
  {
    name: 'negative-control: prose-only JSDoc + TS types',
    src: `
/**
 * Does the thing.
 * @param name The thing to do.
 * @returns The result of doing it.
 */
export function doThing(name: string): boolean {
  return true;
}
`,
    expected: [],
  },

  // ─── Mixed-tag block ─────────────────────────────────────────────
  // A single JSDoc comment that mixes legitimate documentation tags
  // (@deprecated) with one type-bearing tag (@param {string}). Must
  // report exactly one violation, not three, not zero. Catches the
  // "detector iterates all tags and mis-keys" bug.
  {
    name: 'mixed-tag block: only the typed @param is flagged',
    src: `
/**
 * Mounts the thing.
 * @deprecated Use newThing instead.
 * @param {string} foo The input.
 * @returns The result.
 */
export function mount(foo: string): string {
  return foo;
}
`,
    expected: [{ tag: 'param', class: 'declaration-doc-type' }],
  },

  // ─── @param with type braces ─────────────────────────────────────
  {
    name: 'typed @param flagged',
    src: `
/** @param {Element} el */
export function render(el: HTMLElement): void {}
`,
    expected: [{ tag: 'param', class: 'declaration-doc-type' }],
  },

  // ─── @returns with type braces ───────────────────────────────────
  {
    name: 'typed @returns flagged',
    src: `
/** @returns {boolean} */
export function ready(): boolean { return true; }
`,
    expected: [{ tag: 'returns', class: 'declaration-doc-type' }],
  },

  // ─── @param prose-only ───────────────────────────────────────────
  {
    name: 'prose-only @param not flagged',
    src: `
/** @param el The element. */
export function render(el: HTMLElement): void {}
`,
    expected: [],
  },

  // ─── @type inline ────────────────────────────────────────────────
  {
    name: 'inline @type cast flagged',
    src: `
export function pick(): unknown {
  const v = {} as unknown;
  /** @type {Element} */
  const e = document.body;
  return e;
}
`,
    expected: [{ tag: 'type', class: 'inline-fake-cast' }],
  },

  // ─── @typedef ────────────────────────────────────────────────────
  {
    name: '@typedef always flagged',
    src: `
/**
 * @typedef {Object} Options
 * @property {string} name
 */
export const x = 1;
`,
    // Only @typedef fires; nested @property tags inside the typedef
    // are not surfaced as top-level tags by ts.getJSDocTags. That's
    // intentional for the detector — the parent @typedef IS the
    // violation, and the cleanup fix (convert to native interface)
    // takes the @property lines with it. Field-level reporting is
    // reviewer ergonomics, not detector correctness.
    expected: [{ tag: 'typedef', class: 'typedef-style' }],
  },

  // ─── @callback ───────────────────────────────────────────────────
  {
    name: '@callback always flagged',
    src: `
/**
 * @callback Listener
 * @param {string} event
 * @returns {void}
 */
export const x = 1;
`,
    expected: [{ tag: 'callback', class: 'typedef-style' }],
  },

  // ─── @template ───────────────────────────────────────────────────
  {
    name: '@template always flagged in .ts',
    src: `
/**
 * @template T
 */
export function identity<T>(value: T): T { return value; }
`,
    expected: [{ tag: 'template', class: 'declaration-doc-type' }],
  },

  // ─── @typeParam not flagged ──────────────────────────────────────
  // TSDoc-canonical alternative to @template; pure prose form.
  {
    name: '@typeParam not flagged (TSDoc-canonical)',
    src: `
/**
 * @typeParam T - The type of the value being returned.
 */
export function identity<T>(value: T): T { return value; }
`,
    expected: [],
  },

  // ─── @deprecated alone ───────────────────────────────────────────
  {
    name: '@deprecated not flagged',
    src: `
/** @deprecated Use newThing instead. */
export function oldThing(): void {}
`,
    expected: [],
  },

  // ─── @see / @example / @throws not flagged ──────────────────────
  {
    name: 'doc-only tags not flagged',
    src: `
/**
 * Does the thing.
 *
 * @see {@link OtherThing}
 * @example
 * doThing();
 * @throws when X is invalid.
 */
export function doThing(): void {}
`,
    expected: [],
  },

  // ─── @this typed ────────────────────────────────────────────────
  // `@this` canonically takes a type expression; the TS JSDoc parser
  // treats `@this <word>` as a typed form, so practical usage is
  // always flagged. In `.ts`, the right pattern is the parameter
  // `this: Foo` in the function signature.
  {
    name: 'typed @this flagged',
    src: `
/** @this {Foo} */
export function a(): void {}
`,
    expected: [{ tag: 'this', class: 'declaration-doc-type' }],
  },
];

function run() {
  let passed = 0;
  let failed = 0;
  for (const fx of FIXTURES) {
    const got = findViolations('fixture.ts', fx.src).map((v) => ({ tag: v.tag, class: v.class }));
    const gotKey = JSON.stringify(got);
    const expKey = JSON.stringify(fx.expected);
    if (gotKey === expKey) {
      passed++;
      console.log(`  PASS  ${fx.name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${fx.name}`);
      console.log(`        expected: ${expKey}`);
      console.log(`        got:      ${gotKey}`);
    }
  }
  console.log('');
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
