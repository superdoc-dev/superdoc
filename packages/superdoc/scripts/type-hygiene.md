# TypeScript-side JSDoc hygiene

## Rule

In `.ts` source under `packages/superdoc/src/` and
`packages/super-editor/src/`, do not use type-bearing JSDoc tags.
TypeScript syntax is the only source of truth for shape on the public
contract surface; JSDoc is reserved for prose documentation.

## What this rule covers

The scanner (`check-jsdoc-hygiene-ts.cjs`) flags two patterns in `.ts`
files:

### 1. Type-bearing tags that always violate

These tags exist only to declare types in JSDoc form. In `.ts` files
there is always a native TypeScript construct that is more accurate
and self-checking:

| Tag          | Use in TS instead                                  |
|--------------|----------------------------------------------------|
| `@type`      | `as Type`, or just let inference work              |
| `@typedef`   | `type X = ...` or `interface X { ... }`            |
| `@callback`  | `type X = (...) => ...`                            |
| `@template`  | Native generic syntax: `function foo<T>(...)`. For documentation, use `@typeParam T - description` |
| `@implements`| `class Foo implements Bar`                         |
| `@extends`   | `class Foo extends Bar` / `interface Foo extends Bar` |
| `@augments`  | Same as `@extends`                                 |
| `@enum`      | `enum X { ... }`                                   |

### 2. Tags that violate only when carrying a `{Type}` brace

These tags are legitimate as prose documentation. They are flagged
only when they duplicate a TypeScript-expressible type:

| Tag          | OK                            | Flagged                                |
|--------------|-------------------------------|----------------------------------------|
| `@param`     | `@param name description`     | `@param {string} name description`     |
| `@returns`   | `@returns description`        | `@returns {string} description`        |
| `@return`    | `@return description`         | `@return {string} description`         |
| `@this`      | `@this description`           | `@this {Foo} description`              |

## Why

Type-bearing JSDoc in `.ts` files is documentation-only — the TS
compiler ignores it. That means:

- The annotation can drift from the actual TS signature without any
  build error. The recent `addCommentsList` fix is one example:
  `@param {Element}` while the signature was `HTMLElement`.
- Inline `/** @type {Foo} */ value` looks like a cast but is a no-op.
  If a real cast was intended, use `value as Foo`. If the JSDoc is
  redundant commentary, delete it.
- Two sources of truth for the same shape diverge over time, and the
  one TypeScript doesn't enforce becomes wrong silently.

JSDoc is still useful in `.ts` for prose documentation: function
descriptions, `@deprecated`, `@example`, `@throws`, `@see`,
`@typeParam` (the TSDoc-canonical alternative to `@template`), etc.
The scanner does not flag these.

## What still belongs in JSDoc

- Prose explaining what the function does, behavioral contracts,
  side-effect notes, and `@deprecated` / `@example` / `@throws` /
  `@see` tags.
- Parameter and return descriptions, as long as they do not carry
  `{Type}` braces: `@param name description` is fine.
- `@typeParam T - description` for documenting generic parameters
  (TSDoc-canonical, prose-only).

## How to fix violations

### `@param {Type} name description` → `@param name description`

```ts
// Before
/**
 * @param {HTMLElement} element The DOM element to mount into.
 */
addCommentsList(element: HTMLElement) { ... }

// After
/**
 * @param element The DOM element to mount into.
 */
addCommentsList(element: HTMLElement) { ... }
```

The signature carries the type; the prose stays useful.

### `@returns {Type} description` → `@returns description`

Same pattern. Drop the `{Type}` brace, keep the prose.

### Inline `/** @type {Foo} */ value`

Triage each occurrence:

- If a cast was genuinely intended (e.g. the TS inference is wider
  than the runtime guarantee), replace with `value as Foo`.
- If the annotation was redundant commentary, delete it.

In `.ts` files the inline `@type` cast is a no-op — TS ignores it. So
either fix the type system properly with `as`, or remove the misleading
comment.

### `@typedef`, `@callback`, `@enum`

Convert to a native TypeScript declaration:

```ts
// Before
/**
 * @typedef {Object} Options
 * @property {string} name
 * @property {boolean} [verbose]
 */

// After
interface Options {
  name: string;
  verbose?: boolean;
}
```

Export the type if it is part of the public surface.

### `@template T`

In `.ts` files, generics belong in the signature:

```ts
// Before
/**
 * @template T
 * @param {T} value
 */
function identity(value) { return value; }

// After
/**
 * @typeParam T - The type of the value being returned.
 */
function identity<T>(value: T): T { return value; }
```

If you want to document the type parameter, use TSDoc's `@typeParam`,
not `@template`.

## Scope

The scanner runs on `.ts` files under `packages/superdoc/src/` and
`packages/super-editor/src/`. Excludes:

- `*.d.ts` (declaration files, generated)
- `*.test.ts` / `*.spec.ts` (test files; type-bearing JSDoc is fine
  for test fixtures)
- `dev/`, `__mocks__/`, `__fixtures__/` directories

The rule **does not** apply to `.js` files. Those use JSDoc as their
type system via `// @ts-check`; that is enforced separately by
`check-jsdoc.cjs`. Both gates can coexist: TS files use TS syntax for
types, JS files use JSDoc for types, neither uses both.

## Enforcement

Strict zero. Every type-bearing JSDoc tag in scope is a violation;
CI fails on any. There is no baseline, grandfathering, or `--write`
mode.

Run the gate locally with:

```sh
node packages/superdoc/scripts/check-jsdoc-hygiene-ts.cjs
```

If it fires on a tag you can't easily fix, fix the tag (see the patterns
above) rather than reaching for a grandfathering escape hatch. The
gate's failure message links back to this doc so the fix path is
always one click away.
