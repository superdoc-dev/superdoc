/**
 * Consumer typecheck: `ExportParams.fieldsHighlightColor` accepts
 * `string | null | undefined` (SD-2828).
 *
 * The runtime defaults the field to `null` when the consumer omits it,
 * forwards that `null` through to `Editor.exportDocx` (which accepts
 * `string | null`), and then on through the converter. Before this
 * widening the public typedef declared `string` only, so consumers
 * passing the runtime-equivalent `null` got a strict-mode typecheck
 * failure on a value the runtime accepts.
 *
 * If a future change re-narrows this field to `string`, the assignments
 * below stop compiling and CI fails.
 */
import type { ExportParams } from 'superdoc';

// Each of the three valid shapes a consumer can pass: explicit color,
// explicit "no highlight" (null), and omitted (undefined). The current
// runtime treats omitted and explicit-null the same.
const withColor: ExportParams = { fieldsHighlightColor: '#ff0000' };
const withNull: ExportParams = { fieldsHighlightColor: null };
const omitted: ExportParams = {};

// Strict type-equality assertion: a re-narrowing to `string` (or to
// `string | undefined` without `null`) would still leave the explicit
// color and omitted forms compiling, so plain assignments alone do not
// catch a regression. Pin the exact field type here.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

const _fieldsHighlightColorTypeIsExact: AssertEqual<ExportParams['fieldsHighlightColor'], string | null | undefined> =
  true;

void [withColor, withNull, omitted, _fieldsHighlightColorTypeIsExact];
