/**
 * Consumer typecheck: `editor.doc` is the customer-facing runtime API
 * for the Document API. It must be typed as a real `DocumentApi`, with
 * methods that return real result types, not `any`.
 *
 * This is the end-to-end smoke test. The flat `import type {...} from
 * 'superdoc'` test (all-public-types.ts) catches missing exports and
 * `any` collapse on each named type. This file additionally proves
 * that the `editor.doc` getter on the `Editor` class is typed correctly
 * and that calling its methods returns real types, with method names
 * checked at compile time.
 */
import type { Editor, DocumentApi, BlocksListResult, BookmarkInfo } from 'superdoc';

// Helper: IsAny<T> resolves to `true` when T is `any`, otherwise false.
type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

declare const editor: Editor;

// `editor.doc` must be DocumentApi, not any.
const _docIsTyped: AssertNotAny<typeof editor.doc> = true;

// Direct assignment proves the static type matches the named export.
const doc: DocumentApi = editor.doc;

// `editor.doc.blocks.list()` must return BlocksListResult, not any.
const _listResult: BlocksListResult = doc.blocks.list();
const _listIsTyped: AssertNotAny<typeof _listResult> = true;

// Methods on the result are real, not bag-of-any.
const _blocks: BlocksListResult['blocks'] = _listResult.blocks;

// Bookmark surface: same shape contract.
declare const bookmarkResult: BookmarkInfo;
const _bookmarkIsTyped: AssertNotAny<typeof bookmarkResult> = true;

// Compile-time spelling check: a method that does not exist must be
// rejected, proving DocumentApi is a real interface and not `any`.
// @ts-expect-error - this method does not exist on DocumentApi
doc.thisMethodDoesNotExist();

// Compile-time argument shape check: passing the wrong shape must fail.
// @ts-expect-error - bookmarks.get takes BookmarkGetInput, not a string
doc.bookmarks.get('not-an-input');

// Suppress unused-binding warnings while keeping the assertions live.
void _docIsTyped;
void _listIsTyped;
void _blocks;
void _bookmarkIsTyped;
