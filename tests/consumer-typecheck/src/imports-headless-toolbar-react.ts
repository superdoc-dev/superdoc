/**
 * Consumer typecheck: "superdoc/headless-toolbar/react" sub-export.
 *
 * Verifies the React headless-toolbar hook keeps its real type. The fixture
 * is type-only; it does not render JSX. The `useHeadlessToolbar` return
 * type is structural (`{ snapshot, execute }`), so the assertion catches
 * a regression where the hook collapses to `any`.
 */
import { useHeadlessToolbar } from 'superdoc/headless-toolbar/react';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

const _real_useHeadlessToolbar: AssertNotAny<typeof useHeadlessToolbar> = true;

// Spot-check the hook's return shape. If the hook were typed loosely,
// these property accesses would resolve to `any` and the strict-mode
// rules below would not catch it. We pin the call signature explicitly.
type HookReturn = ReturnType<typeof useHeadlessToolbar>;
const _real_HookReturn: AssertNotAny<HookReturn> = true;
const _real_HookSnapshot: AssertNotAny<HookReturn['snapshot']> = true;
const _real_HookExecute: AssertNotAny<HookReturn['execute']> = true;

void _real_useHeadlessToolbar;
void _real_HookReturn;
void _real_HookSnapshot;
void _real_HookExecute;
