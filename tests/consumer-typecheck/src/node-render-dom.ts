/**
 * Consumer typecheck: NodeConfig.renderDOM no longer leaks `any`
 * through ProseMirror's DOMOutputSpec tuple branch (SD-3213 drain).
 *
 * Before this change, `renderDOM?: MaybeGetter<DOMOutputSpec>` pulled
 * in PM's upstream `readonly [string, ...any[]]` tuple shape, leaking
 * `any` into the SD-3213 supported-root audit (6 findings, all reach
 * paths to this one field).
 *
 * After this change, the field is typed with
 * `MaybeGetter<SuperDocDOMOutputSpec>`, a local public alias that
 * mirrors PM's shape but uses an `unknown`-free recursive tuple
 * interface (`SuperDocDOMOutputSpecTuple`).
 *
 * This fixture exercises the four shape branches through `defineNode`,
 * the documented consumer entry point:
 *   - plain string ("em" — a self-closing inline tag name)
 *   - plain tuple with attrs and content hole (["span", { class }, 0])
 *   - nested tuples (["div", ["span", { class }, "text"]])
 *   - { dom, contentDOM? } form (used for custom DOM mount nodes)
 *
 * Plus one negative assertion: a number where an attrs object or
 * child spec is expected must error.
 */

import { defineNode } from 'superdoc/super-editor';

// Plain string: tagName-only render. Compiles because `string` is a
// branch of `SuperDocDOMOutputSpec`.
defineNode({
  name: 'plainStringSpec',
  renderDOM: () => 'em',
});

// Plain tuple with optional attrs + content hole (0). The most common
// shape for custom node renderers. Attrs accept string/number/boolean
// /null/undefined for setAttribute coercion compatibility.
defineNode({
  name: 'tupleWithAttrsAndHole',
  renderDOM: () => ['span', { class: 'my-class', 'data-count': 3, hidden: true }, 0],
});

// Nested tuples for child renderers. The recursive
// SuperDocDOMOutputSpecTuple interface defers self-reference so TS
// doesn't trip on the direct recursion that a plain type alias hits.
defineNode({
  name: 'nestedTuple',
  renderDOM: () => ['div', { class: 'wrap' }, ['span', { class: 'inner' }, 'text']],
});

// `{ dom, contentDOM? }` form. Used when a custom node needs to
// distinguish the outer mount node from the editable content node.
defineNode({
  name: 'domContentDomShape',
  renderDOM: () => {
    const dom = document.createElement('div');
    const contentDOM = document.createElement('span');
    dom.appendChild(contentDOM);
    return { dom, contentDOM };
  },
});

// --- Negative assertions -------------------------------------------------

// renderDOM is function-only at the type level, matching what the
// runtime in `Schema.js:99` actually supports (`renderDOM({ node,
// htmlAttributes })`). A direct-value form like `renderDOM: ['br']`
// would throw `TypeError: renderDOM is not a function` at runtime,
// so the public type rejects it. If a future PR re-widens the field
// to `MaybeGetter<SuperDocDOMOutputSpec>` (or back to PM's tuple-
// containing union), the directive becomes unused and tsc fails
// (TS2578).
defineNode({
  name: 'directValueRejected',
  // @ts-expect-error SD-3213: renderDOM is function-only; runtime invokes it as a callable.
  renderDOM: ['br'],
});

// A number can't be an attrs object or child spec. If a future PR
// widens the tuple element type back to `any` or `unknown`, this
// `@ts-expect-error` becomes unused and tsc fails (TS2578).
defineNode({
  name: 'badTupleElement',
  // @ts-expect-error SD-3213: tuple elements must be attrs object, nested spec, or 0; not a bare number.
  renderDOM: () => ['div', 42, 'no'],
});

// First tuple element must be a string (tagName). Passing a number
// must error; if a future PR re-widens the tuple, this directive
// becomes unused and tsc fails (TS2578).
defineNode({
  name: 'badTagName',
  // @ts-expect-error SD-3213: tuple[0] (tagName) must be string.
  renderDOM: () => [42, { class: 'no' }, 0],
});
