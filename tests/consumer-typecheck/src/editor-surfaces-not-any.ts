/**
 * Consumer typecheck: Editor.converter, Editor.extensionService, and
 * getActiveFormatting are typed surfaces, not `any` (SD-3240, SD-3245).
 *
 * Before this change:
 *   - `editor.converter`         resolved to `SuperConverter` with a
 *     `[key: string]: any` catchall.
 *   - `editor.extensionService`  resolved to `ExtensionService` with a
 *     `[key: string]: any` catchall.
 *   - `getActiveFormatting`      was typed `(editor: any): any`.
 *
 * 18 supported-root allowlist entries (16 + 2) flowed from those three
 * `any` shapes. After SD-3240, the Editor field types are public
 * surface interfaces with `unknown` extras; after SD-3245, the helper
 * has a real signature. The allowlist drains to 0; this fixture locks
 * the contract so a regression breaks the build, not just a JSON file.
 */

import { Editor, getActiveFormatting } from 'superdoc/super-editor';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// --- editor.converter is not any -----------------------------------------

type EditorConverterT = Editor['converter'];
// If `converter` were `any`, `Equal<EditorConverterT, any>` would be `true`.
// Asserting `false` proves it's a real interface.
const _converterIsNotAny: Equal<EditorConverterT, any> = false;
void _converterIsNotAny;

// --- editor.extensionService is not any ----------------------------------

type EditorExtensionServiceT = Editor['extensionService'];
const _extServiceIsNotAny: Equal<EditorExtensionServiceT, any> = false;
void _extServiceIsNotAny;

// --- getActiveFormatting input is not any --------------------------------

type GetActiveFormattingParam = Parameters<typeof getActiveFormatting>[0];
const _paramIsNotAny: Equal<GetActiveFormattingParam, any> = false;
void _paramIsNotAny;

// --- getActiveFormatting return is not any (and element is not any) ------

type GetActiveFormattingReturn = ReturnType<typeof getActiveFormatting>;
const _returnIsNotAny: Equal<GetActiveFormattingReturn, any> = false;
void _returnIsNotAny;

// An `any[]` would compare-equal to `unknown[]` here; using a fresh
// `any` element check disambiguates: if the element type drifted to
// `any`, this becomes `true`.
type GetActiveFormattingElement = GetActiveFormattingReturn extends Array<infer E> ? E : never;
const _elementIsNotAny: Equal<GetActiveFormattingElement, any> = false;
void _elementIsNotAny;

// --- Reach through editor.converter: known surface members stay typed ---

// `documentGuid` is declared on the public surface as `string | null`.
// If the field type regresses to `any`, this exact-type check breaks.
declare const editor: Editor;
const guid: string | null = editor.converter.documentGuid;
void guid;
const _guidIsExact: Equal<typeof editor.converter.documentGuid, string | null> = true;
void _guidIsExact;

// `getDocumentCreatedTimestamp()` returns an ISO timestamp string
// (e.g. `'2024-01-15T10:30:00Z'`) or `null`. SD-3240 review caught a
// surface-vs-runtime mismatch where the field was originally typed as
// `number | null`; this assertion pins the correct shape so a future
// drift back to number (or any) fails the typecheck matrix.
const createdAt: string | null = editor.converter.getDocumentCreatedTimestamp();
void createdAt;
const _createdAtIsExact: Equal<ReturnType<typeof editor.converter.getDocumentCreatedTimestamp>, string | null> = true;
void _createdAtIsExact;

// `getDocumentIdentifier()` is async at the converter level (the
// `null` fallback lives on `Editor.getDocumentIdentifier()` for the
// converter-missing case). The original surface mistakenly typed it as
// synchronous `string | null`; this assertion pins `Promise<string>`.
const identifier: Promise<string> = editor.converter.getDocumentIdentifier();
void identifier;
const _identifierIsExact: Equal<ReturnType<typeof editor.converter.getDocumentIdentifier>, Promise<string>> = true;
void _identifierIsExact;

// `exportToDocx()` at the converter level returns either the rendered
// XML string or the intermediate xml-js JSON tree (when called with
// `exportJsonOnly: true`). Blob / Buffer wrapping happens upstream in
// `Editor.exportDocx()`, not on the converter. SD-3248 tightened the
// JSON branch to the recursive `ConvertedXmlPart` shape (was
// `Record<string, unknown>`) so the runtime tree (`{ name, attributes,
// elements }`) is named honestly; the `Editor.exportDocx` overload was
// corrected in the same wave. Structural assertion pins both branches
// without requiring `ConvertedXmlPart` itself to be a named public
// export.
type AwaitedExport = Awaited<ReturnType<typeof editor.converter.exportToDocx>>;
type StringBranch = Extract<AwaitedExport, string>;
type TreeBranch = Exclude<AwaitedExport, string>;
const _hasStringBranch: Equal<StringBranch, string> = true;
const _treeBranchIsTree: TreeBranch extends {
  name?: string;
  attributes?: Record<string, unknown>;
  elements?: unknown[];
}
  ? true
  : false = true;
void _hasStringBranch;
void _treeBranchIsTree;
