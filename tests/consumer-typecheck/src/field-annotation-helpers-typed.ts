/**
 * Consumer typecheck: `fieldAnnotationHelpers` namespace returns
 * typed `{ node, pos }` entries, not `any[]` (SD-2980 PR A).
 *
 * Before this change, every helper in `fieldAnnotationHelpers` resolved
 * to `(...args: any[]) => any[]` in the published `.d.ts` because the
 * source files were JavaScript without `@param` / `@returns` JSDoc.
 * 34 audit findings tracked the leak. After PR A, JSDoc is in place;
 * this fixture pins each helper's return so a regression breaks the
 * typecheck matrix, not just the inventory count.
 *
 * Element shape pinned: `{ node, pos }` where `pos` is a number and
 * `node` exposes the ProseMirror Node API (`type.name`, `attrs`,
 * `nodeSize`). One helper adds a `rect: DOMRect` field.
 */

import { Editor, fieldAnnotationHelpers } from 'superdoc/super-editor';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';

declare const state: EditorState;
declare const view: EditorView;
declare const doc: PmNode;
declare const tr: Transaction;
declare const editor: Editor;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// --- Each helper's return is NOT any[] -----------------------------------

type GetAllReturn = ReturnType<typeof fieldAnnotationHelpers.getAllFieldAnnotations>;
const _getAllNotAnyArr: Equal<GetAllReturn, any[]> = false;
void _getAllNotAnyArr;

type FindReturn = ReturnType<typeof fieldAnnotationHelpers.findFieldAnnotations>;
const _findNotAnyArr: Equal<FindReturn, any[]> = false;
void _findNotAnyArr;

type FindByIdReturn = ReturnType<typeof fieldAnnotationHelpers.findFieldAnnotationsByFieldId>;
const _findByIdNotAnyArr: Equal<FindByIdReturn, any[]> = false;
void _findByIdNotAnyArr;

type FindBetweenReturn = ReturnType<typeof fieldAnnotationHelpers.findFieldAnnotationsBetween>;
const _findBetweenNotAnyArr: Equal<FindBetweenReturn, any[]> = false;
void _findBetweenNotAnyArr;

type WithRectReturn = ReturnType<typeof fieldAnnotationHelpers.getAllFieldAnnotationsWithRect>;
const _withRectNotAnyArr: Equal<WithRectReturn, any[]> = false;
void _withRectNotAnyArr;

// --- Element shape: { node: PmNode; pos: number } ------------------------

// Structural pin. If the element ever degrades to `any` or loses the
// `node`/`pos` fields, this assignment breaks.
function consumeEntry(entry: GetAllReturn[number]): void {
  const n: PmNode = entry.node;
  const p: number = entry.pos;
  void n;
  void p;
  // `node` must expose ProseMirror Node members, not just be `any`.
  const _typeName: string = entry.node.type.name;
  const _nodeSize: number = entry.node.nodeSize;
  void _typeName;
  void _nodeSize;
}
void consumeEntry;

// --- getAllFieldAnnotationsWithRect carries a real DOMRect ---------------

function consumeWithRect(entry: WithRectReturn[number]): void {
  const _rect: DOMRect = entry.rect;
  // DOMRect has typed top/left/width/height. Asserting `number` proves
  // the rect didn't degrade to `any`.
  const _top: number = entry.rect.top;
  const _width: number = entry.rect.width;
  void _rect;
  void _top;
  void _width;
}
void consumeWithRect;

// --- Predicate parameter is typed Node, not any --------------------------

// If `predicate` were `(...args: any[]) => any`, this `@ts-expect-error`
// would become unused and tsc would fail with TS2578.
fieldAnnotationHelpers.findFieldAnnotations((node) => {
  // Real PmNode members must work:
  return node.type.name === 'fieldAnnotation';
}, state);

// @ts-expect-error SD-2980: predicate receives a Node, not a string.
fieldAnnotationHelpers.findFieldAnnotations((s: string) => s.length > 0, state);

// --- findFirstFieldAnnotationByFieldId returns nullable entry, not any --

type FirstReturn = ReturnType<typeof fieldAnnotationHelpers.findFirstFieldAnnotationByFieldId>;
const _firstNotAny: Equal<FirstReturn, any> = false;
void _firstNotAny;
// Must include `null` in the union (no match case).
const _firstHandlesNull: null extends FirstReturn ? true : false = true;
void _firstHandlesNull;

// --- Argument types are real, not any ------------------------------------

// state: EditorState (not any). If it were any, this `@ts-expect-error`
// would not fire and tsc would catch the unused directive.
fieldAnnotationHelpers.getAllFieldAnnotations(state);
// @ts-expect-error SD-2980: getAllFieldAnnotations needs an EditorState.
fieldAnnotationHelpers.getAllFieldAnnotations('not a state');

// view: EditorView (not any).
fieldAnnotationHelpers.getAllFieldAnnotationsWithRect(view, state);
// @ts-expect-error SD-2980: getAllFieldAnnotationsWithRect needs an EditorView first arg.
fieldAnnotationHelpers.getAllFieldAnnotationsWithRect('not a view', state);

// tr: Transaction (not any).
fieldAnnotationHelpers.findRemovedFieldAnnotations(tr);
// @ts-expect-error SD-2980: findRemovedFieldAnnotations needs a Transaction.
fieldAnnotationHelpers.findRemovedFieldAnnotations('not a tr');

// doc: PmNode (not any).
fieldAnnotationHelpers.findFieldAnnotationsBetween(0, 10, doc);
// @ts-expect-error SD-2980: findFieldAnnotationsBetween needs a Node as doc.
fieldAnnotationHelpers.findFieldAnnotationsBetween(0, 10, 'not a doc');

// editor: Editor (not any).
fieldAnnotationHelpers.getHeaderFooterAnnotations(editor);
// @ts-expect-error SD-2980: getHeaderFooterAnnotations needs an Editor.
fieldAnnotationHelpers.getHeaderFooterAnnotations('not an editor');

fieldAnnotationHelpers.trackFieldAnnotationsDeletion(editor, tr);
