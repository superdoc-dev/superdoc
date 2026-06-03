/**
 * Consumer typecheck: getStarterExtensions / getRichTextExtensions
 * return EditorExtension[] (SD-3213 drain).
 *
 * Before this change, the hand-written
 * `packages/super-editor/src/editors/v1/extensions/index.d.ts`
 * declared both functions as `(...args: any[]): any[]`, doubly wrong:
 *   - Runtime takes zero args (verified across all internal and
 *     documented call sites).
 *   - Return is a concrete `EditorExtension[]`, not `any[]`.
 *
 * After this change, consumers passing the result into
 * `new Editor({ extensions: getStarterExtensions() })` get a typed
 * array, and any attempt to pass arguments is a TS error.
 */

import { getStarterExtensions, getRichTextExtensions } from 'superdoc/super-editor';
import type { EditorExtension } from 'superdoc/super-editor';

// --- Return type is EditorExtension[], not any[] --------------------------

const starter: EditorExtension[] = getStarterExtensions();
const rich: EditorExtension[] = getRichTextExtensions();
void starter;
void rich;

// Strict type-equality assertion. A function silently returning `any[]`
// would still be assignable to `EditorExtension[]`, masking a regression.
// `Equal` fails the test if the return type drifts back to `any[]` (or
// any other shape).
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

const _starterReturnIsExact: AssertEqual<ReturnType<typeof getStarterExtensions>, EditorExtension[]> = true;
const _richReturnIsExact: AssertEqual<ReturnType<typeof getRichTextExtensions>, EditorExtension[]> = true;
void _starterReturnIsExact;
void _richReturnIsExact;

// --- Element type is not any ----------------------------------------------

// If the element type were `any`, this `Equal<typeof first, any>` check
// would compile to `true`. Asserting it's NOT `any` proves the
// EditorExtension union is actually applied.
const first = starter[0];
if (first) {
  const _firstIsNotAny: Equal<typeof first, any> = false;
  void _firstIsNotAny;
}

// --- Arguments are rejected -----------------------------------------------

// Runtime takes zero arguments. Passing anything must be a TS error;
// if a future PR widens the signature back to `(...args: any[])`,
// the directive becomes unused and tsc fails (TS2578).

// @ts-expect-error SD-3213: getStarterExtensions takes no arguments.
getStarterExtensions('docx');

// @ts-expect-error SD-3213: getRichTextExtensions takes no arguments.
getRichTextExtensions({ some: 'option' });
