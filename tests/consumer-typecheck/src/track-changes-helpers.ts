/**
 * Consumer typecheck: track changes helper call shapes.
 *
 * These helpers are public via `superdoc/super-editor`. The calls below guard
 * the runtime-valid shapes that SD-2892 fixed after JSDoc had over-tightened
 * the generated declarations.
 */
import { trackChangesHelpers } from 'superdoc/super-editor';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

type MarkInsertionOptions = Parameters<typeof trackChangesHelpers.markInsertion>[0];
type MarkDeletionOptions = Parameters<typeof trackChangesHelpers.markDeletion>[0];
type AddMarkStepOptions = Parameters<typeof trackChangesHelpers.addMarkStep>[0];

const _realTrackChangesHelpers: AssertNotAny<typeof trackChangesHelpers> = true;
const _realMarkInsertionOptions: AssertNotAny<MarkInsertionOptions> = true;
const _realMarkDeletionOptions: AssertNotAny<MarkDeletionOptions> = true;
const _realAddMarkStepOptions: AssertNotAny<AddMarkStepOptions> = true;

declare const tr: MarkInsertionOptions['tr'];
declare const state: AddMarkStepOptions['state'];
declare const step: AddMarkStepOptions['step'];
declare const newTr: AddMarkStepOptions['newTr'];
declare const doc: AddMarkStepOptions['doc'];

const user = { name: 'Type Test', email: 'type-test@example.com' };
const date = '2026-05-04T00:00:00.000Z';

trackChangesHelpers.markInsertion({ tr, from: 1, to: 2, user, date });
trackChangesHelpers.markDeletion({ tr, from: 1, to: 2, user, date });
trackChangesHelpers.addMarkStep({ state, step, newTr, doc, user, date });

void _realTrackChangesHelpers;
void _realMarkInsertionOptions;
void _realMarkDeletionOptions;
void _realAddMarkStepOptions;
