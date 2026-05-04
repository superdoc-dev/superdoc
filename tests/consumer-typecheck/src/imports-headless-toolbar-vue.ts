/**
 * Consumer typecheck: "superdoc/headless-toolbar/vue" sub-export.
 *
 * Verifies the Vue headless-toolbar composable keeps its real type. The
 * composable returns `{ snapshot: ShallowRef<ToolbarSnapshot>, execute }`.
 * The fixture asserts both the function type and the structural return
 * shape are real.
 */
import { useHeadlessToolbar } from 'superdoc/headless-toolbar/vue';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

const _real_useHeadlessToolbar: AssertNotAny<typeof useHeadlessToolbar> = true;

type HookReturn = ReturnType<typeof useHeadlessToolbar>;
const _real_HookReturn: AssertNotAny<HookReturn> = true;
const _real_HookSnapshot: AssertNotAny<HookReturn['snapshot']> = true;
const _real_HookExecute: AssertNotAny<HookReturn['execute']> = true;

void _real_useHeadlessToolbar;
void _real_HookReturn;
void _real_HookSnapshot;
void _real_HookExecute;
